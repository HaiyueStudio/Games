"""Numerically check the custom trainer, independently of game-strength evaluation."""
import importlib.util
from pathlib import Path
import numpy as np

spec = importlib.util.spec_from_file_location('value_trainer', Path(__file__).with_name('train-values.py'))
trainer = importlib.util.module_from_spec(spec); spec.loader.exec_module(trainer)
rng = np.random.default_rng(581)
x = rng.normal(0, .2, (4, 3)); y = np.array([[.5, .2, 1., 0.], [.3, .4, 0., 1.], [.1, .1, 0., 0.], [.7, .2, 1., 0.]])
p = [rng.normal(0, .1, (3, 2)), np.ones(2), rng.normal(0, .1, (2, 4)), np.zeros(4)]
def loss():
    pred, _, _ = trainer.forward(x, p)
    q = pred[:, 0] - pred[:, 1]; target = y[:, 0] - y[:, 1]
    pair = np.concatenate([(q[s] - q[s].mean()) - (target[s] - target[s].mean()) for s in [slice(0, 2), slice(2, 4)]])
    return np.mean((pred[:, :2] - y[:, :2]) ** 2) + np.mean(pair ** 2) - .08 * np.sum(y[:, 2:] * np.log(pred[:, 2:]) + (1-y[:, 2:]) * np.log(1-pred[:, 2:])) / len(x)
pred, z, h = trainer.forward(x, p); dz = np.zeros_like(z)
dz[:, :2] = (pred[:, :2] - y[:, :2]) * trainer.sigmoid(z[:, :2]) / len(x); dz[:, 2:] = .08 * (pred[:, 2:] - y[:, 2:]) / len(x)
for sl in [slice(0, 2), slice(2, 4)]:
    delta = pred[sl, 0] - pred[sl, 1] - y[sl, 0] + y[sl, 1]; delta -= delta.mean()
    dz[sl, 0] += 2 * delta * trainer.sigmoid(z[sl, 0]) / len(x); dz[sl, 1] -= 2 * delta * trainer.sigmoid(z[sl, 1]) / len(x)
analytic = trainer.gradient(x, h, dz, p); maximum = 0
for values, expected in zip(p, analytic):
    for index in np.ndindex(values.shape):
        original = values[index]; values[index] = original + 1e-5; upper = loss(); values[index] = original - 1e-5; lower = loss(); values[index] = original
        maximum = max(maximum, abs((upper-lower)/2e-5 - expected[index]))
assert maximum < 1e-7, maximum
print(f'Action-value gradient check passed; maximum finite-difference error {maximum:.3g}')
