"""Small NumPy-only heads; inference exports use the same normalized dense equations."""
import argparse, hashlib, json, math, time
from pathlib import Path
import numpy as np

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def sigmoid(x): return 1 / (1 + np.exp(-np.clip(x, -40, 40)))
def metrics(p, y):
    p = np.clip(p, 1e-8, 1-1e-8)
    order = np.argsort(p, kind='stable'); sorted_p, sorted_y = p[order], y[order]
    _, first, count = np.unique(sorted_p, return_index=True, return_counts=True)
    ranks = np.repeat(first + (count+1)/2, count)
    positive = float(y.sum()); negative = len(y)-positive
    auc = float((np.sum(ranks*sorted_y)-positive*(positive+1)/2)/(positive*negative)) if positive*negative else None
    return {'rows': len(y), 'positives': int(positive), 'rate': float(y.mean()), 'brier': float(np.mean((p-y)**2)), 'logLoss': float(np.mean(-y*np.log(p)-(1-y)*np.log(1-p))), 'auc': auc}
def normalize(x, mean, scale): return np.clip((x-mean)/scale, -5, 5)
def forward(x, params):
    w, b, v, c = params; h = np.maximum(0, x@w+b); return h@v+c, h
def backward(x, h, dz, params):
    dh = (dz@params[2].T)*(h>0)
    return [x.T@dh, dh.sum(0), h.T@dz, dz.sum(0)]
class Adam:
    def __init__(self, params, rate): self.m=[np.zeros_like(p) for p in params]; self.v=[np.zeros_like(p) for p in params]; self.step=0; self.rate=rate
    def update(self, params, grads, decay=1e-5):
        self.step += 1
        for i,(p,g) in enumerate(zip(params,grads)):
            g = np.clip(g+decay*p,-5,5); self.m[i]=.9*self.m[i]+.1*g; self.v[i]=.999*self.v[i]+.001*g*g
            p -= self.rate*(self.m[i]/(1-.9**self.step))/(np.sqrt(self.v[i]/(1-.999**self.step))+1e-8)
