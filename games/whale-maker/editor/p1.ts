import {P2_ENEMIES,P2_TOOLS,WEARABLES,P2_PROPERTY_KEYS,validP2Property,P2_BOSSES,p2Issues} from '../rules/p2-schema';
import {P2_SETTING_KEYS,P2_LABELS,P2_CHOICES,P2_WORDS,settingValue,editSetting} from './p2-settings';
import { GuiInput, type GuiElement, type GuiRoot, type GuiRect, type GuiButton, type GuiLabel } from '@haiyue/engine/gui';
import type { Level, Tile } from '../rules/model';
import type { ElementProperties } from '../rules/catalog';
import { P1_ENEMIES, P1_TOOLS, FLIGHT_MODIFIERS, PATH_TILES, levelIssues, validP1Property, P1_PROPERTIES, PIPE_PERIODS } from '../rules/p1-schema';
import { validSnakePath } from '../rules/snake-path';
import { validGlassPath, placeGlassPipe } from '../rules/glass';
import { editSnakeEnd } from '../rules/snake-path';
import { editGlassEnd } from '../rules/glass';
import { placeCactus } from '../rules/desert';
import { placeCannon, cannonCells } from '../rules/advanced';
import { rotatePipe, pipeShape } from '../rules/pipes';
import { elementFits } from './p1-geometry';

