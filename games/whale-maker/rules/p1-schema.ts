import {isPlayerPower} from './player-body';
import {P2_PATHS,P2_ENEMIES} from './p2-schema';
import type { Level, Tile, State } from './model';
import { rulesFor } from './profile';

export const P1_ENEMIES=['ant','spike-ant','jump-mouse','spike-mouse','creeper-plant','dry-turtle','fishbone','fire-plant','fire-brother','ball-thrower','snow-cactus'] as const;
export type P1EnemyKind=typeof P1_ENEMIES[number];
export const P1_TOOLS=['cat-bell','boomerang-flower','hammer-suit','hard-block','sign','gentle-up','gentle-down','semi-platform','conveyor','dash-block','snake-fast','path-red','path-blue','spike-switch','trampoline','trampoline-on','trampoline-moving','red-pow','tree','extend-block','warp-box','locked-warp','pink-coin','snowball-large',...P1_ENEMIES,'cannon-basic','bill-blaster'] as const;
export const P1_NAMES=['猫铃铛','回旋镖花','建造锤','硬砖','方向牌','缓上坡','缓下坡','半实体平台','输送带','冲刺块','蓝色蛇砖','红路径砖','蓝路径砖','伸缩刺砖','蘑菇弹床','开关弹床','移动弹床','红POW','珊瑚树','感叹号砖','传送箱','上锁传送箱','粉红钥匙币','大雪球','蚂蚁兵','尖刺蚁','跳跃鼠','尖刺鼠','蔓延食人花','骷髅龟','鱼骨','吐火食人花','火焰兄弟','投球怪','雪仙人球','普通火炮','炮弹发射器'];
export type Theme='coast'|'underground'|'forest'|'snow'|'desert'|'castle';
export const PIPE_PERIODS={green:1.8,red:1.2,blue:2.4,yellow:3.6} as const;
export type Condition={kind:'coins';amount:number}|{kind:'defeats';amount:number;enemy:string}|{kind:'power';power:State['power']};
export const P1_PROPERTIES=new Set(['width','depth','large','winged','parachute','trigger','color','pace','radius','count','ammoSpeed','spiked','preview','liquid','shockwave']);
export const PATH_TILES=new Set(['snake-block','snake-fast','path-red','path-blue','extend-block','creeper-plant','trampoline-moving',...P2_PATHS]);
export const CONTAINER_TILES=new Set(['?','hidden-block','cannon','ice','wood-crate','tree','P','cannon-basic','bill-blaster']);
export const FLIGHT_MODIFIERS=new Set(['J','T','plant','spiky','iron-turtle','bomb','hammer-otter','fire-brother','jump-mouse','spike-mouse','dry-turtle','ball-thrower','spring-enemy']);
export const p1Enemy=(kind:string):kind is P1EnemyKind=>(P1_ENEMIES as readonly string[]).includes(kind);
export function validP1Property(key:string,value:unknown):boolean {
    if(['large','winged','parachute','spiked','preview','shockwave'].includes(key))return typeof value==='boolean';
    if(key==='liquid')return value==='water'||value==='lava'||value==='quicksand';
    if(key==='trigger')return value==='auto'||value==='step';
    if(key==='color')return ['green','red','blue','yellow','purple'].includes(String(value));
    if(key==='pace')return typeof value==='number'&&Number.isFinite(value)&&value>=.25&&value<=8;
    if(key==='ammoSpeed')return typeof value==='number'&&Number.isFinite(value)&&value>=1&&value<=16;
    return typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=(key==='radius'?16:key==='count'?16:32);
}
export function levelIssues(l:Level):{message:string;cell?:number}[] {
    const errors:{message:string;cell?:number}[]=[];
    if(l.theme!==undefined&&!['coast','underground','forest','snow','desert','castle'].includes(l.theme))errors.push({message:'未知玩法主题'});
    const c=l.condition;
    if(c){if(c.kind==='coins'||c.kind==='defeats'){if(!Number.isInteger(c.amount)||c.amount<1||c.amount>999)errors.push({message:'通关数量必须为 1–999'});if(c.kind==='defeats'&&!['duck','turtle','shell','plant','fish','squid','spiky','cannonball','iron-turtle','ghost','fire-jumper','bomb','hammer-otter','cactus',...P1_ENEMIES,...P2_ENEMIES].includes(c.enemy))errors.push({message:'未知通关目标敌人'});}else if(c.kind==='power'){if(!isPlayerPower(c.power))errors.push({message:'未知目标形态'});}else errors.push({message:'未知通关条件'});
        if(rulesFor(l).rewards==='score')l.cells.forEach((t,cell)=>{if(t==='C')errors.push({message:`通关条件不能与检查点组合（${cell%l.width},${Math.floor(cell/l.width)}）`,cell});});
    }
    for(const [id,p]of Object.entries(l.properties??{}))if((p.large||p.winged||p.parachute)&&!['J','T','plant','spiky','iron-turtle','bomb','hammer-otter','fire-brother','jump-mouse','spike-mouse','dry-turtle','ant','spike-ant','fish','fishbone','ball-thrower',...P2_ENEMIES].includes(l.cells[+id]!))errors.push({message:`该敌人不支持尺寸／飞行修饰（${+id%l.width},${Math.floor(+id/l.width)}）`,cell:+id});
    for(const [id,p]of Object.entries(l.properties??{}))if((p.winged||p.parachute)&&(!FLIGHT_MODIFIERS.has(l.cells[+id]!)||l.cells[+id]==='plant'&&p.mode==='pipe'))errors.push({message:`该敌人不支持飞行修饰（${+id%l.width},${Math.floor(+id/l.width)}）`,cell:+id});
    l.cells.forEach((t,id)=>{
        const x=id%l.width,y=Math.floor(id/l.width),p=l.properties?.[id];
        if(t==='gentle-up'||t==='gentle-down'){if(x+1>=l.width||l.cells[id+1]!==t+'-body')errors.push({message:`缓坡缺少右半部分（${x},${y}）`,cell:id});}
        if(t==='gentle-up-body'||t==='gentle-down-body'){if(x===0||l.cells[id-1]!==t.slice(0,-5))errors.push({message:`缓坡缺少左半部分（${x},${y}）`,cell:id});}
        if(['tree','semi-platform','trampoline','trampoline-on','trampoline-moving','bill-blaster'].includes(t)){
            const width=t==='tree'?2:t==='bill-blaster'?1:p?.width??3,height=t==='tree'||t==='bill-blaster'?p?.height??(t==='tree'?5:2):t==='semi-platform'?p?.depth??2:1,top=t==='tree'||t==='bill-blaster'?y-height+1:y;
            if(x+width>l.width||top<0||top+height>l.height||p?.path?.some(v=>x+v[0]+width>l.width||top+v[1]+height>l.height))errors.push({message:`元素尺寸超出地图（${x},${y}）`,cell:id});
        }
    });
    return errors;
}
