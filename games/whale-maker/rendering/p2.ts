import type { Body, Enemy, Level, State, Tile } from '../rules/model';
import { WEARABLES, isP2Boss, P2_ENEMIES } from '../rules/p2-schema';
import { elementBounds } from '../editor/p1-geometry';
import type { WhaleScene2D } from './WhaleScene2D';
const enemyRows:Record<string,number>={bee:0,'spring-enemy':8,'ring-ghost':16,bully:24,'giant-fish':32,'lava-dragon':40,magikoopa:48,'koopa-car':56};
const icons:Record<string,number>={'beat-block':0,'fall-block':2,icicle:3,tornado:4,'camera-rail':8,'camera-stop':9,'coin-10':10,'coin-30':11,'coin-50':12};
export function p2Art(kind:string,time=0):{atlas:string;frame:number}|null {
    const w=(WEARABLES as readonly string[]).indexOf(kind);if(w>=0)return {atlas:'p2-wearables',frame:w*8+Math.floor(time*8)%4};
    if(enemyRows[kind]!==undefined)return {atlas:'p2-enemies',frame:enemyRows[kind]!+Math.floor(time*8)%4};
    if(kind==='homing-bill'||kind==='giant-bill'||kind==='cat-bill'||kind==='one-up')return {atlas:'p2-bills',frame:(kind==='homing-bill'?0:kind==='giant-bill'?4:kind==='cat-bill'?8:12)+Math.floor(time*8)%4};
    if(isP2Boss(kind))return {atlas:'p2-bosses',frame:kind==='boom-boss'?0:kind==='pom-boss'?16:32};
    if(icons[kind]!==undefined)return {atlas:'p2-icons',frame:icons[kind]!};return null;
}
export function drawP2Enemy(scene:WhaleScene2D,e:Enemy,x:number,feet:number,z:number,time:number):boolean {
    if(!(P2_ENEMIES as readonly string[]).includes(e.kind)||e.frozen)return false;
    if((e.kind==='giant-fish'||e.kind==='lava-dragon')&&e.ai?.phase==='wait')return true;
    const a=p2Art(e.kind,time)!;let frame=a.frame;if(e.kind==='spring-enemy'&&!e.grounded)frame=12+Math.floor(time*8)%4;if(e.kind==='bully'&&(e.ai?.wait??0)>0)frame=28+Math.floor(time*8)%4;if(e.kind==='giant-fish')frame=36+Math.floor(time*8)%4;if(e.kind==='magikoopa'&&e.ai?.phase!=='walk')frame=52+Math.floor(time*8)%4;
    scene.fitActor(a.atlas,frame,x,feet,e.w*z*1.15,e.h*z*1.12,e.vx<0,Math.floor(frame/(a.atlas==='p2-bills'?4:8))*(a.atlas==='p2-bills'?4:8));return true;
}
export function drawP2Tile(scene:WhaleScene2D,s:State,l:Level,t:Tile,x:number,y:number,px:number,py:number,z:number,time:number,editing:boolean):boolean {
    const liquid=l.liquid;if(!editing&&(t==='water'||t==='lava')&&liquid&&l.liquidSurface!==undefined&&x>=(liquid.x??0)&&x<(liquid.x??0)+(liquid.width??l.width)&&y===Math.floor(l.liquidSurface)){
        const offset=l.liquidSurface-y,phase=Math.floor(time*6)%4;scene.sprite(t==='water'?'environment':'lava',t==='water'?16+phase:4+phase,px,py+offset*z,z,(1-offset)*z);scene.sprite(t==='water'?'environment':'lava',phase,px,py+offset*z-.05*z,z,.35*z);return true;
    }
    const art=p2Art(t,time);if(!art)return false;const p=l.properties?.[y*l.width+x];
    if(!editing)return true;const b=elementBounds(t,x,y,p,l.theme),bx=px+(b.x-x)*z,by=py+(b.y-y)*z;
    if(t==='camera-stop'){scene.sprite('p2-icons',9,bx,by,b.w*z,b.h*z,false,0,.4);return true;}
    if(t==='camera-rail'){scene.sprite('p2-icons',8,px,py,z,z,false,0,.6);return true;}
    if(t==='tornado'){for(let n=0;n<b.h;n++)scene.sprite('p2-icons',4+Math.floor(time*8+n)%4,bx,by+n*z,b.w*z,z,false,0,.75);return true;}
    if(t==='beat-block'||t==='fall-block'){scene.sprite(art.atlas,art.frame,px,py,(p?.width??1)*z,t==='fall-block'?.4*z:z);return true;}
    scene.fitActor(art.atlas,art.frame,bx+b.w*z/2,by+b.h*z,b.w*z*(isP2Boss(t)?1.15:1),b.h*z*(isP2Boss(t)?1.15:1));return true;
}
export function drawP2World(scene:WhaleScene2D,s:State,cam:number,cy:number,z:number,v:{x:number;y:number}):void {
    for(const d of s.p2Mechanisms){const x=v.x+(d.x-cam)*z,y=v.y+(d.y-cy)*z;if(d.phase==='gone')continue;
        if(d.kind==='tornado'){for(let n=0;n<d.h;n++)scene.sprite('p2-icons',4+Math.floor(s.time*10+n)%4,x,y+n*z,d.w*z,z,false,0,.7);continue;}
        const frame=d.kind==='beat-block'?(d.active?0:1):d.kind==='fall-block'?2:3;scene.sprite('p2-icons',frame,x+(d.phase==='warn'?Math.sin(s.time*60)*z*.035:0),y,d.w*z,d.h*z,false,0,d.kind==='beat-block'&&!d.active?.22:d.phase==='warn'?.65+.3*Math.sin(s.time*24):1);
    }
    for(const b of s.bosses){const a=b.brain;if(!a||b.phase==='gone')continue;const base=a.kind==='boom-boss'?0:a.kind==='pom-boss'?16:32,frame=b.phase==='fall'?base+15:b.hurt>0?base+14:a.mode==='shell'?base+8+Math.floor(b.age*12)%4:a.mode==='climb'?base+8+Math.floor(b.age*8)%2:a.mode==='telegraph'?base+4:a.mode==='pounce'?base+7:a.mode==='vulnerable'?base+12+Math.floor(b.age*8)%2:a.mode==='hidden'?base+8+Math.floor(b.age*8)%2:base+Math.floor(b.age*8)%4;
        for(const mirror of a.mirages)scene.actor('p2-bosses',base+10,v.x+(mirror.x+mirror.w/2-cam)*z,v.y+(mirror.y+mirror.h-cy)*z,b.h*z*1.15,b.facing<0,base,0,.4);
        scene.actor('p2-bosses',frame,v.x+(b.x+b.w/2-cam)*z,v.y+(b.y+b.h-cy)*z,b.h*z*1.15,b.facing<0,base,b.phase==='fall'?b.age*1.5:0,a.mode==='hidden'?.3:1);
        if(b.health>0){const width=b.w*z;scene.fill({x:v.x+(b.x-cam)*z,y:v.y+(b.y-cy)*z-.2*z,width,height:.1*z},[.08,.16,.24,1]);scene.fill({x:v.x+(b.x-cam)*z,y:v.y+(b.y-cy)*z-.2*z,width:width*b.health/(a.maxHealth??(a.kind==='cat-boss'?6:3)),height:.1*z},[.95,.46,.55,1]);}
    }
    for(const b of s.cannonShots)scene.actor('devices',2,v.x+(b.x+b.w/2-cam)*z,v.y+(b.y+b.h-cy)*z,b.w*z*1.2,b.vx<0,2,s.time*8);
    for(const b of s.magicShots)scene.actor('p2-icons',b.kind==='ninja'?13:14,v.x+(b.x+b.w/2-cam)*z,v.y+(b.y+b.h-cy)*z,z*.65,false,b.kind==='ninja'?13:14,s.time*10);
    for(const car of s.items)if(car.alive&&car.kind==='koopa-car')scene.fitActor('p2-enemies',56+((car.health??3)<=1?4:0)+Math.floor(car.age*12)%4,v.x+(car.x+car.w/2-cam)*z,v.y+(car.y+car.h-cy)*z,car.w*z*1.06,car.h*z*1.1,car.vx<0,56);
}
export function drawWearable(scene:WhaleScene2D,s:State,cam:number,cy:number,z:number,v:{x:number;y:number}):void {
    const w=s.wearable;if(!w||s.phase==='dead')return;const base=(WEARABLES as readonly string[]).indexOf(w.kind)*8,frame=base+(w.kind==='cannon-box'?w.charge>=.6?4:w.charge>.1?2:Math.floor(w.age*4)%2:w.kind==='goomba-mask'?w.exposed>0?4+Math.floor(w.age*8)%4:Math.floor(w.age*6)%4:w.kind==='pow-box'&&w.cooldown>0?4+Math.floor(w.age*12)%4:Math.floor(w.age*10)%4),p=s.player,size=(s.power===3?1.8:s.power?1.25:.85)*z;
    if(s.pipe?.glass){const angle=s.pipe.angle??0;scene.centeredActor('p2-wearables',frame,v.x+(p.x+p.w/2+Math.cos(angle)*.4-cam)*z,v.y+(p.y+p.h/2+Math.sin(angle)*.4-cy)*z,size,base,angle-(s.pipe.flip?Math.PI:0),1,!!s.pipe.flip);}
    else{const x=v.x+(p.x+p.w/2-cam)*z,y=v.y+(p.y+Math.min(p.h*.75,s.power?1.05:.6)-cy)*z;scene.actor('p2-wearables',frame,x,y,size,s.facing<0,base);if(w.kind==='propeller-box'||w.kind==='pow-box')for(let n=0;n<3;n++)scene.dustParticle(x+(n-1)*size*.14,y-size*.38,size*.035,1,n<w.uses?[1,.88,.4,1]:[.15,.24,.29,1]);}
}
/** An editor-only view of the destination, using the authored area blueprint. */
export function drawAreaEntryPreview(scene:WhaleScene2D,root:Level,draft:Level,selected:Iterable<number>,v:{x:number;y:number;w:number}):void {
    const id=[...selected].find(id=>draft.properties?.[id]?.area);if(id===undefined)return;const p=draft.properties![id]!,target=p.area==='main'?root:root.areas?.[p.area!];if(!target)return;
    const x=v.x+v.w-202,y=v.y+30,z=19,tx=p.targetX??2,ty=p.targetY??2,left=Math.max(0,Math.min(target.width-10,tx-4)),top=Math.max(0,Math.min(target.height-6,ty-3));
    scene.fill({x:x-4,y:y-4,width:198,height:122},[.04,.15,.22,.96]);scene.fill({x,y,width:190,height:114},[.49,.79,.82,1]);
    for(let yy=0;yy<6;yy++)for(let xx=0;xx<10;xx++){const t=target.cells[(top+yy)*target.width+left+xx]!,px=x+xx*z,py=y+yy*z,art=p2Art(t);if(t==='#'||t==='B')scene.sprite('world',t==='#'?0:1,px,py,z,z);else if(t==='?')scene.sprite('coins',8,px,py,z,z);else if(art)scene.fitActor(art.atlas,art.frame,px+z/2,py+z,z,z);else if(t==='door'||t==='locked-door'||t==='p-door'||t==='P')scene.fill({x:px+2,y:py,width:15,height:19},[.21,.45,.62,1]);else if(t==='water'||t==='lava')scene.fill({x:px,y:py,width:z,height:z},t==='water'?[.2,.55,.88,.7]:[1,.32,.12,.9]);else if(t!=='.')scene.fill({x:px+3,y:py+3,width:13,height:13},[.85,.69,.46,1]);}
    const px=x+(tx-left)*z,py=y+(ty-top)*z;scene.fill({x:px,y:py,width:z*.9,height:z*.8},[1,.88,.2,.6]);for(const r of [{x:px,y:py,width:z*.9,height:2},{x:px,y:py,width:2,height:z*.8}])scene.fill(r,[1,.95,.45,1]);
}
