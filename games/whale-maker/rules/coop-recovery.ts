import {asPlayer,coopAxis,coopCamera,livingPlayers,restoreCoopPlayer} from './coop-state';
import {courseBounds} from './course-bounds';
import {emit} from './events';
import {firebarPoints} from './firebar';
import {overlaps} from './geometry';
import {curvedGlassCell,glassIntersects} from './glass';
import type {Body,State,Tile} from './model';
import {PLAYER_FORMS} from './player-body';
import type {Services} from './services';
import {switchObstacles} from './switches';
import {cellAt,slopeAt,slopeIntersects} from './terrain';

export const BUBBLE_RADIUS=.61;
const DANGER=new Set<Tile>(['^','spike-all','spike-switch','lava','quicksand','firebar']);
const CHANGING_FLOORS=new Set<Tile>(['p-on','p-off','red-block','blue-block','bridge','toggle-switch','E']);
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(Math.max(min,max),value));
const smallBody=(x:number,y:number):Body=>({x,y,w:PLAYER_FORMS[0].w,h:PLAYER_FORMS[0].h,vx:0,vy:0});

function localBounds(s:State,b:Body) {
    const room=s.level.rooms?.find(r=>b.x+b.w>r.x&&b.x<r.x+r.w&&b.y>=r.y);
    return {...courseBounds(s.level,b),top:room?.y??0,bottom:room?room.y+room.h:s.level.playHeight??s.level.height};
}
function withinTeam(s:State,b:Body):boolean {
    for(const axis of ['x','y'] as const){
        const range=coopAxis(s,b,axis);
        if(range&&(b[axis]<range[0]-.001||b[axis]>range[1]+.001))return false;
    }
    return true;
}
function clearBody(s:State,b:Body,svc:Services):boolean {
    const {left,right,top,bottom}=localBounds(s,b);
    if(b.x<left||b.x+b.w>right||b.y<top||b.y+b.h>bottom||glassIntersects(s.level,b))return false;
    const liquid=s.level.liquid,lx=liquid?.x??0;
    if(liquid?.kind==='lava'&&s.level.liquidSurface!==undefined&&b.y+b.h>s.level.liquidSurface&&b.x<lx+(liquid.width??s.level.width)&&b.x+b.w>lx)return false;
    for(let y=Math.floor(b.y+.001);y<=Math.floor(b.y+b.h-.001);y++)for(let x=Math.floor(b.x+.001);x<=Math.floor(b.x+b.w-.001);x++){
        const tile=cellAt(s.level,x,y);
        if(DANGER.has(tile)||svc.solid(tile,s.pTime,s.redOn)&&!curvedGlassCell(s.level,x,y)||slopeIntersects(tile,x,y,b))return false;
    }
    return !switchObstacles(s,b,true,b.x,b.x+b.w).some(q=>overlaps(b,q));
}
function safePlacement(s:State,b:Body,svc:Services):boolean {
    if(!withinTeam(s,b)||!clearBody(s,b,svc))return false;
    if(s.enemies.some(e=>e.alive&&!e.held&&!e.transit&&overlaps(b,e))||s.bosses.some(e=>e.health>0&&overlaps(b,e)))return false;
    if([...s.bossFire,...s.hammers,...s.enemyProjectiles,...s.magicShots].some(q=>overlaps(b,q)))return false;
    for(let y=Math.max(0,Math.floor(b.y)-10);y<Math.min(s.level.height,b.y+b.h+10);y++)for(let x=Math.max(0,Math.floor(b.x)-10);x<Math.min(s.level.width,b.x+b.w+10);x++){
        if(cellAt(s.level,x,y)==='firebar'&&firebarPoints(s.level,x,y,s.time).some(p=>overlaps(b,{x:p.x-.18,y:p.y-.18,w:.36,h:.36})))return false;
    }
    return true;
}
function landingHeight(s:State,b:Body,row:number,svc:Services):number|undefined {
    const samples=[b.x+.002,b.x+b.w/2,b.x+b.w-.002];
    const at=(x:number)=>{
        const tile=cellAt(s.level,x,row);
        if(DANGER.has(tile)||CHANGING_FLOORS.has(tile))return;
        return slopeAt(s.level,x,row)?.height??(tile==='='||svc.solid(tile,s.pTime,s.redOn)&&!curvedGlassCell(s.level,Math.floor(x),row)?row:undefined);
    };
    const heights=samples.map(at);
    // Stand on a flat surface across the body or a continuous slope with support on both sides.
    if(heights.some(y=>y===undefined))return;
    return Math.min(...(heights as number[]));
}

