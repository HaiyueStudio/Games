"""Fit an ensemble to paired, full-hand counterfactual outcomes. No logged action is a target."""
import argparse
import hashlib
import json
import math
import time
from pathlib import Path
import numpy as np

def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def sigmoid(z): return 1 / (1 + np.exp(-np.clip(z, -40, 40)))
def normalize(x, mean, scale): return np.clip((x - mean) / scale, -5, 5)
def forward(x, p):
    h = np.maximum(0, x @ p[0] + p[1]); z = h @ p[2] + p[3]
    return np.concatenate([np.logaddexp(0, z[:, :2]), sigmoid(z[:, 2:])], axis=1), z, h
def gradient(x, h, dz, p): return [x.T @ ((dz @ p[2].T) * (h > 0)), ((dz @ p[2].T) * (h > 0)).sum(0), h.T @ dz, dz.sum(0)]
class Adam:
    def __init__(self, p): self.m = [np.zeros_like(v) for v in p]; self.v = [np.zeros_like(v) for v in p]; self.n = 0
    def update(self, p, grads):
        self.n += 1
        for i, (v, g) in enumerate(zip(p, grads)):
            g = np.clip(g + .0002 * v, -2, 2); self.m[i] = .9 * self.m[i] + .1 * g; self.v[i] = .999 * self.v[i] + .001 * g * g
            v -= .001 * self.m[i] / (1 - .9 ** self.n) / (np.sqrt(self.v[i] / (1 - .999 ** self.n)) + 1e-8)
