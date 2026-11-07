"""Joint hierarchical policy/hand value/match value; clipped on-policy league improvement and distillation."""
import argparse
import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import numpy as np
TRAINER_BYTES = Path(__file__).read_bytes()

spec = importlib.util.spec_from_file_location('core', Path(__file__).with_name('train-values.py')); core = importlib.util.module_from_spec(spec); spec.loader.exec_module(core)
SIG = [3, 4, 7]; POS = [1, 2, 5, 6]
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p): return json.loads(Path(p).read_text())
def write(p, data): Path(p).parent.mkdir(parents=True, exist_ok=True); Path(p).write_text(json.dumps(data, separators=(',', ':'), allow_nan=False)+'\n')
def logits(x, p):
    h = np.maximum(0, x@p[0]+p[1]); return h@p[2]+p[3], h
def outputs(z):
    v = z.copy(); v[..., POS] = np.logaddexp(0, z[..., POS]); v[..., SIG] = core.sigmoid(z[..., SIG]); return v
def unpack(m):
    n = m['network']; return [np.asarray(n[k], dtype=np.float64) for k in ['w1', 'b1', 'w2', 'b2']]
def distribution(residual, parents, prior, temperature=1):
    ids = [np.flatnonzero(parents == p) for p in dict.fromkeys(parents.tolist())]; maxima = [i[np.argmax(residual[i])] for i in ids]; parent_prior = np.array([prior[parents[i[0]]] for i in ids]); parent_scores = (residual[maxima]+np.log(np.maximum(parent_prior, 1e-12)))/temperature
    pp = softmax(parent_scores); p = np.zeros(len(residual)); conditional = []
    for j, indices in enumerate(ids):
        c = softmax(residual[indices]/temperature); conditional.append(c); p[indices] = pp[j]*c
    return p, (ids, maxima, pp, conditional)
def softmax(z):
    p = np.exp(z-np.max(z)); return p/p.sum()
def ce_gradient(residual, parents, prior, target, temperature=1):
    p, (groups, maxima, pp, conditional) = distribution(residual, parents, prior, temperature); grad = np.zeros(len(residual)); mass = np.array([target[ids].sum() for ids in groups]); total = target.sum()
    for j, ids in enumerate(groups): grad[maxima[j]] += (total*pp[j]-mass[j])/temperature; grad[ids] += (mass[j]*conditional[j]-target[ids])/temperature
    return float(-np.sum(target*np.log(np.maximum(p, 1e-300)))), grad
def log_gradient(residual, parents, prior, chosen, temperature=1):
    target = np.zeros(len(residual)); target[chosen] = 1; _, grad = ce_gradient(residual, parents, prior, target, temperature); return -grad
def parent_best(residual, parents, prior):
    _, (groups, maxima, pp, _) = distribution(residual, parents, prior); return int(maxima[int(np.argmax(pp))])
def policy_target(q, parents, prior, temperature=.1):
    groups = [np.flatnonzero(parents == p) for p in dict.fromkeys(parents.tolist())]; pp = softmax(np.array([q[ids].max()/temperature+math.log(max(1e-12, prior[parents[ids[0]]])) for ids in groups])); target = np.zeros(len(q))
    for j, ids in enumerate(groups): target[ids] = pp[j]*softmax(q[ids]/temperature)
    return target
def model_features(g): return np.asarray(g.get('features', [r['features'] for r in g.get('rows', [])]), dtype=np.float64)
def value_gradient(z, target, mask):
    v = outputs(z); grad = np.zeros_like(z); count = max(1, mask.sum()); loss = 0.
    for k in POS:
        active = mask[:, k]; delta = v[:, k]-target[:, k]; grad[:, k] = active*delta*core.sigmoid(z[:, k])/count; loss += float(np.sum(active*delta**2)/2/count)
    for k in SIG:
        active = mask[:, k]; p = v[:, k]; y = target[:, k]; grad[:, k] = .1*active*(p-y)/count; loss += float(-.1*np.sum(active*(y*np.log(np.maximum(p, 1e-12))+(1-y)*np.log(np.maximum(1-p, 1e-12))))/count)
    return loss, grad
