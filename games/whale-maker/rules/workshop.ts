import {pathBlocked} from './p1-mechanisms';
import { rulesFor } from './profile';
import { releaseContent } from './containers';
import type { State, Level, Body, Enemy, Item, Input, Tile } from './model';
import type { Services } from './expansion';
import { emit } from './events';
import { bounceHorizontalSpring, bounceVerticalSpring } from './springs';
import { setCell } from './terrain';
import { snakePath, pathPoint, pathLength, initialSnake, type SnakePoint } from './snake-path';
export interface SnakeRoute {kind?:string;active?:boolean;done?:boolean;speed?:number;loop?:boolean;anchor:number;path:SnakePoint[];length:number;travel:number;direction:number;blocks:Body[]}
export interface Hammer extends Body {age:number;angle:number}
export interface WorkshopState {snakes:SnakeRoute[];hammers:Hammer[]}
const cell=(l:Level,x:number,y:number):Tile=>x<0||y<0||x>=l.width||y>=l.height?'.':l.cells[Math.floor(y)*l.width+Math.floor(x)]!;
const overlap=(a:Body,b:Body)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
export const isBrick=(t:Tile)=>['B','?','U','='].includes(t);
export function surface(s:State,b:Body):{boost:number;grip:number;brake:number}{
    const x=b.x+b.w/2,y=b.y+b.h+.025,t=cell(s.level,x,y),p=s.level.properties?.[Math.floor(y)*s.level.width+Math.floor(x)];
    const slippery=(t==='ice'||t==='ice-solid')&&p?.slippery!==false;
    return {boost:t==='quicksand'&&rulesFor(s.level).rewards==='score'?.55:t==='speed-belt'?2:1,grip:slippery?.5:1,brake:slippery?.25:1};
}
export function initWorkshop(l:Level):WorkshopState{
    const snakes:SnakeRoute[]=[];
    l.cells.forEach((t,id)=>{if(t==='snake-block'||t==='snake-fast'){const path=structuredClone(snakePath(l,id));snakes.push({kind:t,active:l.properties?.[id]?.trigger==='auto'||t==='snake-block'&&l.properties?.[id]?.trigger!=='step',done:false,speed:l.properties?.[id]?.pace??(t==='snake-fast'?2:1),loop:l.properties?.[id]?.trigger==='auto'||l.properties?.[id]?.trigger!=='step'&&t==='snake-block',anchor:id,path,length:pathLength(path),travel:0,direction:1,blocks:initialSnake(l,id)});l.cells[id]='.';}});
    return {snakes,hammers:[]};
}
function carryBy(s:State,old:Body,block:Body,dt:number,svc:Services,carried:Set<Body>):void{
    const dx=block.x-old.x,dy=block.y-old.y;
    for(const body of [s.player,...s.enemies.filter(e=>e.alive&&!e.held),...s.items.filter(i=>i.alive&&!i.held)]){
        const riding=body.vy>=0&&Math.abs(body.y+body.h-old.y)<.04&&body.x<old.x+old.w-.001&&body.x+body.w>old.x+.001;
        if(riding&&carried.has(body))continue;
        if(!riding&&!overlap(body,block))continue;
        const vx=body.vx,vy=body.vy;
        const pushX=riding?dx:dx>0?block.x+block.w-body.x:dx<0?block.x-body.x-body.w:0;
        const pushY=riding?dy:dy>0?block.y+block.h-body.y:dy<0?block.y-body.y-body.h:0;
        body.vx=pushX/dt;body.vy=pushY/dt;svc.move(s,body,dt,body===s.player);body.vx=vx;body.vy=vy;
        if(riding)carried.add(body);
        if(overlap(body,block)&&!riding){if(body===s.player)svc.crush(s);else if('kind'in body&&'cooldown'in body&&s.enemies.includes(body as Enemy))svc.defeat(s,body as Enemy,'block');else (body as Item).alive=false;}
    }
}
export function advanceWorkshop(s:State,dt:number,svc:Services):void{
    const carried=new Set<Body>();
    for(const route of s.snakes){
        if(route.done)continue;
        if(!route.active){route.active=[s.player,...s.enemies,...s.items].some(b=>b.vy>=0&&route.blocks.some(q=>Math.abs(b.y+b.h-q.y)<.05&&b.x<q.x+1&&b.x+b.w>q.x));if(!route.active)continue;}
        const span=Math.max(0,route.length-route.blocks.length+1);let travel=route.travel+route.direction*dt*(route.speed??1);
        if(travel>span){if(!route.loop){travel=span;route.done=true;}else{travel=span-(travel-span);route.direction=-1;}}if(travel<0){travel=-travel;route.direction=1;}if(span===0)travel=0;route.travel=travel;
        const old=route.blocks.map(b=>({...b}));
        route.blocks.forEach((b,n)=>{const [x,y]=pathPoint(route.path,travel+n);b.x=route.anchor%s.level.width+x;b.y=Math.floor(route.anchor/s.level.width)+y;b.vx=(b.x-old[n]!.x)/dt;b.vy=(b.y-old[n]!.y)/dt;});
        if(rulesFor(s.level).rewards==='score'&&route.blocks.some(b=>pathBlocked(s,b,svc))){route.blocks.forEach((b,n)=>Object.assign(b,old[n]));route.travel=Math.max(0,travel-route.direction*dt*(route.speed??1));route.done=true;continue;}
        route.blocks.forEach((b,n)=>carryBy(s,old[n]!,b,dt,svc,carried));
    }
    // Fuses continue while carried, travelling through doors/pipes, or off-screen.
    for(const e of s.enemies)if(e.alive&&e.kind==='bomb'&&e.bombFuse!==undefined&&!e.frozen){e.bombFuse=Math.max(0,e.bombFuse-dt);if(e.bombFuse<1e-8)explodeBomb(s,e,svc);}
    for(const h of s.hammers){h.age+=dt;h.vy+=20*dt;h.x+=h.vx*dt;h.y+=h.vy*dt;h.angle+=Math.sign(h.vx)*14*dt;if(overlap(h,s.player))svc.hurt(s,h.y<s.player.y?'top':'side');}
    s.hammers=s.hammers.filter(h=>h.age<4&&h.y<s.level.height+2&&h.x> -2&&h.x<s.level.width+2&&Math.abs(h.x-s.player.x)<34);
}
export function woodEffect(s:State,item:Body):void{emit(s,'break',item.x);s.effects.push({kind:'wood',x:item.x+item.w/2,y:item.y+item.h/2,w:1,h:1,vx:0,vy:0,age:0});s.effects=s.effects.slice(-64);}
export function breakCrate(s:State,item:Item):void{if(!item.alive)return;releaseContent(s,item);item.alive=false;item.held=false;if(s.held===item)s.held=null;woodEffect(s,item);}
export function updateCrate(s:State,item:Item,i:Input,dt:number,svc:Services):void{
    item.age+=dt;item.cooldown=Math.max(0,item.cooldown-dt);if(item.held||item.transit)return;
    const old={...item};item.vy=Math.min(18,item.vy+26*dt);const vx=item.vx,hit=svc.move(s,item,dt);if(!item.alive)return;
    // The upper edge of the first water cell is the buoyant resting surface.
    const x=item.x+item.w/2;let waterY:number|undefined;
    for(let y=Math.max(0,Math.floor(old.y));y<=Math.min(s.level.height-1,Math.ceil(item.y+item.h));y++)if(['water','lava'].includes(cell(s.level,x,y))&&!['water','lava'].includes(cell(s.level,x,y-1))){waterY=y;break;}
    if(waterY===undefined)for(const sample of [item.y+item.h*.5,item.y+item.h-.01]){let row=Math.floor(sample);if(!['water','lava'].includes(cell(s.level,x,row)))continue;while(row>0&&['water','lava'].includes(cell(s.level,x,row-1)))row--;waterY=row;break;}
    if(waterY!==undefined&&item.y+item.h>=waterY+.22){
        item.vy+=((waterY+.22-item.y-item.h)*65-26)*dt;item.vy*=Math.exp(-8*dt);
        if(Math.abs(item.y+item.h-waterY-.22)<.02&&Math.abs(item.vy)<.2){item.y=waterY+.22-item.h;item.vy=0;}
    }
    if(hit.wall)item.vx=0;
    if(bounceVerticalSpring(s,item,old))hit.floor=false;
    bounceHorizontalSpring(s,item,old);
    if(item.thrown)for(const e of s.enemies)if(e.alive&&!e.held&&overlap(item,e)){svc.defeat(s,e,'shell',item);breakCrate(s,item);break;}
    if(item.thrown&&hit.wall){breakCrate(s,item);return;}
    if(hit.floor||waterY!==undefined&&item.y+item.h>=waterY){item.vx=Math.sign(item.vx)*Math.max(0,Math.abs(item.vx)-18*dt);if(Math.abs(item.vx)<.1)item.thrown=false;}
    if(item.y>s.level.height+2)item.alive=false;
    if(item.alive&&item.cooldown===0&&i.grab&&!s.held&&Math.abs(vx)<5&&s.player.x<item.x+item.w+.035&&s.player.x+s.player.w>item.x-.035&&s.player.y<item.y+item.h&&s.player.y+s.player.h>item.y-.035){item.held=true;item.vx=item.vy=0;item.thrown=false;s.held=item;emit(s,'grab',item.x);}
}
export function armBomb(s:State,e:Enemy):void{if(e.bombFuse!==undefined)return;e.bombFuse=5;e.vx=e.vy=0;e.bombThrown=false;e.cooldown=.15;emit(s,'switch',e.x);}
export const BOMB_BOUNCE_SPEED=Math.sqrt(13);
export function launchBomb(e:Enemy,direction:number,mode:'stomp'|'kick'|'throw'):void{
    const travelTime=2*(Math.sqrt(26)+BOMB_BOUNCE_SPEED)/26;
    e.bombFlight=mode;e.bombBounces=0;e.bombThrown=true;e.attackChain=0;e.vx=direction*(mode==='throw'?12:(mode==='kick'?5:4)/travelTime);e.vy=-Math.sqrt(mode==='throw'?78:26);e.cooldown=.25;e.grounded=false;
}
export function explodeBomb(s:State,e:Enemy,svc:Services):void{
    if(!e.alive)return;e.alive=false;e.held=false;if(s.held===e)s.held=null;
    const cx=Math.floor(e.x+e.w/2),cy=Math.floor(e.y+e.h/2),blast={x:cx-1,y:cy-1,w:3,h:3,vx:0,vy:0};
    for(let y=cy-1;y<=cy+1;y++)for(let x=cx-1;x<=cx+1;x++)if(cell(s.level,x,y)==='B'){setCell(s.level,y*s.level.width+x,'.');for(let n=0;n<4;n++)s.fragments.push({x:x+.25+n%2*.5,y:y+.25+Math.floor(n/2)*.5,w:.3,h:.3,vx:n%2?3:-3,vy:n<2?-8:-5,age:0,angle:0});}
    s.fragments=s.fragments.slice(-128);
    for(const item of s.items)if(item.alive&&item.kind==='wood-crate'&&overlap(blast,item))breakCrate(s,item);
    for(const other of s.enemies)if(other!==e&&other.alive&&other.kind!=='ghost'&&other.kind!=='fire-jumper'&&overlap(blast,other))svc.defeat(s,other,'pow');
    if(overlap(blast,s.player))svc.hurt(s);
    s.effects.push({kind:'blast',x:cx+.5,y:cy+.5,w:3,h:3,vx:0,vy:0,age:0});s.effects=s.effects.slice(-64);s.shake=Math.max(s.shake,.25);emit(s,'pow',cx+.5);
}
/** Armed bombs are harmless to touch and can be picked up from the boundary. */
export function bombContact(s:State,e:Enemy,i:Input,before:number,svc:Services):boolean{
    if(e.kind!=='bomb')return false;
    const p=s.player,near=p.x<e.x+e.w+.025&&p.x+p.w>e.x-.025&&p.y<e.y+e.h+.025&&p.y+p.h>e.y-.025;
    if(e.bombFuse!==undefined&&e.cooldown<=0&&near&&i.grab&&!s.held){e.held=true;e.vx=e.vy=0;e.bombThrown=false;s.held=e;emit(s,'grab',e.x);return true;}
    if(!overlap(p,e)||e.cooldown>0)return true;
    if(p.vy>=0&&before<=e.y+.25){
        const armed=e.bombFuse!==undefined;armBomb(s,e);
        if(armed){const dir=Math.sign(e.x+e.w/2-p.x-p.w/2)||s.facing;launchBomb(e,dir,'stomp');}
        p.y=e.y-p.h;p.vy=i.jump||i.spin?-13.5:-7;s.grounded=false;s.coyote=0;s.jumpSustain=!!(i.jump||i.spin);s.jumpCut=false;s.pound='none';e.cooldown=.2;emit(s,'stomp',e.x);
    }else if(e.bombFuse===undefined)svc.hurt(s);
    else{launchBomb(e,Math.sign(e.x+e.w/2-p.x-p.w/2)||s.facing,'kick');emit(s,'kick',e.x);}
    return true;
}
export function updateWorkshopEnemy(s:State,e:Enemy,dt:number,svc:Services):boolean{
    if(e.kind==='bomb'&&e.bombFuse!==undefined){e.vy=Math.min(18,e.vy+26*dt);const vx=e.vx,hit=svc.move(s,e,dt);e.grounded=hit.floor;if(e.bombThrown&&Math.abs(vx)>5)for(const other of s.enemies)if(other!==e&&other.alive&&!other.held&&other.kind!=='ghost'&&other.kind!=='fire-jumper'&&overlap(e,other))svc.defeat(s,other,'shell',e);if(hit.wall)e.vx=-vx*.4;if(hit.floor){if(e.bombThrown&&(e.bombBounces??0)===0){e.bombBounces=1;e.vy=-BOMB_BOUNCE_SPEED;e.grounded=false;emit(s,'bump',e.x);}else{e.vx=0;e.bombThrown=false;}}return true;}
    if(e.kind!=='hammer-otter')return false;
    e.hammerFacing=s.player.x+s.player.w/2<e.x+e.w/2?-1:1;
    e.hammerWait=(e.hammerWait??1.2)-dt;e.hammerPoseAge=Math.min(1,(e.hammerPoseAge??1)+dt);e.hammerJumpWait=(e.hammerJumpWait??2.4)-dt;
    if(e.hammerWait<=0){
        const dir=s.player.x+s.player.w/2<e.x+e.w/2?-1:1;e.hammerWait=1.5;e.hammerPoseAge=0;
        if(s.hammers.length<16){s.hammers.push({x:e.x+e.w/2+dir*.4-.18,y:e.y+.1,w:.36,h:.36,vx:dir*5,vy:-5*Math.sqrt(3),age:0,angle:0});emit(s,'throw',e.x);}
    }
    if(e.grounded&&e.hammerJumpWait<=0){
        e.hammerJumps=(e.hammerJumps??0)+1;e.hammerJumpWait=3.1;
        const row=Math.floor(e.y+e.h+.025),under=cell(s.level,e.x+e.w/2,row);
        if(isBrick(under)&&e.hammerJumps%2===0)e.hammerDropRow=row;else delete e.hammerDropRow;e.vy=-Math.sqrt(260);e.grounded=false;emit(s,'jump',e.x);
    }
    const home=e.origin?.[0]??e.x;if(e.x<home-2)e.vx=1;if(e.x>home+2)e.vx=-1;
    e.vy=Math.min(18,e.vy+26*dt);const vx=e.vx,hit=svc.move(s,e,dt);if(hit.wall)e.vx=-vx;e.grounded=hit.floor;
    if(e.hammerDropRow!==undefined&&(e.y>=e.hammerDropRow+1||hit.floor))delete e.hammerDropRow;
    return true;
}
