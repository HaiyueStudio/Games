import type { Body, Enemy, Input, Item, Level, State, Tile } from './model';
import type { Services } from './expansion';
import { setCell } from './terrain';
import { emit } from './events';
import { bounceHorizontalSpring, bounceVerticalSpring } from './springs';

export const SAND_SINK_SPEED=.25;
const overlap=(a:Body,b:Body)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const cell=(l:Level,x:number,y:number):Tile=>x<0||y<0||x>=l.width||y>=l.height?'.':l.cells[Math.floor(y)*l.width+Math.floor(x)]!;

export function cactusCells(l:Level,id:number):number[]{
    if(l.cells[id]==='cactus-body'){
        for(let n=id+l.width;n<l.cells.length;n+=l.width){if(l.cells[n]==='cactus')return cactusCells(l,n);if(l.cells[n]!=='cactus-body')break;}return [];
    }
    return l.cells[id]==='cactus'?Array.from({length:l.properties?.[id]?.height??3},(_,n)=>id-n*l.width):[];
}
/** The editor anchor is the bottom segment; all reserved cells move together. */
export function placeCactus(l:Level,x:number,y:number,height=3):boolean {
    if(x<0||x>=l.width||y>=l.height||y-height+1<0||height<1||height>8)return false;
    const id=y*l.width+x,old=cactusCells(l,id),next=Array.from({length:height},(_,n)=>id-n*l.width);
    if(next.some(n=>!old.includes(n)&&l.cells[n]!=='.'))return false;
    for(const n of old)if(!next.includes(n))setCell(l,n,'.');
    for(const [n,target]of next.entries())setCell(l,target,n?'cactus-body':'cactus');
    (l.properties??={})[id]={...l.properties?.[id],height};return true;
}
export function hitCactus(s:State,e:Enemy,shot:Body,svc:Services):void {
    if(!e.alive)return;
    if(shot.y<e.y+1&&shot.y+shot.h>e.y){svc.defeat(s,e,'shot');return;}
    desertEffect(s,'cactus',shot.x+shot.w/2,shot.y+shot.h/2);
    const feet=e.y+e.h;e.cactusSegments=Math.max(1,(e.cactusSegments??Math.round(e.h))-1);e.h=e.cactusSegments;e.y=feet-e.h;e.cactusDrop=.15;
    emit(s,'bump',e.x);
}

