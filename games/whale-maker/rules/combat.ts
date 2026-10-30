import {beforeP2Defeat} from './p2-enemies';
import { beforeDefeat } from './p1-enemies';
import { spawnContent } from './containers';
import type { Body, Enemy, State, Defeated } from './model';
import { emit } from './events';
import { attackResult } from './interactions';
import { defeatReward } from './scoring';

/** Crushing is terminal even with a star or helmet; shared by all solidifiers. */
export function crushPlayer(s:State):void {
    if(s.phase!=='playing')return;
    s.starTime=s.invincible=0;s.power=0;s.motion='none';s.charge=s.runCharge=s.stun=0;s.boomerangs=[];s.wearable=null;s.cannonShots=[];s.vehicle=null;
    if(s.helmet){s.helmet=false;s.effects.push({kind:'helmet',x:s.player.x,y:s.player.y-.35,w:.4,h:.4,vx:-s.facing*3,vy:-5,age:0});s.effects=s.effects.slice(-64);emit(s,'metal');}
    s.pound='none';s.climbing=false;s.pendingShot=false;s.shootAge=.24;s.bites=[];s.eatAge=.56;s.flagWaves=[];s.cheerAge=.8;s.running=s.skidding=s.turning=false;s.springDrift=false;s.dust=[];s.dustWait=0;
    s.phase='dead';s.deaths++;s.deathAge=0;s.player.vx=0;s.player.vy=-9;s.notice='被压住了 · 按 R 从检查点重试';
    if(s.held){s.held.held=false;s.held=null;}emit(s,'death');
}

/** An ascending helmet strikes the underside, before ordinary contact damage. */
export function bonkWithHelmet(s:State,e:Enemy,previousPlayer:Body,previousEnemy:Body):boolean {
    const p=s.player;
    if(!s.helmet||!e.alive||e.held||previousPlayer.vy>=0||
        previousPlayer.y<previousEnemy.y+previousEnemy.h-.025||
        p.x+p.w<=e.x+.001||p.x>=e.x+e.w-.001||
        p.y>e.y+e.h+.025||p.y+p.h<=e.y+.001)return false;
    if(!['defeat','shatter'].includes(attackResult(e,'helmet')))return false;
    emit(s,'metal',e.x+e.w/2);defeatEnemy(s,e,'block');return true;
}

/** One defeat path for contacts, attacks and blocks becoming solid. */
export function defeatEnemy(s:State,e:Enemy,cause:Defeated['cause'],source?:Body):void {
    if(!e.alive||beforeDefeat(s,e,cause)||beforeP2Defeat(s,e,cause))return;
    s.defeatCounts[e.kind]=(s.defeatCounts[e.kind]??0)+1;if(e.baseKind&&e.baseKind!==e.kind)s.defeatCounts[e.baseKind]=(s.defeatCounts[e.baseKind]??0)+1;
    if(e.kind==='snow-cactus')spawnContent(s,'snowball',e.x,e.y+e.h-.8);
    if(e.frozen){emit(s,'ice',e.x);s.effects.push({kind:'frost',x:e.x+e.w/2,y:e.y+e.h/2,w:1,h:1,vx:0,vy:0,age:0});s.effects=s.effects.slice(-64);}
    emit(s,cause==='stomp'?'stomp':'defeat',e.x+e.w/2);
    e.alive=false;
    if(s.held===e){e.held=false;s.held=null;}
    defeatReward(s,e,cause,source);
    s.defeated.push({...e,cause,age:0,angle:0,vx:cause==='stomp'||cause==='lava'||cause==='sand'?0:e.x<s.player.x?-3:3,vy:cause==='stomp'||cause==='lava'||cause==='sand'?0:-8});
    s.defeated=s.defeated.slice(-48);
}
