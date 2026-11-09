"""Source-balanced supervised batches. Rare captures retain their inverse inclusion weights."""
import math
import numpy as np

def inclusion_average(values, groups):
    weights = np.array([g['weight'] for g in groups])
    assert len(values) == len(weights) and len(weights) and np.isfinite(weights).all() and np.all(weights > 0)
    return float(np.average(values, weights=weights))

def source_masses(groups):
    sources = {g['source'] for g in groups}
    assert sources <= {'legacy', 'expanded', 'league'} and 'expanded' in sources
    raw = {'legacy': .5, 'expanded': .2, 'league': .3} if 'league' in sources else {'legacy': .8, 'expanded': .2}
    total = sum(raw[s] for s in sources)
    return {s: raw[s]/total for s in sorted(sources)}

def source_summary(groups):
    return {fold: {'mass': source_masses([g for g in groups if g['fold'] == fold]), 'groups': {s: sum(g['fold'] == fold and g['source'] == s for g in groups) for s in sorted({g['source'] for g in groups})}} for fold in ['train', 'calibration', 'test'] if any(g['fold'] == fold for g in groups)}

def source_weights(groups):
    masses = source_masses(groups)
    totals = {s: sum(g['weight'] for g in groups if g['source'] == s) for s in masses}
    assert all(np.isfinite(g['weight']) and g['weight'] > 0 for g in groups)
    return np.array([masses[g['source']]*g['weight']/totals[g['source']] for g in groups])

def normalization(groups):
    weights = source_weights(groups); raw = np.concatenate([g['features'] for g in groups]); row_weights = np.concatenate([np.full(len(g['features']), w/len(g['features'])) for g, w in zip(groups, weights)])
    assert np.isfinite(raw).all() and np.isclose(row_weights.sum(), 1)
    mean = np.sum(raw*row_weights[:, None], axis=0); scale = np.maximum(np.sqrt(np.sum((raw-mean)**2*row_weights[:, None], axis=0)), .05)
    return mean.astype(np.float32).astype(np.float64), scale.astype(np.float32).astype(np.float64)

def balanced_batches(groups, rng, batch_size=32):
    masses = source_masses(groups); assert batch_size >= len(masses)
    counts = {s: max(1, int(batch_size*p)) for s, p in masses.items()}
    while sum(counts.values()) < batch_size:
        s = max(masses, key=lambda s: batch_size*masses[s]-counts[s]); counts[s] += 1
    while sum(counts.values()) > batch_size:
        s = max((s for s in masses if counts[s] > 1), key=lambda s: counts[s]-batch_size*masses[s]); counts[s] -= 1
    pools = {s: np.array([i for i, g in enumerate(groups) if g['source'] == s]) for s in masses}; queues = {s: [] for s in masses}
    for _ in range(math.ceil(len(groups)/batch_size)):
        batch = []
        for s, quota in counts.items():
            ids = []
            while len(ids) < quota:
                if not queues[s]: queues[s] = rng.permutation(pools[s]).tolist()
                ids.append(queues[s].pop())
            total = sum(groups[i]['weight'] for i in ids)
            assert np.isfinite(total) and total > 0
            batch.extend((i, masses[s]*groups[i]['weight']/total) for i in ids)
        yield batch
