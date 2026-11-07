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
print('Hierarchical actor, PPO clipping/entropy and all value-head gradients passed finite differences.')
