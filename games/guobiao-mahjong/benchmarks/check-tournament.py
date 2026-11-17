"""Tournament labels, paired policy precision and last-hand objective checks."""
import importlib.util
from pathlib import Path
import numpy as np
import tournament_objective as objective
import decision_gae as gae
import json
assert np.array_equal(objective.coefficients(),[1,-1,.2]);settings=dict(objective='tournament-v1',relativeFanWeight=.2,matchWinWeight=1)
assert np.array_equal(objective.coefficients(settings),[.2,-.2,1])
model=json.loads(Path('artifacts/guobiao-mahjong/credit-v4/round-value/model.json').read_text());g={'observation':{'seat':0,'handIndex':15,'players':[{'fan':100,'score':0},{'fan':90,'score':0},{'fan':0,'score':0},{'fan':0,'score':0}]}}
a={'fans':[8,0,0,0],'scores':[32,-16,-8,-8],'winner':0,'from':1,'selfDrawn':False};b={'fans':[0,16,0,0],'scores':[-24,48,-12,-12],'winner':1,'from':0,'selfDrawn':False}
y=objective.bootstrap_targets(g,[a,b],model);assert np.array_equal(y[:,2],[1,0]);assert y[0,0]==.25 and y[1,1]==1/6
r=np.array([[0.,0.,0.],[1.,.5,0.],[0.,1.,1.]]);v=np.ones_like(r)*.2;assert np.allclose((gae.estimate(r,v,1)+v)@objective.coefficients(settings),np.flip(np.cumsum(np.flip(r,0),0),0)@objective.coefficients(settings))
assert np.allclose(objective.paired_policy([[5,105,205],[0,100,200]],1,[1,1,1]),[5,0])
spec=importlib.util.spec_from_file_location('joint',Path(__file__).with_name('train-joint.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
g.update(prior=[.5,.5],fold='train',seed=1,source='expanded',rows=[dict(plan={'index':i},features=[0]*256,outcomes=[{**o,'weight':1} for _ in range(64)]) for i,o in enumerate([a,b])])
z=m.search_group(g,model,True);assert np.array_equal(z['target'][:,7],[1,0]);assert np.all(z['mask'][:,5:]==.3);assert z['policy'][0]>.99
print('Tournament coefficients, public future-round bootstrap, last-hand first place, GAE and supervised labels passed.')