export const MODIFIABLE=['J','T','plant','spiky','iron-turtle','bomb','hammer-otter','fire-brother','jump-mouse','spike-mouse','dry-turtle','ant','spike-ant','fish','fishbone','ball-thrower',...P2_ENEMIES];
export const labels:Record<string,string>={...P2_LABELS,shockwave:'落地震波',direction:'方向',width:'宽度',depth:'深度',height:'高度',length:'长度',pace:'沿路速度',speed:'运动速度',period:'周期 / 间隔',radius:'生成范围',count:'范围数量上限',ammoSpeed:'弹丸速度',rotation:'安装方向',large:'巨大',winged:'翅膀',parachute:'降落伞',trigger:'启动方式',color:'颜色',drop:'击败掉落',slippery:'光滑惯性',link:'连接编号',theme:'玩法主题',condition:'通关条件',amount:'目标数量',target:'目标敌人/形态',pipes:'管道规则',preview:'轮廓预览'};
const choices:Record<string,unknown[]>={...P2_CHOICES,shockwave:[false,true],direction:['left','right'],rotation:[0,90,180,270],large:[false,true],winged:[false,true],parachute:[false,true],slippery:[true,false],preview:[false,true],trigger:['auto','step'],color:['green','purple'],drop:[undefined,'coin','key'],theme:['coast','underground','forest','snow','desert','castle'],condition:['none','coins','defeats','power'],pipes:['legacy','reference']};
const words:Record<string,string>={...P2_WORDS,left:'左',right:'右',duck:'咕咕嘎嘎',turtle:'龟龟',ant:'蚂蚁兵','spike-ant':'尖刺蚁','jump-mouse':'跳跃鼠','spike-mouse':'尖刺鼠','creeper-plant':'蔓延食人花','dry-turtle':'骷髅龟',fishbone:'鱼骨','fire-plant':'吐火食人花','fire-brother':'火焰兄弟','ball-thrower':'投球怪','snow-cactus':'雪仙人球',true:'开',false:'关',auto:'自动',step:'踩踏',green:'绿',red:'红',blue:'蓝',yellow:'黄',purple:'紫',coin:'金币',key:'钥匙',coast:'海岸',underground:'地下',forest:'森林',snow:'雪地',desert:'沙漠',castle:'城堡',none:'无',coins:'收集金币',defeats:'击败敌人',power:'指定形态',legacy:'旧图返程',reference:'受困失败'};
export const P1_EDITOR_CHARS=Object.values(labels).join('')+Object.values(words).join('')+'高级条件末端延长转弯撤去末段开启轮廓后拖动节点路径编辑内容基础请先选择有路径的元素路径超出地图或无法转弯建造锤猫铃铛回旋镖拿着的物体太大无法进入透明管道周期间隔最多五个';
export function propertyDefault(tile:Tile,key:string,p:ElementProperties={}):unknown {
    const values:Record<string,unknown>={durability:tile==='cat-boss'?6:3,orbit:3,delay:.5,recovery:3,strength:6,charges:3,goalHeight:9,checkpointPower:undefined,goalBonus:'score',targetX:2,targetY:2,phase:0,large:false,winged:false,parachute:false,drop:undefined,trigger:tile==='snake-fast'?'step':'auto',color:tile==='P'?'blue':'green',period:tile==='beat-block'?2:tile==='giant-fish'||tile==='lava-dragon'?3:tile==='magikoopa'?3.5:tile==='P'?PIPE_PERIODS[p.color==='purple'?'blue':p.color??'blue']:tile==='fire-plant'?2:tile==='fire-brother'?1.8:tile==='ball-thrower'||tile==='extend-block'?3:2.4,width:tile==='tornado'?2:tile==='camera-stop'?4:['fall-block','beat-block'].includes(tile)?1:3,depth:tile==='camera-stop'?4:2,height:tile==='tree'||tile==='tornado'?5:tile==='cactus'||tile==='snow-cactus'?3:2,length:4,pace:tile==='ring-ghost'?.6:tile==='path-red'||tile==='snake-fast'?2:1,count:tile==='ring-ghost'?6:8,radius:16,ammoSpeed:tile==='cannon-basic'?3:5,speed:2,rotation:0,link:1,slippery:true,direction:tile==='dash-block'?'right':'left'};
    return values[key]??(['drop','checkpointPower'].includes(key)?undefined:1);
}
export function propertyKeys(tile:Tile):string[]{
    const out:string[]=[];
    if(tile==='propeller-box'||tile==='pow-box')out.push('charges');
    if(['door','locked-door','p-door','P','warp-box','locked-warp'].includes(tile))out.push('area','targetX','targetY');
    if((P2_BOSSES as readonly string[]).includes(tile)||tile==='koopa-car')out.push('durability');
    if(['beat-block','fall-block','tornado','camera-stop'].includes(tile))out.push('width');
    if(tile==='camera-stop')out.push('depth');
    if(tile==='tornado')out.push('height','strength');
    if(tile==='icicle')out.push('height');
    if(tile==='fall-block'||tile==='icicle')out.push('delay','recovery');
    if(tile==='beat-block')out.push('period','phase');
    if(tile==='ring-ghost')out.push('orbit','pace','count');
    if(['giant-fish','lava-dragon','magikoopa'].includes(tile))out.push('period');
    if(tile==='E')out.push('goalHeight','goalBonus');
    if(tile==='C')out.push('checkpointPower');
    if(MODIFIABLE.includes(tile))out.push('large','drop');if(FLIGHT_MODIFIERS.has(tile))out.push('winged','parachute');
    if(['tree','snow-cactus','cactus','cannon','bill-blaster'].includes(tile))out.push('height');
    if(['semi-platform','trampoline','trampoline-on','trampoline-moving'].includes(tile))out.push('width');
    if(tile==='semi-platform')out.push('depth');
    if(PATH_TILES.has(tile)&&tile!=='extend-block')out.push('pace');
    if(tile==='creeper-plant'||tile==='P')out.push('color');
    if(tile==='snake-block'||tile==='snake-fast')out.push('length','trigger');
    if(['P','cannon-basic','bill-blaster','cannon'].includes(tile))out.push('period','count','radius','ammoSpeed');
    if(['extend-block','fire-plant','fire-brother','ball-thrower'].includes(tile))out.push('period');
    if(MODIFIABLE.includes(tile)||tile==='dash-block')out.push('direction');
    if(['P','p-switch','sign'].includes(tile))out.push('rotation');
    if(['P','warp-box','locked-warp','door','locked-door','p-door'].includes(tile))out.push('link');
    if(tile==='fire-brother'||tile==='hammer-otter')out.push('shockwave');
    if(tile==='conveyor')out.push('speed');if(tile==='ice'||tile==='ice-solid')out.push('slippery');
    return [...new Set(out)];
}
/** Batch editing only writes the intersection supported by every selection. */
export function editProperty(level:Level,ids:readonly number[],key:string,value:unknown):boolean {
    if(!ids.length||!ids.every(id=>propertyKeys(level.cells[id]!).includes(key)))return false;
    const valid=['area','checkpointPower'].includes(key)&&value===undefined||P2_PROPERTY_KEYS.has(key)?(['area','checkpointPower'].includes(key)&&value===undefined||validP2Property(key,value)):P1_PROPERTIES.has(key)?validP1Property(key,value):key==='phase'?typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=60:key==='direction'?value==='left'||value==='right':key==='rotation'?[0,90,180,270].includes(Number(value)):key==='drop'?value===undefined||value==='coin'||value==='key':key==='slippery'?typeof value==='boolean':typeof value==='number'&&Number.isFinite(value)&&value>=(key==='period'?.25:key==='speed'?-6:1)&&value<=(key==='height'?8:key==='link'?99:key==='period'?30:key==='length'?16:key==='speed'?6:32);
    if(!valid)return false;
    const draft=structuredClone(level);
    for(const id of ids){const t=draft.cells[id]!,x=id%draft.width,y=Math.floor(id/draft.width);
        if(key==='height'&&t==='cactus'){if(!placeCactus(draft,x,y,Number(value)))return false;continue;}
        if(key==='height'&&t==='cannon'){const owned=new Set(cannonCells(draft,id));if(y-Number(value)+1<0||Array.from({length:Number(value)},(_,n)=>id-n*draft.width).some(n=>!owned.has(n)&&draft.cells[n]!=='.'))return false;placeCannon(draft,x,y,Number(value));continue;}
        if(key==='rotation'&&t==='P'){for(let n=0;n<4&&pipeShape(draft,id)?.rotation!==value;n++)if(!rotatePipe(draft,id))return false;continue;}
        const p=(draft.properties??={})[id]??={};if(value===undefined)delete (p as Record<string,unknown>)[key];else (p as Record<string,unknown>)[key]=value;
    }
    if(!ids.every(id=>elementFits(draft,draft.cells[id]!,id%draft.width,Math.floor(id/draft.width),draft.properties?.[id])))return false;
    Object.assign(level,draft);
    return true;
}
/** Node drag keeps Manhattan paths orthogonal and commits atomically. */
export function movePathNode(level:Level,id:number,index:number,point:[number,number]):boolean {
    const p=level.properties?.[id]?.path;if(!p||index===0||index>=p.length)return false;
    const next=structuredClone(p),old=next[index]!,prev=next[index-1]!,after=next[index+1];
    point=[...point];if(prev[0]===old[0]){prev[0]=point[0];if(index===1)prev[0]=point[0]=0;}else{prev[1]=point[1];if(index===1)prev[1]=point[1]=0;}
    if(after){if(after[0]===old[0])after[0]=point[0];else after[1]=point[1];}next[index]=point;
    const glass=level.cells[id]==='glass-pipe';if(!(glass?validGlassPath(level,id,next):validSnakePath(level,id,next)))return false;
    if(glass)return placeGlassPipe(level,id,next);if(!elementFits(level,level.cells[id]!,id%level.width,Math.floor(id/level.width),{...level.properties?.[id],path:next}))return false;level.properties![id]!.path=next;return true;
}
interface Host {ui:GuiRoot;level:Level;selection:Set<number>;editing:boolean;notice:string;editCamera:number;editY:number;rect(node:GuiElement,r:GuiRect):GuiElement;label(text:string,x:number,y:number,w:number,h?:number):GuiLabel;button(text:string,x:number,y:number,w:number,fn:()=>void):GuiButton;record():void;draw():void;editAreaId?:string;packLevel?():Level;switchEditArea?(id:string):void;addSubArea?():void;removeSubArea?():void}
export class P1Editor {
    enabled:boolean|undefined=undefined;active=false;page=0;preview=false;switchOn=true;
    readonly nodes:GuiElement[]=[];
    readonly inputs:GuiInput[]=[];
    private rows:{label:GuiLabel;input:GuiInput;button:GuiButton;key:string}[]=[];
    private signature='';
    routeMode=false;
    private routeNodes:GuiElement[]=[];
    readonly toggle:GuiButton;
    private h:Host;
    constructor(h:Host){this.h=h;
        this.toggle=h.button('高级 / 条件',1064,704,186,()=>{this.enabled=!this.active;this.signature='';h.draw();});
        for(let n=0;n<4;n++){
            const y=250+n*83,label=h.label('',1064,y,186,25),input=new GuiInput({value:'',inputType:'number',onSubmit:value=>this.commit(n,Number(value)),style:{backgroundColor:'#123d4e',color:'#e6fbff',borderColor:'#56c7c7',radius:8,padding:8}});
            h.ui.add(h.rect(input,{x:1064,y:y+27,width:186,height:35}));const button=h.button('',1064,y+27,186,()=>this.cycle(n));this.inputs.push(input);this.rows.push({label,input,button,key:''});this.nodes.push(label,input,button);
        }
        this.nodes.push(h.button('上一页',1064,590,86,()=>{this.page=Math.max(0,this.page-1);this.signature='';}),h.button('下一页',1164,590,86,()=>{this.page++;this.signature='';}),h.button('路径编辑',1064,633,86,()=>{this.routeMode=!this.routeMode;}),h.button('轮廓范围',1164,633,86,()=>{this.preview=!this.preview;}),h.button('开关预览',1064,671,86,()=>{this.switchOn=!this.switchOn;}),h.button('定位错误',1164,671,86,()=>this.locate()));
        this.routeNodes.push(h.label('末端延长 / 转弯',1064,250,186,30));for(const [text,x,y,dx,dy]of [['↑',1114,295,0,-1],['←',1064,340,-1,0],['→',1164,340,1,0],['↓',1114,385,0,1]] as const)this.routeNodes.push(h.button(text,x,y,86,()=>this.route(dx,dy)));
        this.routeNodes.push(h.button('撤去末段',1064,440,186,()=>this.route(0,0,true)),h.label('开启轮廓后拖动节点',1064,490,186,30));
    }
    ids(){return [...this.h.selection].filter(id=>this.h.level.cells[id]!=='.');}
    keys(){const ids=this.ids();if(!ids.length){const c=this.h.level.condition;return ['theme','condition',...(c?.kind==='coins'?['amount']:c?.kind==='defeats'?['amount','target']:c?.kind==='power'?['target']:[]),'pipes',...P2_SETTING_KEYS];}return propertyKeys(this.h.level.cells[ids[0]!]!).filter(k=>ids.every(id=>propertyKeys(this.h.level.cells[id]!).includes(k)));}
    value(key:string):unknown {const l=this.h.level,ids=this.ids();if(!ids.length&&P2_SETTING_KEYS.includes(key))return key==='area'?this.h.editAreaId??'main':key==='newArea'?'create':key==='removeArea'?'remove':settingValue(l,key);if(key==='area')return l.properties?.[ids[0]!]?.area??'none';if(key==='theme')return l.theme??'coast';if(key==='condition')return l.condition?.kind??'none';if(key==='pipes')return l.rules?.pipes??'legacy';if(key==='amount')return l.condition&&'amount'in l.condition?l.condition.amount:1;if(key==='shockwave'){const p=l.properties?.[this.ids()[0]!];return p?.shockwave??p?.large??false;}if(key==='target')return l.condition?.kind==='defeats'?l.condition.enemy:l.condition?.kind==='power'?l.condition.power:'duck';return (l.properties?.[this.ids()[0]!] as Record<string,unknown>|undefined)?.[key]??propertyDefault(l.cells[this.ids()[0]!]!,key,l.properties?.[this.ids()[0]!]);}
    commit(row:number,value:unknown):void {
        const key=this.rows[row]?.key;if(!key)return;const h=this.h,old=structuredClone(h.level);h.record();
        if(!this.ids().length&&key==='area'){h.switchEditArea?.(String(value));return;}else if(!this.ids().length&&key==='newArea'){h.addSubArea?.();return;}else if(!this.ids().length&&key==='removeArea'){h.removeSubArea?.();return;}else if(!this.ids().length&&P2_SETTING_KEYS.includes(key)){const next=editSetting(h.level,key,value,h.packLevel?.()??h.level);if(next)h.level=next;else h.notice='区域或进度参数无效';this.signature='';return;}
        else if(key==='theme')h.level.theme=value as NonNullable<Level['theme']>;
        else if(key==='condition'){if(value==='none')delete h.level.condition;else h.level.condition=value==='power'?{kind:'power',power:5}:value==='defeats'?{kind:'defeats',amount:1,enemy:'duck'}:{kind:'coins',amount:3};}
        else if(key==='amount'&&h.level.condition&&'amount'in h.level.condition){if(!Number.isInteger(value)||Number(value)<1||Number(value)>999){h.level=old;h.notice='数量必须为 1–999';return;}h.level.condition.amount=Number(value);}
        else if(key==='target'&&h.level.condition){if(h.level.condition.kind==='power')h.level.condition.power=Number(value) as 0;else if(h.level.condition.kind==='defeats')h.level.condition.enemy=String(value);}
        else if(key==='pipes'){h.level.rules??={revision:1,rewards:'legacy-coins',freezing:'permanent'};h.level.rules.pipes=value as 'legacy'|'reference';}
        else if(!editProperty(h.level,this.ids(),key,key==='area'&&value==='none'?undefined:value)){h.level=old;h.notice='输入值或批量属性无效';}
        this.signature='';h.notice=levelIssues(h.level)[0]?.message??'属性已更新';
    }
    cycle(row:number):void {const key=this.rows[row]!.key,list=key==='area'?(this.ids().length?['none','main',...Object.keys(this.h.packLevel?.().areas??this.h.level.areas??{})]:['main',...Object.keys(this.h.packLevel?.().areas??this.h.level.areas??{})]):key==='target'?(this.h.level.condition?.kind==='power'?[0,1,2,3,4,5,6,7]:['duck','turtle',...P1_ENEMIES,...P2_ENEMIES]):key==='color'&&this.h.level.cells[this.ids()[0]!] ==='P'?['green','red','blue','yellow']:choices[key];if(!list)return;this.commit(row,list[(list.indexOf(this.value(key))+1)%list.length]);}
    locate():void {const e=[...levelIssues(this.h.level),...p2Issues(this.h.level,this.h.packLevel?.()??this.h.level)][0];if(!e){this.h.notice='当前规则校验通过';return;}this.h.notice=e.message;if(e.cell!==undefined){this.h.selection=new Set([e.cell]);this.h.editCamera=Math.max(0,e.cell%this.h.level.width-8);this.h.editY=Math.max(0,Math.floor(e.cell/this.h.level.width)-7);}}
    route(dx:number,dy:number,remove=false):void {const id=this.ids().find(id=>PATH_TILES.has(this.h.level.cells[id]!)||this.h.level.cells[id]==='glass-pipe');if(id===undefined){this.h.notice='请先选择有路径的元素';return;}const draft=structuredClone(this.h.level),ok=draft.cells[id]==='glass-pipe'?editGlassEnd(draft,id,dx,dy,remove):editSnakeEnd(draft,id,dx,dy,remove);if(ok&&!levelIssues(draft).some(e=>e.cell===id)){this.h.record();this.h.level=draft;this.preview=true;}else this.h.notice='路径超出地图或无法转弯';}
    update():boolean {
        const h=this.h,ids=this.ids(),fresh=ids.some(id=>([...P1_TOOLS,...P2_TOOLS] as readonly string[]).includes(h.level.cells[id]!)||['C','E'].includes(h.level.cells[id]!)),active=h.editing&&(this.enabled??fresh),keys=this.keys();this.page=Math.min(this.page,Math.max(0,Math.ceil(keys.length/4)-1));
        if(!ids.some(id=>PATH_TILES.has(h.level.cells[id]!)||h.level.cells[id]==='glass-pipe'))this.routeMode=false;
        this.active=active;this.toggle.setText(active?'内容 / 基础':'高级 / 条件');this.toggle.setVisible(h.editing);this.nodes.forEach(n=>n.setVisible(active));
        const signature=JSON.stringify([ids,keys,this.page,keys.map(k=>this.value(k))]);if(signature!==this.signature){this.signature=signature;for(let n=0;n<4;n++){const row=this.rows[n]!,key=keys[this.page*4+n]??'';row.key=key;row.label.setText(key?labels[key]??key:'');const value=this.value(key),enumKey=key in choices||key==='target'||key==='area';row.input.setValue(String(value??''));row.button.setText(key==='target'&&this.h.level.condition?.kind==='power'?['初始','长高','火焰','巨型','寒冰','猫','回旋镖','建造锤'][Number(value)]!:words[String(value)]??String(value??'无'));row.input.setVisible(active&&!!key&&!enumKey);row.button.setVisible(active&&!!key&&enumKey);}}
        for(const row of this.rows){const enumKey=row.key in choices||row.key==='target'||row.key==='area';row.label.setVisible(active&&!this.routeMode&&!!row.key);row.input.setVisible(active&&!this.routeMode&&!!row.key&&!enumKey);row.button.setVisible(active&&!this.routeMode&&!!row.key&&enumKey);}this.routeNodes.forEach(n=>n.setVisible(active&&this.routeMode));return active;
    }
}