function findGround(s:State,view:{x:number;y:number},svc:Services):Body|undefined {
    const {w,h}=s.coop!.viewport,cx=view.x+w/2,cy=view.y+h/2;
    const base=smallBody(cx-PLAYER_FORMS[0].w/2,cy-PLAYER_FORMS[0].h/2);
    const candidates:{body:Body;distance:number}[]=[];
    for(let offset=-5;offset<=5;offset+=.5){
        const x=base.x+offset;
        if(x<view.x||x+base.w>view.x+w)continue;
        for(let row=Math.max(1,Math.ceil(view.y));row<=Math.min(s.level.height-1,Math.floor(view.y+h));row++){
            const body={...base,x},feet=landingHeight(s,body,row,svc);
            if(feet===undefined||feet>view.y+h)continue;
            body.y=feet-body.h;
            if(body.y<view.y||cellAt(s.level,cx+offset,body.y+body.h*.5)==='water')continue;
            const distance=(offset===0?0:100)+offset**2+(body.y-base.y)**2;
            candidates.push({body,distance});
        }
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    return candidates.find(({body})=>safePlacement(s,body,svc))?.body;
}

/** A vertical tether should block separation, without suspending someone over a bottomless pit. */
export function hasFloorBelow(s:State,b:Body,svc:Services):boolean {
    const bottom=localBounds(s,b).bottom;
    for(let y=Math.max(0,Math.floor(b.y+b.h));y<bottom;y++)for(let x=Math.floor(b.x);x<=Math.floor(b.x+b.w-.001);x++){
        const t=cellAt(s.level,x,y);
        if(t==='water'||t==='='||svc.solid(t,s.pTime,s.redOn)||slopeAt(s.level,x+.5,y))return true;
    }
    return [...s.platforms,...switchObstacles(s,b,true,b.x,b.x+b.w)].some(q=>q.x<b.x+b.w&&q.x+q.w>b.x&&q.y>=b.y+b.h-.01&&q.y<bottom);
}

function bubblePosition(s:State,view:{x:number;y:number},svc:Services):Body {
    const {w,h}=s.coop!.viewport,cx=view.x+w/2,cy=view.y+h/2;
    for(const dy of [0,-1,1,-2,2])for(const dx of [0,-1,1,-2,2,-3,3]){
        const body=smallBody(cx+dx-PLAYER_FORMS[0].w/2,cy+dy-PLAYER_FORMS[0].h/2);
        if(clearBody(s,body,svc))return body;
    }
    // The carrier is intangible and leads back to a teammate in enclosed rooms.
    return smallBody(cx-PLAYER_FORMS[0].w/2,cy-PLAYER_FORMS[0].h/2);
}
function bubbleTouches(bubble:Body,actor:Body):boolean {
    const x=bubble.x+bubble.w/2,y=bubble.y+bubble.h/2;
    return (x-clamp(x,actor.x,actor.x+actor.w))**2+(y-clamp(y,actor.y,actor.y+actor.h))**2<=BUBBLE_RADIUS**2;
}
function releaseNear(s:State,helper:Body,svc:Services):Body|undefined {
    const x=helper.x+(helper.w-PLAYER_FORMS[0].w)/2,y=helper.y+helper.h-PLAYER_FORMS[0].h;
    const base=smallBody(x,y),columns=coopAxis(s,base,'x'),rows=coopAxis(s,base,'y');
    return [0,-.45,.45,-.9,.9].flatMap(dx=>[0,-.5,-1].map(dy=>smallBody(
        columns?clamp(x+dx,...columns):x+dx,
        rows?clamp(y+dy,...rows):y+dy,
    ))).find(b=>safePlacement(s,b,svc));
}

export function advanceCoopRecovery(s:State,dt:number,svc:Services):void {
    const coop=s.coop!;
    for(const pop of coop.pops)pop.age+=dt;
    coop.pops=coop.pops.filter(pop=>pop.age<.28);
    if(s.phase!=='playing'||coop.traveler>=0||!coop.recovery.some(Boolean))return;
    for(const [index,recovery] of coop.recovery.entries())if(recovery)asPlayer(s,index,()=>{
        const view=coopCamera(s);
        if(recovery.kind==='waiting'){
            recovery.remaining-=dt;if(recovery.remaining>0)return;
            const ground=findGround(s,view,svc);
            if(ground){restoreCoopPlayer(s,ground,true);s.notice=`P${index+1} 已复活`;emit(s,'splash',ground.x);return;}
            s.player=bubblePosition(s,view,svc);
            coop.recovery[index]={kind:'bubble',age:0};
            s.notice=`碰触泡泡救援 P${index+1}`;
            return;
        }
        recovery.age+=dt;
        const bubble=s.player,helpers=livingPlayers(s);
        const distance=(actor:Body)=>Math.hypot(actor.x+actor.w/2-bubble.x-bubble.w/2,actor.y+actor.h/2-bubble.y-bubble.h/2);
        const closest=helpers.reduce<Body|undefined>((best,p)=>!best||distance(p)<distance(best)?p:best,undefined);
        if(!closest)return;
        const {w,h}=coop.viewport;
        const dx=closest.x+closest.w/2-bubble.x-bubble.w/2,dy=closest.y+closest.h/2-bubble.y-bubble.h/2;
        const speed=recovery.age<.25?0:Math.min(1,dt*3.8/(Math.hypot(dx,dy)||1));
        bubble.x=clamp(bubble.x+dx*speed,view.x+.22,view.x+w-bubble.w-.22);
        bubble.y=clamp(bubble.y+dy*speed,view.y+.22,view.y+h-bubble.h-.22);
        if(recovery.age<.25)return;
        for(const helper of helpers)if(bubbleTouches(bubble,helper)){
            const exit=releaseNear(s,helper,svc);
            if(!exit)continue;
            if(Math.abs(exit.x-helper.x)>.9)exit.vy=-4;
            restoreCoopPlayer(s,exit,false);
            coop.pops.push({x:bubble.x+bubble.w/2,y:bubble.y+bubble.h/2,age:0});
            s.notice=`队友救出了 P${index+1}`;emit(s,'splash',exit.x);break;
        }
    });
}