def search_group(g):
    f = model_features(g); parents = np.array([r['plan']['index'] for r in g['rows']]); target = np.zeros((len(f), 8)); mask = np.zeros_like(target)
    for i, r in enumerate(g['rows']):
        weights = np.array([o.get('weight', 1) for o in r['outcomes']], dtype=np.float64); weights /= weights.sum()
        for w, o in zip(weights, r['outcomes']): target[i, 1:5] += w*np.array([o['fans'][0]/32, sum(o['fans'][1:])/96, float(o['winner'] == 0), float(o['winner'] is not None and not o['selfDrawn'] and o['from'] == 0)])
        mask[i, 1:5] = 1
    q = target[:, 1]-target[:, 2]; return dict(features=f, parents=parents, prior=np.asarray(g['prior']), target=target, mask=mask, policy=policy_target(q, parents,g['prior']), fold=g['fold'], seed=g['seed'], weight=g.get('sourceWeight', 1))
def save_model(path, template, params, mean, scale):
    model = copy.deepcopy(template); p = [v.astype(np.float32).astype(np.float64) for v in params]; model['network'] = core.packed(p, mean, scale); write(path, model); return model
def calibration(groups, params, mean, scale):
    losses = []
    for g in groups:
        z, _ = logits(core.normalize(g['features'], mean, scale), params); ce, _ = ce_gradient(z[:, 0], g['parents'], g['prior'], g['policy']); value, _ = value_gradient(z, g['target'], g['mask']); losses.append(ce+value)
    return float(np.mean(losses))
def fit_supervised(groups, hidden, seed, epochs=80, teacher=None):
    train = [g for g in groups if g['fold'] == 'train']; cal = [g for g in groups if g['fold'] == 'calibration']; raw = np.concatenate([g['features'] for g in train]); mean = raw.mean(0).astype(np.float32).astype(np.float64); scale = np.maximum(raw.std(0), .05).astype(np.float32).astype(np.float64); width = raw.shape[1]; rng = np.random.default_rng(seed)
    p = [rng.normal(0, .035, (width, hidden)), np.zeros(hidden), rng.normal(0, .02, (hidden, 8)), np.array([0, -2, -3, -2, -3, -.5, -.5, -.7])]; p[2][:, 0] = 0; optimizer = core.Adam(p); history = []; best = None; best_loss = float('inf'); stale = 0
    if teacher:
        tm = np.asarray(teacher['network']['mean']); ts = np.asarray(teacher['network']['scale']); tp = unpack(teacher)
        for g in groups:
            z, _ = logits(core.normalize(g['features'], tm, ts), tp); pred = outputs(z); policy, _ = distribution(z[:, 0], g['parents'], g['prior']); g['policy'] = .8*policy+.2*g['policy']; g['target'] = np.where(g['mask'] > 0, .7*pred+.3*g['target'], pred); g['mask'][:, 1:] = 1
    for epoch in range(epochs):
        for batch in np.array_split(rng.permutation(len(train)), max(1, math.ceil(len(train)/32))):
            gradients = [np.zeros_like(v) for v in p]; total = sum(train[i]['weight'] for i in batch)
            for i in batch:
                g = train[i]; x = core.normalize(g['features'], mean, scale); z, h = logits(x, p); _, dz = value_gradient(z, g['target'], g['mask']); _, actor = ce_gradient(z[:, 0], g['parents'], g['prior'], g['policy']); dz[:, 0] += .2*actor; w = g['weight']/total
                for j, grad in enumerate(core.gradient(x, h, dz, p)): gradients[j] += w*grad
            optimizer.update(p, gradients)
        score = calibration(cal, p, mean, scale); history.append(score)
        if score < best_loss-1e-7: best = [v.copy() for v in p]; best_loss = score; stale = 0
        else: stale += 1
        if stale >= 14: break
    return best, mean, scale, history
