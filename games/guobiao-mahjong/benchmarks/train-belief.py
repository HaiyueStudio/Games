"""Public-observation opponent model. Privileged hands are labels, never inputs."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import numpy as np

spec = importlib.util.spec_from_file_location('core', Path(__file__).with_name('train-values.py')); core = importlib.util.module_from_spec(spec); spec.loader.exec_module(core)
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p, data): p.write_text(json.dumps(data, separators=(',', ':'), allow_nan=False)+'\n')
def logits(x, p):
    h = np.maximum(0, x@p[0]+p[1]); return h@p[2]+p[3], h
def metrics(p, y):
    def group(a, b):
        a = a.reshape(-1); b = b.reshape(-1); order = np.argsort(a, kind='stable'); ranks = np.empty(len(a)); sorted_a = a[order]; starts = np.r_[0, np.flatnonzero(np.diff(sorted_a))+1]; ends = np.r_[starts[1:], len(a)]
        for start, end in zip(starts, ends): ranks[order[start:end]] = (start+1+end)/2
        positives = b.sum(); negatives = len(b)-positives
        return {'brier': float(np.mean((a-b)**2)), 'logLoss': float(np.mean(-b*np.log(np.maximum(a, 1e-12))-(1-b)*np.log(np.maximum(1-a, 1e-12)))), 'positiveRate': float(b.mean()), 'auc': float((ranks[b>.5].sum()-positives*(positives+1)/2)/(positives*negatives)) if positives and negatives else None}
    return {'ready': group(p[:, :1], y[:, :1]), 'ronTiles': group(p[:, 1:35], y[:, 1:35]), 'patterns': group(p[:, 35:43], y[:, 35:43]), 'fanMAE': float(np.mean(np.abs(np.expm1(p[:, -1]*np.log(89))-np.expm1(y[:, -1]*np.log(89))))) }

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('data'); ap.add_argument('--output', required=True); args = ap.parse_args(); data = Path(args.data); out = Path(args.output); out.mkdir(parents=True, exist_ok=True); report = json.loads((data/'report.json').read_text()); assert report['status'] == 'passed' and digest(data/'rows.f32') == report['dataSha256']
    rows = np.fromfile(data/'rows.f32', dtype='<f4').reshape(-1, report['width']).astype(np.float64); d = report['input']; k = report['output']; raw = rows[:, :d]; y = rows[:, d:d+k]; seeds = rows[:, -1].astype(int); assert np.isfinite(rows).all() and np.all((y >= 0)&(y <= 1))
    folds = {f: np.flatnonzero(np.isin(seeds, ss)) for f, ss in report['folds'].items()}; assert all(len(v) for v in folds.values()); sets = [set(v) for v in report['folds'].values()]; assert all(not a&b for i, a in enumerate(sets) for b in sets[i+1:]); train = folds['train']; cal = folds['calibration']
    mean = raw[train].mean(0).astype(np.float32).astype(np.float64); scale = np.maximum(raw[train].std(0), .05).astype(np.float32).astype(np.float64); x = core.normalize(raw, mean, scale); rate = np.clip(y[train].mean(0), 1e-4, 1-1e-4); weights = np.minimum(10, (1-rate)/rate); weights[-1] = 1
    rng = np.random.default_rng(20261117); hidden = 24; params = [rng.normal(0, .04, (d, hidden)), np.zeros(hidden), rng.normal(0, .02, (hidden, k)), np.log(rate*weights/(1-rate))]; opt = core.Adam(params); best = None; best_loss = float('inf'); history = []; stale = 0
    for epoch in range(100):
        shuffled = rng.permutation(train)
        for batch in np.array_split(shuffled, int(np.ceil(len(shuffled)/256))):
            z, h = logits(x[batch], params); p = core.sigmoid(z); dz = (p*(1-y[batch])-(1-p)*y[batch]*weights)/(len(batch)*k); opt.update(params, core.gradient(x[batch], h, dz, params))
        z, _ = logits(x[cal], params); p = core.sigmoid(z-np.log(weights)); score = float(np.mean(-y[cal]*np.log(np.maximum(p, 1e-12))-(1-y[cal])*np.log(np.maximum(1-p, 1e-12)))); history.append(score)
        if score < best_loss-1e-7: best_loss = score; best = [v.copy() for v in params]; stale = 0
        else: stale += 1
        if stale >= 14: break
    params = [v.astype(np.float16).astype(np.float64) for v in best]; z, _ = logits(x, params); temperature = np.ones(k); bias = -np.log(weights)
    for ids in [np.array([0]), np.arange(1, 35), np.arange(35, 43)]:
        target = y[cal][:, ids]; base = z[cal][:, ids]-np.log(weights[ids]); chosen = (float('inf'), 1, 0)
        for t in [.5, .75, 1, 1.5, 2, 3]:
            for b in [-1, -.5, 0, .5, 1]:
                p = core.sigmoid(base/t+b); loss = float(np.mean(-target*np.log(np.maximum(p, 1e-12))-(1-target)*np.log(np.maximum(1-p, 1e-12))))
                if loss < chosen[0]: chosen = (loss, t, b)
        temperature[ids] = chosen[1]; bias[ids] = -np.log(weights[ids])/chosen[1]+chosen[2]
    predictions = core.sigmoid(z/temperature+bias); model = {'schemaVersion': 1, 'featureNames': report['featureNames'], 'outputNames': report['outputNames'], 'network': core.packed(params, mean, scale), 'calibration': {'temperature': temperature.tolist(), 'bias': bias.tolist()}}; write(out/'belief.json', model)
    scores = {f: metrics(predictions[ids], y[ids]) for f, ids in folds.items()}; constants = {f: metrics(np.tile(rate, (len(ids), 1)), y[ids]) for f, ids in folds.items()}
    fixture = []
    for r in json.loads((data/'parity.json').read_text()):
        a = core.normalize(np.asarray(r['features']), mean, scale); zz, _ = logits(a, params); fixture.append({**r, 'predictions': core.sigmoid(zz/temperature+bias).tolist()})
    write(out/'parity.json', fixture); (out/'trainer.py').write_bytes(Path(__file__).read_bytes())
    write(out/'report.json', {'schemaVersion': 1, 'status': 'passed', 'role': 'experimental-opponent-belief', 'rows': len(rows), 'hidden': hidden, 'parameters': sum(v.size for v in params), 'folds': report['folds'], 'dataSha256': report['dataSha256'], 'dataReportSha256': digest(data/'report.json'), 'trainerSha256': digest(Path(__file__)), 'modelSha256': digest(out/'belief.json'), 'paritySha256': digest(out/'parity.json'), 'metrics': scores, 'constantMetrics': constants, 'calibrationLoss': best_loss, 'history': history, 'limitations': report['limitations']+['Marginal belief heads are not an exact joint posterior', 'Calibration chooses bounded shared temperatures using calibration walls only', 'No claim of improved playing strength from these predictive metrics']}); print(json.dumps({'rows': len(rows), 'parameters': sum(v.size for v in params), 'metrics': scores, 'constantMetrics': constants}, indent=2))
if __name__ == '__main__': main()
