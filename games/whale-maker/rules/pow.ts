import type {State,Item} from './model';
import type {Services} from './services';
import {overlaps as overlap} from './geometry';
import {cellAt as cell,slopeAt} from './terrain';
import {emit} from './events';
import {rulesFor} from './profile';
import {damageBoss} from './fortress';
import {redPow} from './p1-mechanisms';

export function triggerPow(s:State,svc:Services):void {
    emit(s,'pow');
    for(const e of s.enemies){if(!e.alive||e.held||!overlap(e,{...s.view,vx:0,vy:0}))continue;const feet=e.y+e.h,t=cell(s.level,e.x+e.w/2,feet+.04),ground=svc.solid(t,s.pTime,s.redOn)||t==='='||slopeAt(s.level,e.x+e.w/2,feet+.04);if(ground)svc.defeat(s,e,'pow');}
    if(rulesFor(s.level).rewards==='score')for(const b of s.bosses)if(b.health>0&&overlap(b,{...s.view,vx:0,vy:0})&&svc.solid(cell(s.level,b.x+b.w/2,b.y+b.h+.04),s.pTime,s.redOn))damageBoss(s,b,'pow');
    s.shake=.45;s.powFlash=.22;s.notice='POW！地面敌人被震飞';
}
/** Consume once. Ordinary standing, walking and head contact never activate POW. */
export function detonatePow(s:State,item:Item,svc:Services):void {
    if(!item.alive||item.kind!=='pow'&&item.kind!=='red-pow')return;
    if(item.kind==='red-pow'){redPow(s,item,svc);return;}
    item.alive=false;item.held=false;if(s.held===item)s.held=null;
    triggerPow(s,svc);
}
