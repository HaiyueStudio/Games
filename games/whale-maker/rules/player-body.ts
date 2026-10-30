import type {State} from './model';

const tall={w:.9,h:2,crouch:.8};
/** Extend form data here; movement, upgrades, damage and labels use the same record. */
export const PLAYER_FORMS={
    0:{label:'初始',hudLabel:'普通',w:.9,h:.8,crouch:.55,damaged:0},
    1:{label:'长高',hudLabel:'成长',...tall,damaged:0},
    2:{label:'火焰',hudLabel:'火力',...tall,damaged:1},
    3:{label:'巨型',hudLabel:'巨型',...tall,w:1.9,damaged:1},
    4:{label:'寒冰',hudLabel:'冰力',...tall,damaged:1},
    5:{label:'猫',hudLabel:'猫',...tall,damaged:1},
    6:{label:'回旋镖',hudLabel:'回旋镖',...tall,damaged:1},
    7:{label:'建造锤',hudLabel:'建造锤',...tall,damaged:1},
} as const;
export type PlayerPower=keyof typeof PLAYER_FORMS;
export const PLAYER_POWERS=Object.keys(PLAYER_FORMS).map(Number) as PlayerPower[];
export const isPlayerPower=(value:unknown):value is PlayerPower=>typeof value==='number'&&Number.isInteger(value)&&Object.prototype.hasOwnProperty.call(PLAYER_FORMS,value);
export const playerPowerLabel=(value:unknown):string=>isPlayerPower(value)?PLAYER_FORMS[value].label:'无';
type BodyContext=Pick<State,'power'|'riding'|'crouching'>;
/** One shape policy for power changes, crouching, movement and area transfer. */
export function playerDimensions(s:BodyContext,crouching=s.crouching):{w:number;h:number} {
    const form=PLAYER_FORMS[s.power];
    return {w:form.w,h:s.riding?.kind==='basin'?.55:crouching?form.crouch:form.h};
}
export const damagedPower=(power:PlayerPower):PlayerPower=>PLAYER_FORMS[power].damaged;
