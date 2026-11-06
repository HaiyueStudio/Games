import type { Body, State } from './model';
import { emit } from './events';
import {detonatePow} from './pow';
import type {Services} from './services';
import { collectToken } from './scoring';

export interface BrickBump { x:number;y:number;age:number;down?:boolean;strikerX?:number }
/** Only the ascending top of the animated brick can lift a supported object. */
export function bumpContents(s:State,bump:BrickBump,top:number,svc:Services):void {
    if(bump.down||bump.age>.12)return;
    const {x,y}=bump,w=s.level.width,id=(y-1)*w+x;
    for(const item of s.items)if(item.kind==='pow'&&item.alive&&!item.held&&item.vy>=0&&
        item.y+item.h>=top-.025&&item.y+item.h<=y+.04&&item.x<x+1-.001&&item.x+item.w>x+.001)detonatePow(s,item,svc);
    if(y>0&&s.level.cells[id]==='o'){
        s.level.cells[id]='.';collectToken(s);emit(s,'coin',x+.5);
        s.coinPops.push({x:x+.5,y:y-.5,age:0});s.coinPops=s.coinPops.slice(-32);
    }
    // Also accept a marker introduced by a live terrain edit. Normal level
    // creation already promotes placed pearls into physical rewards.
    if(y>0&&s.level.cells[id]==='G'){
        s.level.cells[id]='.';s.rewards.push({kind:'growth',x:x+.1,y:y-.8,w:.8,h:.8,vx:2,vy:0,age:.4,originY:y+.1});
    }
    const lift=(body:Body&{bumpUntil?:number})=>{
        const feet=body.y+body.h;
        if(body.w<=0||body.vy<0||(body.bumpUntil??0)>s.time||feet<top-.025||feet>y+.04||body.x>=x+1-.001||body.x+body.w<=x+.001)return;
        const delta=(bump.strikerX??s.player.x+s.player.w/2)-(body.x+body.w/2);
        body.vx=(Math.abs(delta)<.02?Math.sign(body.vx)||s.facing:delta>0?-1:1)*Math.max(2,Math.abs(body.vx));
        body.vy=-Math.sqrt(2*26*1.5);body.bumpUntil=s.time+.24;emit(s,'bump',body.x+body.w/2);
    };
    for(const r of s.rewards)if(r.kind==='growth'&&r.age>=.4)lift(r);
    for(const item of s.items)if(item.kind==='giant-pearl'&&item.alive&&!item.held)lift(item);
}
