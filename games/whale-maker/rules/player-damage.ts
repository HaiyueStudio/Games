import type {State} from './model';
import type {HitDirection} from './services';
import {absorbEquipmentHit,dropHelmet} from './player-equipment';
import {damagedPower} from './player-body';
import {grantPower} from './power';
import {emit} from './events';
import {isRecovering} from './coop-state';
import {chargeLife} from './p2-progress';

export const SHOT_DURATION=.24,EAT_DURATION=.56,CHEER_DURATION=.8;
function cancelPlayerActions(s:State):void {
    s.pound='none';s.bonePound=false;s.climbing=false;s.pendingShot=false;s.shootAge=SHOT_DURATION;
    s.bites=[];s.eatAge=EAT_DURATION;if(!s.coop)s.flagWaves=[];s.cheerAge=CHEER_DURATION;
    s.running=s.skidding=s.turning=false;s.springDrift=false;s.dust=[];s.dustWait=0;
}
function releaseHeld(s:State):void {if(s.held){s.held.held=false;s.held=null;}}
/** All lethal environments share one teardown; their notices remain distinct. */
export function killPlayer(s:State,cause:'crush'|'fall'|'contact'|'timeout'='crush'):void {
    const coop=s.coop;
    if(s.phase!=='playing'||isRecovering(s)||coop?.arrivals[coop.active]&&cause!=='timeout'||s.boneTime>0&&!(coop&&cause==='timeout'))return;
    s.clearRun.damaged=true;
    dropHelmet(s);cancelPlayerActions(s);releaseHeld(s);
    s.boneTime=0;s.starTime=s.invincible=0;s.power=0;s.motion='none';s.charge=s.runCharge=s.stun=0;
    s.boomerangs=[];s.wearable=null;if(!coop)s.cannonShots=[];s.vehicle=null;
    if(s.riding){s.riding.held=false;if(cause==='fall')s.riding.alive=false;s.riding=null;}
    s.deaths++;s.player.vx=0;
    if(coop){
        chargeLife(s);
        coop.recovery[coop.active]={kind:'waiting',remaining:.75};
        if(coop.traveler===coop.active){
            coop.traveler=-1;
            for(const actor of coop.players){actor.pipe=actor.door=null;}
        }
        s.pipe=s.door=null;
        if(cause!=='timeout'&&!s.gameOver&&coop.recovery.some(r=>!r)){
            s.player.vy=0;s.notice=`P${coop.active+1} 等待复活`;emit(s,'hurt');return;
        }
        coop.failed=coop.active;s.lifeCharged=true;
    }
    s.phase='dead';s.deathAge=0;s.player.vy=-9;
    s.notice=cause==='crush'?'被压住了 · 按 R 从检查点重试':'落入海中 · 按 R 从检查点重试';emit(s,'death');
    if(s.gameOver)s.notice='生命用尽 · 按 R 重新开始';
}
export const crushPlayer=(s:State,timeout=false):void=>killPlayer(s,timeout?'timeout':'crush');
export function hurtPlayer(s:State,direction:HitDirection='side'):void {
    if(s.phase!=='playing'||isRecovering(s)||s.pipe||direction==='bottom'&&s.riding||s.invincible>0||s.starTime>0||s.boneTime>0)return;
    s.clearRun.damaged=true;
    if(absorbEquipmentHit(s,direction))return;
    if(!s.power){killPlayer(s,'contact');return;}
    cancelPlayerActions(s);s.motion='none';s.motionAge=s.charge=s.runCharge=0;s.catStamina=1.8;
    grantPower(s,damagedPower(s.power));emit(s,'hurt');s.invincible=2;s.notice='受伤了，小心尖刺和敌人';releaseHeld(s);
}
