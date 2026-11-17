import {actionKey,type Observation} from '../../rules/types';
import {projectPlan} from '../value/actions';
import type {ActionPlan} from '../value/types';
export const JOINT_MAXIMUM_PLANS=64;
/** Every legal discard and every legal immediate discard after each chow/pung, without KD pruning. */
export function jointPlans(o:Observation):ActionPlan[]{
  const plans:ActionPlan[]=[];o.legalActions.forEach((action,index)=>{
    if(action.type==='hu')return;const p:ActionPlan={action,index,followUpDiscard:null};
    if(action.type==='chow'||action.type==='pung'){const after=projectPlan(o,p);for(const tile of [...new Set(after.hand)].sort((a,b)=>a-b))plans.push({...p,followUpDiscard:tile});}
    else plans.push(p);
  });
  if(!plans.length||plans.length>JOINT_MAXIMUM_PLANS||new Set(plans.map(p=>actionKey(p.action)+'/'+p.followUpDiscard)).size!==plans.length)throw Error('Invalid joint plan set');return plans;
}
