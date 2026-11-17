import type {Observation,Seat} from '../../rules/types';
import {valueObservation} from '../value/observation';
export const BELIEF_PATTERNS=['万一色路线','条一色路线','筒一色路线','碰碰和路线','七对路线','幺九字路线','无字','五门齐'] as const;
const tiles=(p:string)=>Array.from({length:34},(_,t)=>p+'-'+t);
export const BELIEF_FEATURE_NAMES=[...tiles('own'),...tiles('visible'),...tiles('river'),...tiles('meld'),...Array.from({length:4},(_,i)=>tiles('recent-'+i)).flat(),
  'wall','round','rounds-left','relative-seat','seat-wind','own-hand-size','target-hand-size','melds','chows','pungs','kongs','concealed-kongs','flowers','river-size','last-claim-age','fan-gap','score-gap','other-melds'] as const;
export const BELIEF_OUTPUT_NAMES=['ready',...tiles('ron'),...BELIEF_PATTERNS,'fan-value'] as const;
export function beliefFeatures(input:Observation,target:Seat):number[]{
  const o=valueObservation(input);if(target===o.seat||target<0||target>3)throw Error('Expected an opponent seat');const p=o.players[target]!,own=Array<number>(34).fill(0),visible=Array<number>(34).fill(0),river=Array<number>(34).fill(0),meld=Array<number>(34).fill(0);
  o.hand.forEach(t=>own[t]!++);o.players.forEach(q=>{q.river.forEach(t=>visible[t]!++);q.melds.forEach(m=>{if(!m.concealed)m.tiles.forEach(t=>{if(t!==null)visible[t]!++});});});p.river.forEach(t=>river[t]!++);p.melds.forEach(m=>{if(!m.concealed)m.tiles.forEach(t=>{if(t!==null)meld[t]!++});});
  const discards=o.events.filter(e=>e.type==='discard'&&e.seat===target&&e.tile!==undefined),recent=discards.slice(-4).reverse().map(e=>e.tile!),lastClaim=o.events.findLastIndex(e=>e.seat===target&&['chow','pung','kong','add-kong','concealed-kong'].includes(e.type));
  const f=[...own.map(n=>n/4),...visible.map(n=>n/4),...river.map(n=>n/4),...meld.map(n=>n/4),...Array.from({length:4},(_,i)=>Array.from({length:34},(_,t)=>+(recent[i]===t))).flat(),
    o.wallRemaining/144,o.roundWind/3,(15-o.handIndex)/15,((target-o.seat+4)%4)/3,((target-o.dealer+4)%4)/3,o.hand.length/14,p.handCount/14,p.melds.length/4,p.melds.filter(m=>m.kind==='chow').length/4,p.melds.filter(m=>m.kind==='pung').length/4,p.melds.filter(m=>m.kind==='kong').length/4,p.melds.filter(m=>m.concealed).length/4,p.flowers.length/8,p.river.length/24,lastClaim<0?1:Math.min(1,(o.events.length-1-lastClaim)/32),Math.tanh((p.fan-o.players[o.seat]!.fan)/64),Math.tanh((p.score-o.players[o.seat]!.score)/128),o.players.filter((_,i)=>i!==target&&i!==o.seat).reduce((n,q)=>n+q.melds.length,0)/8];
  if(f.length!==BELIEF_FEATURE_NAMES.length||f.some(v=>!Number.isFinite(v)))throw Error('Invalid belief features');return f;
}