def packed(p, mean, scale): return dict(mean=mean.tolist(), scale=scale.tolist(), w1=p[0].tolist(), b1=p[1].tolist(), w2=p[2].tolist(), b2=p[3].tolist())

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('data'); parser.add_argument('--output', required=True); args = parser.parse_args()
    directory = Path(args.data); out = Path(args.output); out.mkdir(parents=True, exist_ok=True)
    report = json.loads((directory / 'report.json').read_text()); assert digest(directory / 'groups.json') == report['groupsSha256']
    groups = json.loads((directory / 'groups.json').read_text()); width = len(report['featureNames']); features = []; targets = []; membership = []; categories = []; observations = []
    for i, g in enumerate(groups):
        for row in g['rows']:
            assert len(row['outcomes']) == report['worlds']; values = []
            for r in row['outcomes']:
                assert len(r['fans']) == 4 and all(v >= 0 for v in r['fans'])
                values.append([r['fans'][0] / 32, sum(r['fans'][1:]) / 96, float(r['winner'] == 0), float(r['winner'] is not None and not r['selfDrawn'] and r['from'] == 0)])
            features.append(row['features']); targets.append(np.mean(values, axis=0)); membership.append(i); categories.append(g['category']); observations.append(g['observation'])
    raw = np.asarray(features, dtype=np.float64); y = np.asarray(targets); membership = np.asarray(membership); assert raw.shape[1] == width and np.isfinite(raw).all()
    folds = {fold: np.array([groups[i]['fold'] == fold for i in membership]) for fold in report['config']['folds']}
    seed_sets = list(map(set, report['config']['folds'].values())); assert all(not a & b for i, a in enumerate(seed_sets) for b in seed_sets[i+1:])
    train = np.flatnonzero(folds['train']); cal = np.flatnonzero(folds['calibration']); mean = raw[train].mean(0); scale = np.maximum(raw[train].std(0), .05); x = normalize(raw, mean, scale)
    group_ids = [np.flatnonzero(membership == i) for i in range(len(groups))]; ensemble = []; histories = []; rng = np.random.default_rng(20261108)
    def loss(pred, mask):
        # Centered within-position loss trains advantages using common sampled worlds.
        ids = np.flatnonzero(mask); mse = np.mean((pred[ids, :2] - y[ids, :2]) ** 2); pair = []
        for i, indices in enumerate(group_ids):
            if mask[indices[0]] and len(indices) > 1:
                p = pred[indices, 0] - pred[indices, 1]; t = y[indices, 0] - y[indices, 1]; pair.extend(((p - p.mean()) - (t - t.mean())) ** 2)
        return float(mse + np.mean(pair))
    for member in range(3):
        p = [rng.normal(0, .08, (width, 32)), np.zeros(32), rng.normal(0, .03, (32, 4)), np.array([-2., -3., -2., -2.])]; opt = Adam(p); best = None; best_loss = float('inf'); history = []
        # Bootstrap whole original wall seeds, never treat multiple samples of one wall as independent.
        seeds = report['config']['folds']['train']; boot = rng.choice(seeds, len(seeds), replace=True); weights = {s: int(np.sum(boot == s)) for s in seeds}
        train_groups = [i for i, g in enumerate(groups) if g['fold'] == 'train' for _ in range(weights[g['seed']])]
        for epoch in range(100):
            shuffled = rng.permutation(train_groups)
            for batch in np.array_split(shuffled, math.ceil(len(shuffled) / 32)):
                ids = np.concatenate([group_ids[i] for i in batch]); pred, z, h = forward(x[ids], p); dz = np.zeros_like(z)
                dz[:, :2] = (pred[:, :2] - y[ids, :2]) * sigmoid(z[:, :2]) / len(ids)
                # Auxiliary win/deal-in heads preserve distinctions hidden by the mean fan return.
                dz[:, 2:] = .08 * (pred[:, 2:] - y[ids, 2:]) / len(ids)
                at = 0
                for i in batch:
                    n = len(group_ids[i]); sl = slice(at, at+n); delta = pred[sl, 0] - pred[sl, 1] - (y[ids[sl], 0] - y[ids[sl], 1]); delta -= delta.mean()
                    dz[sl, 0] += 2 * delta * sigmoid(z[sl, 0]) / len(ids); dz[sl, 1] -= 2 * delta * sigmoid(z[sl, 1]) / len(ids); at += n
                opt.update(p, gradient(x[ids], h, dz, p))
            pred = forward(x, p)[0]; score = loss(pred, folds['calibration']); history.append(score)
            if score < best_loss: best_loss = score; best = [v.copy() for v in p]
        ensemble.append(best); histories.append(history); print(json.dumps({'member': member, 'calibrationLoss': best_loss, 'epoch': int(np.argmin(history)) + 1}), flush=True)
    prediction = np.mean([forward(x, p)[0] for p in ensemble], axis=0); constant = np.tile(y[train].mean(0), (len(y), 1)); metrics = {}
    for fold, mask in folds.items():
        ids = np.flatnonzero(mask); group_indices = [i for i, g in enumerate(groups) if g['fold'] == fold]; choices = []; prior_choices = []; ties = 0
        for i in group_indices:
            indices = group_ids[i]; g = groups[i]; q = y[indices, 0] - y[indices, 1]; estimate = prediction[indices, 0] - prediction[indices, 1]
            choices.append(float(q[np.argmax(estimate)])); prior_choices.append(float(q[np.argmax([g['prior'][r['plan']['index']] for r in g['rows']])]))
            ties += int(np.ptp(q) < 1e-12)
        metrics[fold] = {'groups': len(group_indices), 'plans': len(ids), 'loss': loss(prediction, mask), 'constantLoss': loss(constant, mask), 'ownFanMAE': float(np.mean(np.abs(prediction[ids, 0] - y[ids, 0])) * 32), 'pairedLabelUtility': float(np.mean(choices) * 32), 'priorLabelUtility': float(np.mean(prior_choices) * 32), 'tiedGroups': ties}
    model = {'schemaVersion': 1, 'featureVersion': report['featureVersion'], 'featureNames': report['featureNames'], 'networks': [packed(p, mean, scale) for p in ensemble], 'settings': {'minimumPrior': .01, 'minimumGain': .03, 'priorWeight': .02, 'uncertaintyWeight': 2, 'maximumPlans': 18}, 'objective': 'expected own fan minus mean opponents fan, current hand', 'fanScale': 32}
    (out / 'model.json').write_text(json.dumps(model, separators=(',', ':'), allow_nan=False) + '\n')
    # Independent NumPy reference, including inference transforms and all three ensemble members.
    fixtures = []
    for fold in ['train', 'calibration', 'test']:
        candidates = [i for i in range(len(raw)) if folds[fold][i]]
        for category in ['discard', 'claim', 'kong']:
            found = [i for i in candidates if categories[i] == category]
            for i in found[:2]: fixtures.append({'features': raw[i].tolist(), 'predictions': [forward(x[i:i+1], p)[0][0].tolist() for p in ensemble]})
    (out / 'parity.json').write_text(json.dumps({'schemaVersion': 1, 'rows': fixtures}) + '\n')
    result = {'schemaVersion': 1, 'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'trainingSeed': 20261108, 'numpy': np.__version__, 'dataReportSha256': digest(directory / 'report.json'), 'groupsSha256': report['groupsSha256'], 'trainerSha256': digest(Path(__file__)), 'modelSha256': digest(out / 'model.json'), 'paritySha256': digest(out / 'parity.json'), 'folds': report['config']['folds'], 'metrics': metrics, 'history': histories, 'status': 'passed', 'limitations': report['limitations'] + ['Offline prediction accuracy and simulated-label utility are not independent game-strength evidence', 'Ensemble disagreement is a heuristic uncertainty measure, not a calibrated confidence interval']}
    (out / 'training-report.json').write_text(json.dumps(result, indent=2) + '\n'); print(json.dumps(metrics, indent=2), flush=True)
if __name__ == '__main__': main()
