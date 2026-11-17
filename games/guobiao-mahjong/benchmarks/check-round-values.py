"""Public-feature independence, wall separation and exact potential telescoping."""
import copy, importlib.util
from pathlib import Path
import numpy as np
spec = importlib.util.spec_from_file_location('rv', Path(__file__).with_name('round_values.py')); rv = importlib.util.module_from_spec(spec); spec.loader.exec_module(rv)
def game(seed, fold):
    fan = [0]*4; score = [0]*4; results = []; trajectories = []
    for hand in range(16):
        who = (hand+seed) % 4; total = 8+4*(hand % 3); deltas = [total*3 if i == who else -total for i in range(4)]; y = [0, total/32 if who == 0 else 0, total/96 if who != 0 else 0, float(who == 0), 0, 0, 0, 0]
        trajectories.append({'hand': hand, 'seat': 0, 'fanSnapshot': fan.copy(), 'targets': y}); fan[who] += total; score = [a+b for a, b in zip(score, deltas)]; results.append({'hand': hand, 'winner': who, 'win': {'fan': total, 'total': total}, 'deltas': deltas, 'hands': [[99]]*4})
    for row in trajectories:
        remaining = [a-b for a, b in zip(fan, row['fanSnapshot'])]; row['targets'][5:] = [remaining[0]/32, sum(remaining[1:])/96, rv.winners(fan, score)[0]]
    return {'seed': seed, 'fold': fold, 'results': results, 'seats': [{'fan': f, 'score': s} for f, s in zip(fan, score)], 'trajectories': trajectories}
games = [game(11, 'train'), game(12, 'train'), game(21, 'calibration')]; model, report = rv.fit(games); assert model == rv.fit(copy.deepcopy(games))[0]
poison = copy.deepcopy(games)
for g in poison:
    g['wall'] = [33]*144
    for r in g['results']: r['hands'] = [[33, 33, 33, 33]]*4
assert rv.fit(poison)[0] == model
for g in games:
    states = rv.boundaries(g)
    for seat in range(4):
        initial = rv.predict(model, *states[0], 0, seat); total = 0
        for hand in range(16):
            before = rv.predict(model, *states[hand], hand, seat); after = rv.predict(model, *states[hand+1], hand+1, seat); change = [(a-b)/32 for a, b in zip(states[hand+1][0], states[hand][0])]; total += change[seat]-sum(v for i, v in enumerate(change) if i != seat)/3+after[0]-after[1]+.2*after[2]-(before[0]-before[1]+.2*before[2])
        fan, score = states[-1]; expected = fan[seat]/32-sum(v for i, v in enumerate(fan) if i != seat)/96+.2*rv.winners(fan, score)[seat]-(initial[0]-initial[1]+.2*initial[2]); assert abs(total-expected) < 1e-12
    rv.prepare_targets([g], model); assert all(np.isfinite(r['trainingTargets']).all() for r in g['trajectories'])
try: rv.fit([game(11, 'train'), game(11, 'calibration')])
except AssertionError: pass
else: raise AssertionError('Overlapping wall folds accepted')
try: rv.fit([game(11, 'train'), game(21, 'test')])
except AssertionError: pass
else: raise AssertionError('Evaluation game used for frozen value fitting')
print('Frozen public round values, no hidden inputs, disjoint walls and telescoping rewards passed.')
