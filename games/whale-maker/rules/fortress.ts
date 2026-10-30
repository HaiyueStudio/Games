import {hitP2Boss} from './p2-bosses';
import type { Body, Level, State } from './model';
import type { Services } from './expansion';
import { emit } from './events';
import { setCell } from './terrain';
const tile=(l:Level,x:number,y:number)=>x<0||y<0||x>=l.width||y>=l.height?'.':l.cells[Math.floor(y)*l.width+Math.floor(x)]!;
const overlaps=(a:Body,b:Body)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;

export interface TurtleBoss extends Body { home:number;health:number;age:number;cycle:number;fireAt:number;fired:boolean;jumpAt:number;hurt:number;facing:number;phase:'walk'|'breath'|'fall'|'gone';link:number;brain?:import('./p2').P2BossBrain }
export interface MovingPlatform extends Body { axis:'x'|'y';start:number;end:number;direction:number;speed:number;loop:boolean }
export interface FortressState { bosses:TurtleBoss[];bossFire:(Body&{age:number})[];platforms:MovingPlatform[];bridgeAnchors:{x:number;y:number}[];bridgeCollapse:{cells:number[];age:number;removed:number;link:number}|null;bridgeDebris:(Body&{age:number})[];releasedBells:Record<string,true> }

export function bossCells(l:Level,id:number):number[]{
    if(l.cells[id]==='boss-body')for(const n of [id-1,id-l.width,id-l.width-1])if(l.cells[n]==='turtle-boss'&&id%l.width>=n%l.width&&id%l.width<=n%l.width+1)return [n,n+1,n+l.width,n+l.width+1];
    return l.cells[id]==='turtle-boss'?[id,id+1,id+l.width,id+l.width+1]:[];
}
export function placeBoss(l:Level,x:number,y:number):void {
    if(x<0||y<0||x+2>l.width||y+2>l.height)return;
    const id=y*l.width+x;for(const n of [id,id+1,id+l.width,id+l.width+1])setCell(l,n,n===id?'turtle-boss':'boss-body');
}
export function initFortress(l:Level):FortressState {
    const bosses:TurtleBoss[]=[],platforms:MovingPlatform[]=[],bridgeAnchors:{x:number;y:number}[]=[];
    l.cells.forEach((t,id)=>{
        const x=id%l.width,y=Math.floor(id/l.width),p=l.properties?.[id];
        if(t==='bridge'&&(tile(l,x-1,y)!=='bridge'||tile(l,x+1,y)!=='bridge'))bridgeAnchors.push({x:x+.5,y:y+.3});
        if(t==='turtle-boss'){bosses.push({x,y,w:2,h:2,vx:0,vy:0,home:x,health:5,age:0,cycle:0,fireAt:2.2,fired:false,jumpAt:3.4,hurt:0,facing:-1,phase:'walk',link:p?.link??1});for(const n of bossCells(l,id))l.cells[n]='.';}
        if(t==='moving-platform'){
            const axis=p?.axis??'x',start=p?.range?.[0]??(axis==='x'?x-3:y-3),end=p?.range?.[1]??(axis==='x'?x+3:y+3);
            platforms.push({x,y,w:p?.length??3,h:.25,vx:0,vy:0,axis,start,end,direction:(p?.speed??2)<0?-1:1,speed:Math.abs(p?.speed??2),loop:p?.loop??false});l.cells[id]='.';
        }
    });
    return {bosses,platforms,bridgeAnchors,bossFire:[],bridgeCollapse:null,bridgeDebris:[],releasedBells:{}};
}

