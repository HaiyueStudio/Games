import {poleHeight} from './goal';
import type { Input, State } from './model';
import { emit } from './events';
import { oneWayDevices } from './p1-mechanisms';

/** Explicit combinations leave ordinary jump, spin, grab and throw untouched. */
export function prepareMotion(s:State,i:Input,dt:number):{ground:boolean;charge:number;style:'normal'|'charged'|'high'|'long'} {
    const ground=s.grounded,charge=s.charge,jump=i.jump&&!s.previous.jump;
    s.charge=ground&&i.down&&!i.axis&&!s.held?s.charge+dt:0;
    s.runCharge=ground&&i.grab&&i.axis&&!i.down?s.runCharge+dt:0;
    if(ground){s.catStamina=1.8;if(['long','high','charge','dive','climb'].includes(s.motion))s.motion='none';}
    if(s.swimming||s.climbing||s.riding||s.pipe||s.door){s.motion='none';s.charge=0;return {ground,charge,style:'normal'};}
    if(s.motion==='roll'&&(!ground||s.motionAge>.55||s.wall||s.held))s.motion='none';
    if(ground&&i.down&&i.special&&!s.previous.special&&!s.held){s.motion='roll';s.motionAge=0;s.facing=Math.sign(s.player.vx)||s.facing;emit(s,'spin');}
    const style=ground&&jump?(s.motion==='roll'||i.down&&i.grab&&Math.abs(s.player.vx)>3?'long':charge>=.7?'charged':'normal'):ground&&i.spin&&i.special&&!s.previous.spin?'high':'normal';
    return {ground,charge,style};
}
export function applyMotion(s:State,i:Input,dt:number,prepared:ReturnType<typeof prepareMotion>):void {
    const p=s.player;
    if(prepared.style!=='normal'){
        s.motion=prepared.style==='charged'?'charge':prepared.style;s.motionAge=0;p.vy=prepared.style==='long'?-8:prepared.style==='high'?-19:-18;
        if(prepared.style==='long')p.vx=s.facing*12;
        s.jumpSustain=true;s.jumpCut=false;s.grounded=false;s.coyote=s.buffer=0;s.spinning=prepared.style==='high';s.charge=0;
    }
    if(s.motion==='roll'){p.vx=s.facing*Math.max(6,Math.abs(p.vx));s.crouching=true;}
    if(s.motion==='long'&&!s.grounded){p.vx=s.facing*Math.max(9,Math.abs(p.vx));s.pound='none';}
    if(s.dashTime>0)p.vx=s.facing*14;
    if(s.power!==5||s.held||s.swimming)return;
    if(i.interact&&s.catStamina>0){const flag=s.goalCells.find(id=>Math.abs(id%s.level.width+.5-p.x-p.w/2)<.6&&p.y<Math.floor(id/s.level.width)&&p.y+p.h>Math.max(0,Math.floor(id/s.level.width)-poleHeight(s,id%s.level.width,Math.floor(id/s.level.width))));if(flag!==undefined){s.motion='climb';s.catStamina=Math.max(0,s.catStamina-dt*.5);p.vy=-4;p.vx=0;s.pound='none';return;}}
    const semi=s.devices.some(d=>d.kind==='semi-platform'&&p.y+p.h>d.y&&p.y<d.y+d.h&&Math.min(Math.abs(p.x+p.w-d.x),Math.abs(p.x-d.x-d.w))<.15);
    if(i.interact&&s.catStamina>0&&(s.wall&&i.axis===s.wall||semi)){
        s.motion='climb';s.grounded=false;s.catStamina=Math.max(0,s.catStamina-dt);p.vy=-3.2;p.vx=0;s.pound='none';s.jumpSustain=false;
    }else if(s.motion==='climb')s.motion='none';
    if(s.motion==='dive'){p.vx=s.facing*10;p.vy=9;s.pound='none';}
}
