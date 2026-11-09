import assert from 'node:assert/strict';
import {validateLeagueEpisodes} from './league-validation.mjs';
import {valueFeatureError} from './value-parity.mjs';
/** Reconstruct actual public decisions and independently count every retain-all critical opportunity. */
export async function auditLeagueReplay(records,scorer,bundles){
  const {createMatch,nextHand,observe,applyAction}=await import('../rules/match.ts'),{actionKey}=await import('../rules/types.ts'),{valueObservation}=await import('../ai/value/observation.ts'),{JointPolicy}=await import('../ai/joint/model.ts'),{criticalDecision}=await import('./trajectory-sampling.ts');
  const {continuationObservation}=await import('../ai/value/actions.ts');
  const {ValueContinuations}=await import('../ai/value/model.ts'),{lastTileAlternative}=await import('../ai/lastTileDefense.ts');
  const {originalAnchor}=await import('./original-anchor.ts'),{actionValueModel}=await import('../ai/value/weights.ts');
  const counts=validateLeagueEpisodes(records);let trajectories=0,critical=0,anchors=0,traceSteps=0,recomputedGuards=0,maximumFeatureError=0;
  for(const g of records){const state=createMatch(g.seed,g.replay.players),learner=g.policies.findIndex(p=>p.learner),rows=new Map(g.trajectories.map(r=>[r.revision,r]));const guardRows=new Map((g.guardDecisions??[]).map(r=>[r.revision,r])),guardPolicy=new JointPolicy();
    const trace=new Map((g.learnerTrace??[]).map(r=>[r.revision,r])),continuations=new ValueContinuations();let eligibleCritical=0;
    for(const r of g.replay.actions){if(r.hand>state.handIndex)nextHand(state);let o;
      if(r.seat===learner&&['critical-stratified','complete'].includes(g.capture?.mode)){o=valueObservation(observe(state,r.seat,scorer));if(o.legalActions.length>1&&!o.legalActions.some(a=>a.type==='hu')&&criticalDecision(o))eligibleCritical++;}
      if(g.guardAuditVersion===1&&r.seat===learner){o??=valueObservation(observe(state,r.seat,scorer));assert.equal(guardRows.has(r.revision),o.legalActions.length>1,'Missing guard or deterministic-decision audit');}
      const row=rows.get(r.revision),step=trace.get(r.revision);
      if(step){o??=valueObservation(observe(state,r.seat,scorer));let kind='policy';
        if(o.legalActions.length===1)kind='forced';
        else{assert.ok(o.legalActions.some(a=>actionKey(a)===actionKey(step.priorAction)));const tile=o.phase==='turn'&&o.drawn===null?continuations.peek(o):null,pending=tile!==null&&o.legalActions.some(a=>a.type==='discard'&&a.tile===tile),safe=lastTileAlternative(o,step.priorAction);
          if(o.legalActions.some(a=>a.type==='hu')){kind='legal-win';assert.equal(r.action.type,'hu');}
          else if(g.executionVersion===2&&pending){kind='joint-follow-up';assert.equal(r.action.type,'discard');assert.equal(r.action.tile,tile);}
          else if(safe){kind='last-tile-safe';assert.equal(actionKey(r.action),actionKey(safe));}
          else if(pending){kind='joint-follow-up';assert.equal(r.action.type,'discard');assert.equal(r.action.tile,tile);}
        }assert.equal(step.kind,kind,'Trajectory omitted or misclassified a learner decision');traceSteps++;
      }
      if(row){o??=valueObservation(observe(state,r.seat,scorer));assert.deepEqual(row.observation,o);assert.equal(actionKey(row.plans[row.chosen].action),actionKey(r.action));const bundle=bundles.get(g.policies[learner].id);assert.ok(bundle,'Missing captured behavior model');const e=new JointPolicy('explore').evaluate(o,row.prior,scorer,bundle,row.temperature);assert.deepEqual(row.plans,e.plans);assert.equal(e.features.length,row.features.length);e.features.forEach((f,i)=>maximumFeatureError=Math.max(maximumFeatureError,valueFeatureError(f,row.features[i])));e.probabilities.forEach((p,i)=>assert.ok(Math.abs(p-row.oldProbabilities[i])<1e-12));assert.ok(Math.abs(e.baseline-row.baseline)<1e-12);if(step){assert.equal(actionKey(step.priorAction),actionKey(o.legalActions[row.prior.indexOf(Math.max(...row.prior))]));continuations.remember(o,row.plans[row.chosen]);}trajectories++;if(row.sampling?.stratum==='critical')critical++;}
      if(row?.anchor){assert.deepEqual(row.anchor,originalAnchor(o,row.prior,row.prior.indexOf(Math.max(...row.prior)),scorer,actionValueModel));anchors++;}
      const guardRow=guardRows.get(r.revision);
      if(guardRow){o??=valueObservation(observe(state,r.seat,scorer));const bundle=bundles.get(g.policies[learner].id);assert.ok(bundle,'Missing guard audit model');assert.equal(guardRow.seat,learner);assert.equal(guardRow.hand,o.handIndex);assert.equal(guardRow.selected,guardRow.prior.indexOf(Math.max(...guardRow.prior)));
        const base=guardRow.diagnostic?.baselinePlan??undefined,check=guardPolicy.decide(o,guardRow.prior,guardRow.selected,scorer,bundle,undefined,1,g.policies[learner].style??'balanced',base);assert.equal(actionKey(check.action),actionKey(r.action));assert.equal(check.reason,guardRow.reason);numericTree(check.guard,guardRow.diagnostic);
        if(guardRow.resolvedContinuation){const q=guardRow.resolvedContinuation;assert.ok(check.evaluation&&base!==undefined);const after=continuationObservation(o,check.evaluation.plans[base]);assert.ok(after.legalActions.some(a=>actionKey(a)===actionKey(q.action)));assert.equal(q.probabilities.length,after.legalActions.length);assert.ok(Math.abs(q.probabilities.reduce((a,b)=>a+b,0)-1)<1e-8);assert.equal(after.legalActions[q.probabilities.indexOf(Math.max(...q.probabilities))].tile,q.action.tile);assert.equal((lastTileAlternative(after,q.action)??q.action).tile,check.evaluation.plans[base].followUpDiscard);}
        recomputedGuards++;
      }
      applyAction(state,r.seat,r.action,scorer,r.revision);
    }assert.deepEqual(state.results,g.results);assert.deepEqual(state.players.map(p=>p.fan),g.seats.map(p=>p.fan));if(['critical-stratified','complete'].includes(g.capture?.mode))assert.equal(g.trajectories.filter(r=>r.sampling.stratum==='critical').length,eligibleCritical,'Critical decisions dropped from actual referee replay');
  }return {...counts,recomputedTrajectories:trajectories,criticalRetained:critical,originalAnchors:anchors,traceSteps,recomputedGuards,maximumFeatureError};
}

function numericTree(a,b){if(typeof a==='number'){assert.ok(Number.isFinite(b)&&Math.abs(a-b)<1e-8,'Guard diagnostics differ');return;}if(a===null||typeof a!=='object'){assert.equal(a,b);return;}assert.deepEqual(Object.keys(a),Object.keys(b));for(const k of Object.keys(a))numericTree(a[k],b[k]);}
