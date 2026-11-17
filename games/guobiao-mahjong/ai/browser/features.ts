import {policyProbabilities} from './policy';
import type {Action,Observation} from '../../rules/types';
import {validateParameters,type BrowserParameters} from './catalog';
const OFFSETS={pass:0,hu:1,discard:2,chow:36,pung:99,kong:133,'concealed-kong':167,'add-kong':201} as const;
function tile(value:unknown):number{if(!Number.isInteger(value)||(value as number)<0||(value as number)>=34)throw new Error('Invalid model tile');return value as number;}
export function actionIndex(a:Action):number{
  if(!(a.type in OFFSETS))throw new Error('Unknown model action');
  if(a.type==='pass'||a.type==='hu')return OFFSETS[a.type];
  const t=tile(a.tile);
  if(a.type==='chow'){
    const ts=(a.tiles??[]).map(tile).sort((a,b)=>a-b),start=ts[0]!;
    if(ts.length!==3||ts[1]!==start+1||ts[2]!==start+2||ts[2]>=27||Math.floor(start/9)!==Math.floor(ts[2]/9)||!ts.includes(t))throw new Error('Invalid model chow');
    return 36+Math.floor(start/9)*21+(start%9)*3+t-start;
  }
  return OFFSETS[a.type]+t;
}
/** Identical to the pinned 38x4x9 NumPy adapter; only the acting seat's observation is accepted. */
export function encodeObservation(o:Observation){
  if(o.protocol!=='haiyue.mcr/1'||![o.seat,o.dealer,o.roundWind].every(n=>Number.isInteger(n)&&n>=0&&n<4))throw new Error('Invalid model observation');
  if(o.players.length!==4||o.players.some(p=>'hand' in p)||o.hand.length<1||o.hand.length>14||o.legalActions.length<1||o.legalActions.length>128)throw new Error('Expected redacted players and legal actions');
  const features=new Float32Array(38*36),mask=new Float32Array(235);
  features[27+(o.seat-o.dealer+4)%4]=1;features[36+27+o.roundWind]=1;
  const thermometer=(offset:number,tiles:readonly number[])=>{
    const counts=new Uint8Array(34);for(const t of tiles)if(++counts[tile(t)]!>4)throw new Error('More than four model tiles');
    for(let t=0;t<34;t++)for(let c=0;c<counts[t]!;c++)features[(offset+c)*36+t]=1;
  };
  thermometer(2,o.hand);
  o.players.forEach((p,who)=>{
    const relative=(who-o.seat+4)%4;
    thermometer(6+relative*4,o.events.filter(e=>e.type==='discard'&&e.hand===o.handIndex&&e.seat===who).map(e=>tile(e.tile)));
    thermometer(22+relative*4,p.melds.filter(m=>!m.concealed||who===o.seat).flatMap(m=>m.tiles.filter((t):t is number=>t!==null)));
  });
  const indices=o.legalActions.map(actionIndex);if(new Set(indices).size!==indices.length)throw new Error('Duplicate model action indices');
  indices.forEach(i=>mask[i]=1);return {features,mask,indices};
}
/** Average per-student legal softmaxes, matching the server's ensemble (not an average of logits). */
export function choosePolicyAction(logits:readonly ArrayLike<number>[],indices:readonly number[],o:Observation,p:BrowserParameters):number{
  validateParameters(p);if(!logits.length||!indices.length)throw new Error('Empty model policy');
  const probabilities=policyProbabilities(logits,indices);
  if(p.temperature===0){let best=0;for(let i=1;i<probabilities.length;i++)if(probabilities[i]!>probabilities[best]!)best=i;return best;}
  const logs=Array.from(probabilities,v=>Math.log(Math.max(v,1e-300))/p.temperature),max=Math.max(...logs),scores=logs.map(v=>Math.exp(v-max)),sum=scores.reduce((a,b)=>a+b,0);
  let state=(p.seed^Math.imul(o.revision+1,0x9e3779b1)^Math.imul(o.seat+1,0x85ebca6b)^Math.imul(o.handIndex+1,0xc2b2ae35))>>>0;
  state+=0x6d2b79f5;let t=Math.imul(state^(state>>>15),1|state);t^=t+Math.imul(t^(t>>>7),61|t);
  let draw=((t^(t>>>14))>>>0)/4294967296*sum;
  for(let i=0;i<scores.length;i++){draw-=scores[i]!;if(draw<0)return i;}return scores.length-1;
}