def network(dim, hidden, outputs, rng): return [rng.normal(0,.12,(dim,hidden)), np.zeros(hidden), rng.normal(0,.05,(hidden,outputs)), np.zeros(outputs)]
def packed(params, mean, scale): return {'mean':mean.tolist(),'scale':scale.tolist(),'w1':params[0].tolist(),'b1':params[1].tolist(),'w2':params[2].tolist(),'b2':params[3].tolist()}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('data');parser.add_argument('--output',required=True);args=parser.parse_args();directory=Path(args.data);out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    report=json.loads((directory/'report.json').read_text());policy_report=json.loads((directory/'policy-report.json').read_text())
    for name,sha in report['data'].items(): assert digest(directory/name)==sha
    assert digest(directory/'policies.json')==policy_report['policySha256']
    rng=np.random.default_rng(20261107);raw=np.fromfile(directory/'risk.f32',dtype='<f4').reshape(-1,report['riskWidth']).astype(np.float64);dim=len(report['riskNames']);x,y,fan,seeds=raw[:,:dim],raw[:,dim],raw[:,dim+1]/5,raw[:,-1].astype(np.int64)
    masks={fold:np.isin(seeds,values) for fold,values in report['folds'].items()};assert all(m.any() for m in masks.values());mean=x[masks['train']].mean(0);scale=np.maximum(x[masks['train']].std(0),.05);x=normalize(x,mean,scale)
    params=network(dim,16,2,rng);params[-1][0]=math.log(y[masks['train']].mean()/(1-y[masks['train']].mean()));params[-1][1]=.55;opt=Adam(params,.002);best=None;best_loss=float('inf');train=np.flatnonzero(masks['train']);history=[]
    for epoch in range(32):
        for indices in np.array_split(rng.permutation(train),math.ceil(len(train)/1024)):
            z,h=forward(x[indices],params);dz=np.zeros_like(z);dz[:,0]=(sigmoid(z[:,0])-y[indices])/len(indices);positive=y[indices]>0;dz[positive,1]=.04*(z[positive,1]-fan[indices][positive])/max(1,positive.sum());opt.update(params,backward(x[indices],h,dz,params))
        z,_=forward(x[masks['calibration']],params);score=metrics(sigmoid(z[:,0]),y[masks['calibration']]);history.append({'epoch':epoch+1,**score})
        if score['logLoss']<best_loss: best_loss=score['logLoss'];best=[p.copy() for p in params]
        if epoch%8==7: print('risk',epoch+1,json.dumps(score),flush=True)
    params=best;logits=forward(x[masks['calibration']],params)[0][:,0];yy=y[masks['calibration']];cal=np.array([1.,0.])
    # Platt calibration uses only the calibration seed blocks.
    design=np.stack([logits,np.ones_like(logits)],1)
    for _ in range(30):
        pp=sigmoid(design@cal);gradient=design.T@(pp-yy)/len(yy)+np.array([1e-4*(cal[0]-1),0]);hessian=(design.T*(pp*(1-pp)))@design/len(yy)+np.diag([1e-4,1e-6]);delta=np.linalg.solve(hessian,gradient);cal-=np.clip(delta,-.5,.5);cal[0]=max(.05,min(5,cal[0]))
    def risk_predict(features):
        z,_=forward(normalize(features,mean,scale),params);return sigmoid(z[:,0]*cal[0]+cal[1]),np.expm1(np.clip(z[:,1]*5,math.log(9),math.log(97)))
    risk_metrics={}
    for fold,mask in masks.items():
        z,_=forward(x[mask],params);p=sigmoid(z[:,0]*cal[0]+cal[1]);risk_metrics[fold]={'model':metrics(p,y[mask]),'constant':metrics(np.full(mask.sum(),y[masks['train']].mean()),y[mask])}
    groups=json.loads((directory/'groups.json').read_text());policies={p['id']:p['probabilities'] for p in json.loads((directory/'policies.json').read_text())};width=len(report['qualityNames']);maximum=max(len(g['rows']) for g in groups);gx=np.zeros((len(groups),maximum,width));prior=np.zeros((len(groups),maximum));valid=np.zeros_like(prior,dtype=bool);chosen=np.array([g['chosen'] for g in groups]);weights=np.array([g['weight'] for g in groups]);gmasks={fold:np.array([g['fold']==fold for g in groups]) for fold in masks}
    for i,g in enumerate(groups):
        assert len(g['rows'])==len(policies[g['id']]);n=len(g['rows']);valid[i,:n]=True;prior[i,:n]=policies[g['id']]
        for j,row in enumerate(g['rows']):
            q=np.array(row['quality']);rp,rf=risk_predict(np.array(row['opponents']));q[-3:]=[rp.max(),rp.sum(),np.dot(rp,rf)/32];gx[i,j]=q
    flat=gx[gmasks['train']][valid[gmasks['train']]];gmean=flat.mean(0);gscale=np.maximum(flat.std(0),.05);gx=normalize(gx,gmean,gscale);gp=network(width,8,1,rng);gp[2].fill(0);gopt=Adam(gp,.003);bestg=None;bestgl=float('inf');ghistory=[];anchor=2.;limit=.8
    def prediction(indices):
        z,h=forward(gx[indices].reshape(-1,width),gp);z=z.reshape(len(indices),maximum);logits=np.log(np.maximum(prior[indices],1e-12))+np.clip(z,-limit,limit);logits[~valid[indices]]=-1e9;logits-=logits.max(1,keepdims=True);prob=np.exp(logits);prob/=prob.sum(1,keepdims=True);return prob,z,h
    def preference_metrics(fold):
        ids=np.flatnonzero(gmasks[fold]);p,_,_=prediction(ids);base=np.maximum(prior[ids],1e-12);return {'groups':len(ids),'teacherTop1':float(np.mean(p.argmax(1)==chosen[ids])),'baseTop1':float(np.mean(base.argmax(1)==chosen[ids])),'crossEntropy':float(np.mean(-np.log(np.maximum(p[np.arange(len(ids)),chosen[ids]],1e-12)))),'weightedCrossEntropy':float(np.average(-np.log(np.maximum(p[np.arange(len(ids)),chosen[ids]],1e-12)),weights=weights[ids])),'changes':int(np.sum(p.argmax(1)!=base.argmax(1)))}
    for epoch in range(180):
        train_groups=rng.permutation(np.flatnonzero(gmasks['train']))
        for ids in np.array_split(train_groups,math.ceil(len(train_groups)/64)):
            p,z,h=prediction(ids);one=np.zeros_like(p);one[np.arange(len(ids)),chosen[ids]]=1;dz=((p-one)*(weights[ids]/weights[ids].mean())[:,None]+anchor*(p-prior[ids]))/len(ids);dz[~valid[ids]]=0;dz[np.abs(z)>=limit]=0;gopt.update(gp,backward(gx[ids].reshape(-1,width),h,dz.reshape(-1,1),gp),decay=.002)
        score=preference_metrics('calibration');ghistory.append({'epoch':epoch+1,**score})
        if score['weightedCrossEntropy']<bestgl: bestgl=score['weightedCrossEntropy'];bestg=[p.copy() for p in gp]
    gp=bestg;quality_metrics={fold:preference_metrics(fold) for fold in gmasks}
    model={'schemaVersion':1,'featureVersion':report['featureVersion'],'risk':{**packed(params,mean,scale),'calibration':cal.tolist()},'preference':{**packed(gp,gmean,gscale),'limit':limit},'settings':{'topCandidates':3,'minimumPrior':.08,'priorRatio':.25,'minimumMargin':.05,'maximumRiskIncrease':.015},'riskNames':report['riskNames'],'qualityNames':report['qualityNames']}
    encoded=json.dumps(model,separators=(',',':'),allow_nan=False);(out/'model.json').write_text(encoded+'\n');result={'schemaVersion':1,'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'numpy':np.__version__,'trainingSeed':20261107,'dataReportSha256':digest(directory/'report.json'),'policyReportSha256':digest(directory/'policy-report.json'),'trainerSha256':digest(Path(__file__)),'modelSha256':digest(out/'model.json'),'folds':report['folds'],'risk':risk_metrics,'preference':quality_metrics,'riskHistory':history,'preferenceHistory':ghistory,'limitations':['Preference targets are reward-weighted logged expert actions, not counterfactual Q-values','Hidden hands label danger only; all inference inputs are public observations','Split by original wall seed, including all seat rotations and policy variants','Diagnostic offline metrics do not establish game-strength improvement'],'status':'passed'};(out/'training-report.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'risk':risk_metrics,'preference':quality_metrics},indent=2),flush=True)
if __name__=='__main__': main()
