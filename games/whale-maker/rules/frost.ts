import {cellAt} from './terrain';
import {WEARABLES} from './p2-schema';
import type { Enemy, Input, Level, Reward, State } from './model';
import type { Services } from './services';
import { emit } from './events';
import { touchingSwitch } from './switches';
import { switchObstacles } from './switches';
import { rulesFor } from './profile';
import { attackResult } from './interactions';

export interface FrozenState {
    thrown:boolean;vx:number;remaining?:number;hang?:number;anchored?:boolean;detached?:boolean;buoyant?:boolean;
    original?:Omit<Enemy,'frozen'>;
}
export const FREEZE_DURATION=6,FREEZE_WARNING=1.2,FREEZE_AIR_HANG=.6;
const cell=(s:State,x:number,y:number)=>cellAt(s.level,x,y);
export function frozenWaterSurface(s:State,e:Enemy):number|undefined {
    for(const y of [e.y+.01,e.y+e.h*.5,e.y+e.h-.01,e.y+e.h+.015]){
        const x=e.x+e.w/2;let row=Math.floor(y);if(cell(s,x,row)!=='water')continue;
        while(row>0&&cell(s,x,row-1)==='water')row--;return row;
    }
    return undefined;
}
function supported(s:State,e:Enemy):boolean {
    if(e.grounded)return true;
    const feet=e.y+e.h,t=cell(s,e.x+e.w/2,feet+.035);
    if(['#','B','?','U','=','ice','ice-solid','speed-belt','slope-up','slope-down','P','Q','p','q'].includes(t!))return true;
    return [...switchObstacles(s,e),...s.platforms].some(b=>Math.abs(b.y-feet)<.04&&e.x<b.x+b.w&&e.x+e.w>b.x);
}
/** Global timers continue offscreen and in transitions; carrying or water pauses thawing. */
export function advanceFrost(s:State,dt:number):void {
    for(const e of s.enemies){const f=e.frozen;if(!e.alive||!f||e.held)continue;
        f.hang=Math.max(0,(f.hang??0)-dt);
        if(f.remaining===undefined||f.remaining===Infinity||frozenWaterSurface(s,e)!==undefined)continue;
        f.remaining=Math.max(0,f.remaining-dt);if(f.remaining===0)thawEnemy(s,e);
    }
}

