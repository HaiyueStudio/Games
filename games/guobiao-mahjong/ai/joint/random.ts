import type {Observation} from '../../rules/types';
/** Repeatable per-decision sampling, isolated from rendering and other seats. */
export function jointRandom(seed:number,o:Observation){
  let state=(seed^Math.imul(o.revision+1,0x9e3779b1)^Math.imul(o.seat+1,0x85ebca6b)^Math.imul(o.handIndex+1,0xc2b2ae35))>>>0;
  return ()=>{state=(state+0x6d2b79f5)>>>0;let t=Math.imul(state^(state>>>15),1|state);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};
}
