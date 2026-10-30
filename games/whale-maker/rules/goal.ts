import type { Body, State } from './model';
import { emit } from './events';

/** Original FlagPole is 72 map units; one tile is 8 units (144 NES pixels). */
export const GOAL_HEIGHT=9;
export const poleHeight=(s:Pick<State,'level'>,x:number,y:number)=>Math.min(y,s.level.properties?.[y*s.level.width+x]?.goalHeight??GOAL_HEIGHT);
export function goalAt(s:State):{x:number;y:number}|null {
    const p=s.player;
    for(let y=Math.max(0,Math.floor(p.y)-1);y<Math.min(s.level.height,Math.ceil(p.y+p.h+24));y++)
        for(let x=Math.max(0,Math.floor(p.x)-1);x<=Math.min(s.level.width-1,Math.ceil(p.x+p.w));x++){
            if(s.level.cells[y*s.level.width+x]!=='E')continue;
            if(s.level.finish==='castle'){if(p.x<x+1&&p.x+p.w>=x-.03&&p.y<y+1&&p.y+p.h>y-1)return {x,y};continue;}
            const pole=x+.5,base=y,top=Math.max(0,base-poleHeight(s,x,y));
            if(p.x<=pole+.1&&p.x+p.w>=pole-.1&&p.y<base&&p.y+p.h>top)return {x,y};
        }
    return null;
}
export function goalPoints(s:State,y:number):number {
    const x=s.goalCells.find(id=>Math.floor(id/s.level.width)===y&&Math.abs(id%s.level.width-s.player.x)<2);return Math.round((100+4900*Math.max(0,Math.min(1,(y-(s.player.y+s.player.h))/Math.max(1,x===undefined?Math.min(GOAL_HEIGHT,y):poleHeight(s,x%s.level.width,y)))))/100)*100;
}
export function updateGoal(s:State,dt:number,move:(s:State,b:Body,dt:number)=>{floor:boolean}):void {
    const v=s.victory!,p=s.player;p.vx=0;
    if(v.stage==='slide'){
        p.x=v.poleX-p.w*.65;const delta=v.baseY-p.y;p.y+=Math.min(Math.max(0,delta),5*dt);p.vy=delta>0?5:0;
        v.flagProgress=Math.max(0,Math.min(1,(p.y-(v.startY??p.y))/Math.max(.001,v.baseY-(v.startY??p.y))));
        if(delta<=.001){emit(s,'victory');p.y=v.baseY;v.stage='cheer';v.ready=true;v.age=0;v.flagProgress=1;p.vy=0;s.grounded=true;}
    }else if(v.stage==='approach'){
        const target=v.poleX-.5-p.w-.1,oldX=p.x;p.vx=Math.min(2.6,Math.max(0,(target-p.x)/dt));p.vy=Math.min(18,p.vy+30*dt);
        s.grounded=move(s,p,dt).floor;s.stride+=Math.max(0,p.x-oldX)*1.7;s.facing=1;
        if(target-p.x<.015&&s.grounded){v.stage='cheer';v.ready=true;v.age=0;v.baseY=p.y;p.vx=p.vy=0;emit(s,'victory');}
    }else if(v.stage==='cheer'){
        v.age+=dt;
        const hop=(start:number,duration:number,height:number)=>{const t=(v.age-start)/duration;return t>0&&t<1?-4*height*t*(1-t):0;};
        const oldY=p.y;p.y=v.baseY+hop(.14,.7,1.6)+hop(.96,.44,.55);p.vy=(p.y-oldY)/dt;s.grounded=p.y===v.baseY;
        if(v.age>=1.5){v.stage='walk';p.vy=0;p.y=v.baseY;}
    }else if(v.stage==='walk'){
        const oldX=p.x;p.vx=Math.min(2.6,Math.max(0,(v.castleX-p.x)/dt));p.vy=Math.min(18,p.vy+30*dt);
        if(s.level.finish==='castle'){p.x+=p.vx*dt;p.y=v.baseY;p.vy=0;s.grounded=true;}else s.grounded=move(s,p,dt).floor;
        s.stride+=Math.max(0,p.x-oldX)*1.7;s.facing=1;
        if(v.castleX-p.x<.01){v.stage='done';p.vx=0;v.age=1.5;}
    }else if(v.stage==='done')v.age=Math.min(2,v.age+dt);
}
