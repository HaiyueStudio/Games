import type {Action,Observation,Tile} from '../rules/types';
const PERMUTATIONS=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
export const KNITTED_PATTERNS=PERMUTATIONS.map(p=>p.flatMap((s,g)=>[g,g+3,g+6].map(r=>s!*9+r)));
const HONORS=[27,28,29,30,31,32,33],ORPHANS=[0,8,9,17,18,26,...HONORS];
/** An upper bound on other players' concealed copies, never a peek at their actual hands. */
export function unseenCopies(o:Observation):number[]{
  const known=Array<number>(34).fill(0);for(const t of o.hand)known[t]!++;
  o.players.forEach((p,i)=>{for(const t of p.river)known[t]!++;for(const m of p.melds)if(i===o.seat||!m.concealed)for(const t of m.tiles)if(t!==null)known[t]!++;});
  if(known.some(n=>n>4))throw Error('Impossible visible tile counts');return known.map(n=>4-n);
}
/** Conservative impossibility proof for a fourth visible copy, including every MCR shape family. */
export function cannotComplete(tile:Tile,meldCount:number,unseen:readonly number[]):boolean{
  if(unseen[tile]!==0)return false;
  if(meldCount===4)return true; // The remaining concealed tile must pair with the discard.
  if(tile<27)for(let start=Math.max(0,tile%9-2);start<=Math.min(6,tile%9);start++){
    const others=[0,1,2].map(d=>Math.floor(tile/9)*9+start+d).filter(t=>t!==tile);
    if(others.every(t=>unseen[t]!>0))return false;
  }
  if(meldCount===0){
    const otherOrphans=ORPHANS.filter(t=>t!==tile);
    if(ORPHANS.includes(tile)&&otherOrphans.every(t=>unseen[t]!>0)&&otherOrphans.some(t=>unseen[t]!>=2))return false;
    for(const pattern of KNITTED_PATTERNS){const domain=[...pattern,...HONORS];if(domain.includes(tile)&&domain.filter(t=>t!==tile&&unseen[t]!>0).length>=13)return false;}
  }
  // A knitted straight may coexist with one declared meld. Ignore its pair/group requirements
  // here: overestimating possibility is safe; declaring an impossible safety is not.
  if(meldCount<=1&&tile<27&&KNITTED_PATTERNS.some(p=>p.includes(tile)&&p.filter(t=>t!==tile).every(t=>unseen[t]!>0)))return false;
  return true;
}
export function guaranteedSafe(o:Observation,tile:Tile,unseen=unseenCopies(o)):boolean{
  return o.players.every((p,i)=>i===o.seat||cannotComplete(tile,p.melds.length,unseen));
}
/** At zero wall there can be no future draw or meld; a safe discard cannot surrender any own win. */
export function lastTileAlternative(o:Observation,preferred:Action,ordered:readonly Action[]=o.legalActions):Action|null{
  if(o.phase!=='turn'||o.turn!==o.seat||o.wallRemaining!==0||preferred.type!=='discard'||o.legalActions.some(a=>a.type==='hu'))return null;
  const unseen=unseenCopies(o);if(guaranteedSafe(o,preferred.tile!,unseen))return null;
  return ordered.find(a=>a.type==='discard'&&o.legalActions.some(l=>l.type==='discard'&&l.tile===a.tile)&&guaranteedSafe(o,a.tile!,unseen))??null;
}
