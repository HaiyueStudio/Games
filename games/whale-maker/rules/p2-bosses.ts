import type { Body, Level, State } from './model';
import type { TurtleBoss } from './fortress';
import type { Services } from './expansion';
import { isP2Boss } from './p2-schema';
import { emit } from './events';
const overlap=(a:Body,b:Body)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
export function initP2Bosses(l:Level):TurtleBoss[]{const out:TurtleBoss[]=[];l.cells.forEach((t,id)=>{if(!isP2Boss(t))return;const size=t==='cat-boss'?3:2,x=id%l.width,y=Math.floor(id/l.width);out.push({x,y,w:size,h:size,vx:0,vy:0,home:x,health:l.properties?.[id]?.durability??(t==='cat-boss'?6:3),age:0,cycle:0,fireAt:2,fired:false,jumpAt:2,hurt:0,facing:-1,phase:'walk',link:l.properties?.[id]?.link??1,brain:{kind:t,mode:'walk',timer:1.4,hits:0,cycle:0,target:[x,y],mirages:[],maxHealth:l.properties?.[id]?.durability??(t==='cat-boss'?6:3)}});l.cells[id]='.';});return out;}
export function defeatP2Boss(s:State,b:TurtleBoss):void {if(b.phase==='fall'||b.phase==='gone')return;b.health=0;b.phase='fall';b.age=0;b.vy=-5;b.vx=0;b.brain!.mirages=[];s.score+=1500;emit(s,'defeat',b.x);}
/** Each boss has a different armor window and resistance, not a shared HP hit. */
export function hitP2Boss(s:State,b:TurtleBoss,attack:string):void {
    const a=b.brain;if(!a||b.health<=0||b.hurt>0)return;
    if(attack==='crush'){defeatP2Boss(s,b);return;}
    const heavy=['stone','turret','heavy','icicle'].includes(attack),red=attack==='red-pow';
    if(a.kind==='cat-boss'&&a.mode!=='vulnerable'&&!heavy||a.kind==='pom-boss'&&a.mode==='hidden'||a.kind==='boom-boss'&&a.mode==='shell'&&!heavy&&attack!=='star'){emit(s,'metal',b.x);return;}
    if(attack==='pow'&&(a.kind==='cat-boss'||a.mode==='climb'||b.vy!==0))return;
    if(attack==='stomp'&&a.kind==='cat-boss')return;
    if(['fire','ice','boomerang','cannon'].includes(attack)){a.hits++;if(a.hits<(a.kind==='cat-boss'?4:3)){b.hurt=.12;emit(s,'hit',b.x);return;}a.hits=0;}
    else if(!heavy&&!red&&!['stomp','pound','hammer','shell','star','block','pow'].includes(attack))return;
    b.health-=heavy?(a.kind==='cat-boss'?2:1):1;b.hurt=.7;a.mode='vulnerable';a.timer=1.1;emit(s,'hit',b.x);if(b.health<=0)defeatP2Boss(s,b);
}
export function updateP2Bosses(s:State,dt:number,svc:Services):void {
    for(const b of s.bosses){const a=b.brain;if(!a||b.health<=0||Math.abs(s.player.x-b.x)>40)continue;
        b.age+=dt;b.hurt=Math.max(0,b.hurt-dt);a.timer-=dt;const p=s.player,old={...b};b.facing=p.x+p.w/2<b.x+b.w/2?-1:1;
        if(a.kind==='boom-boss'){
            if(a.timer<=0){a.cycle++;a.mode=a.mode==='walk'?'telegraph':a.mode==='telegraph'?'shell':a.mode==='shell'?'vulnerable':'walk';a.timer=a.mode==='shell'?2:a.mode==='telegraph'?.5:1.3;}
            b.vx=a.mode==='shell'?b.facing*7:a.mode==='walk'?b.facing*2:0;b.vy=Math.min(18,b.vy+26*dt);const r=svc.move(s,b,dt);if(r.wall){b.vx=-b.vx;a.mode='vulnerable';a.timer=1;}if(r.floor&&a.mode==='telegraph')b.vy=-8;
        }else if(a.kind==='pom-boss'){
            if(a.timer<=0){a.cycle++;if(a.mode==='hidden'){const offsets=[-5,5,0],candidates=offsets.map((_,n)=>b.home+offsets[(n+Math.floor(a.cycle/3))%3]!);for(const x of candidates){if(Math.abs(x-b.x)>.1&&x>=0&&x+b.w<s.level.width){const box={...b,x,y:a.target[1]};let clear=true;for(let yy=Math.floor(box.y);yy<box.y+box.h;yy++)for(let xx=Math.floor(x);xx<x+b.w;xx++)if(svc.solid(s.level.cells[yy*s.level.width+xx]!,s.pTime,s.redOn))clear=false;if(clear){b.x=x;break;}}}a.mode='telegraph';a.timer=1.1;a.mirages=[-4,4].map(dx=>({...b,x:Math.max(0,Math.min(s.level.width-b.w,b.x+dx))}));}
                else if(a.mode==='telegraph'){a.mode='vulnerable';a.timer=1.8;if(s.magicShots.length<24){s.magicShots.push({kind:'ninja',x:b.x+b.w/2,y:b.y+.4,w:.55,h:.55,vx:b.facing*6,vy:-1,age:0,owner:b});emit(s,'throw',b.x);}}
                else{a.mode='hidden';a.timer=.8;a.mirages=[];emit(s,'door',b.x);}}
            b.vx=0;b.vy=Math.min(18,b.vy+26*dt);svc.move(s,b,dt);
            for(const mirror of a.mirages)if(overlap(p,mirror)){emit(s,'ice',mirror.x);mirror.w=0;}a.mirages=a.mirages.filter(m=>m.w>0);
        }else{
            if(a.timer<=0){a.cycle++;if(a.mode==='walk'||a.mode==='vulnerable'){a.mode='climb';a.target=[b.x,Math.max(1,p.y-7)];a.timer=1.2;}
                else if(a.mode==='climb'){a.mode='telegraph';a.target=[p.x,p.y];a.timer=.65;}
                else if(a.mode==='telegraph'){a.mode='pounce';b.vx=Math.max(-8,Math.min(8,(a.target[0]-b.x)*2));b.vy=10;a.timer=1.5;}
                else{a.mode='vulnerable';a.timer=1.6;}}
            if(a.mode==='climb'){b.vx=0;b.y=Math.max(a.target[1],b.y-7*dt);b.vy=0;}
            else if(a.mode==='telegraph'){b.vx=b.vy=0;}
            else{if(a.mode!=='pounce')b.vx=a.mode==='walk'?b.facing:0;b.vy=Math.min(20,b.vy+24*dt);const r=svc.move(s,b,dt);if(r.floor&&a.mode==='pounce'){a.mode='vulnerable';a.timer=1.8;s.shake=.5;emit(s,'stone',b.x);}}
            if(a.mode==='vulnerable'&&a.timer>1.45&&!b.fired){b.fired=true;if(s.bossFire.length<24)s.bossFire.push({x:b.x+b.w/2,y:b.y+1,w:1,h:.5,vx:b.facing*6,vy:0,age:0});}if(a.mode==='climb')b.fired=false;
        }
        if(a.mode!=='hidden'&&overlap(p,b)&&!s.pipe){if(s.starTime>0)hitP2Boss(s,b,'star');else if(p.vy>=0&&p.y+p.h<=old.y+.5&&a.mode!=='shell'&&a.kind!=='cat-boss'){hitP2Boss(s,b,s.pound==='fall'?'pound':'stomp');p.y=b.y-p.h;p.vy=-12;s.grounded=false;s.pound='none';emit(s,'stomp',b.x);}else svc.hurt(s);}
    }
}
