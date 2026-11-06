import {overlaps as overlap} from './geometry';
import {disguised} from './p2-wearables';
import type { Body, Enemy, Level, State } from './model';
import type { ElementProperties } from './catalog';
import type { Services } from './services';
import { p1Enemy } from './p1-schema';
import { pathPoint, pathLength } from './snake-path';
import { spawnContent } from './containers';
import { emit } from './events';
import { actionScore } from './scoring';

export {modifyEnemy} from './body-factory';
export function beforeDefeat(s:State,e:Enemy,cause:string):boolean {
    if(e.frozen)return false;
    if(cause==='stomp'&&e.modifiers?.winged&&!e.removedWings){e.removedWings=true;delete e.flight;e.vy=0;e.cooldown=.25;actionScore(s,'stomp',e.x,e.y);emit(s,'stomp',e.x);return true;}
    if(cause==='stomp'&&e.modifiers?.large){const feet=e.y+e.h;e.modifiers.large=false;e.w/=2;e.h/=2;e.y=feet-e.h;e.cooldown=.25;actionScore(s,'stomp',e.x,e.y);emit(s,'stomp',e.x);return true;}
    if(e.kind==='creeper-plant'&&['stomp','claw','boomerang'].includes(cause)){if(e.ai){e.ai.phase='retreat';e.ai.wait=1;}e.cooldown=.3;emit(s,'bump',e.x);return true;}
    if(e.kind==='dry-turtle'&&['stomp','claw','boomerang'].includes(cause)){
        if(e.downAge===undefined){e.downAge=3;e.vx=e.vy=0;e.cooldown=.1;emit(s,'stomp',e.x);if(cause==='stomp')actionScore(s,'stomp',e.x,e.y);}return true;
    }return false;
}
function fire(s:State,e:Enemy,vx:number,vy:number):void {
    if(disguised(s))return;
    if(s.enemyProjectiles.length>=64||s.enemyProjectiles.filter(p=>p.source===e).length>=(e.modifiers?.count??4))return;const factor=(e.modifiers?.ammoSpeed??5)/5;vx*=factor;vy*=factor;s.enemyProjectiles.push({kind:'fire',x:e.x+e.w/2,y:e.y+.25,w:.35,h:.35,vx,vy,age:0,source:e,owner:s.enemies.indexOf(e)});emit(s,'fire',e.x);
}
function ant(s:State,e:Enemy,dt:number,svc:Services):void {
    const ai=e.ai!,index=Number(ai.phase)||0,normal=[[0,1],[1,0],[0,-1],[-1,0]][index]!,tangent=[[1,0],[0,-1],[-1,0],[0,1]][index]!,direction=ai.direction,speed=e.modifiers?.pace??1;
    const solidAt=(x:number,y:number)=>{const col=Math.floor(x),row=Math.floor(y);return col>=0&&row>=0&&col<s.level.width&&row<s.level.height&&svc.solid(s.level.cells[row*s.level.width+col]!,s.pTime,s.redOn);};
    const cx=e.x+e.w/2,cy=e.y+e.h/2,front=solidAt(cx+tangent[0]!*direction*(e.w/2+.07),cy+tangent[1]!*direction*(e.h/2+.07));
    if(front){const fx=cx+tangent[0]!*direction*(e.w/2+.07),fy=cy+tangent[1]!*direction*(e.h/2+.07);if(tangent[0]!*direction>0)e.x=Math.floor(fx)-e.w;else if(tangent[0]!*direction<0)e.x=Math.floor(fx)+1;else if(tangent[1]!*direction>0)e.y=Math.floor(fy)-e.h;else e.y=Math.floor(fy)+1;ai.phase=String((index+direction+4)%4);ai.age=0;return;}
    e.vx=tangent[0]!*direction*speed;e.vy=tangent[1]!*direction*speed;svc.move(s,e,dt);e.grounded=index===0;
    const nx=e.x+e.w/2+normal[0]!*(e.w/2+.045),ny=e.y+e.h/2+normal[1]!*(e.h/2+.045);
    if(solidAt(nx,ny)){const x=Math.floor(nx),y=Math.floor(ny);if(normal[0]===1)e.x=x-e.w;if(normal[0]===-1)e.x=x+1;if(normal[1]===1)e.y=y-e.h;if(normal[1]===-1)e.y=y+1;ai.age=0;}
    else{ai.age+=dt;if(ai.age>.04){ai.phase=String((index-direction+4)%4);ai.age=0;e.x+=normal[0]!*.075;e.y+=normal[1]!*.075;}}
}
export function updateP1Enemy(s:State,e:Enemy,dt:number,svc:Services):boolean {
    if(e.transit)return true;
    if(e.downAge!==undefined){e.downAge=Math.max(0,e.downAge-dt);if(e.downAge===0){delete e.downAge;e.cooldown=.2;e.vx=-1.5;}return true;}
    const ai=e.ai??={phase:'0',age:0,home:[e.x,e.y],direction:1,lastJump:s.jumpSerial,wait:1.5};
    if((e.kind==='ant'||e.kind==='spike-ant')){if(ai.phase==='floor')ai.phase='0';ant(s,e,dt,svc);return true;}
    if(e.modifiers?.winged&&!e.removedWings&&e.grounded)e.vy=-9;
    if(!p1Enemy(e.kind))return false;
    ai.age+=dt;ai.wait-=dt;
    if(e.kind==='jump-mouse'||e.kind==='spike-mouse'){
        if(ai.lastJump!==s.jumpSerial){ai.lastJump=s.jumpSerial;if(e.grounded)e.vy=-Math.sqrt(260);}
        e.vy=Math.min(18,e.vy+26*dt);const vx=e.vx||-1.2,r=svc.move(s,e,dt);e.grounded=r.floor;if(r.wall)e.vx=-vx;return true;
    }
    if(e.kind==='creeper-plant'){
        const path=e.modifiers?.path??[[0,0],[4,0],[4,-3]],length=pathLength(path),age=ai.age*(e.modifiers?.pace??1),cycle=(e.modifiers?.color==='purple'||e.modifiers?.color==='blue')?Math.sin(age*.8)*.5+.5:Math.min(1,Math.max(0,(age%8<4?age%8:8-age%8)/3));let travelled=length*cycle;if(ai.phase==='retreat'){ai.distance=Math.max(0,(ai.distance??length)-8*dt);travelled=ai.distance;if(travelled===0){ai.phase='cooldown';ai.wait=2;}}else if(ai.phase==='cooldown'){travelled=0;if(ai.wait<=0){ai.phase='floor';ai.age=0;}}else ai.distance=travelled;const point=pathPoint(path,travelled);
        e.x=ai.home[0]+point[0];e.y=ai.home[1]+point[1];e.vx=e.vy=0;return true;
    }
    if(e.kind==='fishbone'){
        const water=(x:number,y:number)=>s.level.cells[Math.floor(y+e.h*.5)*s.level.width+Math.floor(x+e.w*.5)]==='water';if(!water(e.x,e.y)){e.vy=Math.min(18,e.vy+26*dt);e.grounded=svc.move(s,e,dt).floor;return true;}
        if(ai.wait<=0){ai.phase='charge';ai.wait=2;const dx=s.player.x-e.x,dy=s.player.y-e.y,d=Math.hypot(dx,dy)||1;e.vx=dx/d*5;e.vy=dy/d*5;}
        if(!water(e.x+e.vx*dt,e.y+e.vy*dt)){e.vx=e.vy=0;ai.wait=.4;return true;}
        const hit=svc.move(s,e,dt);if(hit.wall){svc.defeat(s,e,'block');return true;}return true;
    }
    if(e.kind==='fire-plant'){
        if(ai.wait<=0&&Math.abs(e.x-s.player.x)<20){ai.wait=e.modifiers?.period??2;const dx=s.player.x-e.x,dy=s.player.y-e.y,d=Math.hypot(dx,dy)||1;fire(s,e,dx/d*5,dy/d*5);}
        e.vx=0;e.vy=Math.min(18,e.vy+26*dt);e.grounded=svc.move(s,e,dt).floor;return true;
    }
    if(e.kind==='fire-brother'){
        if(ai.wait<=0){ai.wait=e.modifiers?.period??1.8;fire(s,e,Math.sign(s.player.x-e.x)*5,-1);}
        if(ai.age>3&&e.grounded){ai.age=0;e.vy=-Math.sqrt(260);}
    }
    if(e.kind==='ball-thrower'&&ai.wait<=0){
        ai.wait=e.modifiers?.period??3;const dir=Math.sign(s.player.x-e.x)||1;
        if(s.level.theme==='snow')spawnContent(s,'snowball',e.x+dir,e.y-.5,dir);
        else if(s.enemyProjectiles.length<64)s.enemyProjectiles.push({kind:'spike-ball',x:e.x+dir,y:e.y-.5,w:.8,h:.8,vx:dir*4,vy:-3,age:0,source:e,owner:s.enemies.indexOf(e)});
        emit(s,'throw',e.x);
    }
    if(e.kind==='snow-cactus'){e.vx=Math.sign(e.vx||-1)*.5;}
    e.vy=Math.min(18,e.vy+26*dt);const vx=e.vx,r=svc.move(s,e,dt);e.grounded=r.floor;if(r.wall)e.vx=-vx;return true;
}
export function advanceEnemyProjectiles(s:State,dt:number,svc:Services):void {
    for(const b of s.enemyProjectiles){if(b.transit)continue;b.age+=dt;const old={...b};b.vy+=dt*(b.kind==='fire'?12:26);const hit=svc.move(s,b,dt,false,b.kind==='spike-ball');if(hit.floor)b.vy=b.kind==='fire'?-4:0;if(hit.wall){b.age=99;if(b.kind==='spike-ball'){const x=Math.floor(b.vx>0?b.x+b.w+.01:b.x-.01),y=Math.floor(b.y+b.h/2);svc.hitBlock(s,x,y,s.level.cells[y*s.level.width+x]!);}}
        if(overlap(b,s.player)){svc.hurt(s,old.y<s.player.y?'top':'side');b.age=99;}
        if(b.kind==='spike-ball')for(const e of s.enemies)if(e.alive&&e!==(b.source??s.enemies[b.owner])&&overlap(b,e)){svc.defeat(s,e,'shell',b);b.age=99;break;}
    }s.enemyProjectiles=s.enemyProjectiles.filter(b=>b.w>0&&(b.transit||b.age<6)&&b.y<s.level.height+2&&b.x> -2&&b.x<s.level.width+2&&Math.abs(b.x-s.player.x)<34);
}
