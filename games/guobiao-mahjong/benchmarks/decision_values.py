"""Offline frozen public-state critic. Fit older walls only; never use action choice as input."""
import hashlib
import json
from pathlib import Path
import numpy as np
import round_values as rounds

WIDTH = 234+34+3

def public_features(row, round_model):
    o = row['observation']; seat = o['seat']; prior = rounds.predict(round_model, [p['fan'] for p in o['players']], [p['score'] for p in o['players']], o['handIndex'], seat)
    # Policy expectation over every candidate, independent of the sampled chosen action.
    f = np.asarray(row['features'], dtype=float); p = np.asarray(row['oldProbabilities'], dtype=float)
    assert f.ndim == 2 and f.shape[0] == len(p) and f.shape[1] >= 234 and np.isfinite(f).all() and np.all(p >= 0) and abs(p.sum()-1) < 1e-8
    counts = np.bincount(o['hand'], minlength=34)/4
    x = np.r_[p@f[:, :234], counts, prior]; assert len(x) == WIDTH and np.isfinite(x).all()
    return x, prior

def predict(model, row, round_model):
    assert model['schemaVersion'] == 1 and model['inputWidth'] == WIDTH
    x, prior = public_features(row, round_model); z = np.r_[np.clip((x-model['mean'])/model['scale'], -4, 4), 1]
    value = prior+z@np.asarray(model['weights']); return np.r_[np.maximum(value[:2], 0), np.clip(value[2], 0, 1)]

def fit(episodes, round_model):
    seen = set(); identities=set(); rows = []; folds = {}
    for g in episodes:
        assert g['fold'] in ['train', 'calibration'], 'State critic cannot fit evaluation episodes'
        identity=(g['seed'],g['rotation']); assert identity not in identities, 'Repeated critic match'; identities.add(identity); seen.add(g['seed']); folds.setdefault(g['fold'], []).append(g['seed']); rounds.boundaries(g)
        for r in g['trajectories']:
            assert r['seed'] == g['seed'] and r['fold'] == g['fold']
            x, prior = public_features(r, round_model); rows.append((g['seed'], g['fold'], x, prior, np.asarray(r['targets'][5:]), r['weight']))
    folds={k:sorted(set(v)) for k,v in folds.items()}
    assert folds.get('train') and folds.get('calibration') and not set(folds['train']) & set(folds['calibration'])
    def arrays(fold):
        data = [r for r in rows if r[1] == fold]; w = np.array([r[5]/sum(q[5] for q in data if q[0] == r[0]) for r in data]); w /= w.sum()
        return np.array([r[2] for r in data]), np.array([r[3] for r in data]), np.array([r[4] for r in data]), w
    x, prior, y, w = arrays('train'); cx, cp, cy, cw = arrays('calibration'); mean = np.average(x, axis=0, weights=w); scale = np.maximum(np.sqrt(np.average((x-mean)**2, axis=0, weights=w)), .05)
    tx = np.c_[np.clip((x-mean)/scale, -4, 4), np.ones(len(x))]; vx = np.c_[np.clip((cx-mean)/scale, -4, 4), np.ones(len(cx))]
    def loss(p): return float(np.average(np.mean(((p-cy)*[1, 1, .2])**2, axis=1), weights=cw))
    candidates = [(loss(cp), 'round-only', np.zeros((WIDTH+1, 3)))]; scores = []
    for ridge in [.01, .1, 1., 10.]:
        penalty = np.eye(WIDTH+1)*ridge; penalty[-1, -1] = .0001
        weights = np.linalg.solve(tx.T@(w[:, None]*tx)+penalty, tx.T@(w[:, None]*(y-prior)))
        p = cp+vx@weights; p[:, :2] = np.maximum(0, p[:, :2]); p[:, 2] = np.clip(p[:, 2], 0, 1); candidates.append((loss(p), ridge, weights))
    best, ridge, weights = min(candidates, key=lambda r:r[0]); model = dict(schemaVersion=1, inputWidth=WIDTH, mean=mean.tolist(), scale=scale.tolist(), weights=weights.tolist(), ridge=ridge, fitSeeds=sorted(seen))
    return model, dict(rows=len(rows), folds=folds, calibrationMSE=best, roundOnlyCalibrationMSE=candidates[0][0], selection=[dict(ridge=r, calibrationMSE=v) for v, r, _ in candidates], inputDescription='policy-mean public joint features + own tile counts + frozen public round value', hiddenInputs=False, chosenActionInput=False, weighting='equal wall mass; inverse inclusion weights within wall')
