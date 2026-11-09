import assert from 'node:assert/strict';
import {jointSearchDecision} from './joint-uncertainty.ts';
import {DEFAULT_ADAPTIVE_BUDGET} from './adaptive-values.ts';
/** Keep existing coverage, overlay stronger labels, and expose uncertainty without rewriting archives. */
export function mergeJointGroups(sources){
  assert.ok(Array.isArray(sources)&&sources.length>=2);const roots=new Map();
  for(const groups of sources){assert.ok(Array.isArray(groups)&&groups.length);assert.equal(new Set(groups.map(g=>g.id)).size,groups.length);
    for(const input of groups){const g=structuredClone(input),old=roots.get(g.id);if(old){assert.equal(g.fold,old.fold);assert.equal(g.seed,old.seed);assert.deepEqual(g.observation,old.observation);assert.deepEqual(g.prior,old.prior);assert.deepEqual(g.rows.map(r=>r.plan),old.rows.map(r=>r.plan));}
      assert.ok(['train','calibration','test'].includes(g.fold));assert.equal(g.rows[0].outcomes.length,g.sampling.worlds);
      const baseline=g.rows.findIndex(r=>r.plan.index===g.prior.indexOf(Math.max(...g.prior)));assert.ok(baseline>=0);
      const diagnostic=jointSearchDecision(g.rows,baseline,DEFAULT_ADAPTIVE_BUDGET.ordinaryMinimum,DEFAULT_ADAPTIVE_BUDGET);
      g.uncertainty??={...diagnostic.uncertainty,derivedFromArchivedOutcomes:true};roots.set(g.id,g);
    }
  }
  return [...roots.values()].sort((a,b)=>a.id-b.id);
}
