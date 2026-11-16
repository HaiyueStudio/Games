import type {State,Item,Body} from './model';
import {emit} from './events';
export function triggerP(s:State):void {
    emit(s,'switch');
    if(s.pTime===0){s.pConversions={};s.level.cells.forEach((t,id)=>{if(t==='B'||t==='o'){const to=t==='B'?'o':'B';s.pConversions[id]={from:t,to};s.level.cells[id]=to;}});}
    s.pTime=10;s.notice='P开关启动！10秒路径变化';
}
export const P_SWITCH_VANISH_TIME=.4;
export function pressSwitch(s:State,item:Item):void {
    item.spent=true;item.pressedAge=0;const r=item.rotation??0;if(r===90||r===270){if(r===90)item.x+=item.w-.18;item.w=.18;}else{if(r===0)item.y+=item.h-.18;item.h=.18;}item.vx=item.vy=0;triggerP(s);
}
/** Only a downward top contact presses a switch; sides remain solid barriers. */
export function pressPSwitch(s:State,b:Body,previous:Body):boolean {
    for(const item of s.items){if(item===b||item.kind!=='p-switch'||!item.alive||item.held||item.spent)continue;
        const r=item.rotation??0,n:[number,number]=r===0?[0,-1]:r===90?[1,0]:r===180?[0,1]:[-1,0];
        const tangent=n[0]?b.y<item.y+item.h-.001&&b.y+b.h>item.y+.001:b.x<item.x+item.w-.001&&b.x+b.w>item.x+.001;
        const edge=n[0]?n[0]>0?item.x+item.w:item.x:n[1]>0?item.y+item.h:item.y;
        const gap=(q:Body)=>n[0]?n[0]>0?q.x-edge:edge-q.x-q.w:n[1]>0?q.y-edge:edge-q.y-q.h;
        if(!tangent||(previous.vx*n[0]+previous.vy*n[1]>=-1e-8&&!(n[1]===-1&&previous.vy>=0))||gap(previous)<-.04||gap(b)>.03||gap(b)<-.08)continue;
        pressSwitch(s,item);
        if(n[0])b.x=n[0]>0?item.x+item.w:item.x-b.w;else b.y=n[1]>0?item.y+item.h:item.y-b.h;
        if(b===s.player){b.vx=n[0]*4;b.vy=n[1]*4;}return true;
    }return false;
}
