"""Versioned sixteen-hand objective, shared by labels, PPO and GAE."""
import numpy as np

def coefficients(settings=None):
    settings=settings or {}; fan=settings.get('relativeFanWeight',1.); first=settings.get('matchWinWeight',.2)
    if settings.get('objective') == 'tournament-v1': assert fan == .2 and first == 1
    assert np.isfinite([fan,first]).all() and 0 <= fan <= 1 and 0 <= first <= 1
    return np.array([fan,-fan,first])

def bootstrap_targets(group, outcomes, model):
    import round_values as rv
    o=group['observation']; seat=o['seat']; fan=[p['fan'] for p in o['players']]; score=[p['score'] for p in o['players']]; out=[]
    for r in outcomes:
        next_fan=fan.copy(); next_score=score.copy()
        for relative in range(4):
            who=(seat+relative)%4; next_fan[who]+=r['fans'][relative]; next_score[who]+=r['scores'][relative]
        v=rv.predict(model,next_fan,next_score,o['handIndex']+1,seat)
        out.append([r['fans'][0]/32+v[0],sum(r['fans'][1:])/96+v[1],v[2]])
    return np.asarray(out)

def paired_policy(values, baseline, weights, confidence_z=1.96):
    w=np.asarray(weights,dtype=float); w/=w.sum(); squared=float(w@w); out=[]
    for v in values:
        d=np.asarray(v)-values[baseline]; mean=float(w@d); se=np.sqrt(np.sum(w*w*(d-mean)**2)/max(1e-12,1-squared)); out.append(np.sign(mean)*max(0,abs(mean)-confidence_z*se))
    return np.asarray(out)
