import {isPlayerPower} from './player-body';
import type { Level, Tile } from './model';
export const WEARABLES=['cannon-box','propeller-box','goomba-mask','bullet-mask','pow-box'] as const;
export type WearableKind=typeof WEARABLES[number];
export const P2_ENEMIES=['bee','spring-enemy','ring-ghost','bully','giant-fish','lava-dragon','magikoopa','homing-bill','giant-bill','cat-bill'] as const;
export type P2EnemyKind=typeof P2_ENEMIES[number];
export const P2_BOSSES=['boom-boss','pom-boss','cat-boss'] as const;
export type P2BossKind=typeof P2_BOSSES[number];
export const P2_TOOLS=[...WEARABLES,...P2_ENEMIES,'koopa-car',...P2_BOSSES,'beat-block','fall-block','icicle','tornado','camera-rail','camera-stop','one-up','coin-10','coin-30','coin-50'] as const;
export const P2_NAMES=['鲸炮箱','旋桨箱','咕嘎面具','鲸弹面具','红脉冲箱','蜜蜂','弹簧小怪','环绕幽灵','推人企鹅','巨型食人鱼','岩浆龙','魔法龟','追踪炮弹','巨大炮弹','猫炮弹','龟壳车','珊瑚拳王','珍珠幻忍','猫鲸龙王','节拍砖','坠落圈砖','冰柱','龙卷风','镜头路线','镜头停止区','生命珍珠','十枚金币','三十金币','五十金币'];
export const P2_PATHS=['camera-rail'] as const;
export interface P2Properties {durability?:number;orbit?:number;delay?:number;recovery?:number;strength?:number;charges?:number;goalHeight?:number;checkpointPower?:number;goalBonus?:'score'|'life';area?:string;targetX?:number;targetY?:number}
export const P2_PROPERTY_KEYS=new Set(['durability','orbit','delay','recovery','strength','charges','goalHeight','checkpointPower','goalBonus','area','targetX','targetY']);
export interface ProgressOptions {lives?:boolean;initialLives?:number;timeLimit?:number}
export interface CameraOptions {mode:'follow'|'auto';axis?:'x'|'y';speed?:number}
export interface LiquidOptions {kind:'water'|'lava';low:number;high:number;period:number;mode:'rise'|'fall'|'cycle';x?:number;width?:number}
export type SubArea=Omit<Level,'areas'>;
export const isWearable=(v:string):v is WearableKind=>(WEARABLES as readonly string[]).includes(v);
export const isP2Enemy=(v:string):v is P2EnemyKind=>(P2_ENEMIES as readonly string[]).includes(v);
export const isP2Boss=(v:string):v is P2BossKind=>(P2_BOSSES as readonly string[]).includes(v);
export function validP2Property(key:string,v:unknown):boolean {
    if(key==='area')return typeof v==='string'&&/^[a-zA-Z0-9_-]{1,24}$/.test(v);
    if(key==='goalBonus')return v==='score'||v==='life';
    if(key==='checkpointPower')return isPlayerPower(v);
    const max=key==='goalHeight'?24:key==='charges'?9:key==='durability'?20:key==='targetY'?255:key==='targetX'?239:key==='period'||key==='recovery'?60:32;
    return typeof v==='number'&&Number.isFinite(v)&&v>=(['checkpointPower','delay','targetX','targetY'].includes(key)?0:.1)&&v<=max&&(!['charges','durability','checkpointPower','goalHeight','targetX','targetY'].includes(key)||Number.isInteger(v));
}
export function p2Issues(l:Level,main:Level=l):{message:string;cell?:number}[]{
    const out:{message:string;cell?:number}[]=[];
    if(l.orientation!==undefined&&!['horizontal','vertical'].includes(l.orientation))out.push({message:'区域方向无效'});
    if(l.progress){const p=l.progress;if(Object.keys(p).some(k=>!['lives','initialLives','timeLimit'].includes(k))||p.lives!==undefined&&typeof p.lives!=='boolean'||p.initialLives!==undefined&&(!Number.isInteger(p.initialLives)||p.initialLives<1||p.initialLives>99)||p.timeLimit!==undefined&&(!Number.isInteger(p.timeLimit)||p.timeLimit<0||p.timeLimit>999))out.push({message:'生命或倒计时配置无效'});}
    if(l.cameraRules){const c=l.cameraRules;if(!['follow','auto'].includes(c.mode)||c.axis!==undefined&&!['x','y'].includes(c.axis)||c.speed!==undefined&&(!Number.isFinite(c.speed)||c.speed<.1||c.speed>12))out.push({message:'镜头配置无效'});}
    if(l.liquid){const a=l.liquid;if(!['water','lava'].includes(a.kind)||!['rise','fall','cycle'].includes(a.mode)||![a.low,a.high,a.period].every(Number.isFinite)||a.low<a.high||a.high<0||a.low>l.height||a.period<1||a.period>120||a.x!==undefined&&(!Number.isInteger(a.x)||a.x<0)||a.width!==undefined&&(!Number.isInteger(a.width)||a.width<1||(a.x??0)+a.width>l.width))out.push({message:'液面范围或周期无效'});}
    if(l.areas&&(typeof l.areas!=='object'||Array.isArray(l.areas)||Object.keys(l.areas).length>8||Object.keys(l.areas).some(k=>k==='main'||!/^[a-zA-Z0-9_-]{1,24}$/.test(k))))out.push({message:'副区域编号无效，最多八个副区'});
    l.cells.forEach((t,id)=>{const p=l.properties?.[id],x=id%l.width,y=Math.floor(id/l.width);
        if(isP2Boss(t)){const size=t==='cat-boss'?3:2;if(x+size>l.width||y+size>l.height)out.push({message:'首领尺寸超出区域',cell:id});}
        if(['beat-block','fall-block','icicle','tornado','camera-stop'].includes(t)){const w=t==='icicle'?1:p?.width??(t==='tornado'?2:t==='camera-stop'?4:1),h=t==='icicle'?p?.height??2:t==='tornado'?p?.height??5:t==='camera-stop'?p?.depth??4:1;if(x+w>l.width||y+h>l.height)out.push({message:'机关尺寸超出区域',cell:id});}
        if(p?.area){const target=p.area==='main'?main:l.areas?.[p.area];if(!target)out.push({message:`目标区域不存在（${x},${y}）`,cell:id});else if((p.targetX??2)>=target.width||(p.targetY??2)>=target.height)out.push({message:`出口坐标超出目标区域（${x},${y}）`,cell:id});}
    });return out;
}
