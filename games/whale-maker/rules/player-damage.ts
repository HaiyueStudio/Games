import type {State} from './model';
import type {HitDirection} from './services';
import {absorbEquipmentHit,dropHelmet} from './player-equipment';
import {damagedPower} from './player-body';
import {grantPower} from './power';
import {emit} from './events';

export const SHOT_DURATION=.24,EAT_DURATION=.56,CHEER_DURATION=.8;
function cancelPlayerActions(s:State):void {
    s.pound='none';s.bonePound=false;s.climbing=false;s.pendingShot=false;s.shootAge=SHOT_DURATION;
    s.bites=[];s.eatAge=EAT_DURATION;s.flagWaves=[];s.cheerAge=CHEER_DURATION;
    s.running=s.skidding=s.turning=false;s.springDrift=false;s.dust=[];s.dustWait=0;
}
function releaseHeld(s:State):void {if(s.held){s.held.held=false;s.held=null;}}
/** All lethal environments share one teardown; their notices remain distinct. */
export function killPlayer(s:State,cause:'crush'|'fall'|'contact'='crush'):void {
    if(s.phase!=='playing'||s.boneTime>0)return;
    dropHelmet(s);cancelPlayerActions(s);releaseHeld(s);
    s.boneTime=0;s.starTime=s.invincible=0;s.power=0;s.motion='none';s.charge=s.runCharge=s.stun=0;
    s.boomerangs=[];s.wearable=null;s.cannonShots=[];s.vehicle=null;
    if(s.riding){s.riding.held=false;if(cause==='fall')s.riding.alive=false;s.riding=null;}
    s.phase='dead';s.deaths++;s.deathAge=0;s.player.vx=0;s.player.vy=-9;
    s.notice=cause==='crush'?'被压住了 · 按 R 从检查点重试':'落入海中 · 按 R 从检查点重试';emit(s,'death');
}
export const crushPlayer=(s:State):void=>killPlayer(s,'crush');
export function hurtPlayer(s:State,direction:HitDirection='side'):void {
    if(s.phase!=='playing'||s.pipe||direction==='bottom'&&s.riding||s.invincible>0||s.starTime>0||s.boneTime>0)return;
    if(absorbEquipmentHit(s,direction))return;
    if(!s.power){killPlayer(s,'contact');return;}
    cancelPlayerActions(s);s.motion='none';s.motionAge=s.charge=s.runCharge=0;s.catStamina=1.8;
    grantPower(s,damagedPower(s.power));emit(s,'hurt');s.invincible=2;s.notice='受伤了，小心尖刺和敌人';releaseHeld(s);
}
