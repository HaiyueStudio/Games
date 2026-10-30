import {overlaps as overlap} from './geometry';
import {specialHit} from './p1-abilities';
import {attackResult} from './interactions';
import type { Body, Enemy, State } from './model';
import type { Services } from './services';
import { glassRouteGeometry, roundedGlassPath, sampleGlassPath, glassIntersects, type Point } from './glass';
import { switchObstacles } from './switches';
export interface ObjectTransit {path:Point[];core:Point[];travel:number;angle:number;from:{point:Point;normal:Point};to:{point:Point;normal:Point};vx:number;vy:number;returns:number;elapsed:number;freezeAtExit?:boolean;exiting?:boolean}

const alive=(b:Body):boolean=>!('alive'in b)||!!b.alive;
export function allPipeBodies(s:State):Body[]{return [...s.enemies.filter(e=>e.alive&&!e.held&&!e.frozen&&!['ghost','fire-jumper','creeper-plant'].includes(e.kind)),...s.items.filter(i=>i.alive&&!i.held),...s.rewards.filter(r=>r.w>0),...s.shots,...s.boomerangs,...s.enemyProjectiles,...s.cannonShots,...s.magicShots];}
function clear(s:State,b:Body,m:{point:Point;normal:Point},svc:Services):boolean {
    const n=m.normal,half=n[0]?b.w/2:b.h/2,box={...b,x:m.point[0]+n[0]*(half+.04)-b.w/2,y:m.point[1]+n[1]*(half+.04)-b.h/2};
    for(let y=Math.floor(box.y+.005);y<=Math.floor(box.y+box.h-.005);y++)for(let x=Math.floor(box.x+.005);x<=Math.floor(box.x+box.w-.005);x++)if(x<0||y<0||x>=s.level.width||y>=s.level.height||(!String(s.level.cells[y*s.level.width+x]).startsWith('glass')&&svc.solid(s.level.cells[y*s.level.width+x]!,s.pTime,s.redOn)))return false;
    return !glassIntersects(s.level,box)&&!switchObstacles(s,b).some(o=>overlap(o,box))&&!allPipeBodies(s).some(o=>o!==b&&!o.transit&&alive(o)&&overlap(o,box));
}
/** Pipe space is shared. A short entrance reservation queues following objects. */
export function advancePipeObjects(s:State,dt:number,svc:Services):void {
    const bodies=allPipeBodies(s);
    for(const b of bodies){
        b.transitWait=Math.max(0,(b.transitWait??0)-dt);
        const tr=b.transit;
        if(tr){
            tr.elapsed+=dt;if(tr.elapsed>12&&(s.shots.some(o=>o===b)||s.boomerangs.some(o=>o===b)||s.enemyProjectiles.some(o=>o===b)||s.cannonShots.some(o=>o===b)||s.magicShots.some(o=>o===b))){b.w=0;delete b.transit;continue;}
            const previous={x:b.x+b.w/2,y:b.y+b.h/2};tr.travel+=6*dt;const at=sampleGlassPath(tr.path,tr.travel);tr.angle=at.angle;b.x=at.point[0]-b.w/2;b.y=at.point[1]-b.h/2;b.vx=b.vy=0;
            for(const other of bodies)if(other!==b&&other.transit&&overlap(b,other)){
                // Projectiles hit pipe occupants; ordinary travellers pass each
                // other rather than deadlocking a one-lane tube.
                const boom=s.boomerangs.find(o=>o===b),target=other as Enemy,key='pipe:'+s.enemies.indexOf(target);if(boom&&s.enemies.includes(target)&&!(boom.targets??=[]).includes(target)){boom.targets.push(target);specialHit(s,target,'boomerang',svc,true);}const coin=s.items.find(i=>i===other&&i.kind==='coin'&&i.alive);if(boom&&coin){coin.alive=false;svc.coin(s,other.x,other.y);}
                if(s.cannonShots.includes(b as never)&&s.enemies.includes(other as Enemy)){const e=other as Enemy;if(['defeat','shatter'].includes(attackResult(e,'shell')))svc.defeat(s,e,'shell',b);b.w=0;delete b.transit;}
                if(s.shots.includes(b)){const e=other as Enemy;if(s.enemies.includes(e)){const result=attackResult(e,(b as {kind?:string}).kind==='ice'?'ice':'fire');s.shots.splice(s.shots.indexOf(b),1);if(result==='defeat')svc.defeat(s,e,'shot');else if(result==='freeze')e.transit!.freezeAtExit=true;b.w=0;delete b.transit;}}
            }
            if((s.enemyProjectiles.some(o=>o===b)||s.magicShots.some(o=>o===b))&&s.pipe?.glass&&overlap(b,s.player)){svc.hurt(s);b.w=0;}
            // Ordinary travellers do not deal body contact damage inside tubes.
            if(at.done){
                if(!tr.exiting){if(clear(s,b,tr.to,svc)){const n=tr.to.normal,extent=n[0]?b.w/2:b.h/2;tr.path=[at.point,[tr.to.point[0]+n[0]*(extent+.05),tr.to.point[1]+n[1]*(extent+.05)]];tr.exiting=true;tr.travel=0;}
                    else{const prev=tr.from;tr.from=tr.to;tr.to=prev;tr.core.reverse();tr.path=tr.core;tr.travel=0;tr.returns++;}}
                else{delete b.transit;b.transitWait=.5;const n=tr.to.normal,speed=Math.max(2,Math.hypot(tr.vx,tr.vy));b.vx=n[0]*speed;b.vy=n[1]*speed;if(Math.abs(b.vx)<.1&&s.enemies.includes(b as Enemy))b.vx=tr.vx||-1.5;if(tr.freezeAtExit)s.pipeHits.push({enemy:b as Enemy,ice:true});}
            }
            if(!Number.isFinite(b.x+b.y)){b.x=previous.x-b.w/2;b.y=previous.y-b.h/2;delete b.transit;}
            continue;
        }
        if(b.transitWait||b.w>1.6||b.h>1.6||!alive(b))continue;
        for(const route of glassRouteGeometry(s.level))for(let end=0;end<2;end++){
            const m=route.mouths[end]!,n=m.normal,extent=n[0]?b.w/2:b.h/2,c:Point=[b.x+b.w/2,b.y+b.h/2],target:Point=[m.point[0]+n[0]*(extent+.003),m.point[1]+n[1]*(extent+.003)];
            if(b.vx*n[0]+b.vy*n[1]>=-.01||Math.abs((c[0]-target[0])*n[0]+(c[1]-target[1])*n[1])>.28||Math.abs((c[0]-target[0])*n[1]-(c[1]-target[1])*n[0])>.48||!clear(s,b,m,svc))continue;
            if(bodies.some(o=>o.transit&&Math.hypot(o.x+o.w/2-c[0],o.y+o.h/2-c[1])<1))continue;
            const to=route.mouths[1-end]!,spine=end?[...route.world].reverse():route.world,inside=(mouth:typeof m):Point=>{const v=mouth.normal,h=v[0]?b.w/2:b.h/2;return [mouth.point[0]-v[0]*(h+.003),mouth.point[1]-v[1]*(h+.003)];},core=roundedGlassPath([inside(m),...spine,inside(to)]);
            b.transit={path:[c,...core],core,travel:0,angle:0,elapsed:0,from:m,to,vx:b.vx,vy:b.vy,returns:0};b.vx=b.vy=0;
        }
    }
}
