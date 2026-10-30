import type { Body, Enemy, State } from './model';
import type { Services } from './expansion';
import { isP2Enemy } from './p2-schema';
import { disguised } from './p2-wearables';
import { emit } from './events';
import { spawnContent } from './containers';
import { setCell } from './terrain';
const overlap=(a:Body,b:Body)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
export function beforeP2Defeat(s:State,e:Enemy,cause:string):boolean {
    if(e.frozen)return false;
    if(e.kind==='bully'&&!['lava','sand','block'].includes(cause)){e.vx=(Math.sign(e.x-s.player.x)||s.facing)*7;e.ai!.wait=.8;e.cooldown=.2;emit(s,'bump',e.x);return true;}
    if(e.kind==='giant-fish'&&['shot','claw','boomerang'].includes(cause)&&(e.health??3)>1){e.health=(e.health??3)-1;e.cooldown=.15;emit(s,'hit',e.x);return true;}
    if(e.kind==='spring-enemy'&&cause==='stomp')spawnContent(s,'spring-v',e.x,e.y);
    return false;
}
export function bullyContact(s:State,e:Enemy,oldFeet:number,svc:Services):void {
    if(e.cooldown>0)return;const p=s.player,dir=Math.sign(p.x+p.w/2-e.x-e.w/2)||-s.facing;
    if(p.vy>=0&&oldFeet<=e.y+.3){p.y=e.y-p.h;p.vy=-9;s.grounded=false;e.vx=-dir*6;e.ai!.wait=.8;}
    else{p.pushVx=dir*7;p.vx=dir*7;const vx=e.vx;e.vx=-dir*3;svc.move(s,e,1/120);e.vx=vx;e.ai!.wait=.25;}
    e.cooldown=.25;emit(s,'bump',e.x);
}
function clearAt(s:State,b:Body,svc:Services):boolean {if(b.x<0||b.y<0||b.x+b.w>s.level.width||b.y+b.h>s.level.height)return false;for(let y=Math.floor(b.y+.01);y<=Math.floor(b.y+b.h-.01);y++)for(let x=Math.floor(b.x+.01);x<=Math.floor(b.x+b.w-.01);x++)if(svc.solid(s.level.cells[y*s.level.width+x]!,s.pTime,s.redOn))return false;return true;}
export function updateP2Enemy(s:State,e:Enemy,dt:number,svc:Services):boolean {
    if(!isP2Enemy(e.kind))return false;const a=e.ai!,masked=disguised(s),p=s.player;a.age+=dt;a.wait-=dt;
    if(e.kind==='ring-ghost'){const radius=e.modifiers?.orbit??3,phase=(e.origin?.[0]??0)+a.age*(e.modifiers?.pace??.6);e.x=a.home[0]+Math.cos(phase)*radius;e.y=a.home[1]+Math.sin(phase)*radius;e.vx=e.vy=0;return true;}
    if(e.kind==='bee'){const target=masked?a.home:[p.x,p.y],dx=target[0]!-e.x,dy=target[1]!-e.y,d=Math.hypot(dx,dy)||1,pace=e.modifiers?.pace??2.4;e.vx+=Math.max(-3*dt,Math.min(3*dt,dx/d*pace-e.vx));e.vy+=Math.max(-3*dt,Math.min(3*dt,dy/d*pace-e.vy));const r=svc.move(s,e,dt);if(r.wall)e.vx=-r.wall*2;return true;}
    if(e.kind==='spring-enemy'){if(e.grounded&&a.wait<=0){e.vy=-Math.sqrt(52*(e.modifiers?.winged?7:4));a.wait=1;e.vx=masked?-1.2:(Math.sign(p.x-e.x)||1)*1.8;emit(s,'spring',e.x);}e.vy=Math.min(18,e.vy+26*dt);e.grounded=svc.move(s,e,dt).floor;return true;}
    if(e.kind==='bully'){if(a.wait<=0)e.vx=masked?0:(Math.sign(p.x-e.x)||1)*1.8;e.vy=Math.min(18,e.vy+26*dt);const r=svc.move(s,e,dt);e.grounded=r.floor;if(r.wall)e.vx=-e.vx;return true;}
    if(e.kind==='giant-fish'||e.kind==='lava-dragon'){
        const liquid=e.kind==='giant-fish'?'water':'lava',control=s.level.liquid;
        if(a.distance===undefined){const column=Math.floor(a.home[0]);a.distance=a.home[1];for(let y=0;y<s.level.height;y++)if(s.level.cells[y*s.level.width+column]===liquid){a.distance=y;break;}}
        const surface=control?.kind===liquid&&a.home[0]>=(control.x??0)&&a.home[0]<(control.x??0)+(control.width??s.level.width)?s.liquidLevel:a.distance;
        if(a.phase==='floor'){a.phase='wait';a.wait=1;e.vx=e.vy=0;}
        if(a.phase==='wait'){e.x=a.home[0];e.y=surface+3;if(a.wait<=0&&!masked&&Math.abs(p.x-a.home[0])<14){a.phase='leap';e.x=a.home[0]-5;e.y=surface+3;e.vx=4.5;e.vy=e.kind==='lava-dragon'?-16:-13;a.wait=e.modifiers?.period??3;}return true;}
        e.vy+=20*dt;e.x+=e.vx*dt;e.y+=e.vy*dt;if(e.vy>0&&e.y>surface+3){a.phase='wait';a.wait=e.modifiers?.period??3;}return true;
    }
    if(e.kind==='magikoopa'){
        e.vx=0;e.vy=Math.min(18,e.vy+26*dt);svc.move(s,e,dt);
        if(a.wait<=0&&!masked){a.wait=e.modifiers?.period??3.5;a.phase='cast';if(s.magicShots.length<24){const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy)||1;s.magicShots.push({kind:'magic',x:e.x+e.w/2,y:e.y+.2,w:.45,h:.45,vx:dx/d*4,vy:dy/d*4,age:0,owner:e});emit(s,'fire',e.x);}a.revives=(a.revives??0)+1;if(a.revives%2===0){for(const offset of [6,-6,9,-9]){const b={...e,x:Math.max(0,Math.min(s.level.width-e.w,p.x+offset)),y:Math.min(e.y,p.y)};if(clearAt(s,b,svc)){e.x=b.x;e.y=b.y;emit(s,'door',e.x);break;}}}}
        if(a.wait<1)a.phase='hidden';else if(a.wait<2.5)a.phase='cast';else a.phase='walk';return true;
    }
    if(e.kind==='homing-bill'||e.kind==='cat-bill'||e.kind==='giant-bill'){
        if(e.kind!=='giant-bill'&&!masked){const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy)||1,pace=e.kind==='cat-bill'?6:4;e.vx+=Math.max(-5*dt,Math.min(5*dt,dx/d*pace-e.vx));e.vy+=Math.max(-5*dt,Math.min(5*dt,dy/d*pace-e.vy));}else if(!e.vx)e.vx=-4;
        const vx=e.vx,r=svc.move(s,e,dt,false,e.kind!=='homing-bill');if(r.wall||r.floor){e.alive=false;emit(s,'break',e.x);s.effects.push({kind:'blast',x:e.x,y:e.y,w:e.w,h:e.h,vx:0,vy:0,age:0});s.effects=s.effects.slice(-64);}else e.vx=vx;return true;
    }return true;
}
export function advanceMagic(s:State,dt:number,svc:Services):void {
    for(const b of s.magicShots){if(b.transit)continue;b.age+=dt;b.x+=b.vx*dt;b.y+=b.vy*dt;if(overlap(s.player,b)&&!s.pipe){svc.hurt(s);b.age=9;}
        const x=Math.floor(b.x+b.w/2),y=Math.floor(b.y+b.h/2),id=y*s.level.width+x,t=s.level.cells[id];if(svc.solid(t!,s.pTime,s.redOn)){
            const root=s.rootLevel??s.startLevel,original=s.currentArea==='main'?root:root.areas?.[s.currentArea],owner=b.owner as Enemy|undefined;
            if(b.kind==='magic'&&t==='B'&&original?.cells[id]==='B'&&!s.pConversions[id]&&!b.converted&&owner&&(owner.magicCount??0)<8){owner.magicCount=(owner.magicCount??0)+1;setCell(s.level,id,'.');spawnContent(s,owner.magicCount%3===0?'coin':owner.magicCount%2?'duck':'turtle',x+.1,y);b.converted=true;emit(s,'reward',x);}b.age=9;
        }
    }s.magicShots=s.magicShots.filter(b=>b.w>0&&(b.transit||b.age<5)&&b.x>-2&&b.x<s.level.width+2&&b.y>=-4&&b.y<s.level.height+2);
}