/** Find a contiguous sand column touched by the feet or crossed this step. */
function sandColumn(l:Level,b:Body,oldFeet:number):{top:number;bottom:number}|null {
    let found:{top:number;bottom:number}|null=null;
    for(const x of [b.x+.02,b.x+b.w/2,b.x+b.w-.02]){
        for(let y=Math.max(0,Math.floor(Math.min(b.y,oldFeet)-.02));y<=Math.min(l.height-1,Math.floor(b.y+b.h+.025));y++){
            if(cell(l,x,y)!=='quicksand')continue;
            let top=y,bottom=y+1;while(top>0&&cell(l,x,top-1)==='quicksand')top--;while(bottom<l.height&&cell(l,x,bottom)==='quicksand')bottom++;
            if(b.y+b.h>=top-.02&&b.y<bottom&&(!found||top<found.top))found={top,bottom};break;
        }
    }return found;
}
export function sandJump(b:Body):void {
    if(b.vy>=0)b.sandJumping=false;
    else if(!b.sandJumping){if((b.sandDepth??0)>.5)b.vy*=Math.SQRT1_2;b.sandJumping=true;}
}
/** Gravity lands on the surface, then yields to the much slower sinking rate. */
export function resolveSand(s:State,b:Body,oldX:number,oldFeet:number,dt:number,blockedFloor=false):boolean {
    const column=sandColumn(s.level,b,oldFeet);
    if(!column){delete b.sandSurface;b.sandDepth=0;return false;}
    b.sandSurface=column.top;
    if(b.vy>=0){
        const moving=Math.abs(b.x-oldX)>1e-6,feet=Math.max(column.top,oldFeet)+SAND_SINK_SPEED*(moving?.5:1)*dt;
        b.y=Math.min(blockedFloor?b.y+b.h:column.bottom,feet)-b.h;b.vy=0;b.sandJumping=false;
    }
    b.sandDepth=Math.max(0,b.y+b.h-column.top);
    return b.vy>=0;
}
export function desertEffect(s:State,kind:'snow'|'cactus',x:number,y:number):void {
    s.effects.push({kind,x,y,w:1,h:1,vx:0,vy:0,age:0});s.effects=s.effects.slice(-64);emit(s,kind==='snow'?'ice':'break',x);
}
export function breakSnowball(s:State,item:Item):void {
    if(!item.alive)return;item.alive=false;item.held=false;if(s.held===item)s.held=null;desertEffect(s,'snow',item.x+item.w/2,item.y+item.h/2);
}
const snowTarget=(e:Enemy)=>e.alive&&!e.held&&e.kind!=='ghost'&&e.kind!=='fire-jumper'&&!(e.kind==='plant'&&Math.min(e.w,e.h)<.08);
export function heldSnowContact(s:State,e:Enemy,svc:Services):boolean {
    const snow=s.held;if(snow?.kind!=='snowball'||!snow.alive||!snowTarget(e)||!overlap(snow,e))return false;
    svc.defeat(s,e,'shell',snow);breakSnowball(s,snow);return true;
}
function snowBrickImpact(s:State,item:Item,wall:number,ceiling:boolean,floor:boolean,svc:Services):void {
    const targets=new Set<number>();
    if(wall){const x=Math.floor(wall>0?item.x+item.w+.01:item.x-.01);for(let y=Math.floor(item.y+.001);y<=Math.floor(item.y+item.h-.001);y++)targets.add(y*s.level.width+x);}
    else{const y=Math.floor(ceiling?item.y-.01:item.y+item.h+.01);for(let x=Math.floor(item.x+.001);x<=Math.floor(item.x+item.w-.001);x++)targets.add(y*s.level.width+x);}
    for(const id of targets)if(id>=0&&id<s.level.cells.length)svc.hitBlock(s,id%s.level.width,Math.floor(id/s.level.width),s.level.cells[id]!,floor);
    breakSnowball(s,item);
}
export function updateSnowball(s:State,item:Item,i:Input,dt:number,svc:Services):void {
    item.age+=dt;item.cooldown=Math.max(0,item.cooldown-dt);if(item.held||item.transit)return;
    const p=s.player,side=p.y<item.y+item.h-.05&&p.y+p.h>item.y+.05;
    const near=side&&p.x<item.x+item.w+.04&&p.x+p.w>item.x-.04;
    if(near&&i.grab&&item.kind!=='snowball-large'&&!item.large&&!s.held&&item.cooldown===0){item.held=true;item.vx=item.vy=0;item.thrown=false;s.held=item;emit(s,'grab',item.x);return;}
    const onTop=p.vy>=0&&Math.abs(p.y+p.h-item.y)<.05&&p.x<item.x+item.w&&p.x+p.w>item.x;
    if(onTop&&item.cooldown===0){item.vx=0;item.thrown=false;item.cooldown=.2;}
    const pushing=near&&!item.thrown&&i.axis!==0&&(item.x+item.w/2-p.x-p.w/2)*i.axis>0;
    if(pushing)item.vx=p.pushVx??p.vx;
    const old={...item},impactVy=item.vy+26*dt,vx=item.vx;item.vy=Math.min(18,impactVy);
    const hit=svc.move(s,item,dt);if(!item.alive)return;const sprung=bounceVerticalSpring(s,item,old);bounceHorizontalSpring(s,item,old);
    const ceiling=impactVy<0&&item.vy===0;
    if(hit.wall||ceiling){snowBrickImpact(s,item,hit.wall,ceiling,false,svc);return;}
    if(hit.floor&&!sprung&&impactVy>4&&['B','?','hidden-block'].includes(cell(s.level,item.x+item.w/2,item.y+item.h+.01))){snowBrickImpact(s,item,0,false,true,svc);return;}
    if(Math.abs(vx)>.05||item.thrown)for(const e of s.enemies)if(snowTarget(e)&&overlap(item,e)){svc.defeat(s,e,'shell',item);breakSnowball(s,item);return;}
    if(pushing&&item.alive)p.vx=p.pushVx??p.vx;
    else if(hit.floor&&!item.thrown)item.vx=Math.sign(item.vx)*Math.max(0,Math.abs(item.vx)-10*dt);
    if(item.y>s.level.height+2)item.alive=false;
}
