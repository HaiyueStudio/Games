"""Numerical credit, complete-trajectory, and action-independent state-value checks."""
import argparse, copy, json
from pathlib import Path
import numpy as np
import decision_gae as gae
import decision_values as dv
import round_values as rv

r=np.array([[0.,0.,0.],[2.,1.,0.],[0.,3.,1.]])
v=np.array([[1.,1.,.3],[1.5,.8,.4],[.7,.2,.6]])
a=gae.estimate(r,v,1); assert np.max(np.abs(v+a-np.flip(np.cumsum(np.flip(r,0),0),0))) < 1e-12
assert np.max(np.abs(gae.estimate(r,v,0)-(r+np.r_[v[1:],np.zeros((1,3))]-v))) < 1e-12
assert np.allclose(gae.estimate(r,v)[-1],r[-1]-v[-1]); assert len(set(np.round(gae.estimate(r,v)@[1,-1,.2],8))) == 3
ap=argparse.ArgumentParser();ap.add_argument('--episodes');ap.add_argument('--state-value');ap.add_argument('--round-value');args=ap.parse_args()
if args.episodes:
    episodes=json.loads(Path(args.episodes).read_text());model=json.loads(Path(args.state_value).read_text());round_model=json.loads(Path(args.round_value).read_text());before=json.dumps([g['trajectories'] for g in episodes]);stats=gae.prepare_targets(episodes,model,round_model)
    row=episodes[0]['trajectories'][0];x,prior=dv.public_features(row,round_model);poison=copy.deepcopy(row);poison['chosen']=(row['chosen']+1)%len(row['plans']);poison['targets']=[1e9]*8;poison['observation']['wall']=[0]*99
    for p in poison['observation']['players']:p['hand']=[33]*13
    assert np.array_equal(x,dv.public_features(poison,round_model)[0]);assert np.array_equal(prior,dv.public_features(poison,round_model)[1]);assert all('gaeAdvantage' in r for g in episodes for r in g['trajectories'])
    for corrupt in ['missing','reward','leak','sampled']:
        bad=copy.deepcopy(episodes)
        if corrupt=='missing':bad[0]['trajectories'].pop()
        elif corrupt=='reward':bad[0]['learnerTrace'][-1]['reward'][0]+=1
        elif corrupt=='leak':bad[0]['seed']=model['fitSeeds'][0]
        else:bad[0]['capture']['mode']='critical-stratified'
        try:gae.prepare_targets(bad,model,round_model)
        except AssertionError:pass
        else:raise AssertionError('Accepted corrupt credit '+corrupt)
    print(json.dumps(stats,indent=2))
print('GAE telescoping, TD endpoints, terminal bootstrap and decision credit passed.')
