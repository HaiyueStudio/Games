import {overlaps as overlap} from './geometry';
import type { Body, Enemy, Input, Item, Level, State, Tile, BlockContent } from './model';
import type { ElementProperties } from './catalog';
import type { Services } from './services';
import { pathPoint, pathLength } from './snake-path';
import { releaseContent, spawnContent } from './containers';
import { damageBoss } from './fortress';
import { emit } from './events';
import { setCell } from './terrain';
import { curvedGlassCell, glassIntersects } from './glass';
import {PIPE_PERIODS} from './p1-schema';
import {deviceSolids} from './device-solids';
export {deviceSolids} from './device-solids';

export interface Device extends Body {id:number;kind:Tile;home:[number,number];props:ElementProperties;content?:BlockContent|undefined;released?:boolean;path:[number,number][];travel:number;age:number;active:boolean;phase:'idle'|'moving'|'return'|'done';blocks:Body[];wait:number;used?:boolean}
export const DEVICE_TILES=new Set(['semi-platform','tree','extend-block','path-red','path-blue','trampoline','trampoline-on','trampoline-moving','cannon-basic','bill-blaster']);

const feetOn=(a:Body,b:Body)=>a.vy>=0&&Math.abs(a.y+a.h-b.y)<.06&&a.x<b.x+b.w-.005&&a.x+a.w>b.x+.005;
export function pathBlocked(s:State,b:Body,svc:Pick<Services,'solid'>):boolean {
    if(glassIntersects(s.level,b))return true;
    for(let y=Math.floor(b.y+.001);y<=Math.floor(b.y+b.h-.001);y++)for(let x=Math.floor(b.x+.001);x<=Math.floor(b.x+b.w-.001);x++)if(x<0||y<0||x>=s.level.width||y>=s.level.height||!curvedGlassCell(s.level,x,y)&&svc.solid(s.level.cells[y*s.level.width+x]!,s.pTime,s.redOn))return true;
    return false;
}
export function initDevices(l:Level):Device[]{
    const devices:Device[]=[];
    l.cells.forEach((t,id)=>{const p=l.properties?.[id]??{};if(!DEVICE_TILES.has(t)&&!(t==='P'&&l.contents?.[id]&&l.contents[id]!=='empty'))return;
        const x=id%l.width,y=Math.floor(id/l.width),height=t==='tree'?p.height??5:t==='bill-blaster'?p.height??2:1,w=t==='semi-platform'||t.startsWith('trampoline')?p.width??3:t==='tree'?2:1;
        const path=structuredClone(p.path??[[0,0],[4,0]]) as [number,number][];
        const d:Device={id,kind:t,x,y:t==='tree'||t==='bill-blaster'?y-height+1:y,w,h:t==='semi-platform'?p.depth??2:t.startsWith('trampoline')?.35:height,vx:0,vy:0,home:[x,y],props:structuredClone(p),content:l.contents?.[id],path,travel:0,age:0,active:t==='path-red'||t==='trampoline-moving',phase:'idle',blocks:[],wait:p.period??2};
        if(t==='extend-block')d.blocks=[{x,y,w:1,h:1,vx:0,vy:0}];
        if(t==='P'){d.h=d.w=0;d.active=true;}
        devices.push(d);if(t!=='P'&&t!=='tree')setCell(l,id,'.');
    });return devices;
}
export function oneWayDevices(s:State):Body[]{return [...s.devices.filter(d=>d.kind==='semi-platform'||d.kind==='tree').map(d=>({...d,h:.2})),...s.p2Mechanisms.filter(d=>d.kind==='fall-block'&&d.active)];}
/** Only the shallow top contact is corrected when an ON bed reappears. */
export function activateTrampolines(s:State):void {
    if(!s.redOn)return;
    for(const d of s.devices)if(d.kind==='trampoline-on')for(const b of [s.player,...s.enemies.filter(e=>e.alive&&!e.held),...s.items.filter(i=>i.alive&&!i.held),...s.rewards]){
        if(b.transit||b.y>=d.y||b.y+b.h<d.y-.04||b.y+b.h>d.y+d.h+.04||b.x+b.w<=d.x||b.x>=d.x+d.w)continue;
        b.y=d.y-b.h;b.vy=-17;b.bounceWait=.22;if(b===s.player){s.grounded=false;s.coyote=0;s.jumpSustain=true;}emit(s,'spring',b.x);
    }
}
function carry(s:State,old:Body,now:Body,dt:number,svc:Services):void {
    const dx=now.x-old.x,dy=now.y-old.y;if(Math.abs(dx)+Math.abs(dy)<1e-9)return;
    for(const b of [s.player,...s.enemies.filter(e=>e.alive&&!e.held&&!e.transit),...s.items.filter(e=>e.alive&&!e.held&&!e.transit),...s.rewards]){
        if(!feetOn(b,old))continue;const vx=b.vx,vy=b.vy;b.vx=dx/dt;b.vy=dy/dt;svc.move(s,b,dt,b===s.player);b.vx=vx;b.vy=vy;
    }
}
export function triggerExtension(s:State,x:number,y:number,all=false,svc?:Pick<Services,'solid'|'crush'|'defeat'>):boolean {
    const d=s.devices.find(d=>d.kind==='extend-block'&&d.home[0]===x&&d.home[1]===y);if(!d)return false;
    d.active=true;d.phase='moving';d.wait=d.props.period??3;const length=Math.floor(pathLength(d.path)),count=all?length:Math.min(length,d.blocks.length);
    const added=new Set<number>();while(d.blocks.length<=count){const [dx,dy]=pathPoint(d.path,d.blocks.length),block={x:x+dx,y:y+dy,w:1,h:1,vx:0,vy:0};if(svc&&(pathBlocked(s,block,svc)||s.devices.some(other=>other!==d&&deviceSolids(s).includes(other)&&overlap(other,block))))break;d.blocks.push(block);added.add((y+dy)*s.level.width+x+dx);}if(svc)resolveActivation(s,added,svc);emit(s,'bump',x);return true;
}
export function advanceDevices(s:State,dt:number,svc:Services):void {
    const actors=[s.player,...s.enemies.filter(e=>e.alive&&!e.held),...s.items.filter(e=>e.alive&&!e.held),...s.rewards];
    for(const d of s.devices){d.age+=dt;const old={...d};
        if(d.kind==='extend-block'){if(d.active){d.wait-=dt;if(d.wait<=0){d.active=false;d.blocks=d.blocks.slice(0,1);d.phase='idle';}}continue;}
        if(d.kind==='path-blue'&&d.phase==='done'){d.wait-=dt;if(d.wait<=0){const home={...d,x:d.home[0],y:d.home[1]};if(!actors.some(b=>!b.transit&&overlap(b,home))){d.x=home.x;d.y=home.y;d.travel=0;d.active=false;d.phase='idle';}}continue;}
        if(d.kind==='path-blue'&&d.phase==='idle'&&actors.some(b=>feetOn(b,d))){d.active=true;d.phase='moving';}
        if(d.kind==='path-red'||d.kind==='trampoline-moving'||d.kind==='path-blue'&&d.active){
            const length=pathLength(d.path),speed=d.props.pace??(d.kind==='path-red'?2:1),returning=d.phase==='return';d.travel+=dt*speed*(returning?-1:1);
            if(d.travel>=length){d.travel=length;d.phase=d.kind==='path-blue'?'done':'return';if(d.phase==='done'){d.active=false;d.wait=1.2;}}
            if(d.travel<=0&&returning){d.travel=0;d.phase=d.kind==='path-blue'?'idle':'moving';d.active=d.kind!=='path-blue';}
            const [x,y]=pathPoint(d.path,d.travel),target={...d,x:d.home[0]+x,y:d.home[1]+y};
            if(pathBlocked(s,target,svc)){d.travel=Math.max(0,d.travel-dt*speed*(returning?-1:1));d.phase=returning?'moving':'return';}else{d.x=target.x;d.y=target.y;carry(s,old,d,dt,svc);}
        }
        if(d.kind==='P'||d.kind==='cannon-basic'||d.kind==='bill-blaster'){
            if(Math.abs(d.x-s.player.x)>28)continue;d.wait-=dt;if(d.wait>0)continue;d.wait=d.props.period??(d.kind==='P'?PIPE_PERIODS[d.props.color==='purple'?'blue':d.props.color??'blue']:2.4);
            const dir=d.props.direction==='left'?-1:d.props.direction==='right'?1:Math.sign(s.player.x-d.x)||1,kind=d.content??'cannonball';
            const active=[...s.enemies.filter(e=>e.alive),...s.items.filter(e=>e.alive),...s.rewards].filter(e=>e.generatorId===d.id&&Math.hypot(e.x-d.x,e.y-d.y)<(d.props.radius??16)).length;
            if(active>=(d.props.count??8))continue;
            if(d.kind==='P'){
                const rotation=d.props.rotation??0,n:[number,number]=rotation===0?[0,-1]:rotation===90?[1,0]:rotation===180?[0,1]:[-1,0],length=d.props.length??3;
                const x=d.home[0]+(n[0]>0?length:n[0]<0?-.9:.6),y=d.home[1]+(n[1]>0?length:n[1]<0?-.9:.6);if(Math.hypot(s.player.x-x,s.player.y-y)<1.5)continue;const created=spawnContent(s,kind,x,y,n[0]??0);if(created)created.generatorId=d.id;
            }else{const created=spawnContent(s,kind,d.x+(dir>0?1.05:-.85),d.y+.1,dir);if(created)created.generatorId=d.id;const b=kind==='cannonball'?created as Enemy|undefined:undefined;if(b){b.vx=dir*(d.props.ammoSpeed??(d.kind==='bill-blaster'?5:3));if(d.kind==='cannon-basic'){b.ballistic=true;b.vy=-6;}}emit(s,'cannon',d.x);}
        }
    }
    // Belts move a resting body, including items and enemies. ON/OFF reverses
    // direction; the original speed-belt remains a separate speed modifier.
    for(const b of actors){if(b.transit)continue;const row=Math.floor(b.y+b.h+.03),col=Math.floor(b.x+b.w/2),id=row*s.level.width+col;
        if(s.level.cells[id]==='conveyor'&&b.vy>=0){const p=s.level.properties?.[id],speed=(p?.speed??2)*(s.redOn?1:-1),vx=b.vx,vy=b.vy;b.vx=speed;b.vy=0;svc.move(s,b,dt,b===s.player);b.vx=vx;b.vy=vy;}
        if(s.level.cells[id]==='dash-block'&&b.vy>=0){const direction=s.level.properties?.[id]?.direction==='left'?-1:1;b.vx=direction*14;if(b===s.player){s.dashTime=.3;s.facing=direction;};}
        const spring=s.devices.find(d=>d.kind.startsWith('trampoline')&&(d.kind!=='trampoline-on'||s.redOn)&&feetOn(b,d));
        b.bounceWait=Math.max(0,(b.bounceWait??0)-dt);if(spring&&b.bounceWait===0){b.vy=-17;b.bounceWait=.22;if(b===s.player){s.grounded=false;s.coyote=0;s.jumpSustain=true;}spring.wait=.2;emit(s,'spring',b.x);}
    }
    for(let y=Math.max(0,Math.floor(s.player.y)-1);y<=Math.min(s.level.height-1,Math.ceil(s.player.y+s.player.h));y++)for(let x=Math.floor(s.player.x)-1;x<=Math.ceil(s.player.x+s.player.w);x++)if(s.level.cells[y*s.level.width+x]==='spike-switch'&&s.redOn&&overlap(s.player,{x:x-.16,y:y-.16,w:1.32,h:1.32,vx:0,vy:0}))svc.hurt(s);
}
/** Resolve only newly solid tiles. Each entity is processed once. */
export function resolveActivation(s:State,ids:ReadonlySet<number>,svc:Pick<Services,'crush'|'defeat'>):void {
    const inside=(b:Body)=>{for(let y=Math.max(0,Math.floor(b.y+.001));y<=Math.min(s.level.height-1,Math.floor(b.y+b.h-.001));y++)for(let x=Math.max(0,Math.floor(b.x+.001));x<=Math.min(s.level.width-1,Math.floor(b.x+b.w-.001));x++)if(ids.has(y*s.level.width+x))return true;return false;};
    if(inside(s.player))svc.crush(s);
    for(const e of s.enemies)if(e.alive&&inside(e))svc.defeat(s,e,'block');
    for(const b of s.bosses)if(b.health>0&&inside(b)){b.health=1;b.hurt=0;damageBoss(s,b,'crush');}
    for(const i of s.items)if(i.alive&&inside(i)){i.alive=i.held=false;if(s.held===i)s.held=null;if(s.riding===i)s.riding=null;}
    for(const r of s.rewards)if(inside(r))r.w=0;
}
export function redPow(s:State,item:Item,svc:Services):void {
    if(!item.alive)return;const queue=[item],seen=new Set<Item>();
    while(queue.length){const pow=queue.shift()!;if(seen.has(pow)||!pow.alive)continue;seen.add(pow);pow.alive=pow.held=false;if(s.held===pow)s.held=null;const radius=3,box={x:pow.x-radius,y:pow.y-radius,w:1+radius*2,h:1+radius*2,vx:0,vy:0};
        for(let y=Math.max(0,Math.floor(box.y));y<Math.min(s.level.height,box.y+box.h);y++)for(let x=Math.max(0,Math.floor(box.x));x<Math.min(s.level.width,box.x+box.w);x++){const t=s.level.cells[y*s.level.width+x]!;if(t==='B'){setCell(s.level,y*s.level.width+x,'.');emit(s,'break',x);}else if(t==='?'||t==='hidden-block')svc.hitBlock(s,x,y,t);}
        for(const e of s.enemies)if(e.alive&&overlap(e,box))svc.defeat(s,e,'pow');for(const b of s.bosses)if(b.health>0&&overlap(b,box))damageBoss(s,b,'red-pow');
        for(const other of s.items)if(other.alive&&other.kind==='red-pow'&&overlap(other,box))queue.push(other);
        s.effects.push({kind:'blast',x:pow.x+.5,y:pow.y+.5,w:7,h:7,vx:0,vy:0,age:0});s.effects=s.effects.slice(-64);
    }s.shake=.45;s.powFlash=.22;emit(s,'pow',item.x);
}
export function treeContact(s:State,i:Input,jump:boolean,dt:number):boolean {
    const p=s.player,tree=s.devices.find(d=>d.kind==='tree'&&p.x+p.w>d.x&&p.x<d.x+d.w&&p.y+p.h>d.y&&p.y<d.y+d.h);
    if(!tree)return false;
    if(jump&&s.climbing){s.climbing=false;s.climbWait=.25;p.vy=-13.5;s.grounded=false;s.jumpSustain=true;return false;}
    if(i.interact&&!s.held&&s.climbWait===0)s.climbing=true;
    if(!s.climbing)return false;p.vx=i.axis*1.8;p.vy=(Number(i.down)-Number(!!i.interact))*3;s.climbAge+=dt;s.grounded=false;s.buffer=0;
    if(p.y+p.h<=tree.y+1)releaseContent(s,tree);return true;
}
export function warpBoxes(s:State,i:Input):void {
    if(!i.interact||s.previous.interact||s.door||s.pipe)return;
    const p=s.player,id=Math.floor(p.y+p.h-.1)*s.level.width+Math.floor(p.x+p.w/2),t=s.level.cells[id];
    if(t!=='warp-box'&&t!=='locked-warp'||s.usedWarps[id])return;
    const link=s.level.properties?.[id]?.link??1,exit=s.level.cells.findIndex((c,n)=>n!==id&&(c==='warp-box'||c==='locked-warp')&&(s.level.properties?.[n]?.link??1)===link&&!s.usedWarps[n]);if(exit<0)return;
    if(t==='locked-warp'){if(!s.keys.length){s.notice='上锁传送箱需要一把钥匙';return;}s.keys.shift();}
    s.usedWarps[id]=s.usedWarps[exit]=true;s.door={age:0,from:[p.x,p.y],to:[exit%s.level.width+.5-p.w/2,Math.floor(exit/s.level.width)+1-p.h],source:id,target:exit};emit(s,'door',p.x);
}
