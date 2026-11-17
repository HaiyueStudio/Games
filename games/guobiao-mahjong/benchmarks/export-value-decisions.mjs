import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const {createScorer}=await import('../rules/scorer.ts'),{rankActionValues,ValueContinuations}=await import('../ai/value/model.ts'),{actionPlans,continuationObservation}=await import('../ai/value/actions.ts'),{actionKey}=await import('../rules/types.ts');
const distilled=process.argv[3]==='distilled',actionValueModel=distilled?(await import('../ai/value/distilledWeights.ts')).distilledValueModel:(await import('../ai/value/weights.ts')).actionValueModel;
const game=resolve(import.meta.dirname,'..'),out=resolve(process.argv[2]??'artifacts/guobiao-mahjong/value/data-v2'),scorer=await createScorer(readFileSync(resolve(game,'assets/mcr.wasm'))),groups=JSON.parse(readFileSync(resolve(out,'groups.json'))),cases=[],seen=new Set(),reasons={};let changes=0,followUps=0;
for(const g of groups){const o=g.observation,prior=g.prior,selected=prior.indexOf(Math.max(...prior)),store=new ValueContinuations(),d=rankActionValues(o,prior,selected,scorer,actionValueModel,store),family=d.action.type,key=d.reason+'-'+family+(d.changed?'-changed':'');reasons[d.reason]=(reasons[d.reason]??0)+1;
  if(d.changed)changes++;if(seen.has(key))continue;seen.add(key);
  const example={name:key,observation:o,expectedAction:d.action,expectedReason:d.reason,baseline:o.legalActions[selected],prior,followUp:null};
  if(['chow','pung'].includes(family)){const plans=actionPlans(o,prior,scorer).filter(p=>actionKey(p.action)===actionKey(d.action));let chosen;
    for(const plan of plans){const trial=new ValueContinuations();rankActionValues(o,prior,selected,scorer,actionValueModel,trial);const next=continuationObservation(o,plan),p=next.legalActions.map(()=>1/next.legalActions.length),decision=rankActionValues(next,p,0,scorer,actionValueModel,trial);if(decision.reason==='value-follow-up'){chosen={observation:next,expectedAction:decision.action};break;}}
    if(chosen){example.followUp=chosen;followUps++;}
  }
  cases.push(example);
}
// Preserve one bounded continuation store, exactly like the real Worker and its ordered verification workload.
const sequence=new ValueContinuations();for(const c of cases){const selected=c.prior.indexOf(Math.max(...c.prior)),d=rankActionValues(c.observation,c.prior,selected,scorer,actionValueModel,sequence);c.expectedAction=d.action;c.expectedReason=d.reason;
  if(['chow','pung'].includes(d.action.type)){const plan=actionPlans(c.observation,c.prior,scorer).find(p=>actionKey(p.action)===actionKey(d.action)),o=continuationObservation(c.observation,plan);if(sequence.peek(o)!==null){const p=o.legalActions.map(()=>1/o.legalActions.length),next=rankActionValues(o,p,0,scorer,actionValueModel,sequence);assert.equal(next.reason,'value-follow-up');c.followUp={observation:o,expectedAction:next.action};}else c.followUp=null;}else c.followUp=null;
}
assert.ok(cases.length>0);writeFileSync(resolve(game,'../test/fixtures',distilled?'mahjong-distilled-decisions.json':'mahjong-value-decisions.json'),JSON.stringify({schemaVersion:1,source:'Ordered public observations and real collected KD priors; deterministic value ensemble and bounded continuation state',cases},null,2)+'\n');console.log(JSON.stringify({distilled,cases:cases.length,offlineActionChanges:changes,followUpCases:followUps,reasons,keys:[...seen]}));