def ppo_update(model, trajectories, generation):
    params = unpack(model); mean = np.asarray(model['network']['mean']); scale = np.asarray(model['network']['scale']); train = [g for g in trajectories if g['fold'] == 'train']; cal = [g for g in trajectories if g['fold'] == 'calibration']; assert train and cal
    for g in trajectories:
        g['features'] = np.asarray(g['features']); g['parents'] = np.array([p['index'] for p in g['plans']]); g['prior'] = np.asarray(g['prior']); p, _ = distribution(logits(core.normalize(g['features'], mean, scale), params)[0][:, 0], g['parents'], g['prior'], g['temperature']); assert np.max(np.abs(p-np.asarray(g['oldProbabilities']))) < 1e-7
    advantage = np.array([g['targets'][5]-g['targets'][6]+model['settings']['matchWinWeight']*g['targets'][7]-g['baseline'] for g in train]); weights = np.array([g['weight'] for g in train]); center = np.average(advantage, weights=weights); spread = max(.1, np.sqrt(np.average((advantage-center)**2, weights=weights)))
    for g in trajectories: g['advantage'] = (g['targets'][5]-g['targets'][6]+model['settings']['matchWinWeight']*g['targets'][7]-g['baseline']-center)/spread
    optimizer = core.Adam(params); rng = np.random.default_rng(20261200+generation); history = []; best = [p.copy() for p in params]
    for epoch in range(6):
        previous = [p.copy() for p in params]
        for batch in np.array_split(rng.permutation(len(train)), max(1, math.ceil(len(train)/32))):
            gradients = [np.zeros_like(v) for v in params]; total = sum(train[i]['weight'] for i in batch)
            for i in batch:
                g = train[i]; x = core.normalize(g['features'], mean, scale); z, h = logits(x, params); probability, _ = distribution(z[:, 0], g['parents'], g['prior'], g['temperature']); chosen = g['chosen']; ratio = math.exp(np.clip(math.log(max(1e-300, probability[chosen]))-g['oldLogProbability'], -20, 20)); a = g['advantage']; active = not (a >= 0 and ratio > 1.2 or a < 0 and ratio < .8)
                dz = np.zeros_like(z); dz[:, 0] = (-a*ratio if active else 0)*log_gradient(z[:, 0], g['parents'], g['prior'], chosen, g['temperature']); _, trust = ce_gradient(z[:, 0], g['parents'], g['prior'], np.asarray(g['oldProbabilities']), g['temperature']); _, entropy = ce_gradient(z[:, 0], g['parents'], g['prior'], -probability*(np.log(np.maximum(probability, 1e-300))+1), g['temperature']); dz[:, 0] += .1*trust+.002*entropy
                targets = np.zeros_like(z); mask = np.zeros_like(z); targets[chosen] = g['targets']; mask[chosen, 1:] = 1; _, value = value_gradient(z, targets, mask); dz += .5*value
                for j, grad in enumerate(core.gradient(x, h, dz, params)): gradients[j] += g['weight']/total*grad
            optimizer.update(params, gradients)
        kl = []
        for g in cal:
            p, _ = distribution(logits(core.normalize(g['features'], mean, scale), params)[0][:, 0], g['parents'], g['prior'], g['temperature']); old = np.asarray(g['oldProbabilities']); kl.append(float(np.sum(old*(np.log(np.maximum(old, 1e-300))-np.log(np.maximum(p, 1e-300))))))
        mean_kl = float(np.mean(kl)); history.append({'epoch': epoch+1, 'calibrationKL': mean_kl})
        if mean_kl > .03: params = previous; break
        best = [p.copy() for p in params]
    return best, mean, scale, history

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('mode', choices=['pretrain', 'ppo', 'distill']); ap.add_argument('--bootstrap', default='artifacts/guobiao-mahjong/league/bootstrap-v1'); ap.add_argument('--expanded', default='artifacts/guobiao-mahjong/league/joint-data-v1'); ap.add_argument('--model'); ap.add_argument('--episodes'); ap.add_argument('--generation', type=int, default=0); ap.add_argument('--output', required=True); args = ap.parse_args(); out = Path(args.output); out.mkdir(parents=True, exist_ok=True)
    if args.mode == 'ppo':
        model = read(args.model); episodes = read(args.episodes); groups = [g for e in episodes for g in e['trajectories']]; params, mean, scale, history = ppo_update(model, groups, args.generation); trained = save_model(out/'model.json', model, params, mean, scale); folds = {f: sorted({g['seed'] for g in groups if g['fold'] == f}) for f in ['train', 'calibration', 'test']}; details = {'episodes': len(episodes), 'positions': len(groups), 'folds': folds, 'parentModelSha256': digest(Path(args.model)), 'episodesSha256': digest(Path(args.episodes)), 'objective': 'remaining own cumulative fan minus mean opponents /32 + 0.2 final match winner credit', 'ppoClip': .2, 'maximumCalibrationKL': .03}
    else:
        boot = read(Path(args.bootstrap)/'report.json'); assert digest(Path(args.bootstrap)/'groups.json') == boot['groupsSha256']; expanded = read(Path(args.expanded)/'report.json'); assert digest(Path(args.expanded)/'groups.json') == expanded['groupsSha256']; new = read(Path(args.expanded)/'groups.json'); new_ids = {g['id'] for g in new}; raw = [g for g in read(Path(args.bootstrap)/'groups.json') if g['id'] not in new_ids]+new; groups = [search_group(g) for g in raw]
        teacher = read(args.model) if args.mode == 'distill' else None
        if teacher and args.episodes:
            for episode in read(args.episodes):
                for row in episode['trajectories']:
                    f = model_features(row); target = np.zeros((len(f), 8)); mask = np.zeros_like(target); target[row['chosen']] = row['targets']; mask[row['chosen'], 1:] = 1; groups.append(dict(features=f, parents=np.array([p['index'] for p in row['plans']]), prior=np.asarray(row['prior']), target=target, mask=mask, policy=np.asarray(row['oldProbabilities']), fold=row['fold'], seed=row['seed'], weight=1))
        params, mean, scale, history = fit_supervised(groups, 32 if teacher else 64, 20261118, 120 if teacher else 80, teacher)
        template = {'schemaVersion': 1, 'featureNames': boot['featureNames'], 'outputNames': boot['outputNames'], 'settings': {'fanScale': 32, 'matchWinWeight': .2}}; trained = save_model(out/'model.json', template, params, mean, scale); details = {'positions': len(groups), 'expandedPositions': len(new), 'legacyWeight': .25, 'bootstrapSha256': digest(Path(args.bootstrap)/'report.json'), 'expandedSha256': digest(Path(args.expanded)/'report.json'), 'teacherSha256': digest(Path(args.model)) if teacher else None}
    fixture = []
    for g in groups[:8]:
        f = model_features(g); parent = g.get('parents', np.array([p['index'] for p in g.get('plans', [])])); prior = np.asarray(g['prior']); z, _ = logits(core.normalize(f, np.asarray(trained['network']['mean']), np.asarray(trained['network']['scale'])), unpack(trained)); p, _ = distribution(z[:, 0], parent, prior, g.get('temperature', 1)); fixture.append({'features': f.tolist(), 'parents': parent.tolist(), 'prior': prior.tolist(), 'temperature': g.get('temperature', 1), 'predictions': outputs(z).tolist(), 'probabilities': p.tolist()})
    fidelity = {}
    if args.mode == 'distill':
        for fold in ['train', 'calibration', 'test']:
            kl = []; agreement = []; qerrors = []
            for g in groups:
                if g['fold'] != fold: continue
                f = model_features(g); parents = g['parents']; prior = g['prior']; tz, _ = logits(core.normalize(f, np.asarray(teacher['network']['mean']), np.asarray(teacher['network']['scale'])), unpack(teacher)); sz, _ = logits(core.normalize(f, np.asarray(trained['network']['mean']), np.asarray(trained['network']['scale'])), unpack(trained)); tp, _ = distribution(tz[:, 0], parents, prior); sp, _ = distribution(sz[:, 0], parents, prior); kl.append(float(np.sum(tp*(np.log(np.maximum(tp, 1e-300))-np.log(np.maximum(sp, 1e-300)))))); agreement.append(parent_best(tz[:, 0], parents, prior) == parent_best(sz[:, 0], parents, prior)); qerrors.extend(((outputs(tz)[:, 1:]-outputs(sz)[:, 1:])**2).reshape(-1))
            fidelity[fold] = {'groups': len(kl), 'policyKL': float(np.mean(kl)), 'planAgreement': float(np.mean(agreement)), 'valueRMSE': float(np.sqrt(np.mean(qerrors)))}
    write(out/'parity.json', fixture); (out/'trainer.py').write_bytes(TRAINER_BYTES); write(out/'report.json', {'schemaVersion': 1, 'status': 'passed', 'role': 'experimental-joint-'+args.mode, 'modelSha256': digest(out/'model.json'), 'trainerSha256': hashlib.sha256(TRAINER_BYTES).hexdigest(), 'paritySha256': digest(out/'parity.json'), 'history': history, 'fidelity': fidelity, **details}); print(json.dumps({'mode': args.mode, 'modelSha256': digest(out/'model.json'), **details, 'history': history[-6:], 'fidelity': fidelity}, indent=2))
if __name__ == '__main__': main()
