import type {Action} from '../rules/types';
export type ClaimFamily='hu'|'kong'|'pung'|'chow';
export const CLAIM_FAMILIES:ClaimFamily[]=['hu','kong','pung','chow'];
export const CLAIM_LABELS={hu:'胡',kong:'杠',pung:'碰',chow:'吃'};
const family=(a:Action):ClaimFamily|null=>a.type==='hu'?'hu':a.type==='chow'?'chow':a.type==='pung'?'pung':['kong','concealed-kong','add-kong'].includes(a.type)?'kong':null;
/** Presentation groups only; every selected combination remains an exact referee-issued action. */
export function claimGroups(actions:readonly Action[]){return CLAIM_FAMILIES.flatMap(kind=>{const options=actions.filter(a=>family(a)===kind);return options.length?[{kind,label:CLAIM_LABELS[kind],options}]:[]})}
export function choiceTiles(action:Action){if(!family(action)||action.type==='hu')return [];const tiles=action.type==='chow'?[...action.tiles!]:Array(action.type==='pung'?3:4).fill(action.tile!) as number[];return tiles.map((tile,index)=>({tile,called:action.type==='chow'?tile===action.tile:!['concealed-kong','add-kong'].includes(action.type)&&index===0}))}