export const FIRE_JUMP_GRAVITY=20;
export function initFlowers(l:Level):Reward[]{
    const rewards:Reward[]=[];
    l.cells.forEach((t,id)=>{if(!['G','F','ice-flower','cat-bell','boomerang-flower','hammer-suit','one-up','coin-10','coin-30','coin-50',...WEARABLES].includes(t))return;const x=id%l.width,y=Math.floor(id/l.width);rewards.push({kind:t==='G'?'growth':t==='F'?'fire':t as Reward['kind'],x:x+.1,y:y+.1,w:.8,h:.8,vx:t==='G'?2:0,vy:0,age:.4,originY:y+1,persistent:true,...(l.properties?.[id]?.charges!==undefined?{charges:l.properties[id]!.charges}: {})});l.cells[id]=l.properties?.[id]?.liquid??'.';});
    return rewards;
}
export function frostEffect(s:State,x:number,y:number):void {
    emit(s,'ice',x);s.effects.push({kind:'frost',x,y,w:1,h:1,vx:0,vy:0,age:0});s.effects=s.effects.slice(-64);
}
export function freezeEnemy(s:State,e:Enemy):boolean {
    if(!e.alive||e.frozen||attackResult(e,'ice')!=='freeze'||Math.min(e.w,e.h)<.08)return false;
    const timed=rulesFor(s.level).freezing==='timed',original=structuredClone(e),anchored=e.kind==='creeper-plant'||e.kind==='plant'&&(e.mode==='pipe'||!!e.plantMouth);
    e.frozen={thrown:false,vx:e.vx,original,anchored,remaining:timed?(e.modifiers?.large?FREEZE_DURATION/2:FREEZE_DURATION):Infinity,hang:timed&&!anchored&&!supported(s,e)?FREEZE_AIR_HANG:0};
    e.vx=e.vy=0;e.cooldown=.12;delete e.flight;
    frostEffect(s,e.x+e.w/2,e.y+e.h/2);return true;
}
export function thawEnemy(s:State,e:Enemy):void {
    if(!e.frozen||!e.alive)return;
    const f=e.frozen,feet=e.y+e.h,center=e.x+e.w/2,held=e.held,snapshot=f.original;
    if(snapshot){
        const currentX=e.x,currentY=e.y;Object.assign(e,structuredClone(snapshot));
        if(!f.anchored||f.detached){
            e.x=center-e.w/2;e.y=feet-e.h;
            if(e.origin)e.origin=[e.origin[0]+e.x-snapshot.x,e.origin[1]+e.y-snapshot.y];
            if(e.flight)e.flight=[e.flight[0]+currentY-snapshot.y,e.flight[1]+currentY-snapshot.y];
            if(e.kind==='plant'&&f.detached){e.mode='fixed';e.w=.8;e.h=1;e.y=feet-1;e.x=currentX;delete e.plantMouth;delete e.plantDirection;e.origin=[e.x,feet];}
        }
    }else{e.vx=f.vx;e.vy=0;}
    delete e.frozen;e.held=false;e.cooldown=.3;if(held&&s.held===e)s.held=null;
    frostEffect(s,e.x+e.w/2,e.y+e.h/2);
}
export function shatterFrozen(s:State,e:Enemy,svc:Services):void {
    if(!e.alive)return;
    svc.defeat(s,e,'shell');
}
export function updateFrozen(s:State,e:Enemy,dt:number,svc:Services):void {
    if(!e.frozen||e.held)return;
    const f=e.frozen,timed=rulesFor(s.level).freezing==='timed';
    if(timed&&f.anchored&&!f.detached){e.vx=e.vy=0;e.grounded=true;return;}
    const water=timed?frozenWaterSurface(s,e):undefined;
    f.buoyant=water!==undefined;
    if(water!==undefined){e.vy=Math.max(-3,Math.min(3,(water+e.h*.18-e.y-e.h)*5));}
    else if(timed&&!f.thrown&&(f.hang??0)>0){e.vy=0;e.grounded=false;return;}
    else e.vy=Math.min(18,e.vy+26*dt);
    const impact=e.vy,moving=f.thrown&&Math.abs(e.vx)>1;
    const hit=svc.move(s,e,dt,false,moving);e.grounded=hit.floor;
    if(moving&&hit.wall||timed&&hit.floor&&impact>8)shatterFrozen(s,e,svc);
}
/** Solid frozen bodies must be grabbable from their collision boundary. */
export function interactFrozen(s:State,e:Enemy,i:Input):boolean {
    if(!e.frozen)return false;
    const near=touchingSwitch(s.player,e);
    if(e.alive&&!e.held&&e.cooldown<=0&&i.grab&&!s.held&&near&&!(rulesFor(s.level).freezing==='timed'&&e.frozen.anchored)){
        e.held=true;e.vx=e.vy=0;e.frozen.thrown=false;e.frozen.detached=true;e.frozen.hang=0;s.held=e;emit(s,'grab',e.x);
    }
    return true;
}
/** Placement is the apex. Start falling; each new arc rises from below view. */
export function updateFireJumper(s:State,e:Enemy,dt:number):void {
    const origin=e.origin??[e.x,e.y];e.origin=origin;e.vx=0;
    const bottom=Math.max(origin[1]+(e.jumpHeight??4),s.view.y+s.view.h);
    if(e.flamePhase==='wait'){
        e.flameWait=Math.max(0,(e.flameWait??0)-dt);
        if(e.flameWait>1e-8)return;
        e.y=bottom+.8;e.vy=-Math.sqrt(2*FIRE_JUMP_GRAVITY*(e.y-origin[1]));e.flamePhase='flight';emit(s,'fire',e.x);
    }
    const rising=e.vy<0;e.y+=e.vy*dt+.5*FIRE_JUMP_GRAVITY*dt*dt;e.vy+=FIRE_JUMP_GRAVITY*dt;
    if(rising&&e.vy>=0){e.y=origin[1];e.vy=0;}
    if(e.vy>0&&e.y>=bottom+.5){e.flamePhase='wait';e.flameWait=e.period??3;e.vy=0;e.y=bottom+1;}
}
