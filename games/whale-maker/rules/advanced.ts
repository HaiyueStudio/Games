import {effect,type Effect} from './effects';
export {effect} from './effects';
import {overlaps as overlap} from './geometry';
import {hasHelmet,ridingBoneShell} from './player-equipment';
import {mountBoneShell} from './shell-equipment';
import { resolveActivation, activateTrampolines } from './p1-mechanisms';
import { spawnContent as payload } from './containers';
import type { Body, State, Level, Enemy, Item, Input, BlockContent, Tile } from './model';
import type { Services } from './services';
import { ITEM_KINDS, EXTRA_ENEMIES, type ElementProperties } from './catalog';
import { crushPlayer, defeatEnemy } from './combat';
import {launchBomb} from './workshop';
import { emit } from './events';
import { setCell } from './terrain';

export interface Turret extends Body { kind:'cannon';content:BlockContent;wait:number;id?:number;props?:ElementProperties }
export type {Effect} from './effects';
export interface AdvancedState {
    shellHelmet:import('./player-equipment').ShellHelmet|null;boneTime:number;bonePound:boolean;
    turrets:Turret[];effects:Effect[];redOn:boolean;score:number;
    riding:Item|null;swimKickAge:number;pound:'none'|'flip'|'fall';poundAge:number;
    jumpChain:number;chainWindow:number;springWindow:number;springBoosted:boolean;
}

