import type { Item, Enemy, Level } from './model';
import type { ItemKind, ElementProperties } from './catalog';
import { HORIZONTAL_SPRING_HEIGHT } from './springs';
export function makeItem(kind:ItemKind,x:number,y:number):Item {
    if(kind==='bone-shell')return {kind,x,y:y+.55,w:1.1,h:.45,vx:0,vy:0,alive:true,held:false,cooldown:.15,age:0,thrown:false,spent:false};
    if(kind==='koopa-car')return {kind,x,y:y-.1,w:1.8,h:1.1,vx:0,vy:0,alive:true,held:false,cooldown:.2,age:0,thrown:false,spent:false,health:3};
    const h=kind==='giant-pearl'?2:kind==='snowball-large'?2:kind==='pow'||kind==='red-pow'||kind==='wood-crate'||kind==='snowball'?1:kind==='basin'?.45:kind==='p-switch'?.5:kind==='spring-h'?HORIZONTAL_SPRING_HEIGHT:.7;
    return {kind,x:x+(['pow','wood-crate','snowball','giant-pearl'].includes(kind)?0:.1),y:y+1-h,w:kind==='giant-pearl'||kind==='snowball-large'?2:kind==='pow'||kind==='red-pow'||kind==='wood-crate'||kind==='snowball'?1:.8,h,vx:kind==='star'?2.5:0,vy:kind==='star'?-6:0,alive:true,held:false,cooldown:.15,age:0,thrown:false,spent:false};
}
export function makeEnemy(kind:Enemy['kind'],x:number,y:number,props:ElementProperties={}):Enemy {
    const sizes:Record<string,[number,number]>={bee:[.8,.65],'spring-enemy':[.8,1],'ring-ghost':[.8,.8],bully:[1,1],'giant-fish':[2,2],'lava-dragon':[2,2],magikoopa:[.8,1.3],'homing-bill':[.9,.7],'giant-bill':[3,2],'cat-bill':[1,1]};
    if(sizes[kind]){const [w,h]=sizes[kind]!;return {kind,x:x+.1,y:y+1-h,w,h,vx:kind.includes('bill')?-4:0,vy:0,alive:true,held:false,cooldown:0,health:kind==='giant-fish'?3:1};}
    if(kind==='fire-brother')return {kind,x:x+.1,y:y-.4,w:.8,h:1.4,vx:-1,vy:0,alive:true,held:false,cooldown:0};
    if(kind==='ball-thrower')return {kind,x:x+.05,y,w:.9,h:1,vx:-.6,vy:0,alive:true,held:false,cooldown:0};
    if(kind==='cactus'){const h=props.height??3;return {kind,x:x+.1,y:y+1-h,w:.8,h,vx:-.6,vy:0,alive:true,held:false,cooldown:0,age:0,cactusSegments:h};}
    if(kind==='fire-jumper')return {kind,x:x+.1,y:y+.2,w:.8,h:.8,vx:0,vy:0,alive:true,held:false,cooldown:0,age:0,origin:[x+.1,y+.2],flamePhase:'flight',flameWait:0,jumpHeight:props.jumpHeight??4,period:props.period??3};
    if(kind==='hammer-otter')return {kind,x:x+.1,y:y-.4,w:.8,h:1.4,vx:-1,vy:0,alive:true,held:false,cooldown:0,age:0,origin:[x+.1,y-.4],hammerWait:1.2,hammerJumpWait:2.4};
    if(kind==='snow-cactus'){const h=props.height??3;return {kind,x:x+.1,y:y+1-h,w:.8,h,vx:-.5,vy:0,alive:true,held:false,cooldown:0,cactusSegments:h};}
    const plant=kind==='plant',squid=kind==='squid';
    const bodyY=plant?y:squid?y-.5:y+.2;
    return {kind,x:x+.1,y:bodyY,w:squid?.65:.8,h:plant?1:squid?1.5:.8,vx:kind==='fish'?1.8:kind==='squid'?0:-1.5,vy:0,alive:true,held:false,cooldown:0,age:0,origin:[x+.1,plant?y+1:bodyY],mode:props.mode??'fixed'};
}

export function modifyEnemy(e:Enemy,p:ElementProperties={},theme:Level['theme']='coast'):Enemy {
    e.baseKind=e.kind;
    e.modifiers=structuredClone(p);
    if(theme==='snow'&&e.kind==='cactus')e.kind='snow-cactus';
    if(p.large){const feet=e.y+e.h;e.w*=2;e.h*=2;e.y=feet-e.h;}
    if(p.direction==='left'||p.direction==='right')e.vx=Math.abs(e.vx||1)*(p.direction==='left'?-1:1);
    e.ai={phase:'floor',age:0,home:[e.x,e.y],direction:p.direction==='left'?-1:1,lastJump:0,wait:1.5};
    if(p.drop)e.drop=p.drop;return e;
}
