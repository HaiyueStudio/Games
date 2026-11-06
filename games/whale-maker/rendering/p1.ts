import {drawCannon} from './advanced';
import { elementBounds } from '../editor/p1-geometry';
import type { Enemy, Level, State, Tile } from '../rules/model';
import { P1_TOOLS, P1_ENEMIES } from '../rules/p1-schema';
import { DEVICE_TILES } from '../rules/p1-mechanisms';
import { pathPoint } from '../rules/snake-path';
import type { WhaleScene2D } from './WhaleScene2D';
const icon:Record<string,number>={'hard-block':0,sign:1,conveyor:2,'dash-block':3,'red-pow':4,'extend-block':5,'snake-fast':6,'pink-coin':7,'warp-box':8,'locked-warp':9,'snowball-large':11,'cat-bell':12,'boomerang-flower':13,'hammer-suit':14,tree:16,trampoline:17,'trampoline-moving':18,'trampoline-on':19,'path-red':20,'path-blue':21,'spike-switch':22,'ball-thrower':28,'snow-cactus':29,'semi-platform':28};
const creature:Record<string,number>={ant:0,'spike-ant':8,'jump-mouse':16,'spike-mouse':24,'dry-turtle':32,fishbone:40,'creeper-plant':48,'fire-plant':48,'fire-brother':56};
export function p1Art(kind:string,time=0):{atlas:string;frame:number}|null {
    if(creature[kind]!==undefined)return {atlas:'p1-creatures',frame:creature[kind]!+Math.floor(time*8)%(kind==='ant'||kind==='spike-ant'||kind==='fishbone'?8:4)};
    if(kind==='ball-thrower')return {atlas:'p1-special',frame:Math.floor(time*8)%8};
    if(kind==='snow-cactus')return {atlas:'p1-special',frame:8+Math.floor(time*8)%4};
    if(icon[kind]!==undefined)return {atlas:'p1-icons',frame:icon[kind]!};
    if(kind==='cannon-basic'||kind==='bill-blaster')return {atlas:'devices',frame:0};
    if(kind.startsWith('gentle-'))return {atlas:'environment',frame:kind.includes('up')?8:9};return null;
}
export function p1Player(s:State):{atlas:string;frame:number;reference:number;flip:boolean;lift:number;size:number}|null {
    if(s.phase==='dead'||s.phase==='won'&&s.power<5)return null;
    const power=s.power,moving=Math.abs(s.player.vx)>1;
    if(s.phase==='playing'){
        const row=power===0||power===3?0:power===1?1:power===2?2:power===4?3:power-1;
        const action=s.pipe?.glass||s.wearable?.kind==='bullet-mask'&&s.wearable.active?6+Math.floor(s.time*8)%2:s.motion==='roll'?Math.floor(s.motionAge*16)%4:s.motion==='long'?4:s.motion==='high'?Math.floor(s.spinAge*16)%4:s.charge>.3?5:-1;
        if(action>=0)return {atlas:'p1-actions',frame:row*8+action,reference:row*8,flip:s.facing<0,lift:0,size:power?96:48};
        if(power===6&&s.motion==='boomerang')return {atlas:'p1-actions',frame:56+Math.min(3,Math.floor(s.motionAge*10)),reference:56,flip:s.facing<0,lift:0,size:96};
    }
    if(power>=5){const start=(power-5)*16;let frame=!s.grounded?s.player.vy<0?6:7:moving?1+Math.floor(s.stride)%3:0;
        if(s.stun>0)frame=8;
        if(s.running)frame=4+Math.floor(s.stride)%2;if(s.crouching)frame=8;if(s.held)frame=power===5?(moving?1+Math.floor(s.stride)%3:0):moving?13+Math.floor(s.stride)%2:12;
        if(s.swimming&&!s.grounded)frame=s.swimKickAge<.3?6:7;
        if(!s.grounded&&s.wall&&s.player.vy>0)frame=12;
        if(s.climbing||s.motion==='climb')frame=power===5?13+Math.floor(s.climbAge*10+s.time*6)%2:12;
        if(s.motion==='claw')frame=s.motionAge<.1?9:10;if(s.motion==='dive')frame=11;if(s.motion==='hammer')frame=s.motionAge<.1?9:10;if(s.motion==='boomerang')frame=s.motionAge<.1?9:10;
        if(s.riding||s.vehicle||s.sliding)frame=8;if(s.pound!=='none')frame=s.pound==='flip'?7:8;if(s.spinning)frame=[6,7,8,11][Math.floor(s.spinAge*16)%4]!;
        if(s.phase==='won'&&s.victory?.stage==='slide')frame=12;
        if(s.phase==='won'&&s.victory?.stage==='cheer')frame=15;return {atlas:'p1-costumes',frame:start+frame,reference:start,flip:s.facing<0,lift:0,size:96};
    }
    return null;
}
export function drawP1Enemy(scene:WhaleScene2D,e:Enemy,x:number,feet:number,z:number,time:number):boolean {
    if(!(P1_ENEMIES as readonly string[]).includes(e.kind)||e.frozen)return false;
    const giant=e.modifiers?.large?2:1;
    if(e.kind==='snow-cactus'){const count=Math.round(e.h),phase=Math.floor(time*6),frame=count>=3?8+phase%4:count===2?12+phase%2:14+phase%2,extra=Math.max(0,count-3);for(let n=0;n<extra;n++){const xx=x+Math.sin(time*4+n)*z*.035,yy=feet-(n+.5)*z;scene.dustParticle(xx,yy,z*.48,1,[.1,.24,.34,1]);scene.dustParticle(xx,yy-1,z*.44,1,[.92,.98,1,1]);}scene.actor('p1-special',frame,x,feet-extra*z,3*z,false,8);return true;}
    const art=p1Art(e.kind,time)!;let frame=art.frame;
    if(e.kind==='dry-turtle'&&e.downAge!==undefined)frame=36+(e.downAge<.6?Math.floor(time*12)%4:1);
    if(e.kind==='jump-mouse'||e.kind==='spike-mouse')frame=creature[e.kind]!+(e.grounded?Math.floor(time*8)%4:4+Math.floor(time*8)%4);
    if(e.kind==='fire-plant')frame=48+((e.ai?.wait??0)<.4?4+Math.floor(time*8)%4:Math.floor(time*8)%4);
    if(e.kind==='fire-brother')frame=56+((e.ai?.wait??0)<.4?4+Math.floor(time*8)%4:Math.floor(time*8)%4);
    if(e.kind==='creeper-plant'&&e.ai){const path=e.modifiers?.path??[[0,0],[4,0],[4,-3]],span=e.ai.distance??Math.hypot(e.x-e.ai.home[0],e.y-e.ai.home[1]);for(let n=0;n<span;n+=.35){const [dx,dy]=pathPoint(path,n);scene.actor('adventure',6,x+(e.ai.home[0]+dx-e.x)*z,feet+(e.ai.home[1]+dy-e.y)*z,z*.5);}}
    if(e.kind==='ball-thrower')frame=(e.ai?.wait??0)<.5?2+Math.floor(time*8)%4:[0,1,6,7][Math.floor(time*8)%4]!;
    const angle=(e.kind==='ant'||e.kind==='spike-ant')?(Number(e.ai?.phase)||0)*-Math.PI/2:0;
    scene.actor(art.atlas,frame,x,feet,z*(e.kind==='fire-brother'?1.46:e.kind==='ball-thrower'?1.3:1)*giant,e.vx<0,creature[e.kind]??frame,angle,1,e.kind==='creeper-plant'&&(e.modifiers?.color==='purple'||e.modifiers?.color==='blue')?[1,.65,1,1]:undefined);return true;
}
export function drawModifiers(scene:WhaleScene2D,e:Enemy,x:number,feet:number,z:number,time:number):void {
    if(e.frozen||!e.alive||e.held)return;
    if(e.modifiers?.winged&&!e.removedWings)scene.centeredActor('p1-icons',24,x,feet-e.h*z*.55,z*(.7+.08*Math.sin(time*24)),24);
    if(e.modifiers?.parachute)scene.actor('p1-icons',25,x,feet-e.h*z*.5,z*1.1);
}
function drawTree(scene:WhaleScene2D,x:number,y:number,z:number,height:number):void {scene.fill({x:x+z*.8,y:y+z,width:z*.4,height:(height-1)*z},[.56,.39,.27,1]);scene.actor('p1-icons',16,x+z,y+2*z,2*z);}
export function drawP1Tile(scene:WhaleScene2D,s:State,l:Level,t:Tile,x:number,y:number,px:number,py:number,z:number,time:number,editing:boolean):boolean {
    if(!(P1_TOOLS as readonly string[]).includes(t)&&!t.startsWith('gentle-'))return false;
    const id=y*l.width+x,p=l.properties?.[id];
    if(t.startsWith('gentle-')){const up=t.includes('up'),second=t.endsWith('-body'),h0=up?(second?.5:1):(second?.5:0),h1=up?(second?0:.5):(second?1:.5);for(let n=0;n<24;n++){const h=h0+(h1-h0)*(n+.5)/24;scene.fill({x:px+n*z/24,y:py+z*h,width:z/24+.5,height:z*(1-h)},[.42,.78,.72,1]);}return true;}
    if(!editing&&DEVICE_TILES.has(t)&&t!=='tree')return true;
    const art=p1Art(t,time);if(!art)return false;
    if(t==='cannon-basic'||t==='bill-blaster'){const h=t==='bill-blaster'?p?.height??2:1;if(editing)drawCannon(scene,{x,y:y-h+1,w:1,h,vx:0,vy:0},px,py-(h-1)*z,z,true);return true;}
    if(t==='tree'){if(!editing)return true;drawTree(scene,px,py-((p?.height??5)-1)*z,z,p?.height??5);return true;}
    if(t==='conveyor'){scene.fill({x:px,y:py,width:z,height:z},[.08,.35,.42,1]);scene.sprite('p1-icons',2,px,py,z,z*.6);for(let n=0;n<3;n++){const u=((n/3+(time*(p?.speed??2)*(s.redOn?1:-1))%1)+2)%1;scene.dustParticle(px+u*z,py+z*.1,z*.025,1,[1,.85,.5,1]);}return true;}
    if(t==='spike-switch'){scene.sprite('p1-icons',s.redOn?23:22,px,py,z,z);return true;}
    if(t==='warp-box'||t==='locked-warp'){scene.sprite(art.atlas,art.frame,px,py,z,z,false,0,!editing&&s.usedWarps[id]?.35:1);return true;}
    if(t==='semi-platform'&&editing){scene.sprite('p1-icons',28,px,py,(p?.width??3)*z,(p?.depth??2)*z);return true;}
    if(t.startsWith('trampoline')&&editing){scene.sprite('p1-icons',art.frame,px,py,(p?.width??3)*z,z);return true;}
    if((P1_ENEMIES as readonly string[]).includes(t)&&!editing)return true;
    scene.sprite(art.atlas,art.frame,px,py,z,z,false,(p?.rotation??0)*Math.PI/180);return true;
}
export function drawP1(scene:WhaleScene2D,s:State,cam:number,cy:number,z:number,v:{x:number;y:number}):void {
    if(s.level.theme==='snow')for(let yy=Math.max(0,Math.floor(cy));yy<Math.min(s.level.height,cy+13);yy++)for(let xx=Math.max(0,Math.floor(cam));xx<Math.min(s.level.width,cam+27);xx++)if(s.level.cells[yy*s.level.width+xx]==='#'&&s.level.cells[(yy-1)*s.level.width+xx]!== '#')scene.sprite('p1-icons',29,v.x+(xx-cam)*z,v.y+(yy-cy)*z-z*.08,z,z*.3);
    for(const d of s.devices){const x=v.x+(d.x-cam)*z,y=v.y+(d.y-cy)*z;
        if(d.kind==='P')continue;
        if(d.kind==='tree'){drawTree(scene,x,y,z,d.h);continue;}
        if(d.kind==='extend-block'){for(const b of d.blocks)scene.sprite('p1-icons',5,v.x+(b.x-cam)*z,v.y+(b.y-cy)*z,z,z);continue;}
        if(d.kind==='cannon-basic'||d.kind==='bill-blaster'){drawCannon(scene,d,x,y,z,s.player.x<d.x);continue;}
        if(d.kind==='path-blue'&&d.phase==='done')continue;
        const a=p1Art(d.kind)!;scene.sprite(a.atlas,a.frame,x,y,d.w*z,d.h*z,false,0,d.kind==='trampoline-on'&&!s.redOn?.3:1);
    }
    if(s.motion==='claw'&&s.motionAge<.22)scene.actor('p1-icons',26,v.x+(s.player.x+s.player.w/2+s.facing*.9-cam)*z,v.y+(s.player.y+s.player.h-.1-cy)*z,1.2*z,s.facing<0,26,0,1-s.motionAge/.22);
    if(s.motion==='hammer'&&s.motionAge>.08&&s.motionAge<.28)scene.actor('p1-icons',27,v.x+(s.player.x+s.player.w/2+s.facing*1.1-cam)*z,v.y+(s.player.y+s.player.h-.1-cy)*z,z,false,27,0,1-(s.motionAge-.08)/.2);
    for(const b of s.boomerangs)scene.centeredActor('p1-icons',15,v.x+(b.x+b.w/2-cam)*z,v.y+(b.y+b.h/2-cy)*z,z*.75,15,s.time*20);
    for(const b of s.enemyProjectiles)scene.centeredActor(b.kind==='fire'?'mechanics':'p1-icons',b.kind==='fire'?4:10,v.x+(b.x+b.w/2-cam)*z,v.y+(b.y+b.h/2-cy)*z,b.w*z,b.kind==='fire'?4:10,s.time*6);
}
export function drawP1Overlay(scene:WhaleScene2D,l:Level,selected:Iterable<number>,cam:number,cy:number,z:number,v:{x:number;y:number},preview:boolean):void {
    const line=(x:number,y:number,w:number,h:number)=>{const c=[.93,.87,.38,.9] as const;for(const r of [{x,y,width:w,height:2},{x,y:y+h-2,width:w,height:2},{x,y,width:2,height:h},{x:x+w-2,y,width:2,height:h}])scene.fill(r,c);};
    for(const id of selected){const p=l.properties?.[id],x=id%l.width,y=Math.floor(id/l.width),px=v.x+(x-cam)*z,py=v.y+(y-cy)*z;
        if(p?.path)for(const [n,point]of p.path.entries()){if(n){const a=p.path[n-1]!,dx=(point[0]-a[0])*z,dy=(point[1]-a[1])*z,len=Math.hypot(dx,dy);scene.fill({x:px+(a[0]+.5)*z+dx/2-len/2,y:py+(a[1]+.5)*z+dy/2-1.5,width:len,height:3},[.95,.8,.3,.8],Math.atan2(dy,dx));}scene.fill({x:px+(point[0]+.32)*z,y:py+(point[1]+.32)*z,width:z*.36,height:z*.36},[1,.83,.35,.95]);}
        if(preview){const b=elementBounds(l.cells[id]!,x,y,p,l.theme);if(l.cells[id]==='tree'||l.cells[id]==='semi-platform')b.h=.2;if(!String(l.cells[id]).startsWith('glass'))line(v.x+(b.x-cam)*z,v.y+(b.y-cy)*z,b.w*z,b.h*z);if(p?.radius){const r=p.radius*z;line(px+z/2-r,py+z/2-r,r*2,r*2);}}
    }
}
