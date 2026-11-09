"""Finite-difference checks for hierarchical policy, clipping, entropy and eight-head value losses."""
import importlib.util
from pathlib import Path
import numpy as np
spec = importlib.util.spec_from_file_location('joint', Path(__file__).with_name('train-joint.py')); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
rng = np.random.default_rng(27); z = rng.normal(0, .5, 5); parents = np.array([0, 1, 1, 2, 2]); prior = np.array([.4, .35, .25]); target = rng.random(5); target /= target.sum(); epsilon = 1e-5
def numerical(f, x):
    grad = np.zeros_like(x)
    for i in range(len(x)):
        plus = x.copy(); minus = x.copy(); plus[i] += epsilon; minus[i] -= epsilon; grad[i] = (f(plus)-f(minus))/(2*epsilon)
    return grad
for temperature in [.7, 1, 1.3]:
    _, analytic = m.ce_gradient(z, parents, prior, target, temperature); numeric = numerical(lambda a: m.ce_gradient(a, parents, prior, target, temperature)[0], z); assert np.max(np.abs(analytic-numeric)) < 1e-8
    p, _ = m.distribution(z, parents, prior, temperature); _, analytic = m.ce_gradient(z, parents, prior, -p*(np.log(p)+1), temperature); numeric = numerical(lambda a: np.sum(m.distribution(a, parents, prior, temperature)[0]*np.log(m.distribution(a, parents, prior, temperature)[0])), z); assert np.max(np.abs(analytic-numeric)) < 1e-8
    anchor = np.array([.01, .98, .01]); _, analytic = m.parent_ce_gradient(z, parents, prior, anchor, temperature); numeric = numerical(lambda a: m.parent_ce_gradient(a, parents, prior, anchor, temperature)[0], z); assert np.max(np.abs(analytic-numeric)) < 1e-8
    for parent in set(parents):
        ids = np.flatnonzero(parents == parent); assert all(analytic[i] == 0 for i in ids if i != ids[np.argmax(z[ids])])
    for advantage in [-1.1, .9]:
        chosen = 2; old_log = np.log(p[chosen])
        def loss(a):
            ratio = np.exp(np.log(m.distribution(a, parents, prior, temperature)[0][chosen])-old_log); return -min(ratio*advantage, np.clip(ratio, .8, 1.2)*advantage)
        analytic = -advantage*m.log_gradient(z, parents, prior, chosen, temperature); assert np.max(np.abs(analytic-numerical(loss, z))) < 1e-8
    extreme_old = np.log(p[2]/1.5)
    clipped = lambda a: -min(np.exp(np.log(m.distribution(a, parents, prior, temperature)[0][2])-extreme_old), 1.2)
    assert np.max(np.abs(numerical(clipped, z))) < 1e-8
raw = rng.normal(size=(3, 8)); values = np.abs(rng.normal(size=(3, 8))); values[:, m.SIG] = rng.random((3, 3)); mask = np.ones_like(raw); mask[:, 0] = 0; _, analytic = m.value_gradient(raw, values, mask)
numeric = numerical(lambda a: m.value_gradient(a.reshape(3, 8), values, mask)[0], raw.reshape(-1)).reshape(3, 8); assert np.max(np.abs(analytic-numeric)) < 1e-8
print('Hierarchical actor, fixed original parent anchor, PPO clipping/entropy and all value-head gradients passed finite differences.')
# Shared training/checkpoint objective and confidence-preserving distillation.
g = dict(parents=parents, prior=prior, policy=target, target=values, mask=mask)
raw = rng.normal(size=(5, 8)); g['target'] = np.tile(values[0], (5, 1)); g['mask'] = np.ones_like(raw); g['mask'][:,0] = 0
_, analytic = m.supervised_loss(raw, g); numeric = numerical(lambda a:m.supervised_loss(a.reshape(5,8),g)[0], raw.reshape(-1)).reshape(5,8); assert np.max(np.abs(analytic-numeric)) < 1e-8
low=g['mask'].copy(); low[0,1:5]=.1; pred=m.outputs(raw); blended, confidence=m.distillation_values(pred,g['target'],low)
assert np.allclose(confidence[0,1:5],.73) and np.allclose(confidence[1,1:],1) and np.all(confidence[:,0] == 0)
assert np.allclose(blended[0,1:5],(.7*pred[0,1:5]+.03*g['target'][0,1:5])/.73)
zero=np.zeros_like(low); pure, confidence=m.distillation_values(pred,g['target'],zero); assert np.allclose(pure[:,1:],pred[:,1:]) and np.allclose(confidence[:,1:],.7)
print('Training/selection objective and per-plan distillation confidence passed.')
