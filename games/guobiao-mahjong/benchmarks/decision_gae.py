"""Undiscounted fan objective, lambda credit across every learnable learner decision.
Deterministic referee/continuation steps are retained in the trace and collapsed into edges.
"""
import numpy as np
import round_values as rounds
import decision_values as values

GAMMA = 1.
LAMBDA = .95

def estimate(rewards, predictions, lam=LAMBDA):
    r=np.asarray(rewards, dtype=float); v=np.asarray(predictions, dtype=float)
    assert r.shape == v.shape and r.ndim == 2 and r.shape[1] == 3 and 0 <= lam <= 1 and np.isfinite(r).all() and np.isfinite(v).all()
    out=np.zeros_like(r); running=np.zeros(3)
    for i in reversed(range(len(r))):
        delta=r[i]+(v[i+1] if i+1 < len(r) else 0)-v[i]; running=delta+lam*running; out[i]=running
    return out

def prepare_targets(episodes, model, round_model, settings=None):
    from tournament_objective import coefficients
    weights=coefficients(settings)
    stats={'gamma':GAMMA,'lambda':LAMBDA,'matches':len(episodes),'steps':0,'policySteps':0,'deterministicSteps':0,'handsWithMultiplePolicySteps':0,'handsWithDifferentAdvantages':0,'maximumRewardTelescopingError':0.}
    for g in episodes:
        assert g['seed'] not in model['fitSeeds'], 'Current PPO wall leaked into frozen state critic'
        assert g.get('trajectoryVersion') == 1 and g['capture']['mode'] == 'complete', 'GAE requires complete unsampled learner traces'
        states=rounds.boundaries(g); learner=next(i for i,p in enumerate(g['policies']) if p.get('learner')); trace=g['learnerTrace']; own=[a for a in g['replay']['actions'] if a['seat'] == learner]
        assert len(trace) == len(own) and trace
        rows={r['revision']:r for r in g['trajectories']}; assert len(rows) == len(g['trajectories'])
        credit=rounds.winners(*states[-1])[learner]; policy=[]; rewards=[]
        for i,s in enumerate(trace):
            assert all(s[k] == own[i][k] for k in ['revision','hand','seat','action']); nxt=trace[i+1] if i+1 < len(trace) else None
            assert s['nextRevision'] == (nxt['revision'] if nxt else None) and s['terminal'] == (nxt is None)
            assert s['nextPolicyRevision'] == next((q['revision'] for q in trace[i+1:] if q['kind'] == 'policy'),None)
            assert (s['kind'] == 'policy') == (s['revision'] in rows)
            delta=np.array(states[nxt['hand'] if nxt else 16][0])-states[s['hand']][0]
            expected=[delta[learner]/32,sum(v for j,v in enumerate(delta) if j != learner)/96,credit if nxt is None else 0]
            assert np.max(np.abs(np.array(s['reward'])-expected)) < 1e-12
            if s['kind'] == 'policy':
                row=rows[s['revision']]; assert row['sampling']['probability'] == row['weight'] == 1; assert row['fanSnapshot'] == states[row['hand']][0]
                policy.append(row); rewards.append(np.zeros(3))
            if rewards: rewards[-1]+=s['reward']
        assert policy and len(policy) == len(rows)
        r=np.asarray(rewards); v=np.array([values.predict(model,row,round_model) for row in policy]); a=estimate(r,v); returns=v+a
        for i,row in enumerate(policy):
            error=float(np.max(np.abs(r[i:].sum(0)-row['targets'][5:]))); assert error < 1e-10; stats['maximumRewardTelescopingError']=max(stats['maximumRewardTelescopingError'],error)
            assert np.all(returns[i,:2] >= -1e-10) and -1e-10 <= returns[i,2] <= 1+1e-10
            row['trainingTargets']=list(row['targets']); row['trainingTargets'][5:]=np.r_[np.maximum(returns[i,:2],0),np.clip(returns[i,2],0,1)].tolist(); row['stateBaseline']=float(v[i]@weights); row['gaeAdvantage']=float(a[i]@weights)
        for hand in range(16):
            adv=[row['gaeAdvantage'] for row in policy if row['hand'] == hand]
            if len(adv)>1: stats['handsWithMultiplePolicySteps']+=1; stats['handsWithDifferentAdvantages']+=int(np.ptp(adv)>1e-10)
        stats['steps']+=len(trace); stats['policySteps']+=len(policy); stats['deterministicSteps']+=len(trace)-len(policy)
    return stats
