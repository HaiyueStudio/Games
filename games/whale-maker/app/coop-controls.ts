import type {PadFrame} from '../../gamepad/sampler';
import type {Input} from '../rules/model';

export const ACTIONS=['left','right','interact','down','jump','spin','grab','fire','special','build'] as const;
export type Action=typeof ACTIONS[number];
export const ACTION_LABELS=['向左','向右','向上 / 互动','下蹲 / 下砸','跳跃','旋转跳','快跑 / 抱物','发射 / 投掷','特技','建造'];
const keyboardDefaults=[
    ['KeyA','KeyD','KeyW','KeyS','Space','KeyX','ShiftLeft','KeyJ','KeyK','KeyL'],
    ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter','Slash','ShiftRight','Period','Comma','Semicolon'],
    ['KeyF','KeyH','KeyT','KeyG','KeyV','KeyB','KeyC','KeyU','KeyY','KeyI'],
    ['Numpad4','Numpad6','Numpad8','Numpad5','Numpad0','Numpad1','Numpad7','Numpad3','Numpad2','Numpad9'],
];
const padDefaults=['left','right','up','down','b0','b1','b4','b2','b6','b7'];
const padDirections=['left','right','up','down','axis-left','axis-right','axis-up','axis-down','b14','b15','b12','b13'];
const directionButton:Record<string,string>={left:'b14',right:'b15',up:'b12',down:'b13'};
export const RESERVED_KEYS=new Set(['Escape','Tab','KeyE','KeyP','KeyR','KeyM','KeyN','Delete','Backspace','ControlLeft','ControlRight','MetaLeft','MetaRight','AltLeft','AltRight']);
const reservedPad=new Set(['b8','b11']); // Lobby return and controller pointer mode.
const aliases:Partial<Record<Action,string>>={left:'ArrowLeft',right:'ArrowRight',interact:'ArrowUp',down:'ArrowDown',jump:'KeyZ'};
export interface PlayerControls {keys:string[];pad:string[];device:number}
export interface CoopSettings {count:number;players:PlayerControls[]}

export function defaultControls(index:number):PlayerControls {
    return {keys:[...keyboardDefaults[index]!],pad:[...padDefaults],device:index};
}
export function defaultSettings():CoopSettings {return {count:1,players:Array.from({length:4},(_,i)=>defaultControls(i))};}
function padBinding(value:string):boolean {return padDirections.includes(value)||/^b([0-9]|1[0-6])$/.test(value)&&!reservedPad.has(value);}
export function validSettings(input:unknown):input is CoopSettings {
    if(!input||typeof input!=='object')return false;
    const {count,players}=input as CoopSettings;
    if(!Number.isInteger(count)||count<1||count>4||!Array.isArray(players)||players.length!==4)return false;
    const devices=new Set<number>(),keys=new Set<string>();
    for(const row of players){
        if(!row||!Number.isInteger(row.device)||row.device< -1||row.device>3||row.device>=0&&devices.has(row.device))return false;
        if(row.device>=0)devices.add(row.device);
        if(!Array.isArray(row.keys)||row.keys.length!==ACTIONS.length||!Array.isArray(row.pad)||row.pad.length!==ACTIONS.length)return false;
        for(const key of row.keys){if(typeof key!=='string'||!/^\w{1,32}$/.test(key)||RESERVED_KEYS.has(key)||keys.has(key))return false;keys.add(key);}
        if(row.pad.some(p=>typeof p!=='string'||!padBinding(p))||new Set(row.pad).size!==ACTIONS.length)return false;
    }
    return true;
}
export function changeBinding(settings:CoopSettings,index:number,device:'keys'|'pad',action:number,value:string):boolean {
    if(device==='keys'&&(!/^\w{1,32}$/.test(value)||RESERVED_KEYS.has(value))||device==='pad'&&!padBinding(value))return false;
    const row=settings.players[index]![device],previous=row[action]!;
    // Swap duplicates, including keys assigned to a different player, so one press never moves two players.
    for(const profile of device==='keys'?settings.players:[settings.players[index]!]){
        const conflict=profile[device].indexOf(value);
        if(conflict>=0)profile[device][conflict]=previous;
    }
    if(device==='pad')for(const [direction,button] of Object.entries(directionButton)){
        const combined=row.indexOf(direction);
        if(combined>=0&&combined!==action){if(value===button)row[combined]=`axis-${direction}`;else if(value===`axis-${direction}`)row[combined]=button;}
    }
    row[action]=value;return true;
}
export function assignDevice(settings:CoopSettings,index:number,device:number):void {
    const player=settings.players[index]!,other=settings.players.find((p,n)=>n!==index&&device>=0&&p.device===device);
    if(other)other.device=player.device;
    player.device=device;
}
function axisHeld(pad:PadFrame,direction:string):boolean {
    return direction==='left'?(pad.values.x??0)<-.25:direction==='right'?(pad.values.x??0)>.25:direction==='up'?(pad.values.y??0)<-.25:(pad.values.y??0)>.25;
}
export function padHeld(pad:PadFrame|undefined,key:string):boolean {
    if(!pad)return false;
    const button=directionButton[key];
    return button?pad.held.has(button)||axisHeld(pad,key):key.startsWith('axis-')?axisHeld(pad,key.slice(5)):pad.held.has(key);
}
export function capturedPadBinding(pad:PadFrame|undefined):string|undefined {
    if(!pad)return;
    return [...pad.held].find(p=>padBinding(p))??padDirections.find(p=>p.startsWith('axis-')&&padHeld(pad,p));
}
export function playerInput(settings:CoopSettings,index:number,keys:ReadonlySet<string>,pads:readonly PadFrame[],edges:ReadonlySet<Action>):Input {
    const profile=settings.players[index]!,pad=pads.find(p=>p.index===profile.device);
    const active=(n:number)=>{
        const action=ACTIONS[n]!,alias=index===0&&settings.count===1&&profile.keys[n]===keyboardDefaults[0]![n]?aliases[action]:undefined;
        return keys.has(profile.keys[n]!)||!!alias&&!profile.keys.includes(alias)&&keys.has(alias)||padHeld(pad,profile.pad[n]!)||edges.has(action);
    };
    return {axis:Number(active(1))-Number(active(0)),interact:active(2),down:active(3),jump:active(4),spin:active(5),grab:active(6),fire:active(7),special:active(8),build:active(9)};
}
export function keyLabel(key:string):string {
    const names:Record<string,string>={Space:'空格',Enter:'回车',ShiftLeft:'左 Shift',ShiftRight:'右 Shift',ArrowLeft:'←',ArrowRight:'→',ArrowUp:'↑',ArrowDown:'↓',Comma:',',Period:'.',Slash:'/',Semicolon:';'};
    return names[key]??key.replace(/^Key|^Digit/,'').replace(/^Numpad/,'小键盘 ');
}
export function padLabel(key:string):string {
    const arrows:Record<string,string>={left:'左',right:'右',up:'上',down:'下'};
    if(arrows[key])return `摇杆 / 十字 ${arrows[key]}`;
    if(key.startsWith('axis-'))return `摇杆 ${arrows[key.slice(5)]}`;
    return ['A','B','X','Y','LB','RB','LT','RT','Back','Start','L3','R3','十字上','十字下','十字左','十字右','Home'][Number(key.slice(1))]??key;
}
