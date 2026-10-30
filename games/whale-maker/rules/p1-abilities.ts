import {overlaps as overlap} from './geometry';
import type { Body, Enemy, Input, State, Tile } from './model';
import type { Services } from './services';
import { makeItem } from './body-factory';
import { setCell } from './terrain';
import { emit } from './events';
import { damageBoss } from './fortress';
import { toggleColor } from './advanced';
import { triggerExtension } from './p1-mechanisms';
import { attackResult } from './interactions';

export function specialHit(s:State,e:Enemy,kind:'claw'|'boomerang'|'hammer',svc:Services,throughPipe=false):void {
    if(!e.alive||e.held||e.transit&&!throughPipe)return;
    if(attackResult(e,kind)==='ignore')return;
    if(e.kind==='shell'&&kind!=='hammer'&&!e.frozen){e.vx=s.facing*12;e.cooldown=.25;e.attackChain=0;emit(s,'kick',e.x);return;}
    if(e.kind==='spiky'&&kind!=='hammer'&&!e.frozen){const feet=e.y+e.h;e.kind='shell';e.h=.5*(e.modifiers?.large?2:1);e.y=feet-e.h;e.vx=e.vy=0;e.cooldown=.25;e.inverted=true;emit(s,'stomp',e.x);return;}
    if(e.kind==='ghost'&&kind!=='hammer')return;
    svc.defeat(s,e,kind);
}
function hitTiles(s:State,box:Body,kind:'claw'|'hammer'|'boomerang',svc:Services,seen?:Set<number>):void {
    for(let y=Math.max(0,Math.floor(box.y-.025));y<Math.min(s.level.height,Math.ceil(box.y+box.h+.025));y++)for(let x=Math.max(0,Math.floor(box.x-.025));x<Math.min(s.level.width,Math.ceil(box.x+box.w+.025));x++){
        const id=y*s.level.width+x,t=s.level.cells[id]!;if(seen?.has(id))continue;
        if(t==='toggle-switch'){toggleColor(s);seen?.add(id);}
        if(t==='?'||t==='hidden-block'){svc.hitBlock(s,x,y,t);seen?.add(id);}
        if(t==='hard-block'&&kind==='hammer'||t==='B'&&kind!=='boomerang'){setCell(s.level,id,'.');emit(s,'break',x);seen?.add(id);}
        triggerExtension(s,x,y,kind==='hammer',svc);
        if(t==='o'&&kind==='boomerang'){s.level.cells[id]='.';svc.coin(s,x+.5,y+.5);}
    }
}
export function abilities(s:State,i:Input,dt:number,svc:Services):void {
    const p=s.player,press=i.fire&&!s.previous.fire,special=i.special&&!s.previous.special;
    if(!s.held&&!s.pipe&&!s.door&&s.abilityWait===0){
        if(s.power===5&&(press||special&&!s.grounded&&!i.spin)){
            s.motion=press?'claw':'dive';s.motionAge=0;s.abilityWait=.32;emit(s,'throw');
            const box={...p,x:s.facing>0?p.x+p.w-.1:p.x-1,y:p.y+.1,w:1.1,h:Math.min(1.4,p.h)};
            for(const e of s.enemies)if(overlap(box,e))specialHit(s,e,'claw',svc);hitTiles(s,box,'claw',svc);
        }
        if(s.power===6&&press&&s.boomerangs.length===0){s.boomerangs.push({kind:'boomerang',x:p.x+p.w/2+s.facing*.5,y:p.y+p.h*.55-.275,w:.55,h:.55,vx:s.facing*11,vy:0,age:0,returning:false,distance:0,leg:0,hits:[],targets:[]});s.motion='boomerang';s.motionAge=0;s.abilityWait=.25;emit(s,'throw');}
        if(s.power===7&&press){s.motion='hammer';s.motionAge=0;s.abilityWait=.4;emit(s,'metal');const box={...p,x:s.facing>0?p.x+p.w-.15:p.x-1.4,y:p.y-.35,w:1.55,h:p.h+.45};for(const e of s.enemies)if(overlap(box,e))specialHit(s,e,'hammer',svc);for(const b of s.bosses)if(overlap(box,b))damageBoss(s,b,'hammer');hitTiles(s,box,'hammer',svc);}
        if(s.power===7&&i.build&&!s.previous.build){
            const x=s.facing>0?p.x+p.w+.05:p.x-1.05,y=p.y+p.h-1,box={x,y,w:1,h:1,vx:0,vy:0};let clear=x>=0&&y>=0&&x+1<=s.level.width&&y+1<=s.level.height;
            for(let yy=Math.floor(y+.001);yy<=Math.floor(y+.999);yy++)for(let xx=Math.floor(x+.001);xx<=Math.floor(x+.999);xx++)if(xx<0||xx>=s.level.width||svc.solid(s.level.cells[yy*s.level.width+xx]!,s.pTime,s.redOn))clear=false;
            if(clear&&s.items.filter(i=>i.alive).length<128&&!s.items.some(b=>b.alive&&overlap(b,box))){const built=s.buildBoxes.filter(b=>b.alive);if(built.length>=5){const oldest=built.shift()!;oldest.alive=false;}const crate=makeItem('wood-crate',x,y);Object.assign(crate,{x,y,cooldown:.2,construction:++s.buildSerial});s.items.push(crate);s.buildBoxes=[...built,crate];s.motion='hammer';s.motionAge=0;s.abilityWait=.25;emit(s,'reward');}
        }
    }
    if(s.motion==='dive')for(const e of s.enemies)if(e.alive&&overlap(p,e))specialHit(s,e,'claw',svc);
    for(const b of s.boomerangs){if(b.transit)continue;b.age+=dt;
        if(!b.returning){const old={...b};const hit=svc.move(s,b,dt);b.distance+=Math.abs(b.x-old.x);if(hit.wall||b.distance>=6||b.age>.75){b.returning=true;b.leg++;b.hits=[];b.targets=[];}}
        else{const dx=p.x+p.w/2-b.x-b.w/2,dy=p.y+p.h*.4-b.y-b.h/2,d=Math.hypot(dx,dy)||1;b.vx=dx/d*13;b.vy=dy/d*13;b.x+=b.vx*dt;b.y+=b.vy*dt;if(d<.65)b.age=9;}
        const tiles=new Set(b.hits.filter(k=>k.startsWith('tile:')).map(k=>+k.slice(5)));hitTiles(s,b,'boomerang',svc,tiles);for(const id of tiles)if(!b.hits.includes('tile:'+id))b.hits.push('tile:'+id);
        for(const [n,e]of s.enemies.entries())if(e.alive&&overlap(b,e)&&!(b.targets??=[]).includes(e)){b.targets.push(e);specialHit(s,e,'boomerang',svc);}
        for(const [n,boss]of s.bosses.entries())if(boss.health>0&&overlap(b,boss)&&!b.hits.includes('boss:'+n)){b.hits.push('boss:'+n);damageBoss(s,boss,'boomerang');}
    }
    s.boomerangs=s.boomerangs.filter(b=>b.w>0&&b.age<3&&b.x>=-2&&b.x<s.level.width+2&&b.y>=-4&&b.y<s.level.height+2);
}
