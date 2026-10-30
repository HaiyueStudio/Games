import type {Body, Input, Item, State} from './model';
import {emit} from './events';

import {equipHelmet,ridingBoneShell} from './player-equipment';
import type {ShellHelmet} from './player-equipment';
export {SHELL_TOOLS,SHELL_NAMES,hasHelmet,ridingBoneShell} from './player-equipment';
export type {ShellHelmet} from './player-equipment';
export function equipShellHelmet(s:State,kind:ShellHelmet):void {
    equipHelmet(s,kind);
    s.notice=(kind==='shell-helmet'?'龟壳帽':'尖刺龟壳帽')+'戴好了！向上顶撞，抵挡一次伤害并保留形态';
}
export function mountBoneShell(s:State,item:Item):void {
    if(s.riding||s.vehicle||!item.alive||item.held)return;
    item.held=true;item.vx=item.vy=0;s.riding=item;s.pound='none';s.bonePound=false;s.crouching=false;
    s.player.y=item.y-s.player.h;s.player.vy=0;s.grounded=true;s.swimming=false;
    emit(s,'metal',item.x);s.notice='骨头龟壳：漂浮水面和岩浆，下砸变骨头5秒；Shift加跳跃跳出';
}
export function boneRest(s:State):void {
    if(!ridingBoneShell(s)||s.boneTime>0)return;
    s.boneTime=5;s.bonePound=false;s.pound='none';s.player.vx=0;s.spinning=false;
    if(s.wearable){s.wearable.charge=0;s.wearable.boost=0;s.wearable.active=false;}
    s.pendingShot=false;emit(s,'metal',s.player.x);s.notice='变成骨头！5秒免疫伤害，随后自动复原';
}
export function shellInput(s:State,input:Input):Input {
    if(s.phase==='playing'&&ridingBoneShell(s)&&s.grounded&&input.down&&!s.previous.down)boneRest(s);
    return s.boneTime>0?{...input,axis:0,jump:false,spin:false,down:false,grab:false,fire:false,interact:false,special:false,build:false}:input;
}
/** First exposed liquid surface crossed by the shell. Solid banks still use the normal mover. */
export function floatShell(s:State,body:Body,previousFeet:number,offset=0):boolean {
    if(body.vy<0)return false;
    const feet=body.y+body.h+offset,l=s.level;
    let surface=Infinity;
    const liquid=l.liquid;
    if(liquid&&(liquid.kind==='water'||liquid.kind==='lava')&&l.liquidSurface!==undefined&&
        body.x+body.w>(liquid.x??0)&&body.x<(liquid.x??0)+(liquid.width??l.width)&&
        previousFeet+offset<=l.liquidSurface+.3&&feet>=l.liquidSurface)surface=l.liquidSurface;
    for(let y=Math.max(0,Math.floor(previousFeet+offset-.3));y<=Math.min(l.height-1,Math.floor(feet));y++)
        for(let x=Math.max(0,Math.floor(body.x+.01));x<=Math.min(l.width-1,Math.floor(body.x+body.w-.01));x++){
            const tile=l.cells[y*l.width+x];if(tile!=='water'&&tile!=='lava')continue;
            if(liquid?.kind===tile&&l.liquidSurface!==undefined)continue;
            if(y>0&&l.cells[(y-1)*l.width+x]===tile)continue;
            if(previousFeet+offset<=y+.3&&feet>=y)surface=Math.min(surface,y);
        }
    if(!Number.isFinite(surface))return false;
    body.y=surface-body.h-offset;body.vy=0;return true;
}
