import {disguised} from './p2-wearables';
import {updateP2Enemy} from './p2-enemies';
import {damageBoss} from './fortress';
import {rulesFor} from './profile';
import {makeItem,makeEnemy} from './body-factory';
import { modifyEnemy, updateP1Enemy } from './p1-enemies';
import { resolveActivation, redPow } from './p1-mechanisms';
import type { State, Level, Body, Enemy, Item, Input, Tile, Defeated } from './model';
import { ITEM_KINDS, EXTRA_ENEMIES, type ItemKind, type ElementProperties } from './catalog';
import { worldGlassPath, glassMouths } from './glass';
import { toggleColor } from './advanced';
import { collectKey } from './adventure';
import { bounceHorizontalSpring, bounceVerticalSpring, HORIZONTAL_SPRING_HEIGHT } from './springs';
import { touchingSwitch } from './switches';
import { grantPower } from './power';
import { updateCrate, updateWorkshopEnemy } from './workshop';
import { updateFireJumper } from './frost';
import { emit } from './events';
import { pipeShape } from './pipes';
import { updateSnowball } from './desert';

const cell=(l:Level,x:number,y:number):Tile=>x<0||y<0||x>=l.width||y>=l.height?'.':l.cells[Math.floor(y)*l.width+Math.floor(x)]!;
const overlap=(a:Body,b:Body)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
export interface Services {
    activatePow?(s:State,item:Item):void;
    move(s:State,b:Body,dt:number,player?:boolean,breakBricks?:boolean):{floor:boolean;wall:number;slope:number};
    hurt(s:State,direction?:'top'|'side'|'bottom'):void;
    defeat(s:State,e:Enemy,cause:Defeated['cause'],source?:Body):void;
    solid(t:Tile,pTime?:number,redOn?:boolean):boolean;
    crush(s:State):void;
    hitBlock(s:State,x:number,y:number,t:Tile,down?:boolean):void;
    coin(s:State,x:number,y:number,count?:number):void;
}
export {makeItem,makeEnemy} from './body-factory';
export function initExpansion(l:Level):Pick<State,'items'|'starTime'|'helmet'|'pTime'|'pConversions'|'springEffects'|'swimming'|'swimAge'|'sliding'|'slope'|'slideTime'|'shake'|'powFlash'|'door'|'doorWait'|'view'> & {extraEnemies:Enemy[]} {
    const items:Item[]=[],extraEnemies:Enemy[]=[];
    l.cells.forEach((t,id)=>{
        const x=id%l.width,y=Math.floor(id/l.width),props=l.properties?.[id]??{};
        if(ITEM_KINDS.includes(t)){const item=makeItem(t as ItemKind,x,y);item.content=l.contents?.[id];if(t==='koopa-car')item.health=props.durability??3;item.rotation=props.rotation;if((props.rotation===90||props.rotation===270)&&t==='p-switch'){[item.w,item.h]=[item.h,item.w];item.y=y+1-item.h;}item.large=t==='snowball-large'||props.large;items.push(item);l.cells[id]=props.liquid??([cell(l,x-1,y),cell(l,x+1,y)].includes('quicksand')?'quicksand':'.');}
        if(t==='cactus')for(let n=1;n<(props.height??3);n++){const at=id-n*l.width;l.cells[at]=[cell(l,x-1,y-n),cell(l,x+1,y-n)].includes('quicksand')?'quicksand':'.';}
        if(EXTRA_ENEMIES.includes(t)){extraEnemies.push({...modifyEnemy(makeEnemy(t as Enemy['kind'],x,y,props),props,l.theme),...(props.drop?{drop:props.drop}:{})});l.cells[id]=props.liquid??((t==='fish'||t==='squid'||t==='fishbone')&&[cell(l,x-1,y),cell(l,x+1,y),cell(l,x,y-1),cell(l,x,y+1)].includes('water')?'water':[cell(l,x-1,y),cell(l,x+1,y)].includes('quicksand')?'quicksand':[cell(l,x-1,y),cell(l,x+1,y)].includes('lava')?'lava':'.');}
        if(t==='glass-pipe'&&props.path){const mouths=glassMouths(worldGlassPath(l,id,props.path));for(const [n,m]of mouths.entries())if(m.normal[1]===-1&&(n===0?props.plant:props.endPlant)){const e=makeEnemy('plant',m.point[0]-.5,m.point[1]-1,{mode:'pipe'});e.origin=[m.point[0]-.4,m.point[1]+.05];extraEnemies.push(e);}}
        else if(t==='P'&&props.plant){const pipe=pipeShape(l,id)!,e=makeEnemy('plant',x+.5,y-1,{mode:'pipe'});e.plantMouth=pipe.mouth;e.plantDirection=pipe.normal;e.w=pipe.normal[0]?.015:.8;e.h=pipe.normal[0]?.8:.015;e.x=pipe.mouth[0]-e.w/2;e.y=pipe.mouth[1]-e.h/2;e.origin=[pipe.mouth[0]-.4,pipe.mouth[1]];extraEnemies.push(e);}
        else if(t==='glass-pipe'&&props.plant){const e=makeEnemy('plant',x+.5,y-1,{mode:'pipe'});e.origin=[x+.6,y+.05];extraEnemies.push(e);}
    });
    for(const e of [...extraEnemies])if(e.kind==='ring-ghost'){const count=e.modifiers?.count??6;e.origin=[0,0];for(let n=1;n<count&&extraEnemies.length<256;n++){const copy=structuredClone(e);copy.origin=[n*Math.PI*2/count,0];extraEnemies.push(copy);}}
    return {items,extraEnemies,starTime:0,helmet:false,pTime:0,pConversions:{},springEffects:[],swimming:false,swimAge:0,sliding:false,slope:0,slideTime:0,shake:0,powFlash:0,door:null,doorWait:0,view:{x:Math.max(0,l.spawn[0]-9),y:Math.max(0,l.spawn[1]-8),w:1232/48,h:12}};
}
export function inWater(l:Level,b:Body):boolean {
    return [b.y+b.h*.3,b.y+b.h*.75].some(y=>{const x=b.x+b.w/2;if(l.liquid?.kind==='water'&&l.liquidSurface!==undefined&&x>=(l.liquid.x??0)&&x<(l.liquid.x??0)+(l.liquid.width??l.width))return y>=l.liquidSurface;return cell(l,x,y)==='water';});
}
export function slopeAt(l:Level,x:number,y:number):{height:number;grade:number}|null {
    const t=cell(l,x,y),row=Math.floor(y),u=x-Math.floor(x);
    if(String(t).startsWith('gentle-')){const second=String(t).endsWith('-body'),up=String(t).startsWith('gentle-up'),v=(u+(second?1:0))/2;return {height:row+(up?1-v:v),grade:up?-.5:.5};}
    return t==='slope-up'?{height:row+1-u,grade:-1}:t==='slope-down'?{height:row+u,grade:1}:null;
}
/** Test only the filled triangle, leaving the air above the diagonal traversable. */
export function slopeIntersects(t:Tile,x:number,y:number,b:Body):boolean {
    if(t!=='slope-up'&&t!=='slope-down'&&!String(t).startsWith('gentle-'))return false;
    const left=Math.max(x,b.x),right=Math.min(x+1,b.x+b.w);
    if(right-left<.00001||b.y>=y+1-.00001||b.y+b.h<=y+.00001)return false;
    const gentle=String(t).startsWith('gentle-'),up=t==='slope-up'||String(t).startsWith('gentle-up'),offset=String(t).endsWith('-body')?1:0;
    const surface=gentle?y+(up?1-((right-x)+offset)/2:((left-x)+offset)/2):up?y+1-(right-x):y+(left-x);
    // Surface following samples 0.001 tiles inside each foot edge. Leave that
    // contact tolerance here so a standing body never catches on its own ramp.
    return b.y+b.h>surface+.003;
}
export function resolveSlope(s:State,b:Body,oldY:number,oldX:number,dt:number,isSolid:(t:Tile,pTime?:number)=>boolean):number|null {
    if(b.vy<0)return null;
    const oldFeet=oldY+b.h,feet=b.y+b.h;
    const samples=[.001,b.w/2,b.w-.001];
    const following=samples.some(offset=>{
        for(let y=Math.floor(oldFeet)-1;y<=Math.floor(oldFeet+.1);y++){
            const old=slopeAt(s.level,oldX+offset,y);if(old&&Math.abs(oldFeet-old.height)<.1)return true;
        }return false;
    });
    let best:{height:number;grade:number}|null=null;
    for(const x of samples.map(offset=>b.x+offset))for(let y=Math.floor(feet)-1;y<=Math.floor(feet+.15);y++){
        const hit=slopeAt(s.level,x,y)??(following&&isSolid(cell(s.level,x,y),s.pTime)&&!isSolid(cell(s.level,x,y-1),s.pTime)?{height:y,grade:0}:null);if(!hit)continue;
        if(oldFeet<=hit.height+.08+Math.abs(b.vx*dt)&&feet>=hit.height-(following?.2:.001)&&(!best||hit.height<best.height))best=hit;
    }
    if(!best)return null;b.y=best.height-b.h;b.vy=0;return best.grade;
}
export function triggerP(s:State):void {
    emit(s,'switch');
    if(s.pTime===0){s.pConversions={};s.level.cells.forEach((t,id)=>{if(t==='B'||t==='o'){const to=t==='B'?'o':'B';s.pConversions[id]={from:t,to};s.level.cells[id]=to;}});}
    s.pTime=10;s.notice='P开关启动！10秒路径变化';
}
export const P_SWITCH_VANISH_TIME=.4;
export function pressSwitch(s:State,item:Item):void {
    item.spent=true;item.pressedAge=0;const r=item.rotation??0;if(r===90||r===270){if(r===90)item.x+=item.w-.18;item.w=.18;}else{if(r===0)item.y+=item.h-.18;item.h=.18;}item.vx=item.vy=0;triggerP(s);
}
/** Only a downward top contact presses a switch; sides remain solid barriers. */
export function pressPSwitch(s:State,b:Body,previous:Body):boolean {
    for(const item of s.items){if(item===b||item.kind!=='p-switch'||!item.alive||item.held||item.spent)continue;
        const r=item.rotation??0,n:[number,number]=r===0?[0,-1]:r===90?[1,0]:r===180?[0,1]:[-1,0];
        const tangent=n[0]?b.y<item.y+item.h-.001&&b.y+b.h>item.y+.001:b.x<item.x+item.w-.001&&b.x+b.w>item.x+.001;
        const edge=n[0]?n[0]>0?item.x+item.w:item.x:n[1]>0?item.y+item.h:item.y;
        const gap=(q:Body)=>n[0]?n[0]>0?q.x-edge:edge-q.x-q.w:n[1]>0?q.y-edge:edge-q.y-q.h;
        if(!tangent||(previous.vx*n[0]+previous.vy*n[1]>=-1e-8&&!(n[1]===-1&&previous.vy>=0))||gap(previous)<-.04||gap(b)>.03||gap(b)<-.08)continue;
        pressSwitch(s,item);
        if(n[0])b.x=n[0]>0?item.x+item.w:item.x-b.w;else b.y=n[1]>0?item.y+item.h:item.y-b.h;
        if(b===s.player){b.vx=n[0]*4;b.vy=n[1]*4;}return true;
    }return false;
}
export function expansionTimers(s:State,dt:number,svc?:Services):void {
    s.starTime=Math.max(0,s.starTime-dt);s.shake=Math.max(0,s.shake-dt);s.powFlash=Math.max(0,s.powFlash-dt);s.doorWait=Math.max(0,s.doorWait-dt);s.slideTime=Math.max(0,s.slideTime-dt);
    for(const fx of s.springEffects)fx.age+=dt;s.springEffects=s.springEffects.filter(f=>f.age<.32);
    // Keep the pressed pose briefly, then retire it even during door/pipe travel.
    for(const item of s.items)if(item.kind==='p-switch'&&item.spent){item.pressedAge=(item.pressedAge??0)+dt;if(item.pressedAge>=P_SWITCH_VANISH_TIME)item.alive=false;}
    s.items=s.items.filter(item=>item.alive);
    if(s.pTime>0){s.pTime=Math.max(0,s.pTime-dt);if(s.pTime===0){emit(s,'switch');for(const [id,c]of Object.entries(s.pConversions))if(s.level.cells[Number(id)]===c.to)s.level.cells[Number(id)]=c.from;if(svc)resolveActivation(s,new Set(Object.keys(s.pConversions).map(Number).filter(id=>svc.solid(s.level.cells[id]!,0,s.redOn))),svc);s.pConversions={};s.notice='P开关时间结束';}}
}
export function pairedExit(l:Level,id:number,pTime:number,pipes=false):number|undefined {
    const t=l.cells[id],link=l.properties?.[id]?.link??1;
    const candidates=l.cells.flatMap((v,n)=>n!==id&&(pipes?(v===t&&(v==='P'||v==='glass-pipe')):(v==='door'||v==='locked-door'||v==='p-door'&&pTime>0))&&(l.properties?.[n]?.link??1)===link?[n]:[]);
    if(t==='p-door'&&pTime<=0)return undefined;
    return candidates[0];
}
export function doorStep(s:State,i:Input,dt:number):boolean {
    if(s.door){const d=s.door;d.age+=dt;s.player.vx=s.player.vy=0;if(d.age>=.35){s.player.x=d.to[0];s.player.y=d.to[1];}if(d.age>=.7){s.door=null;s.doorWait=.5;s.invincible=Math.max(s.invincible,.8);}return true;}
    if(!i.interact||s.previous.interact||s.doorWait>0)return false;
    if(s.held?.kind==='basin'){if(s.helmet){s.notice='已经戴着铁盆';return false;}emit(s,'metal');s.helmet=true;s.held.alive=false;s.held.held=false;s.held=null;s.notice='铁盆戴好了！可抵挡来自头顶的一次伤害';return false;}
    const p=s.player;
    for(let y=Math.max(0,Math.floor(p.y));y<=Math.min(s.level.height-1,Math.floor(p.y+p.h));y++)for(let x=Math.floor(p.x);x<=Math.floor(p.x+p.w);x++){
        const id=y*s.level.width+x,t=s.level.cells[id];if(t!=='door'&&t!=='p-door'&&t!=='locked-door')continue;const exit=pairedExit(s.level,id,s.pTime);if(exit===undefined){s.notice=t==='p-door'&&s.pTime===0?'P门需要先踩下P开关':'请给两扇门设置相同的连接编号';continue;}
        if(t==='locked-door'&&!s.unlockedDoors[id]){if(!s.keys.length){s.notice='这扇门需要一把钥匙';continue;}s.keys.shift();s.unlockedDoors[id]=true;}
        emit(s,'door');s.climbing=false;const ex=exit%s.level.width,ey=Math.floor(exit/s.level.width);s.door={age:0,from:[p.x,p.y],to:[ex+.5-p.w/2,ey+1-p.h],source:id,target:exit};s.cheerAge=.8;s.notice='正在穿过门';return true;
    }return false;
}
export function firebarPoints(l:Level,x:number,y:number,time:number):{x:number;y:number}[]{
    const props=l.properties?.[y*l.width+x]??{},n=props.length??4,angle=(props.phase??0)+time*(props.speed??1.5);
    return Array.from({length:n},(_,j)=>({x:x+.5+Math.cos(angle)*(j+1)*.55,y:y+.5+Math.sin(angle)*(j+1)*.55}));
}
export function triggerPow(s:State,svc:Services):void {
    emit(s,'pow');
    for(const e of s.enemies){if(!e.alive||e.held||!overlap(e,{...s.view,vx:0,vy:0}))continue;const feet=e.y+e.h,t=cell(s.level,e.x+e.w/2,feet+.04),ground=svc.solid(t,s.pTime,s.redOn)||t==='='||slopeAt(s.level,e.x+e.w/2,feet+.04);if(ground)svc.defeat(s,e,'pow');}
    if(rulesFor(s.level).rewards==='score')for(const b of s.bosses)if(b.health>0&&overlap(b,{...s.view,vx:0,vy:0})&&svc.solid(cell(s.level,b.x+b.w/2,b.y+b.h+.04),s.pTime,s.redOn))damageBoss(s,b,'pow');
    s.shake=.45;s.powFlash=.22;s.notice='POW！地面敌人被震飞';
}
/** Consume once. Ordinary standing, walking and head contact never activate POW. */
export function detonatePow(s:State,item:Item,svc:Services):void {
    if(!item.alive||item.kind!=='pow'&&item.kind!=='red-pow')return;
    if(item.kind==='red-pow'){redPow(s,item,svc);return;}
    item.alive=false;item.held=false;if(s.held===item)s.held=null;
    triggerPow(s,svc);
}
/** Swept AABB picks the first enemy along the actual throw, independent of list order. */
function throwContact(from:Body,to:Body,target:Body):number|null {
    let enter=0,exit=1;
    for(const [position,size,delta,low,high]of [[from.x,from.w,to.x-from.x,target.x,target.x+target.w],[from.y,from.h,to.y-from.y,target.y,target.y+target.h]]){
        if(Math.abs(delta!)<1e-9){if(position!+size!<=low!||position!>=high!)return null;continue;}
        const a=(low!-position!-size!)/delta!,b=(high!-position!)/delta!;
        enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
        if(enter>exit)return null;
    }
    return enter;
}
export function springEffect(s:State,x:number,y:number,kind:'spring-h'|'spring-v'):void {
    emit(s,'spring',x+.4);
    s.springEffects=s.springEffects.filter(f=>f.x!==x||f.y!==y);s.springEffects.push({x,y,age:0,kind});s.springEffects=s.springEffects.slice(-32);
}
export function updateItems(s:State,i:Input,dt:number,before:number,svc:Services):void {
    const p=s.player;
    for(const item of s.items){
        if(!item.alive||item.transit||item.kind==='koopa-car')continue;
        if((item.kind==='snowball'||item.kind==='snowball-large')){updateSnowball(s,item,i,dt,svc);continue;}
        if(item.kind==='wood-crate'){updateCrate(s,item,i,dt,svc);continue;}
        if(item.kind==='p-switch'&&item.spent)continue;
        if(item.compression!==undefined)item.compression=Math.max(0,item.compression-dt);
        if(item.held)continue;
        if(item.kind==='coin'){const old={...item};item.age+=dt;item.cooldown=Math.max(0,item.cooldown-dt);item.vy=Math.min(18,item.vy+26*dt);const hit=svc.move(s,item,dt);if(!item.alive||item.y>s.level.height+2){item.alive=false;continue;}if(hit.floor&&item.sandSurface===undefined){item.vy=-2;item.vx*=.8;}bounceVerticalSpring(s,item,old);bounceHorizontalSpring(s,item,old);if(overlap(p,item)&&item.cooldown===0){svc.coin(s,item.x+item.w/2,item.y);item.alive=false;}continue;}
        if(item.kind==='key'){item.age+=dt;item.vy=Math.min(18,item.vy+26*dt);svc.move(s,item,dt);if(item.y>s.level.height+2)item.alive=false;if(!item.alive||item.transit)continue;if(overlap(p,item)){collectKey(s,item.x+item.w/2,item.y+item.h/2);item.alive=false;}continue;}
        item.age+=dt;item.cooldown=Math.max(0,item.cooldown-dt);
        const old={...item},vx=item.vx;item.vy=Math.min(18,item.vy+26*dt);const impactVy=item.vy;
        const r=svc.move(s,item,dt,false,item.kind==='basin'&&Math.abs(vx)>5);if(!item.alive||item.transit)continue;
        if(r.wall)item.vx=item.kind==='p-switch'||item.kind==='pow'?0:-vx;
        const sprung=bounceVerticalSpring(s,item,old);bounceHorizontalSpring(s,item,old);
        if(sprung)r.floor=false;
        if(item.kind==='giant-pearl')pressPSwitch(s,item,old);
        if(item.y>s.level.height+2){item.alive=false;continue;}
        if(item.kind==='p-switch'){
            if(r.floor&&item.thrown&&impactVy>2)emit(s,'bump',item.x);
            if(r.floor){item.vx=Math.sign(item.vx)*Math.max(0,Math.abs(item.vx)-70*dt);if(item.vx===0){item.vx=0;item.thrown=false;item.vy=0;}}
            else if(item.thrown){item.vx*=Math.exp(-3*dt);if(Math.abs(item.vx)<.12)item.vx=0;}
        }
        if(item.kind==='spring-v'&&item.thrown){
            if(r.wall)item.vx=-vx*.35;
            if(r.floor){
                if(impactVy>2)emit(s,'spring',item.x);
                const bounces=item.springBounces??0,rebound=Math.min(4,impactVy*.65);
                item.springBounces=bounces+1;item.compression=.1;item.vx*=.4;
                if(bounces<3&&rebound>1)item.vy=-rebound;
                else{item.vx=item.vy=0;item.thrown=false;}
            }
            // Retain flight speed until first contact, then brake through the
            // diminishing rebounds so the spring settles close to its landing.
            if((item.springBounces??0)>0){item.vx*=Math.exp(-8*dt);if(Math.abs(item.vx)<.12)item.vx=0;}
        }
        if(item.kind==='star'&&r.floor&&item.sandSurface===undefined)item.vy=-7;
        if((item.kind==='pow'||item.kind==='red-pow')&&item.thrown){
            const first=s.enemies.filter(e=>e.alive&&!e.held&&(e.kind!=='plant'||Math.min(e.w,e.h)>=.08)).map(e=>({e,t:throwContact(old,item,e)})).filter(hit=>hit.t!==null).sort((a,b)=>a.t!-b.t!)[0];
            if(first){svc.defeat(s,first.e,'pow');detonatePow(s,item,svc);continue;}
            if(r.wall||r.floor){detonatePow(s,item,svc);continue;}
        }
        if(item.kind==='basin'&&Math.abs(item.vx)>5)for(const e of s.enemies)if(e.alive&&!e.held&&overlap(item,e))svc.defeat(s,e,'shell',item);
        if(item.kind==='spring-h'){if(r.floor)item.vx=0;continue;}
        if(item.cooldown>0||!(['p-switch','basin','pow','red-pow'].includes(item.kind)?touchingSwitch(p,item):overlap(p,item)))continue;
        if(item.kind==='star'){emit(s,'star');item.alive=false;s.starTime=10;s.notice='无敌星！10秒无敌';continue;}
        if(item.kind==='giant-pearl'){item.alive=false;grantPower(s,3);s.notice='巨型珍珠！落下两格可踩碎一层砖';continue;}
        const stomp=p.vy>=0&&before<=item.y+.2;
        if(item.kind==='p-switch'&&stomp&&!item.spent){pressSwitch(s,item);p.y=item.y-p.h;p.vy=-4;s.grounded=false;s.coyote=0;continue;}
        if(item.kind==='spring-v'&&stomp&&!i.grab){p.y=item.y-p.h;p.vy=i.jump||i.spin?-Math.sqrt(40*(13.5**2/40+(16**2/60-2))):-Math.sqrt(60*(16**2/60-2));s.springWindow=.22;s.springBoosted=!!(i.jump||i.spin);s.grounded=false;s.spinning=i.spin;s.jumpSustain=!!(i.jump||i.spin);s.jumpCut=false;s.coyote=0;s.buffer=0;springEffect(s,item.x,item.y,'spring-v');item.cooldown=.18;continue;}
        if(i.grab&&!s.held&&!item.spent&&(item.kind!=='basin'||r.floor&&Math.abs(item.vx)<.1&&Math.abs(item.vy)<.1)){emit(s,'grab',item.x);item.held=true;item.vx=item.vy=0;if(item.kind==='p-switch')item.thrown=false;if(item.kind==='spring-v'){item.thrown=false;item.springBounces=0;item.compression=0;}s.held=item;continue;}
        if(item.kind==='basin'){
            if(stomp){emit(s,'metal',item.x);p.y=item.y-p.h;p.vy=-7;item.vx=Math.abs(item.vx)>5?0:s.facing*12;}
            else if(Math.abs(item.vx)<1){
                const side=item.x+item.w/2-p.x-p.w/2;
                // Boundary contact alone is not a kick. Collision resolution
                // stops vx, so use the approach velocity captured before it.
                if(side*(p.pushVx??p.vx)<=.01)continue;
                emit(s,'metal',item.x);item.vx=Math.sign(side||s.facing)*12;
            }else{emit(s,'metal',item.x);svc.hurt(s,item.y+item.h<p.y+.3?'top':'side');}
            item.attackChain=0;item.cooldown=.3;
        }
    }
    s.items=s.items.filter(item=>item.alive);
    bounceHorizontalSpring(s,p,p);
    for(let y=Math.max(0,Math.floor(s.view.y)-10);y<Math.min(s.level.height,s.view.y+s.view.h+10);y++)for(let x=Math.max(0,Math.floor(s.view.x)-10);x<Math.min(s.level.width,s.view.x+s.view.w+10);x++)if(cell(s.level,x,y)==='firebar')for(const point of firebarPoints(s.level,x,y,s.time))if(overlap(p,{x:point.x-.18,y:point.y-.18,w:.36,h:.36,vx:0,vy:0}))svc.hurt(s,point.y<p.y+.2?'top':'side');
}
export function updateSpecialEnemy(s:State,e:Enemy,dt:number,svc:Services):boolean {
    e.age=(e.age??0)+dt;
    if(e.kind==='cactus'){e.cactusDrop=Math.max(0,(e.cactusDrop??0)-dt);return false;}
    if(updateP2Enemy(s,e,dt,svc))return true;
    if(updateP1Enemy(s,e,dt,svc))return true;
    if(updateWorkshopEnemy(s,e,dt,svc))return true;
    if(e.transit)return true;
    if(e.kind==='fire-jumper'){updateFireJumper(s,e,dt);return true;}
    if(e.kind==='plant'){
        // Only pipe-mounted plants are anchored. Independent plants retain
        // their current position and use the shared gravity/collision path.
        if(e.mode!=='pipe'&&!e.plantMouth){e.vx=0;e.h=e.modifiers?.large?2:1;return false;}
        e.vx=e.vy=0;const origin=e.origin??[e.x,e.y+e.h];e.origin=origin;
        if(e.plantMouth&&e.plantDirection){
            const mouth=e.plantMouth,n=e.plantDirection,phase=e.age%4;
            const exposed=phase<1?0:phase<1.7?(phase-1)/.7:phase<2.7?1:phase<3.4?1-(phase-2.7)/.7:0;
            if(Math.hypot(s.player.x+s.player.w/2-mouth[0],s.player.y+s.player.h/2-mouth[1])<1.4&&phase<1)e.age-=dt;
            const length=Math.max(.015,exposed*1.15);e.w=n[0]?length:.8;e.h=n[0]?.8:length;
            e.x=mouth[0]+(n[0]<0?-length:n[0]>0?0:-.4);e.y=mouth[1]+(n[1]<0?-length:n[1]>0?0:-.4);e.grounded=true;return true;
        }
        if(e.mode==='pipe'){const phase=e.age%4;let exposed=phase<1?0:phase<1.7?(phase-1)/.7:phase<2.7?1:phase<3.4?1-(phase-2.7)/.7:0;if(Math.abs(s.player.x+s.player.w/2-origin[0]-.4)<1.25&&phase<1)e.age-=dt;e.h=Math.max(.015,exposed*1.15);e.y=origin[1]-e.h;}else{e.h=1;e.y=origin[1]-1;}e.grounded=true;return true;
    }
    if(e.kind==='cannonball'&&e.ballistic){e.vy=Math.min(18,e.vy+20*dt);const r=svc.move(s,e,dt);if(r.wall||r.floor||e.age>12)e.alive=false;return true;}
    if(e.kind==='cannonball'){e.x+=e.vx*dt;e.vy=0;if(e.age>12||e.x< -2||e.x>s.level.width+2)e.alive=false;return true;}
    if(e.kind==='ghost'){e.shy=disguised(s)||(e.x+e.w/2-s.player.x-s.player.w/2)*s.facing>0;if(e.shy){e.vx=e.vy=0;}else{const dx=s.player.x-e.x,dy=s.player.y-e.y,d=Math.hypot(dx,dy)||1;e.vx=dx/d*.65;e.vy=dy/d*.65;e.x+=e.vx*dt;e.y+=e.vy*dt;}return true;}
    if(e.kind==='squid'){updateSquid(s,e,dt,svc);return true;}
    if(e.kind!=='fish')return false;
    const origin=e.origin??[e.x,e.y];e.origin=origin;
    e.vy=Math.cos(e.age*2.4)*.7;if(!inWater(s.level,{...e,x:e.x+e.vx*dt,y:e.y+e.vy*dt})){e.vx=-e.vx;e.vy+=(origin[1]-e.y)*2;}
    if((e.springLaunch??0)>0)e.vx=Math.sign(e.vx)*9.6;
    const vx=e.vx,r=svc.move(s,e,dt);if(r.wall)e.vx=-vx;e.grounded=r.floor;return true;
}

