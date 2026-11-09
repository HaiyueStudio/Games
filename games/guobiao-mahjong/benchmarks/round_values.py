"""Frozen public round-boundary value; no hidden hands, future wall or live training."""
import numpy as np

FEATURE_NAMES = ['remaining', 'remaining-squared'] + [f'fan-{i}' for i in range(4)] + [f'score-{i}' for i in range(4)] + [f'fan-gap-{i}' for i in range(1, 4)] + [f'remaining-gap-{i}' for i in range(1, 4)] + ['rank', 'leader-gap']

def winners(fan, score):
    best = max(zip(fan, score)); ids = [i for i in range(4) if (fan[i], score[i]) == best]
    return [float(i in ids)/len(ids) for i in range(4)]

def features(fan, score, hand, seat):
    assert 0 <= hand <= 16 and len(fan) == len(score) == 4 and 0 <= seat < 4
    ids = [(seat+i) % 4 for i in range(4)]; f = [fan[i]/128 for i in ids]; s = [score[i]/256 for i in ids]; left = (16-hand)/16
    gaps = [f[0]-v for v in f[1:]]
    return [left, left*left, *f, *s, *gaps, *(left*v for v in gaps), sum(v > f[0] for v in f[1:])/3, f[0]-max(f[1:])]

def boundaries(game):
    assert len(game['results']) == 16
    fan = [0.]*4; score = [0.]*4; result = [(fan.copy(), score.copy())]
    for hand, r in enumerate(game['results']):
        assert r['hand'] == hand and sum(r['deltas']) == 0
        if r['winner'] is not None:
            assert r['win']['fan'] >= 8
            fan[r['winner']] += r['win']['total']
        score = [a+b for a, b in zip(score, r['deltas'])]; result.append((fan.copy(), score.copy()))
    assert fan == [s['fan'] for s in game['seats']] and score == [s['score'] for s in game['seats']]
    return result

def predict(model, fan, score, hand, seat):
    assert model['schemaVersion'] == 1 and model['featureNames'] == FEATURE_NAMES and model['matchWinWeight'] == .2
    if hand == 16: return np.array([0., 0., winners(fan, score)[seat]])
    x = np.clip((np.array(features(fan, score, hand, seat))-model['mean'])/model['scale'], -4, 4)
    y = np.append(x, 1)@np.array(model['weights'])
    return np.array([max(0., y[0]), max(0., y[1]), np.clip(y[2], 0, 1)])

def rows(games):
    out = []
    for g in games:
        assert g['fold'] in ['train', 'calibration'], 'Round-value training must not consume evaluation walls'
        states = boundaries(g); final_fan, final_score = states[-1]; win = winners(final_fan, final_score)
        for hand, (fan, score) in enumerate(states[:-1]):
            for seat in range(4):
                remaining = [(a-b)/32 for a, b in zip(final_fan, fan)]
                out.append({'features': features(fan, score, hand, seat), 'target': [remaining[seat], sum(v for i, v in enumerate(remaining) if i != seat)/3, win[seat]], 'seed': g['seed'], 'fold': g['fold']})
    train = {r['seed'] for r in out if r['fold'] == 'train'}; cal = {r['seed'] for r in out if r['fold'] == 'calibration'}
    assert train and cal and not train & cal
    return out

def fit(games):
    data = rows(games); train = [r for r in data if r['fold'] == 'train']; cal = [r for r in data if r['fold'] == 'calibration']
    x = np.array([r['features'] for r in train]); y = np.array([r['target'] for r in train]); mean = x.mean(0); scale = np.maximum(x.std(0), .05); xn = np.c_[np.clip((x-mean)/scale, -4, 4), np.ones(len(x))]
    cx = np.c_[np.clip((np.array([r['features'] for r in cal])-mean)/scale, -4, 4), np.ones(len(cal))]; cy = np.array([r['target'] for r in cal]); scores = []
    for ridge in [1., 10., 100.]:
        penalty = np.eye(xn.shape[1])*ridge; penalty[-1, -1] = 0
        weights = np.linalg.solve(xn.T@xn+penalty, xn.T@y); pred = cx@weights; pred[:, :2] = np.maximum(0, pred[:, :2]); pred[:, 2] = np.clip(pred[:, 2], 0, 1)
        loss = float(np.mean(((pred-cy)*[1, 1, .2])**2)); scores.append((loss, ridge, weights))
    loss, ridge, weights = min(scores, key=lambda r: r[0])
    model = {'schemaVersion': 1, 'featureNames': FEATURE_NAMES, 'matchWinWeight': .2, 'mean': mean.tolist(), 'scale': scale.tolist(), 'weights': weights.tolist(), 'ridge': ridge}
    constant = np.tile(y.mean(0), (len(cy), 1))
    return model, {'rows': len(data), 'folds': {f: sorted({r['seed'] for r in data if r['fold'] == f}) for f in ['train', 'calibration']}, 'calibrationMSE': loss, 'constantCalibrationMSE': float(np.mean(((constant-cy)*[1, 1, .2])**2)), 'selection': [{'ridge': r, 'calibrationMSE': v} for v, r, _ in scores]}

def prepare_targets(episodes, model, settings=None):
    """Per-round TD(0) bootstrap; dense potential differences telescope to the terminal objective."""
    from tournament_objective import coefficients
    weights=coefficients(settings)
    for g in episodes:
        states = boundaries(g)
        for row in g['trajectories']:
            hand = row['hand']; seat = row['seat']; before, after = states[hand], states[hand+1]
            assert row['fanSnapshot'] == before[0]
            a = predict(model, *before, hand, seat); b = predict(model, *after, hand+1, seat)
            row['trainingTargets'] = list(row['targets']); row['trainingTargets'][5:] = [row['targets'][1]+b[0], row['targets'][2]+b[1], b[2]]
            row['roundBaseline'] = float(a@weights)
    return episodes
