import type { Input, Level, State } from './model';
import { emit } from './events';
import { pipeShape } from './pipes';
type Factory=(l:Level)=>State;
const GLOBAL=['power','score','coins','deaths','time','keys','helmet','starTime','invincible','wearable','held','riding','lives','gameOver','lifeCharged','nextLifeCoin','timeRemaining','timeBonus','defeatCounts','checkpoint','checkpointArea','checkpointMemory'] as const;
export function rootLevel(s:State):Level{return s.rootLevel??s.startLevel;}
export function inheritArea(root:Level,id:string):Level{return id==='main'?root:{...root.areas![id]!,...(root.areas?{areas:root.areas}:{}),...(root.rules?{rules:root.rules}:{}),...(root.condition?{condition:root.condition}:{}),...(root.progress?{progress:root.progress}:{})};}
export function areaBlueprint(s:State,id=s.currentArea):Level{return inheritArea(rootLevel(s),id);}
/** Cache each area's live scene exactly once. Inventory is moved, not cloned. */
export function changeArea(s:State,id:string,create:Factory,position?:[number,number]):boolean {
    const root=rootLevel(s);if(id===s.currentArea||id!=='main'&&!root.areas?.[id])return false;
    const carry=[s.held,s.riding].filter((b,n,a)=>b&&a.indexOf(b)===n),enemies=new Set(s.enemies),global:Partial<State>={};for(const key of GLOBAL)(global as Record<string,unknown>)[key]=s[key];
    const cache=s.areaMemory,old=s.currentArea;s.items=s.items.filter(i=>!carry.includes(i));s.enemies=s.enemies.filter(e=>!carry.includes(e));s.vehicle=null;s.shots=[];s.boomerangs=[];s.cannonShots=[];s.pendingShot=false;
    cache[old]={...s,areaMemory:{}};const next=cache[id]??create(inheritArea(root,id));delete cache[id];Object.assign(s,next,global);
    s.rootLevel=root;s.startLevel=root;s.currentArea=id;s.areaMemory=cache;s.phase='playing';s.areaCooldown=.8;s.areaFade=.5;if(s.wearable){s.wearable.active=false;s.wearable.charge=0;s.wearable.boost=0;}s.pipe=s.door=null;s.motion='none';s.grounded=false;s.climbing=false;s.cameraHold=null;
    const at=position??(id==='main'?root.spawn:root.areas![id]!.spawn);const width=s.power===3?1.9:.9,height=s.riding?.55:s.power?2:.8;s.player={x:Math.max(0,Math.min(s.level.width-width,at[0])),y:Math.max(0,Math.min(s.level.height-height,at[1])),w:width,h:height,vx:0,vy:0};
    for(const b of carry){if(!b)continue;if(enemies.has(b as never)){if(!s.enemies.includes(b as never))s.enemies.push(b as never);}else if(!s.items.includes(b as never))s.items.push(b as never);b.x=s.player.x+s.facing*.7;b.y=s.player.y+.5;b.vx=b.vy=0;}
    s.litCheckpoints={...(s.checkpointMemory[id]??s.litCheckpoints)};s.invincible=Math.max(.7,s.invincible);emit(s,'door',s.player.x);s.notice='抵达'+(id==='main'?'主区域':s.level.name);return true;
}
export function areaTravel(s:State,i:Input,dt:number,create:Factory):boolean {
    s.areaCooldown=Math.max(0,s.areaCooldown-dt);if(s.areaCooldown>0||s.pipe||s.door||!i.interact&&!i.down&&!i.axis)return false;
    const p=s.player;for(const [key,props] of Object.entries(s.level.properties??{})){
        const id=Number(key),x=id%s.level.width,y=Math.floor(id/s.level.width),t=s.level.cells[id];if(!props.area||!['door','locked-door','p-door','P','warp-box','locked-warp'].includes(t!))continue;
        if((t==='warp-box'||t==='locked-warp')&&s.usedWarps[id])continue;
        if(t==='P'){const shape=pipeShape(s.level,id)!,n=shape.normal,cx=p.x+p.w/2,cy=p.y+p.h/2,pressing=n[0]===1?i.axis<0:n[0]===-1?i.axis>0:n[1]===-1?i.down:!!i.interact,tangent=n[0]?Math.abs(cy-shape.mouth[1]):Math.abs(cx-shape.mouth[0]),gap=(cx-shape.mouth[0])*n[0]+(cy-shape.mouth[1])*n[1]-(n[0]?p.w:p.h)/2;if(!pressing||tangent>.55||gap<-.04||gap>.1)continue;}
        if(t!=='P'&&(!i.interact||s.previous.interact||p.x+p.w<=x||p.x>=x+1||p.y+p.h<y+.5||p.y>y+1))continue;
        if(t==='p-door'&&s.pTime<=0)continue;if(props.area===s.currentArea||props.area!=='main'&&!rootLevel(s).areas?.[props.area])continue;const locked=t==='locked-door'||t==='locked-warp';if(locked&&!s.keys.length){s.notice='需要钥匙才能进入副区';return false;}if(locked)s.keys.shift();const oneUse=t==='warp-box'||t==='locked-warp';if(oneUse)s.usedWarps[id]=true;
        if(!changeArea(s,props.area,create,[props.targetX??2,props.targetY??2]))return false;
        if(oneUse){const destination=Math.floor(s.player.y)*s.level.width+Math.floor(s.player.x);if(['warp-box','locked-warp'].includes(s.level.cells[destination]!))s.usedWarps[destination]=true;}return true;
    }return false;
}
export function respawnP2(s:State,create:Factory):boolean {
    if(!s.rootLevel&&!s.level.areas&&!s.level.progress?.lives)return false;
    // R can arrive before the next simulation tick after a lethal contact.
    if(s.phase==='dead'&&s.level.progress?.lives&&!s.lifeCharged){s.lifeCharged=true;s.lives=Math.max(0,s.lives-1);s.gameOver=s.lives===0;}
    const root=rootLevel(s),dead=s.deaths,area=s.checkpointArea,point:[number,number]=[...s.checkpoint],lit=structuredClone(s.checkpointMemory),lives=s.lives,score=s.score,over=s.gameOver;
    Object.assign(s,create(root));if(over){s.notice='新的冒险开始！';return true;}if(area!=='main')changeArea(s,area,create,point);s.checkpointArea=area;s.checkpoint=point;s.checkpointMemory=lit;s.litCheckpoints={...(lit[area]??{})};s.player.x=point[0];s.player.y=point[1];s.deaths=dead;s.lives=lives;s.score=s.level.progress?.lives?score:0;s.lifeCharged=false;s.invincible=2;s.notice='重新出发！';return true;
}
