import type {Observation} from '../../rules/types';
import {JointPolicy} from './model';
interface Entry {policy:JointPolicy;signature:string;revision:number;hand:number}
/** One game surface has four independent actors. A new settings signature or rewind cannot reuse a claim. */
export class JointSessionPolicies {
  private readonly entries=new Map<number,Entry>();
  get size(){return this.entries.size;}
  clear(){this.entries.clear();}
  get(o:Observation,seed:number,temperature:number,context=''){
    if(!Number.isInteger(o.seat)||o.seat<0||o.seat>3||!Number.isSafeInteger(o.revision)||o.revision<0||!Number.isInteger(o.handIndex)||o.handIndex<0||o.handIndex>16||!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff||!Number.isFinite(temperature)||temperature<0||temperature>2)throw Error('Invalid joint session');
    if(typeof context!=='string'||context.length>256)throw Error('Invalid joint context');
    const signature=JSON.stringify([seed,temperature,context]);let entry=this.entries.get(o.seat);
    if(!entry||entry.signature!==signature||o.revision<entry.revision||o.handIndex<entry.hand){entry={policy:new JointPolicy(),signature,revision:o.revision,hand:o.handIndex};this.entries.set(o.seat,entry);}
    entry.revision=o.revision;entry.hand=o.handIndex;return entry.policy;
  }
}
