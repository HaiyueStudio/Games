"""CPU inference for the three published KD students and their mean-softmax ensemble."""
import hashlib
import json
from pathlib import Path
from threading import RLock
import time
import numpy as np
from adapter import encode
from vendor.numpy_resfused import NumpyResFused

ROOT = Path(__file__).resolve().parent
MODELS = [
    {'id': 'kd-s0', 'name': 'KD Student 0', 'members': [0]},
    {'id': 'kd-s1', 'name': 'KD Student 1', 'members': [1]},
    {'id': 'kd-s2', 'name': 'KD Student 2', 'members': [2]},
    {'id': 'kdens3', 'name': 'KD Ensemble 3', 'members': [0, 1, 2]},
]

class ModelRuntime:
    def __init__(self, weights):
        self.weights = Path(weights)
        self.lockfile = json.loads((ROOT / 'models.lock.json').read_text())
        self.cache = {}
        self.lock = RLock()
    def catalog(self):
        return [{'id': m['id'], 'name': m['name'], 'rules': 'MCR', 'license': 'MIT',
                 'available': all((self.weights / f'kdens_s{i}_fp16.npz').is_file() for i in m['members']),
                 'parameters': {'temperature': {'default': 0, 'min': 0, 'max': 2}, 'seed': {'default': 20261105, 'min': 0, 'max': 4294967295}}} for m in MODELS]
    def load(self, index):
        if index not in self.cache:
            name = f'kdens_s{index}_fp16.npz'
            record = next(f for f in self.lockfile['files'] if f['name'] == name)
            path = self.weights / name
            if not path.is_file(): raise FileNotFoundError('Weights missing; run fetch_models.py')
            if path.stat().st_size != record['size'] or hashlib.sha256(path.read_bytes()).hexdigest() != record['sha256']:
                raise ValueError('Weight checksum mismatch: ' + name)
            self.cache[index] = NumpyResFused(str(path))
        return self.cache[index]
    def decide(self, model_id, request):
        model = next((m for m in MODELS if m['id'] == model_id), None)
        if model is None: raise KeyError('Unknown model')
        if request.get('protocol') != 'haiyue.mcr/1' or not isinstance(request.get('requestId'), str): raise ValueError('Invalid decision request')
        o = request['observation']
        if 'includePolicy' in request and type(request['includePolicy']) is not bool: raise ValueError('includePolicy must be boolean')
        if type(o.get('revision')) is not int or o['revision'] < 0: raise ValueError('Invalid revision')
        params = request.get('parameters', {})
        if not isinstance(params, dict) or set(params) - {'temperature', 'seed'}: raise ValueError('Unknown model parameter')
        temperature, seed = params.get('temperature', 0), params.get('seed', 20261105)
        if type(temperature) not in (int, float) or not np.isfinite(temperature) or not 0 <= temperature <= 2: raise ValueError('Temperature must be 0..2')
        if type(seed) is not int or not 0 <= seed <= 4294967295: raise ValueError('Seed must be uint32')
        obs, mask, indices = encode(o)
        started = time.perf_counter()
        with self.lock:
            probabilities = []
            for member in model['members']:
                logits = self.load(member).logits(obs, mask)[indices]
                if not np.all(np.isfinite(logits)): raise ValueError('Non-finite model output')
                p = np.exp(logits.astype(np.float64) - np.max(logits))
                probabilities.append(p / p.sum())
            p = np.mean(probabilities, axis=0)
        if temperature == 0:
            selected = int(np.argmax(p))
        else:
            q = np.exp(np.log(np.maximum(p, 1e-300)) / temperature - np.max(np.log(np.maximum(p, 1e-300)) / temperature))
            q /= q.sum()
            rng = np.random.default_rng(np.random.SeedSequence([seed, o['revision'], o['seat'], o['handIndex']]))
            selected = int(rng.choice(len(indices), p=q))
        reply = {'requestId': request['requestId'], 'revision': o['revision'], 'action': o['legalActions'][selected],
                'model': model_id, 'inferenceMs': round((time.perf_counter() - started) * 1000, 2),
                'parameters': {'temperature': temperature, 'seed': seed}, 'weightsRevision': self.lockfile['revision']}
        if request.get('includePolicy'): reply['policy'] = {'indices': indices, 'probabilities': p.tolist()}
        return reply