export function cannonCells(l:Level,id:number):number[]{
    if(l.cells[id]==='cannon-body'){for(let y=Math.floor(id/l.width)+1;y<l.height;y++){const n=y*l.width+id%l.width;if(l.cells[n]==='cannon')return cannonCells(l,n);if(l.cells[n]!=='cannon-body')break;}return [];}
    if(l.cells[id]!=='cannon')return [];
    const h=l.properties?.[id]?.height??2;return Array.from({length:h},(_,n)=>id-n*l.width);
}
export function placeCannon(l:Level,x:number,y:number,height=2):boolean {
    if(x<0||x>=l.width||y>=l.height||y-height+1<0)return false;
    const id=y*l.width+x,props=l.properties?.[id]??{},content=l.contents?.[id];
    for(const n of cannonCells(l,id))setCell(l,n,'.');
    setCell(l,id,'cannon');for(let n=1;n<height;n++)setCell(l,id-n*l.width,'cannon-body');
    (l.properties??={})[id]={...props,height};if(content)(l.contents??={})[id]=content;
    return true;
}
export function initAdvanced(l:Level):AdvancedState {
    const turrets:Turret[]=[];
    l.cells.forEach((t,id)=>{if(t!=='cannon')return;const h=l.properties?.[id]?.height??2;turrets.push({kind:'cannon',id,props:structuredClone(l.properties?.[id]??{}),x:id%l.width,y:Math.floor(id/l.width)-h+1,w:1,h,vx:0,vy:0,content:l.contents?.[id]??'cannonball',wait:1});for(const n of cannonCells(l,id))l.cells[n]='.';});
    return {shellHelmet:null,boneTime:0,bonePound:false,turrets,effects:[],redOn:true,score:0,riding:null,swimKickAge:1,pound:'none',poundAge:0,jumpChain:0,chainWindow:0,springWindow:0,springBoosted:false};
}
export function advancedTimers(s:State,dt:number):void {
    s.boneTime=Math.max(0,s.boneTime-dt);if(s.boneTime<1e-8)s.boneTime=0;
    s.swimKickAge=Math.min(1,s.swimKickAge+dt);s.chainWindow=Math.max(0,s.chainWindow-dt);s.springWindow=Math.max(0,s.springWindow-dt);
    for(const fx of s.effects){fx.age+=dt;if(fx.kind==='helmet'||fx.kind==='stone'){fx.vy+=18*dt;fx.x+=fx.vx*dt;fx.y+=fx.vy*dt;}}
    s.effects=s.effects.filter(fx=>fx.age<(fx.kind==='stone'?.8:fx.kind==='helmet'?.65:.4));
}
export {dropHelmet} from './player-equipment';
export function toggleColor(s:State):void {
    emit(s,'switch');
    s.redOn=!s.redOn;
    const active=s.redOn?'red-block':'blue-block';
    const inside=(body:Body)=>{
        for(let y=Math.max(0,Math.floor(body.y+.00001));y<=Math.min(s.level.height-1,Math.floor(body.y+body.h-.00001));y++)
            for(let x=Math.max(0,Math.floor(body.x+.00001));x<=Math.min(s.level.width-1,Math.floor(body.x+body.w-.00001));x++)
                if(s.level.cells[y*s.level.width+x]===active)return true;
        return false;
    };
    for(const e of s.enemies)if(e.alive&&inside(e))defeatEnemy(s,e,'block');
    s.stones=s.stones.filter(stone=>{
        if(!inside(stone))return true;
        effect(s,'stone',stone.x+stone.w/2,stone.y+stone.h,2,-7);return false;
    });
    for(const item of s.items)if(item.alive&&inside(item)){
        item.alive=false;item.held=false;
        if(s.held===item)s.held=null;if(s.riding===item)s.riding=null;
    }
    for(const reward of s.rewards)if(reward.w>0&&inside(reward))reward.w=0;
    s.items=s.items.filter(item=>item.alive);s.rewards=s.rewards.filter(reward=>reward.w>0);
    resolveActivation(s,new Set(s.level.cells.flatMap((t,id)=>t===active?[id]:[])),{crush:crushPlayer,defeat:defeatEnemy});
    activateTrampolines(s);
    s.notice=s.redOn?'红色机关启动':'蓝色机关启动';
}
export { spawnContent as payload } from './containers';
export function meltIce(s:State,x:number,y:number):void {
    const id=y*s.level.width+x;if(s.level.cells[id]!=='ice')return;
    const content=s.level.contents?.[id]??'empty';s.level.cells[id]='.';if(s.level.contents)delete s.level.contents[id];
    if(content==='coin')s.level.cells[id]='o';else payload(s,content,x+.1,y+.1);
    effect(s,'ice',x,y);
}
export function bonkTurret(s:State,cannon:Turret):void {if(!hasHelmet(s))return;cannon.vy=-7;emit(s,'metal',cannon.x);s.notice='顶起了炮台！';}
export function updateTurrets(s:State,dt:number,svc:Services):void {
    for(const cannon of s.turrets){
        const old={...cannon};cannon.vy=Math.min(18,cannon.vy+26*dt);svc.move(s,cannon,dt);
        if(cannon.y>old.y+.0001){
            for(const e of s.enemies)if(e.alive&&!e.held&&overlap(e,cannon)&&old.y+old.h<=e.y+.2)svc.defeat(s,e,'block');
            if(!s.pipe&&overlap(s.player,cannon)&&old.y+old.h<=s.player.y+.2){if(hasHelmet(s)){cannon.y=old.y;bonkTurret(s,cannon);}else svc.crush(s);}
        }
        cannon.wait-=dt;const props=cannon.props??{},radius=props.radius??28,source=cannon.id??Math.floor(cannon.y)*s.level.width+Math.floor(cannon.x),count=[...s.enemies.filter(e=>e.alive),...s.items.filter(e=>e.alive),...s.rewards].filter(e=>e.generatorId===source&&Math.hypot(e.x-cannon.x,e.y-cannon.y)<radius).length;
        if(cannon.wait<=0&&Math.abs(cannon.x-s.player.x)<radius&&count<(props.count??8)){emit(s,'cannon',cannon.x);cannon.wait=props.period??2.4;const dir=s.player.x+s.player.w/2<cannon.x+cannon.w/2?-1:1,created=payload(s,cannon.content,cannon.x+(dir<0?-.9:1.1),cannon.y+.1,dir);if(created){created.generatorId=source;if(props.ammoSpeed!==undefined)created.vx=dir*props.ammoSpeed;}}
    }
    s.turrets=s.turrets.filter(c=>c.y<s.level.height+2);
}
export function ironWake(s:State,e:Enemy,dt:number):void {
    if(e.frozen||!e.iron||e.kind!=='shell'||!e.alive)return;
    e.shellAge=(e.shellAge??0)+dt;
    if(e.shellAge<10||!e.held&&Math.abs(e.vx)>=1)return;
    emit(s,'metal',e.x);
    const feet=e.y+e.h;e.kind='iron-turtle';e.h=.8;e.y=feet-e.h;e.vx=-s.facing*1.5;e.vy=0;e.cooldown=.45;e.held=false;e.shellAge=0;
    if(s.held===e)s.held=null;
}
export function heldAction(s:State,i:Input):boolean {
    const e=s.held;if(!e)return false;
    if(e.kind==='bomb'&&e.bombFuse!==undefined&&!e.frozen){const throwing=i.fire&&!s.previous.fire;if(!throwing&&i.grab)return false;emit(s,throwing?'throw':'grab',e.x);e.held=false;if(throwing)launchBomb(e,s.facing,'throw');else{e.bombThrown=false;e.vx=e.vy=0;}e.cooldown=.3;e.x=s.facing>0?s.player.x+s.player.w+.02:s.player.x-e.w-.02;e.y=Math.min(e.y,s.player.y+s.player.h-e.h-.03);s.held=null;return throwing;}
    if('frozen'in e&&e.frozen){const throwing=i.fire&&!s.previous.fire;if(!throwing&&i.grab)return false;emit(s,throwing?'throw':'grab',e.x);e.held=false;e.frozen.thrown=throwing;e.frozen.detached=true;e.frozen.hang=0;e.attackChain=0;e.vx=throwing?s.facing*12:0;e.vy=0;e.cooldown=.3;e.x=s.facing>0?s.player.x+s.player.w+.02:s.player.x-e.w-.02;e.y=Math.min(e.y,s.player.y+s.player.h-e.h-.03);s.held=null;return throwing;}
    if(e.kind==='bone-shell'&&i.down&&!s.previous.down){e.y=s.player.y+s.player.h;e.held=false;s.held=null;mountBoneShell(s,e);placeRiding(s);return true;}
    if(e.kind==='basin'&&i.down&&!s.previous.down){emit(s,'metal');e.held=true;s.riding=e;s.held=null;s.pound='none';s.crouching=false;s.notice='坐进铁盆！Shift加跳跃可以跳出';return true;}
    const throwing=i.fire&&!s.previous.fire;
    if(!throwing&&i.grab)return false;
    emit(s,throwing?'throw':'grab');
    e.held=false;e.attackChain=0;e.vx=throwing?s.facing*12:0;e.vy=0;e.cooldown=throwing?.3:.4;
    if(e.kind==='basin'||e.kind==='bone-shell'||e.kind==='shell-helmet'||e.kind==='spike-shell-helmet'||e.kind==='pow'||e.kind==='red-pow'||e.kind==='wood-crate'||(e.kind==='snowball'||e.kind==='snowball-large')){e.x=s.facing>0?s.player.x+s.player.w+.03:s.player.x-e.w-.03;e.y=Math.min(e.y,s.player.y+s.player.h-e.h-.03);}
    if('thrown'in e){e.thrown=throwing;if((e.kind==='snowball'||e.kind==='snowball-large')){e.vx=throwing?s.facing*8.5:0;e.vy=throwing?-3:0;}else if(e.kind==='spring-v'){e.vx=throwing?s.facing*8:0;e.vy=throwing?-4:0;e.springBounces=0;e.compression=0;}else if((e.kind==='pow'||e.kind==='red-pow'||e.kind==='wood-crate')&&throwing)e.vy=-3;}
    s.held=null;return throwing;
}
export function ridingStep(s:State,i:Input,jump:boolean):boolean {
    if(!s.riding)return false;
    const p=s.player,basin=s.riding;
    if(jump&&i.grab){s.boneTime=0;s.bonePound=false;emit(s,'jump');basin.held=false;basin.vx=basin.vy=0;basin.cooldown=.4;s.riding=null;p.vy=-13.5;s.grounded=false;s.coyote=0;s.buffer=0;s.jumpSustain=true;s.jumpCut=false;return false;}
    if(ridingBoneShell(s)){if(jump&&s.grounded){emit(s,'jump');p.vy=-13.5;s.grounded=false;s.coyote=0;s.buffer=0;s.jumpSustain=true;s.jumpCut=false;}return true;}
    if(s.grounded&&(i.axis||jump)){if(jump)emit(s,'jump');p.vy=jump?-13.5:-2.5;s.grounded=false;s.coyote=0;s.buffer=0;s.jumpSustain=jump;s.jumpCut=false;}
    return true;
}
export function placeRiding(s:State):void {if(s.riding){if(s.pipe?.glass){const angle=(s.pipe.angle??0)-(s.pipe.flip?Math.PI:0);s.riding.x=s.player.x+s.player.w/2-Math.sin(angle)*.35-s.riding.w/2;s.riding.y=s.player.y+s.player.h/2+Math.cos(angle)*.35-s.riding.h/2;}else{s.riding.x=s.player.x+s.player.w/2-s.riding.w/2;s.riding.y=s.player.y+s.player.h-.2;}}}
