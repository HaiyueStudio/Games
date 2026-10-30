import {effect} from './effects';
import type {State} from './model';
import type {HitDirection} from './services';
import {emit} from './events';

export const SHELL_TOOLS=['shell-helmet','spike-shell-helmet','bone-shell'] as const;
export const SHELL_NAMES=['龟壳帽','尖刺龟壳帽','骨头龟壳'] as const;
export type ShellHelmet='shell-helmet'|'spike-shell-helmet';
export type HelmetKind='basin'|ShellHelmet;
export const hasHelmet=(s:State):boolean=>s.helmet||!!s.shellHelmet;
export const ridingBoneShell=(s:State):boolean=>s.riding?.kind==='bone-shell';
export function equipHelmet(s:State,kind:HelmetKind):void {
    s.helmet=kind==='basin';s.shellHelmet=kind==='basin'?null:kind;emit(s,'metal',s.player.x);
}
export function dropHelmet(s:State):void {
    if(!hasHelmet(s))return;
    const headgear=s.shellHelmet??undefined;s.helmet=false;s.shellHelmet=null;
    effect(s,'helmet',s.player.x,s.player.y-.35,-s.facing*3,-5);
    if(headgear)s.effects.at(-1)!.headgear=headgear;
}
export function absorbVehicleHit(s:State):boolean {
    if(!s.vehicle)return false;
    const car=s.vehicle;car.health=(car.health??3)-1;s.invincible=.8;car.vx=-s.facing*3;
    if(car.health<=0){car.alive=false;s.vehicle=null;}emit(s,'metal',car.x);return true;
}
export function absorbWearableHit(s:State):boolean {
    if(!s.wearable)return false;
    s.wearable=null;s.invincible=.9;s.pendingShot=false;emit(s,'break',s.player.x);s.notice='穿戴装备挡住了伤害';return true;
}
type DefenseLayer={readonly slot:string;absorb(s:State,direction:HitDirection):boolean};
/** Order is gameplay policy. A successful layer consumes exactly one hit. */
const DEFENSE_LAYERS:readonly DefenseLayer[]=[
    {slot:'helmet',absorb(s){if(!hasHelmet(s))return false;dropHelmet(s);s.invincible=.6;s.notice='帽子挡住了伤害，形态保留！';return true;}},
    {slot:'foot-shell',absorb(s,direction){if(!ridingBoneShell(s)||direction==='top')return false;s.riding!.alive=false;s.riding!.held=false;s.riding=null;s.bonePound=false;s.invincible=.8;emit(s,'break',s.player.x);s.notice='骨头龟壳挡住了伤害';return true;}},
    {slot:'vehicle',absorb:absorbVehicleHit},
    {slot:'wearable',absorb:absorbWearableHit},
];
export const absorbEquipmentHit=(s:State,direction:HitDirection):boolean=>DEFENSE_LAYERS.some(layer=>layer.absorb(s,direction));
