import {newPinkProgress,pinkTotal,type PinkProgress} from './pink-coins';
import { newClearRun, type ClearRun } from './conditions';
export { conditionProgress } from './conditions';
import type { Body, Enemy, Level, State } from './model';
import { initDevices, type Device } from './p1-mechanisms';
export interface Boomerang extends Body {kind:'boomerang';age:number;returning:boolean;distance:number;leg:number;hits:string[];targets?:Enemy[]}
export interface EnemyProjectile extends Body {kind:'fire'|'spike-ball';age:number;owner:number;source?:Enemy}
export interface P1State {
    clearRun:ClearRun;
    goalCells:number[];devices:Device[];boomerangs:Boomerang[];enemyProjectiles:EnemyProjectile[];pipeHits:{enemy:Enemy;ice:boolean}[];
    motion:'none'|'roll'|'long'|'high'|'charge'|'claw'|'dive'|'climb'|'hammer'|'boomerang';motionAge:number;charge:number;runCharge:number;catStamina:number;abilityWait:number;dashTime:number;
    stun:number;jumpSerial:number;defeatCounts:Record<string,number>;pinkProgress:PinkProgress;pinkCollected:number;pinkTotal:number;usedWarps:Record<string,true>;buildSerial:number;buildBoxes:(Body&{alive:boolean})[];
}
export function initP1(l:Level):P1State{return {clearRun:newClearRun(),goalCells:l.cells.flatMap((t,id)=>t==='E'?[id]:[]),devices:initDevices(l),boomerangs:[],enemyProjectiles:[],pipeHits:[],motion:'none',motionAge:0,charge:0,runCharge:0,catStamina:1.8,abilityWait:0,dashTime:0,stun:0,jumpSerial:0,defeatCounts:{},pinkProgress:newPinkProgress(),pinkCollected:0,pinkTotal:pinkTotal(l),usedWarps:{},buildSerial:0,buildBoxes:[]};}
export function p1Timers(s:State,dt:number,shared=true):void {s.stun=Math.max(0,s.stun-dt);s.abilityWait=Math.max(0,s.abilityWait-dt);s.dashTime=Math.max(0,s.dashTime-dt);s.motionAge+=dt;if(s.motionAge>.45&&['claw','hammer','boomerang'].includes(s.motion))s.motion='none';
    if(!shared)return;
    for(const e of s.enemies)if(e.alive&&e.kind==='cannonball'&&!e.frozen&&!e.held){e.projectileAge=(e.projectileAge??0)+dt;if(e.projectileAge>12||e.x< -2||e.x>s.level.width+2||e.y>s.level.height+2)e.alive=false;}
}
export function resetP1Motion(s:State):void {s.motion='none';s.motionAge=s.charge=s.runCharge=0;s.catStamina=1.8;}
