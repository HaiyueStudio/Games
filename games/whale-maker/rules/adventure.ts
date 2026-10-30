import {overlaps as overlap} from './geometry';
import {hasHelmet} from './player-equipment';
import type { Body, Input, Level, State } from './model';
import type { Services } from './services';
import { detonatePow } from './pow';
import { effect } from './effects';
import { touchingSwitch } from './switches';
import { emit } from './events';
import { setCell } from './terrain';

export interface FollowingKey { x:number;y:number;age:number }
export interface Stone extends Body {
    origin:[number,number];direction:'left'|'right'|'down';
    phase:'idle'|'alert'|'charge'|'pause'|'return'|'knocked';timer:number;
}


export function stoneCells(l:Level,id:number):number[]{
    if(l.cells[id]==='stone')return [id,id+1,id+l.width,id+l.width+1];
    if(l.cells[id]!=='stone-body')return [];
    for(const n of [id-1,id-l.width,id-l.width-1])if(l.cells[n]==='stone'&&Math.floor(n/l.width)<=Math.floor(id/l.width)&&id%l.width>=n%l.width)return stoneCells(l,n);
    return [];
}
export function placeStone(l:Level,x:number,y:number):boolean {
    if(x<0||x+2>l.width||y<0||y+2>l.height)return false;
    const id=y*l.width+x;setCell(l,id,'stone');for(const n of [id+1,id+l.width,id+l.width+1])setCell(l,n,'stone-body');
    (l.properties??={})[id]={direction:'down'};return true;
}
export function initAdventure(l:Level):Pick<State,'stones'|'keys'|'keyTrail'|'unlockedDoors'|'climbing'|'climbAge'|'climbWait'> {
    const stones:Stone[]=[];
    l.cells.forEach((t,id)=>{if(t!=='stone')return;const x=id%l.width,y=Math.floor(id/l.width);stones.push({x,y,w:2,h:2,vx:0,vy:0,origin:[x,y],direction:l.properties?.[id]?.direction??'down',phase:'idle',timer:0});for(const n of stoneCells(l,id))l.cells[n]='.';});
    return {stones,keys:[],keyTrail:[],unlockedDoors:{},climbing:false,climbAge:0,climbWait:0};
}
export function collectKey(s:State,x:number,y:number):void {
    emit(s,'key',x);
    if(s.keys.length<32)s.keys.push({x,y,age:0});s.notice='获得钥匙！跟在身后，可开启上锁的门';
}
export function advanceAdventure(s:State,dt:number):void {
    s.climbWait=Math.max(0,s.climbWait-dt);
    const p=s.player;s.keyTrail.unshift({x:p.x+p.w/2-s.facing*.8,y:p.y+p.h*.35});s.keyTrail=s.keyTrail.slice(0,160);
    for(const [n,key]of s.keys.entries()){
        key.age+=dt;const target=s.keyTrail[Math.min(s.keyTrail.length-1,12+n*8)]!;
        const ease=1-Math.exp(-12*dt);key.x+=(target.x-key.x)*ease;key.y+=(target.y+Math.sin(key.age*4+n)*.08-key.y)*ease;
    }
}
const onVine=(s:State)=>{
    const p=s.player,x=Math.floor(p.x+p.w/2);
    for(let y=Math.max(0,Math.floor(p.y));y<=Math.min(s.level.height-1,Math.floor(p.y+p.h-.02));y++)if(s.level.cells[y*s.level.width+x]==='vine')return true;
    return false;
};
/** Up catches a vine, down descends; jumping detaches with a brief regrab delay. */
export function vineStep(s:State,i:Input,jump:boolean,dt:number):boolean {
    const p=s.player,contact=onVine(s);
    if(s.climbing&&jump){emit(s,i.spin?'spin':'jump');s.climbing=false;s.climbWait=.25;p.vy=-13.5;s.grounded=false;s.coyote=0;s.buffer=0;s.spinning=i.spin;s.jumpSustain=true;s.jumpCut=false;return false;}
    if(!contact){s.climbing=false;return false;}
    if(!s.climbing&&i.interact&&s.climbWait===0&&!s.held){s.climbing=true;s.climbAge=0;s.spinning=false;s.grounded=false;s.coyote=0;s.wallGrace=0;s.buffer=0;s.running=s.skidding=s.sliding=false;}
    if(!s.climbing)return false;
    p.vx=i.axis*1.8;p.vy=(Number(i.down)-Number(!!i.interact))*3;
    if(p.vx||p.vy)s.climbAge+=dt;
    s.grounded=false;s.coyote=0;s.buffer=0;s.jumpSustain=false;s.jumpCut=false;
    return true;
}
export function bonkStone(s:State,stone:Stone):void {
    if(!hasHelmet(s))return;
    stone.phase='knocked';stone.vx=0;stone.vy=-7;stone.timer=0;
    s.notice='顶起了石头怪，落定后改变起点！';
}
function approach(stone:Stone,p:Body):number|null {
    const dx=p.x+p.w/2-stone.x-stone.w/2,dy=p.y+p.h/2-stone.y-stone.h/2;
    if(stone.direction==='down')return p.y>=stone.y+stone.h-.1?Math.abs(dx):null;
    return stone.direction==='left'?(dx<0?Math.abs(dy):null):(dx>0?Math.abs(dy):null);
}
export function updateStones(s:State,dt:number,svc:Services):void {
    const p=s.player;
    for(const stone of s.stones){
        const old={...stone},standing=Math.abs(p.y+p.h-stone.y)<.04&&p.vy>=0&&p.x+p.w>stone.x+.01&&p.x<stone.x+stone.w-.01;
        stone.timer=Math.max(0,stone.timer-dt);
        if(stone.phase==='idle'||stone.phase==='alert'){
            const gap=approach(stone,p);stone.phase=gap!==null&&gap<=3?'alert':'idle';
            if(gap!==null&&gap<=2){stone.phase='charge';stone.vx=stone.direction==='left'?-18:stone.direction==='right'?18:0;stone.vy=stone.direction==='down'?14.4:0;}
        }
        if(stone.phase==='pause'){stone.vx=stone.vy=0;if(stone.timer===0)stone.phase='return';}
        if(stone.phase==='return'){
            const dx=stone.origin[0]-stone.x,dy=stone.origin[1]-stone.y,d=Math.hypot(dx,dy);
            const speed=dy<0?1.08:.9;
            if(d<=dt*speed){stone.x=stone.origin[0];stone.y=stone.origin[1];stone.vx=stone.vy=0;stone.phase='idle';}
            else{stone.vx=dx/d*speed;stone.vy=dy/d*speed;}
        }
        if(stone.phase==='knocked'){stone.vy+=22*dt;if(stone.vy>=0){stone.origin=[stone.x,stone.y];stone.phase='pause';stone.timer=.45;stone.vx=stone.vy=0;}}
        if(stone.vx||stone.vy){
            const hit=svc.move(s,stone,dt);
            if(stone.phase==='charge'&&(hit.wall||hit.floor)){
                const pow=s.items.find(item=>item.kind==='pow'&&item.alive&&!item.held&&touchingSwitch(stone,item)&&
                    (stone.direction==='down'?Math.abs(stone.y+stone.h-item.y)<.03:stone.direction==='left'?Math.abs(stone.x-item.x-item.w)<.03:Math.abs(stone.x+stone.w-item.x)<.03));
                if(pow){detonatePow(s,pow,svc);effect(s,'stone',stone.x+1,stone.y+2,stone.direction==='left'?-2:2,-7);s.stones=s.stones.filter(other=>other!==stone);s.notice='POW震碎了石头怪！';continue;}
            }
            if(stone.phase==='charge'&&(hit.wall||hit.floor||stone.x===0||stone.x+stone.w===s.level.width)){emit(s,'stone',stone.x+1);stone.phase='pause';stone.timer=.45;stone.vx=stone.vy=0;}
            if(stone.phase==='knocked'&&stone.vy===0){stone.origin=[stone.x,stone.y];stone.phase='pause';stone.timer=.45;}
        }
        const dx=stone.x-old.x,dy=stone.y-old.y;
        if(dy>0)for(const enemy of s.enemies)if(enemy.alive&&!enemy.held&&Math.min(enemy.w,enemy.h)>.08&&
            enemy.x<stone.x+stone.w&&enemy.x+enemy.w>stone.x&&old.y+old.h<=enemy.y+.2&&stone.y+stone.h>=enemy.y)
            svc.defeat(s,enemy,'block');
        if(standing&&(dx||dy)){
            const carried={...p,vx:dx/dt,vy:dy/dt},hit=svc.move(s,carried,dt,true);p.x=carried.x;p.y=carried.y;if(hit.wall||hit.floor&&dy>0)s.climbing=false;
        }
        if(!overlap(p,stone))continue;
        if(hasHelmet(s)){
            stone.x=old.x;stone.y=old.y;
            if(old.y+old.h<=p.y+.12||p.y>=stone.y+stone.h-.25)bonkStone(s,stone);
            else{stone.phase='pause';stone.timer=.45;stone.vx=stone.vy=0;}
        }else if(dy>0&&old.y+old.h<=p.y+.2)svc.crush(s);
        else if(dx!==0){
            const desired=dx<0?stone.x-p.w:stone.x+stone.w,body={...p,vx:desired-p.x,vy:0};svc.move(s,body,1,true);p.x=body.x;
            if(overlap(p,stone))svc.crush(s);
        }
        // Separate on the approach face while retaining a safe player position.
        if(overlap(p,stone)){
            if(stone.direction==='down'){if(p.y>=stone.y+stone.h/2)p.y=stone.y+stone.h;else p.y=stone.y-p.h;}
            else p.x=stone.direction==='left'?stone.x-p.w:stone.x+stone.w;
        }
    }
}
