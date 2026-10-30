import {overlaps as overlap} from './geometry';
import type { Body, Level, State } from './model';
import type { Services } from './services';
import type { P2Mechanism } from './p2';
import { resolveActivation } from './p1-mechanisms';
import { damageBoss } from './fortress';
import { emit } from './events';

const stands=(a:Body,b:Body)=>a.vy>=0&&Math.abs(a.y+a.h-b.y)<.06&&a.x+a.w>b.x&&a.x<b.x+b.w;
export function initP2Mechanisms(l:Level):P2Mechanism[]{const out:P2Mechanism[]=[];l.cells.forEach((kind,id)=>{if(!['beat-block','fall-block','icicle','tornado'].includes(kind))return;const x=id%l.width,y=Math.floor(id/l.width),props=l.properties?.[id]??{};out.push({kind:kind as P2Mechanism['kind'],id,home:[x,y],x:x+(kind==='icicle'?.15:0),y,w:kind==='tornado'?props.width??2:kind==='icicle'?.7:props.width??1,h:kind==='tornado'?props.height??5:kind==='icicle'?props.height??2:kind==='fall-block'?.3:1,vx:0,vy:0,age:0,phase:'idle',wait:0,props,active:kind!=='beat-block'});l.cells[id]='.';});return out;}
export function advanceP2Mechanisms(s:State,dt:number,svc:Services):void {
    const actors=[s.player,...s.enemies.filter(e=>e.alive&&!e.held),...s.items.filter(i=>i.alive&&!i.held),...s.rewards.filter(r=>r.w>0)];
    for(const d of s.p2Mechanisms){d.age+=dt;
        if(d.kind==='beat-block'){const period=d.props.period??2,phase=((s.time+(d.props.phase??0))%period+period)%period,active=phase<period/2,warn=Math.abs(phase-period/2)<.22||phase>period-.22;if(active&&!d.active){const ids=new Set(Array.from({length:Math.ceil(d.w)},(_,n)=>d.id+n));resolveActivation(s,ids,svc);emit(s,'switch',d.x);}d.active=active;d.phase=warn?'warn':'idle';continue;}
        if(d.kind==='tornado'){for(const b of actors)if(!b.transit&&overlap(b,d)){b.vy=-(d.props.strength??6);b.vx+=Math.max(-2*dt,Math.min(2*dt,(d.x+d.w/2-b.x-b.w/2)*dt));if(b===s.player){s.grounded=false;s.pound='none';}}continue;}
        if(d.phase==='gone'){d.wait-=dt;const home={...d,x:d.home[0]+(d.kind==='icicle'?.15:0),y:d.home[1]};if(d.wait<=0&&!actors.some(b=>!b.transit&&overlap(b,home))){d.x=home.x;d.y=home.y;d.phase='idle';d.active=true;d.vy=0;d.age=0;}continue;}
        if(d.kind==='fall-block'){
            const riders=actors.filter(b=>!b.transit&&stands(b,d));if(d.phase==='idle'&&riders.length){d.phase='warn';d.wait=d.props.delay??.45;}
            if(d.phase==='warn'){if(!riders.length){d.phase='idle';d.wait=0;}else{d.wait-=dt;if(d.wait<=0){d.phase='fall';emit(s,'bump',d.x);}}}
            if(d.phase==='fall'){d.vy=Math.min(20,d.vy+22*dt);const dy=d.vy*dt;d.y+=dy;for(const b of riders){const vx=b.vx,vy=b.vy;b.vx=0;b.vy=d.vy;svc.move(s,b,dt,b===s.player);b.vx=vx;b.vy=vy;}if(d.y>s.level.height+2){d.phase='gone';d.active=false;d.wait=d.props.recovery??3;}}continue;
        }
        if(d.phase==='idle'&&s.player.y>d.y&&s.player.y<d.y+12&&Math.abs(s.player.x+s.player.w/2-d.x-d.w/2)<2){d.phase='warn';d.wait=d.props.delay??.5;}
        if(d.phase==='warn'){d.wait-=dt;if(d.wait<=0){d.phase='fall';emit(s,'ice',d.x);}}
        if(d.phase==='fall'){d.vy=Math.min(18,d.vy+30*dt);const r=svc.move(s,d,dt);let impact=r.floor||!!r.wall;for(const e of s.enemies)if(e.alive&&overlap(d,e)){svc.defeat(s,e,'block');impact=true;}for(const b of s.bosses)if(b.health>0&&overlap(d,b)){damageBoss(s,b,'icicle');impact=true;}if(!s.pipe&&overlap(s.player,d)){svc.hurt(s,'top');impact=true;}if(impact||d.y>s.level.height+2){d.phase='gone';d.active=false;d.wait=d.props.recovery??3;emit(s,'ice',d.x);s.effects.push({kind:'frost',x:d.x,y:d.y,w:1,h:1,vx:0,vy:0,age:0});s.effects=s.effects.slice(-64);}}
    }
}
