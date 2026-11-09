import assert from 'node:assert/strict';
import {selectValuePositions} from './offline-inputs.mjs';
import {jointPlans} from '../ai/joint/plans.ts';
import {validateAdaptiveBudget} from './adaptive-values.ts';
/** Outcome-blind full-action selection, with an explicit compute preview before starting Chrome. */
export function jointDataPlan(all,c){
  assert.equal(c.schemaVersion,1);assert.ok(['stratified','all'].includes(c.selection));
  if(c.budget){assert.equal(c.worlds,undefined,'Choose fixed or adaptive worlds');validateAdaptiveBudget(c.budget);}else assert.ok(Number.isInteger(c.worlds)&&c.worlds>=2&&c.worlds<=256);
  const positions=selectValuePositions(all,c),plans=positions.reduce((n,g)=>n+jointPlans(g.observation).length,0);
  return {positions,summary:{positions:positions.length,plans,...(c.budget?{budget:c.budget,maximumHandSimulations:plans*c.budget.stages.at(-1)}:{worlds:c.worlds,handSimulations:plans*c.worlds}),folds:Object.fromEntries(['train','calibration','test'].map(f=>[f,{positions:positions.filter(g=>g.fold===f).length,seeds:[...new Set(positions.filter(g=>g.fold===f).map(g=>g.seed))]}]))}};
}
