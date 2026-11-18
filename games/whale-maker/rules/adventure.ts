import {playerBodies,visitPlayers} from './coop-state';
import {overlaps as overlap} from './geometry';
import {hasHelmet} from './player-equipment';
import type { Body, Input, Level, State } from './model';
import type { Services } from './services';
import { detonatePow } from './pow';
import { effect } from './effects';
import { touchingSwitch } from './switches';
import { emit } from './events';
import { setCell } from './terrain';
import {shatterTile} from './breaking';
import {pressPSwitch} from './p-switch';
import type {ElementProperties} from './catalog';

export interface FollowingKey { x:number;y:number;age:number }
export interface Stone extends Body {
    origin:[number,number];direction:'left'|'right'|'down';
    phase:'idle'|'alert'|'charge'|'pause'|'return'|'knocked';timer:number;winged?:boolean;age?:number;
}


export function stoneCells(l:Level,id:number):number[]{
    if(l.cells[id]==='stone'){const size=l.properties?.[id]?.large?4:2;return Array.from({length:size*size},(_,n)=>id+Math.floor(n/size)*l.width+n%size);}
    if(l.cells[id]!=='stone-body')return [];
    for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++){const n=id-dy*l.width-dx;if(n>=0&&id%l.width>=dx&&l.cells[n]==='stone'&&stoneCells(l,n).includes(id))return stoneCells(l,n);}
    return [];
}
export function placeStone(l:Level,x:number,y:number,props:ElementProperties={}):boolean {
    const size=props.large?4:2;if(x<0||x+size>l.width||y<0||y+size>l.height)return false;
    const id=y*l.width+x;setCell(l,id,'stone');(l.properties??={})[id]={direction:'down',...props};for(const n of stoneCells(l,id).slice(1))setCell(l,n,'stone-body');return true;
}
export function initAdventure(l:Level):Pick<State,'stones'|'keys'|'keyTrail'|'unlockedDoors'|'climbing'|'climbAge'|'climbWait'> {
    const stones:Stone[]=[];
    l.cells.forEach((t,id)=>{if(t!=='stone')return;const x=id%l.width,y=Math.floor(id/l.width),p=l.properties?.[id],size=p?.large?4:2;stones.push({x,y,w:size,h:size,vx:0,vy:0,origin:[x,y],direction:p?.direction??'down',phase:'idle',timer:0,winged:!!p?.winged,age:0});for(const n of stoneCells(l,id))l.cells[n]='.';});
    return {stones,keys:[],keyTrail:[],unlockedDoors:{},climbing:false,climbAge:0,climbWait:0};
}
export function collectKey(s:State,x:number,y:number):void {
    emit(s,'key',x);
    if(s.keys.length<32)s.keys.push({x,y,age:0});s.notice='获得钥匙！跟在身后，可开启上锁的门';
}
export function advanceAdventure(s:State,dt:number,shared=true):void {
    s.climbWait=Math.max(0,s.climbWait-dt);
    if(!shared)return;
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
    const players=playerBodies(s);
    for(const stone of s.stones){
        const old={...stone};stone.age=(stone.age??0)+dt;
        if(stone.winged&&(stone.phase==='idle'||stone.phase==='alert')){const x=stone.origin[0]+Math.sin(stone.age*2)*.65,dx=x-stone.x;stone.vx=dx/dt;stone.vy=0;svc.move(s,stone,dt);stone.vx=0;}
        stone.timer=Math.max(0,stone.timer-dt);
        if(stone.phase==='idle'||stone.phase==='alert'){
            const gap=Math.min(...players.map(p=>approach(stone,p)??Infinity));stone.phase=gap<=3?'alert':'idle';
            if(gap<=2){stone.phase='charge';stone.vx=stone.direction==='left'?-18:stone.direction==='right'?18:0;stone.vy=stone.direction==='down'?14.4:0;}
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
            const velocity=[stone.vx,stone.vy],hit=svc.move(s,stone,dt);
            if(stone.phase==='charge'&&(hit.wall||hit.floor)){
                pressPSwitch(s,stone,{...old,vx:velocity[0]!,vy:velocity[1]!});
                let broke=false,stopped=false,destroyed=false;
                const vertical=stone.direction==='down',face=vertical?Math.floor(stone.y+stone.h+.02):Math.floor(stone.direction==='left'?stone.x-.02:stone.x+stone.w+.02);
                const start=Math.floor(vertical?stone.x+.001:stone.y+.001),end=Math.floor(vertical?stone.x+stone.w-.001:stone.y+stone.h-.001);
                for(let n=start;n<=end;n++){
                    const x=vertical?n:face,y=vertical?face:n,t=s.level.cells[y*s.level.width+x];
                    if(t==='B'||stone.w>2&&['hard-block','U','ice','ice-solid'].includes(t!)){shatterTile(s,x,y);broke=true;}
                    else if(t==='?'){svc.hitBlock(s,x,y,t,true);destroyed=true;}
                    else if(t==='toggle-switch'){svc.hitBlock(s,x,y,t,true);stopped=true;}
                    else if(t&&svc.solid(t,s.pTime,s.redOn))stopped=true;
                }
                if(destroyed){effect(s,'stone',stone.x+stone.w/2,stone.y+stone.h,2,-7);s.stones=s.stones.filter(other=>other!==stone);continue;}
                if(broke&&stone.w>2&&!stopped){stone.vx=velocity[0]!;stone.vy=velocity[1]!;hit.wall=0;hit.floor=false;}
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
        visitPlayers(s,()=>{
        const p=s.player,standing=Math.abs(p.y+p.h-old.y)<.04&&p.vy>=0&&p.x+p.w>old.x+.01&&p.x<old.x+old.w-.01;
        if(standing&&(dx||dy)){
            const carried={...p,vx:dx/dt,vy:dy/dt},hit=svc.move(s,carried,dt,true);p.x=carried.x;p.y=carried.y;if(hit.wall||hit.floor&&dy>0)s.climbing=false;
        }
        if(!overlap(p,stone))return;
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
        });
    }
}