export function advancePlatforms(s:State,dt:number,svc:Services):void {
    for(const platform of s.platforms){
        const old={...platform},key=platform.axis;
        let next=platform[key]+platform.direction*platform.speed*dt;
        if(next>platform.end||next<platform.start){if(platform.loop)next=platform.direction>0?platform.start:platform.end;else{next=Math.max(platform.start,Math.min(platform.end,next));platform.direction*=-1;}}
        platform[key]=next;const dx=platform.x-old.x,dy=platform.y-old.y;
        platform.vx=dx/dt;platform.vy=dy/dt;
        if(Math.abs(dx)+Math.abs(dy)>1)continue; // Elevator recycling never teleports riders.
        for(const b of [s.player,...s.enemies,...s.items])if(b.vy>=0&&Math.abs(b.y+b.h-old.y)<.045&&b.x<old.x+old.w&&b.x+b.w>old.x){
            const vx=b.vx,vy=b.vy;b.vx=dx/dt;b.vy=dy/dt;svc.move(s,b,dt);b.vx=vx;b.vy=vy;
        }
    }
}
export function damageBoss(s:State,b:TurtleBoss,attack='fire'):void {
    if(b.brain){hitP2Boss(s,b,attack);return;}
    if(b.phase==='fall'||b.phase==='gone'||b.hurt>0)return;
    b.health--;b.hurt=.22;emit(s,'hit',b.x+1);
    if(b.health<=0)dropBoss(s,b);
}
function dropBoss(s:State,b:TurtleBoss):void {
    if(b.phase==='fall'||b.phase==='gone')return;
    b.phase='fall';b.health=0;b.vx=0;b.vy=-3;b.age=0;s.score+=1000;emit(s,'defeat',b.x+1);
}
export function releaseBridge(s:State,id:number):void {
    if(s.releasedBells[id]||s.bridgeCollapse)return;
    s.releasedBells[id]=true;const link=s.level.properties?.[id]?.link??1;
    const cells=s.level.cells.flatMap((t,n)=>t==='bridge'&&(s.level.properties?.[n]?.link??1)===link?[n]:[]).sort((a,b)=>b-a);
    if(!cells.length)return;
    s.bridgeCollapse={cells,age:0,removed:0,link};s.shake=.5;emit(s,'switch',id%s.level.width);s.notice='吊桥机关启动！';
}
export function updateFortress(s:State,dt:number,svc:Services):void {
    const collapse=s.bridgeCollapse;
    if(collapse){
        collapse.age+=dt;const count=Math.min(collapse.cells.length,Math.floor(collapse.age/.055));
        while(collapse.removed<count){const id=collapse.cells[collapse.removed++]!,x=id%s.level.width,y=Math.floor(id/s.level.width);setCell(s.level,id,'.');s.bridgeDebris.push({x,y,w:1,h:.3,vx:(collapse.removed%3-1)*1.2,vy:1,age:0});emit(s,'break',x);}
    }
    for(const d of s.bridgeDebris){d.age+=dt;d.vy+=20*dt;d.x+=d.vx*dt;d.y+=d.vy*dt;}s.bridgeDebris=s.bridgeDebris.filter(d=>d.age<1.5).slice(-48);
    for(const b of s.bosses){
        if(b.phase==='gone')continue;
        if(b.health>0){
            for(const stone of s.stones)if(stone.phase==='charge'&&overlaps(stone,b)){damageBoss(s,b,'stone');stone.phase='pause';stone.timer=.5;}
            for(const turret of s.turrets)if(turret.vy>2&&overlaps(turret,b))damageBoss(s,b,'turret');
            for(const item of s.items)if(item.alive&&!item.held&&item.thrown&&Math.hypot(item.vx,item.vy)>3&&overlaps(item,b)){if(item.kind==='pow'||item.kind==='red-pow')svc.activatePow?.(s,item);else if(item.kind==='basin'||item.kind==='wood-crate'){damageBoss(s,b,'heavy');item.alive=false;}}
        }
        if(b.brain&&b.phase!=='fall')continue;
        b.age+=dt;b.hurt=Math.max(0,b.hurt-dt);
        if(b.phase==='fall'){b.vy+=18*dt;b.y+=b.vy*dt;if(b.age>2||b.y>s.level.height+3)b.phase='gone';continue;}
        if(b.brain)continue;
        if(s.phase!=='playing'||Math.abs(s.player.x-b.x)>30)continue;
        const feet=Math.floor(b.y+b.h+.03);
        if(b.y>s.level.height+2||collapse&&collapse.link===b.link&&(collapse.removed===collapse.cells.length||[Math.floor(b.x),Math.floor(b.x+1)].some(x=>collapse.cells.includes(feet*s.level.width+x)&&tile(s.level,x,feet)!=='bridge'))){dropBoss(s,b);continue;}
        b.cycle+=dt;b.facing=s.player.x+s.player.w/2<b.x+1?-1:1;
        b.phase=b.cycle>=b.fireAt-.65?'breath':'walk';
        if(b.cycle>=b.fireAt-.28&&!b.fired){
            if(s.bossFire.length<24)s.bossFire.push({x:b.x+(b.facing<0?-.9:1.9),y:b.y+1.1,w:1,h:.45,vx:b.facing*5.2,vy:0,age:0});
            emit(s,'fire',b.x+1);b.fired=true;
        }
        if(b.cycle>=b.fireAt){b.cycle=0;b.fired=false;b.phase='walk';}
        b.jumpAt-=dt;let pace=b.phase==='breath'?0:(b.x>b.home+1.8?-1:b.x<b.home-1.8?1:Math.sign(b.vx)||-1);
        b.vx=pace*1.05;b.vy=Math.min(16,b.vy+22*dt);const r=svc.move(s,b,dt);
        if(r.wall)b.vx=-pace*1.05;
        if(r.floor&&b.jumpAt<=0){b.vy=-8.3;b.jumpAt=3.4;}
        if(overlaps(s.player,b)&&!s.pipe){
            if(s.starTime>0)damageBoss(s,b);
            else if(s.spinning&&s.player.vy>=0&&s.player.y+s.player.h<b.y+.55){s.player.y=b.y-s.player.h;s.player.vy=-11;s.grounded=false;s.spinAge=0;emit(s,'stomp',b.x);}
            else svc.hurt(s);
        }
    }
    for(const f of s.bossFire){
        f.age+=dt;f.x+=f.vx*dt;
        if(!s.pipe&&overlaps(s.player,f)){svc.hurt(s);f.age=9;}
        for(let y=Math.floor(f.y);y<=Math.floor(f.y+f.h-.001);y++)for(let x=Math.floor(f.x);x<=Math.floor(f.x+f.w-.001);x++)if(svc.solid(tile(s.level,x,y),s.pTime,s.redOn))f.age=9;
    }
    s.bossFire=s.bossFire.filter(f=>f.age<8&&Math.abs(f.x-s.player.x)<34&&f.x>=0);
}
