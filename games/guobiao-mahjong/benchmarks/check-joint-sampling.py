"""Check source mass, deterministic coverage and inclusion weights independently of optimization."""
import importlib.util
from pathlib import Path
import numpy as np
spec = importlib.util.spec_from_file_location('sampling', Path(__file__).with_name('joint_training.py')); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
groups = [dict(source='legacy', weight=.25, fold='train') for _ in range(1533)]+[dict(source='expanded', weight=1., fold='train') for _ in range(3)]
w = m.source_weights(groups); assert np.isclose(w[-3:].sum(), .2) and np.isclose(w[:-3].sum(), .8)
batches = list(m.balanced_batches(groups, np.random.default_rng(19))); assert batches == list(m.balanced_batches(groups, np.random.default_rng(19)))
for batch in batches:
    assert len(batch) == 32 and np.isclose(sum(w for _, w in batch), 1)
    for source, mass in [('legacy', .8), ('expanded', .2)]: assert np.isclose(sum(w for i, w in batch if groups[i]['source'] == source), mass)
mixed = groups+[dict(source='league', weight=8. if i % 2 else 1., fold='train') for i in range(512)]
w = m.source_weights(mixed)
for source, mass in [('legacy', .5), ('expanded', .2), ('league', .3)]: assert np.isclose(sum(p for g, p in zip(mixed, w) if g['source'] == source), mass)
assert np.isclose(w[-1]/w[-2], 8)
assert np.isclose(m.inclusion_average([.08, .001], [{'weight': 1}, {'weight': 9}]), .0089)
assert np.isclose(m.inclusion_average([.08, .001], [{'weight': 1}, {'weight': 1}]), .0405)
tiny = [dict(source='legacy', weight=.25, features=np.zeros((4, 1))) for _ in range(100)]+[dict(source='expanded', weight=1, features=np.array([[10.]]))]
mean, scale = m.normalization(tiny); assert np.isclose(mean[0], 2) and np.isclose(scale[0], 4)
for batch in m.balanced_batches(mixed, np.random.default_rng(23)):
    for source, mass in [('legacy', .5), ('expanded', .2), ('league', .3)]: assert np.isclose(sum(p for i, p in batch if mixed[i]['source'] == source), mass)
try: m.source_weights([dict(source='legacy', weight=1)])
except AssertionError: pass
else: raise AssertionError('Missing full-action source accepted')
print('Source-balanced batches, fixed expanded mass and inverse inclusion weights passed.')
