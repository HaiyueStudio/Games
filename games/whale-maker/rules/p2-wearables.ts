import {absorbVehicleHit,absorbWearableHit} from './player-equipment';
import {overlaps as overlap} from './geometry';
import type { Body, Input, State } from './model';
import type { Services } from './services';
import type { WearableKind } from './p2-schema';
import { emit } from './events';
import { makeItem } from './body-factory';
import { redPow } from './p1-mechanisms';
import { damageBoss } from './fortress';
import { attackResult } from './interactions';

export const disguised=(s:State)=>s.wearable?.kind==='goomba-mask'&&s.wearable.exposed===0&&!s.held;
export function equipWearable(s:State,kind:WearableKind,uses=3):void {
    s.wearable={kind,age:0,charge:0,uses,capacity:uses,flight:0,boost:0,cooldown:0,exposed:0,active:false};s.pendingShot=false;emit(s,'power',s.player.x);s.notice=kind==='cannon-box'?'鲸炮箱：J 蓄力，松开发射':kind==='propeller-box'?'旋桨箱：K 上升三次，落地恢复；下键俯冲':kind==='goomba-mask'?'咕嘎面具：安静行走可伪装，跳跃或攻击会暴露':kind==='bullet-mask'?'鲸弹面具：K 推进／结束，方向键转向与升降':'红脉冲箱：从下方撞击可发动三次';
}
/** Compatibility for callers that only handle vehicle and wearable layers. */
export const wearableDamage=(s:State):boolean=>absorbVehicleHit(s)||absorbWearableHit(s);
export function wearCeiling(s:State,svc:Services):void {
    const w=s.wearable;if(w?.kind!=='pow-box'||w.cooldown>0||w.uses<=0)return;
    w.cooldown=.25;w.uses--;const pulse=makeItem('red-pow',s.player.x,s.player.y);pulse.x=s.player.x;pulse.y=s.player.y;redPow(s,pulse,svc);if(w.uses===0)s.wearable=null;
}
/** Timers also advance in transitions; held cannon charge is cancelled there. */
export function wearTimers(s:State,dt:number):void {const w=s.wearable;if(!w)return;w.age+=dt;w.cooldown=Math.max(0,w.cooldown-dt);w.exposed=Math.max(0,w.exposed-dt);w.boost=Math.max(0,w.boost-dt);if(s.pipe||s.door){w.charge=0;w.active=false;w.boost=0;}}
export function wearableInput(s:State,i:Input,dt:number):Input {
    const w=s.wearable;if(!w)return i;const press=i.special&&!s.previous.special;
    if(w.kind==='goomba-mask'){if(i.jump||i.spin||i.fire||i.special||s.pound!=='none'||s.held)w.exposed=2;return i;}
    if(w.kind==='cannon-box'&&!s.held){if(i.fire)w.charge=Math.min(1,w.charge+dt);if(!i.fire&&w.charge>0){if(w.cooldown===0&&s.cannonShots.length<8){const charged=w.charge>=.6;s.cannonShots.push({kind:'cannon',x:s.player.x+s.player.w/2+s.facing*.55,y:s.player.y+s.player.h-(charged?1:.7),w:charged?.65:.4,h:charged?.65:.4,vx:s.facing*(charged?16:11),vy:0,age:0,charged});w.cooldown=.25;emit(s,'cannon',s.player.x);}w.charge=0;}return {...i,fire:false};}
    if(w.kind==='propeller-box'){if(s.grounded){w.uses=w.capacity;w.active=false;}if(press&&w.uses>0&&!s.swimming&&!s.held){w.uses--;w.boost=.28;w.active=true;s.player.vy=-18;s.grounded=false;s.jumpSustain=false;s.pound='none';emit(s,'spin',s.player.x);}return {...i,special:false};}
    if(w.kind==='bullet-mask'){if(press&&!s.swimming&&!s.held){w.active=!w.active;if(w.active){w.flight=4;s.pound='none';s.spinning=false;s.grounded=false;emit(s,'cannon',s.player.x);}}return {...i,special:false};}
    return i;
}
export function wearMotion(s:State,i:Input,dt:number):void {
    const w=s.wearable;if(!w||s.held||s.riding||s.vehicle||s.swimming)return;
    if(w.kind==='propeller-box'&&w.active){if(i.down){s.player.vy=18;s.pound='none';w.boost=0;}else s.player.vy=w.boost>0?-18:Math.min(3,s.player.vy);}
    if(w.kind==='bullet-mask'&&w.active){w.flight=Math.max(0,w.flight-dt);if(w.flight===0){w.active=false;return;}s.player.vx=s.facing*12;s.player.vy=(Number(i.down)-Number(!!i.interact))*4;s.pound='none';s.jumpSustain=false;}
}
export function afterWearMove(s:State,wall:number):void {if(wall&&s.wearable?.kind==='bullet-mask'&&s.wearable.active){s.wearable.active=false;s.wearable.flight=0;s.player.vx=0;emit(s,'bump',s.player.x);}}
export function advanceCannonShots(s:State,dt:number,svc:Services):void {
    for(const b of s.cannonShots){if(b.transit)continue;b.age+=dt;const vx=b.vx,hit=svc.move(s,b,dt,false,!!b.charged);if(hit.wall||hit.floor){const x=Math.floor(vx>0?b.x+b.w+.02:b.x-.02),y=Math.floor(b.y+b.h/2);svc.hitBlock(s,x,y,s.level.cells[y*s.level.width+x]!);b.age=9;}
        for(const e of s.enemies)if(e.alive&&!e.transit&&overlap(b,e)){const response=attackResult(e,'shell');if(response==='defeat'||response==='shatter')svc.defeat(s,e,'shell',b);b.age=9;break;}
        for(const boss of s.bosses)if(boss.health>0&&overlap(b,boss)){damageBoss(s,boss,b.charged?'heavy':'cannon');b.age=9;}
        if(b.age>=9){s.effects.push({kind:'blast',x:b.x,y:b.y,w:.8,h:.8,vx:0,vy:0,age:0});s.effects=s.effects.slice(-64);emit(s,'hit',b.x);}
    }s.cannonShots=s.cannonShots.filter(b=>b.w>0&&(b.transit||b.age<2.5)&&b.x>=-2&&b.x<s.level.width+2&&b.y<s.level.height+2);
}