export const SQUID_RISE_SPEED=10,SQUID_SINK_SPEED=1.05;
function updateSquid(s:State,e:Enemy,dt:number,svc:Services):void {
    e.squidPhase??='rise';
    const oldX=e.x,oldY=e.y,incomingVx=e.vx,rising=e.squidPhase==='rise';
    if(rising){
        e.squidRiseStart??=[e.x,e.y];e.squidDrift??=0;
        const dx=s.player.x+s.player.w/2-e.x-e.w/2,left=Math.max(0,4-e.squidDrift);
        e.vx=Math.sign(dx)*Math.min(8,Math.abs(dx)/dt,left/dt);
        if((e.turnWait??0)>0&&e.springPace!==undefined)e.vx=Math.sign(incomingVx)*Math.min(Math.abs(incomingVx),left/dt);
        e.vy=-Math.min(SQUID_RISE_SPEED,Math.max(0,e.y-Math.max(0,e.squidRiseStart[1]-5))/dt);
        if(inWater(s.level,e)&&!inWater(s.level,{...e,x:e.x+e.vx*dt}))e.vx=0;
    }else{
        e.squidPeak??=e.y;e.vx=0;
        const target=Math.max(e.squidPeak+1,Math.min(e.squidPeak+6,s.player.y+s.player.h/2-e.h/2));
        e.vy=Math.min(SQUID_SINK_SPEED,Math.max(0,target-e.y)/dt);
    }
    if((e.springLaunch??0)>0)e.vx=Math.sign(incomingVx||s.player.x-e.x)*9.6;
    const intendedY=e.vy,hit=svc.move(s,e,dt);e.grounded=hit.floor;
    if(rising){
        e.squidDrift!+=Math.abs(e.x-oldX);
        if(e.y<=Math.max(0,e.squidRiseStart![1]-5)+1e-7||intendedY<0&&e.y>=oldY-1e-7){e.squidPhase='sink';e.squidPeak=e.y;e.vx=0;e.vy=SQUID_SINK_SPEED;}
    }else{
        const target=Math.max(e.squidPeak!+1,Math.min(e.squidPeak!+6,s.player.y+s.player.h/2-e.h/2));
        if(e.y>=target-1e-7||hit.floor||intendedY>0&&e.y<=oldY+1e-7){e.squidPhase='rise';delete e.squidRiseStart;e.squidDrift=0;e.vy=-SQUID_RISE_SPEED;}
    }
}
