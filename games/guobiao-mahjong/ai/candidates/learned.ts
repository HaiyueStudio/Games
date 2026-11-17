import {seat,type Observation,type Scorer} from '../../rules/types';
import {lastTileAlternative} from '../lastTileDefense';
import {candidateFeatures,riskFeatures,CANDIDATE_FEATURE_VERSION,RISK_NAMES,QUALITY_NAMES,type CandidateFeatures} from './features';
import type {HybridDecision} from '../hybrid';
import type {CandidateModel,DenseNetwork} from './schema';
import {candidateModel} from './weights';

export function validateCandidateModel(model:CandidateModel):void {
  if(model.schemaVersion!==1||model.featureVersion!==CANDIDATE_FEATURE_VERSION||JSON.stringify(model.riskNames)!==JSON.stringify(RISK_NAMES)||JSON.stringify(model.qualityNames)!==JSON.stringify(QUALITY_NAMES))throw Error('Candidate model schema mismatch');
  const check=(n:DenseNetwork,width:number,outputs:number)=>{
    const finite=(a:readonly number[])=>a.every(v=>Number.isFinite(v)&&Math.abs(v)<10000),hidden=n.b1.length;
    if(hidden<1||hidden>64||n.mean.length!==width||n.scale.length!==width||n.w1.length!==width||n.w2.length!==hidden||n.b2.length!==outputs||!finite(n.mean)||!finite(n.b1)||!finite(n.b2)||n.scale.some(v=>!Number.isFinite(v)||v<1e-6)||n.w1.some(r=>r.length!==hidden||!finite(r))||n.w2.some(r=>r.length!==outputs||!finite(r)))throw Error('Invalid candidate network');
  };check(model.risk,RISK_NAMES.length,2);check(model.preference,QUALITY_NAMES.length,1);
  const s=model.settings;
  if(model.risk.calibration.length!==2||model.risk.calibration.some(v=>!Number.isFinite(v))||model.risk.calibration[0]!<=0||model.preference.limit<=0||model.preference.limit>1||!Number.isInteger(s.topCandidates)||s.topCandidates<1||s.topCandidates>3||![s.minimumPrior,s.priorRatio,s.minimumMargin,s.maximumRiskIncrease].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||s.maximumRiskIncrease>.05)throw Error('Invalid candidate settings');
}
validateCandidateModel(candidateModel);
export function densePredict(input:readonly number[],network:DenseNetwork):number[]{
  if(input.length!==network.mean.length||input.some(v=>!Number.isFinite(v)))throw Error('Invalid dense features');
  const hidden=[...network.b1];for(let i=0;i<input.length;i++){const x=Math.max(-5,Math.min(5,(input[i]!-network.mean[i]!)/network.scale[i]!));for(let j=0;j<hidden.length;j++)hidden[j]!+=x*network.w1[i]![j]!;}
  const output=[...network.b2];for(let j=0;j<hidden.length;j++){const h=Math.max(0,hidden[j]!);for(let k=0;k<output.length;k++)output[k]!+=h*network.w2[j]![k]!;}return output;
}
export function predictRiskVector(input:readonly number[],model:CandidateModel=candidateModel){
  const [logit,fan]=densePredict(input,model.risk),c=model.risk.calibration,z=Math.max(-40,Math.min(40,logit!*c[0]!+c[1]!));
  return {probability:1/(1+Math.exp(-z)),conditionalFan:Math.exp(Math.max(Math.log(9),Math.min(Math.log(97),fan!*5)))-1};
}
export function predictDiscardRisk(o:Observation,tile:number,model:CandidateModel=candidateModel){
  const opponents=[1,2,3].map(n=>{const opponent=seat(o.seat+n);return {seat:opponent,...predictRiskVector(riskFeatures(o,tile,opponent),model)}});
  return {opponents,maximum:Math.max(...opponents.map(p=>p.probability)),sum:opponents.reduce((n,p)=>n+p.probability,0),expectedFan:opponents.reduce((n,p)=>n+p.probability*p.conditionalFan,0)};
}
export function preferenceFeatures(row:CandidateFeatures,model:CandidateModel=candidateModel){
  const risk=row.opponents.map(f=>predictRiskVector(f,model)),quality=[...row.quality];quality.splice(-3,3,Math.max(...risk.map(p=>p.probability)),risk.reduce((n,p)=>n+p.probability,0),risk.reduce((n,p)=>n+p.probability*p.conditionalFan,0)/32);return quality;
}
/** Conservative learned residual over a frozen policy prior, with the exact terminal safety guard. */
export function rankCandidates(o:Observation,p:readonly number[],selected:number,scorer:Scorer,model:CandidateModel=candidateModel):HybridDecision{
  if(p.length!==o.legalActions.length||!o.legalActions[selected]||p.some(v=>!Number.isFinite(v)||v<0)||Math.abs(p.reduce((a,b)=>a+b,0)-1)>1e-6)throw Error('Invalid candidate prior');
  const result=(index:number,reason:string,calls=0,q:number|null=null,b:number|null=null):HybridDecision=>({index,action:o.legalActions[index]!,changed:index!==selected,reason,analysisCalls:calls,quality:q,baselineQuality:b});
  const hu=o.legalActions.findIndex(a=>a.type==='hu');if(hu>=0)return result(hu,'legal-win');
  const preferred=o.legalActions[selected]!,safe=lastTileAlternative(o,preferred);if(safe)return result(o.legalActions.findIndex(a=>a.type==='discard'&&a.tile===safe.tile),'last-tile-safe');
  if(o.phase!=='turn'||o.turn!==o.seat||o.wallRemaining===0||preferred.type!=='discard')return result(selected,'model');
  const s=model.settings,order=o.legalActions.map((a,i)=>({a,i,p:p[i]!})).filter(v=>v.a.type==='discard'&&v.i!==selected&&v.p>=s.minimumPrior&&v.p>=p[selected]!*s.priorRatio).sort((a,b)=>b.p-a.p||a.i-b.i).slice(0,s.topCandidates-1);
  if(!order.length)return result(selected,'learned-prior');
  const candidates=[selected,...order.map(v=>v.i)].map(index=>{const row=candidateFeatures(o,o.legalActions[index]!.tile!,scorer),features=preferenceFeatures(row,model),residual=Math.max(-model.preference.limit,Math.min(model.preference.limit,densePredict(features,model.preference)[0]!));return {index,row,features,residual,score:Math.log(Math.max(1e-12,p[index]!))+residual}}),base=candidates[0]!;
  let best=base;for(const c of candidates.slice(1)){
    if(c.features[0]!>base.features[0]!||c.features[QUALITY_NAMES.length-3]!>base.features[QUALITY_NAMES.length-3]!+s.maximumRiskIncrease)continue;
    if(base.row.targets.selfLive+base.row.targets.ronLive>0&&c.row.targets.selfLive+c.row.targets.ronLive===0)continue;
    if(c.score>best.score)best=c;
  }
  const calls=candidates.reduce((n,c)=>n+c.row.targets.analyses+1,0);
  return best.index!==selected&&best.score>=base.score+s.minimumMargin?result(best.index,'learned-preference',calls,best.residual,base.residual):result(selected,'learned-prior',calls,base.residual,base.residual);
}
