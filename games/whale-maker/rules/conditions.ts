import type {Body,State} from './model';
import {PLAYER_FORMS} from './player-body';
import {emit} from './events';
import {inWater} from './water';
import {WEARABLES} from './p2-schema';

export const HOLD_TARGETS=['shell','iron-shell','spring-v','basin','pow','red-pow','p-switch','wood-crate','snowball','snowball-large','bomb','frozen-enemy','bone-shell','shell-helmet','spike-shell-helmet'] as const;
export type HoldTarget=typeof HOLD_TARGETS[number];
export const HOLD_NAMES:Record<HoldTarget,string>={shell:'龟壳','iron-shell':'铁壳','spring-v':'纵向弹簧',basin:'铁盆',pow:'POW块','red-pow':'红POW','p-switch':'P开关','wood-crate':'木箱',snowball:'雪球','snowball-large':'大雪球',bomb:'炸弹小怪','frozen-enemy':'冰冻敌人','bone-shell':'骨头龟壳','shell-helmet':'龟壳帽','spike-shell-helmet':'尖刺龟壳帽'};
export const RIDE_TARGETS=['basin','bone-shell','koopa-car'] as const;
export type RideTarget=typeof RIDE_TARGETS[number];
export const WEAR_TARGETS=[...WEARABLES,'basin','shell-helmet','spike-shell-helmet'] as const;
export type WearTarget=typeof WEAR_TARGETS[number];
export const STATE_NAMES:Record<RideTarget|WearTarget,string>={basin:'铁盆','bone-shell':'骨头龟壳','koopa-car':'龟龟车','shell-helmet':'龟壳帽','spike-shell-helmet':'尖刺龟壳帽','cannon-box':'鲸炮箱','propeller-box':'旋桨箱','goomba-mask':'咕嘎面具','bullet-mask':'鲸弹面具','pow-box':'红脉冲箱'};

export interface ClearRun {
    damaged:boolean;
    leftGround:boolean;
    landed:boolean;
    enteredWater:boolean;
    leftWater:boolean;
    ready:boolean;
    groundTime:number;
}
export const newClearRun=():ClearRun=>({damaged:false,leftGround:false,landed:false,enteredWater:false,leftWater:false,ready:false,groundTime:-1});

export function holdingTarget(s:State,target:HoldTarget):boolean {
    const b=s.held;if(!b?.alive||!b.held)return false;
    if(target==='frozen-enemy')return 'frozen'in b&&!!b.frozen;
    if(target==='iron-shell')return b.kind==='shell'&&!!b.iron&&!b.frozen;
    if(target==='shell')return b.kind==='shell'&&!b.iron&&!b.frozen;
    return b.kind===target&&!('frozen'in b&&b.frozen);
}

/** Rebounds do not count as landing, even if the collision briefly stops vy. */
export function reboundSupport(s:State,b:Body):boolean {
    const on=(q:Body)=>b.x+b.w>q.x+.001&&b.x<q.x+q.w-.001&&Math.abs(b.y+b.h-q.y)<.08;
    return s.items.some(q=>q.alive&&!q.held&&['spring-v','spring-h','p-switch'].includes(q.kind)&&on(q))||
        s.enemies.some(q=>q.alive&&!q.held&&on(q));
}

export function recordConditionLanding(s:State):void {
    if(s.phase!=='playing')return;
    s.scoreChain.stomp=0;
    s.clearRun.groundTime=s.time;
    if(s.clearRun.leftGround)s.clearRun.landed=true;
}

export function conditionProgress(s:State):{current:number;target:number;done:boolean;failed:boolean;text:string} {
    const c=s.level.condition;if(!c)return {current:0,target:0,done:true,failed:false,text:''};
    let current:number,target=1,failed=false,text:string;
    if(c.kind==='coins'||c.kind==='defeats'){
        current=c.kind==='coins'?s.coins:s.defeatCounts[c.enemy]??0;target=c.amount;
        text=`${c.kind==='coins'?'金币':'击败'} ${Math.min(current,target)}/${target}`;
    }else if(c.kind==='power'){current=Number(s.power===c.power);text=`目标${PLAYER_FORMS[c.power].label}形态 ${current}/1`;}
    else if(c.kind==='holding'){current=Number(holdingTarget(s,c.item));text=`抱着${HOLD_NAMES[c.item]}通关 ${current}/1`;}
    else if(c.kind==='star'){current=Number(s.starTime>0);text=`无敌状态通关 ${current}/1`;}
    else if(c.kind==='riding'){current=Number(c.item==='koopa-car'?s.vehicle?.alive:s.riding?.alive&&s.riding.kind===c.item);text=`乘坐${STATE_NAMES[c.item]}通关 ${current}/1`;}
    else if(c.kind==='wearing'){current=Number(c.item==='basin'?s.helmet:c.item==='shell-helmet'||c.item==='spike-shell-helmet'?s.shellHelmet===c.item:s.wearable?.kind===c.item);text=`穿戴${STATE_NAMES[c.item]}通关 ${current}/1`;}
    else if(c.kind==='stay-water'){failed=s.clearRun.leftWater;current=Number(!failed&&inWater(s.level,s.player));text=failed?'水中挑战已失败 · 请重试':s.clearRun.enteredWater?'保持水中直达终点':'进入水中后不可离开';}
    else if(c.kind==='no-damage'){failed=s.clearRun.damaged;current=Number(!failed);text=failed?'无伤挑战已失败 · 请重试':'保持无伤通关';}
    else{failed=s.clearRun.landed;current=Number(s.clearRun.leftGround&&!failed);text=failed?'不落地挑战已失败 · 请重试':s.clearRun.leftGround?'保持离地直达终点':'离开地面后不再落地';}
    return {current,target,done:!failed&&current>=target,failed,text};
}

/** Settle after damage, pickups, throws and all rebounds. */
export function advanceClearRun(s:State):void {
    if(s.phase!=='playing')return;
    if(!s.pipe&&!s.door){
        if(inWater(s.level,s.player))s.clearRun.enteredWater=true;
        else if(s.clearRun.enteredWater)s.clearRun.leftWater=true;
        if(s.grounded){if(!reboundSupport(s,s.player))recordConditionLanding(s);}
        else if(Math.abs(s.player.vy)>.001||s.clearRun.groundTime!==s.time)s.clearRun.leftGround=true;
    }
    const p=conditionProgress(s),wasReady=s.clearRun.ready;s.clearRun.ready=!!s.level.condition&&p.done;
    if(s.clearRun.ready&&!wasReady){emit(s,'key');s.notice='通关条件已达成！保持条件前往终点';}
    if(p.failed&&!s.notice.includes('挑战已失败'))s.notice=p.text;
}
