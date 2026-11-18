import { centeredCamera } from './camera';
import type { Body, State } from './model';

const playerFields = [
    'player','power','facing','grounded','fallPeak','giantBounce','previous',
    'crouching','crouchAge','running','skidding','skidDecel','turning','turnAge','springDrift','stride','dust','dustWait',
    'wall','wallGrace','wallDirection','wallKick','bufferedSpin','coyote','buffer','spinning','spinAge','jumpSustain','jumpCut',
    'climbing','climbAge','climbWait','swimming','swimAge','swimKickAge','sliding','slope','slideTime',
    'pound','poundAge','jumpChain','chainWindow','springWindow','springBoosted','jumpSerial',
    'held','riding','vehicle','helmet','shellHelmet','wearable','starTime','invincible','boneTime','bonePound',
    'fireWait','shootAge','shootFacing','pendingShot','boomerangs','motion','motionAge','charge','runCharge','catStamina','abilityWait','dashTime','stun',
    'scoreChain','clearRun','victory','door','doorWait','pipe','pipeWait','eatAge','eatFacing','bites','cheerAge','cheerFacing',
] as const satisfies readonly (keyof State)[];
export type PlayerState = Pick<State, typeof playerFields[number]>;
type Arrival = {x:number;y:number};
export type PlayerRecovery = {kind:'waiting';remaining:number} | {kind:'bubble';age:number};
export interface CoopState {
    players: PlayerState[];
    spawn: PlayerState;
    arrivals: (Arrival|null)[];
    recovery: (PlayerRecovery|null)[];
    pops: {x:number;y:number;age:number}[];
    active: number;
    failed: number;
    traveler: number;
    viewport: {w:number;h:number};
}
function copyPlayer(from:PlayerState,to:PlayerState):void {
    const target:Record<typeof playerFields[number],unknown>=to;
    for(const key of playerFields)target[key]=from[key];
}
export function startCoop(s:State,count:number,w:number,h:number):void {
    const initial={} as PlayerState;
    copyPlayer(s,initial);
    s.coop={players:Array.from({length:count},(_,i)=>i===0?initial:structuredClone(initial)),spawn:structuredClone(initial),arrivals:Array(count).fill(null),recovery:Array(count).fill(null),pops:[],active:0,failed:-1,traveler:-1,viewport:{w,h}};
}
export function asPlayer<T>(s:State,index:number,action:()=>T):T {
    const coop=s.coop;
    if(!coop||index===coop.active)return action();
    const previous=coop.active;
    copyPlayer(s,coop.players[previous]!);
    copyPlayer(coop.players[index]!,s);
    coop.active=index;
    try{return action();}finally{
        copyPlayer(s,coop.players[index]!);
        copyPlayer(coop.players[previous]!,s);
        coop.active=previous;
    }
}
export function playerAt(s:State,index:number):PlayerState {
    return !s.coop||s.coop.active===index?s:s.coop.players[index]!;
}
export function restoreCoopPlayer(s:State,body:Body,grounded:boolean):void {
    const coop=s.coop!,clearRun=s.clearRun;
    copyPlayer(structuredClone(coop.spawn),s);
    s.player=body;s.clearRun=clearRun;s.clearRun.ready=false;s.grounded=grounded;s.fallPeak=body.y+body.h;s.invincible=2;s.pipeWait=s.doorWait=.5;
    coop.recovery[coop.active]=null;
}
export const isRecovering=(s:State):boolean=>!!s.coop?.recovery[s.coop.active];
const canAct=(coop:CoopState,i:number)=>!coop.arrivals[i]&&!coop.recovery[i]&&(coop.traveler<0||coop.traveler===i);
export function livingPlayers(s:State):Body[] {
    const coop=s.coop;
    return coop?coop.players.flatMap((_,i)=>coop.recovery[i]?[]:[playerAt(s,i).player]):[s.player];
}
export function playerBodies(s:State):Body[] {
    const coop=s.coop;
    return coop?coop.players.flatMap((_,i)=>canAct(coop,i)?[playerAt(s,i).player]:[]):[s.player];
}
export function visitPlayers(s:State,action:()=>void):void {
    const coop=s.coop;
    if(!coop){action();return;}
    for(let i=0;i<coop.players.length&&s.phase==='playing';i++){
        if(canAct(coop,i))asPlayer(s,i,action);
    }
}
export function asPlayerBody<T>(s:State,b:Body,action:(player:boolean)=>T):T {
    if(b===s.player)return action(true);
    const index=s.coop?.players.findIndex((_,i)=>playerAt(s,i).player===b)??-1;
    return index<0?action(false):asPlayer(s,index,()=>action(true));
}
export function nearestPlayer<T>(s:State,b:Body,action:()=>T):T {
    const coop=s.coop;
    if(!coop)return action();
    let target=coop.active,distance=Infinity;
    for(let i=0;i<coop.players.length;i++){
        if(!canAct(coop,i))continue;
        const p=playerAt(s,i).player,dx=p.x+p.w/2-b.x-b.w/2,dy=p.y+p.h/2-b.y-b.h/2,d=dx*dx+dy*dy;
        if(d<distance){target=i;distance=d;}
    }
    return asPlayer(s,target,action);
}
export function coopCamera(s:State):{x:number;y:number} {
    const coop=s.coop!,players=livingPlayers(s);
    if(players.length===0)players.push(playerAt(s,Math.max(0,coop.failed)).player);
    const center={x:0,y:0,w:0,h:0,vx:0,vy:0};
    for(const p of players){
        center.x+=(p.x+p.w/2)/players.length;center.y+=(p.y+p.h/2)/players.length;
    }
    return centeredCamera(s.level,center,coop.viewport.w,coop.viewport.h);
}
/** Limit the current actor so every body fits around the arithmetic mean. */
export function coopAxis(s:State,p:Body,axis:'x'|'y'): [number,number] | undefined {
    const coop=s.coop;
    if(!coop||coop.traveler>=0||s.phase!=='playing')return;
    const size=axis==='x'?'w':'h',half=coop.viewport[size]/2,bodyHalf=p[size]/2;
    let n=1;
    let sum=0,far=-Infinity,near=Infinity;
    for(let i=0;i<coop.players.length;i++){
        if(i===coop.active||coop.recovery[i])continue;
        n++;
        const other=playerAt(s,i).player;
        sum+=other[axis]+other[size]/2;
        far=Math.max(far,other[axis]+other[size]);near=Math.min(near,other[axis]);
    }
    if(n===1)return;
    const radius=Math.max(0,half-bodyHalf)*n;
    return [Math.max((sum-radius)/(n-1),n*(far-half)-sum)-bodyHalf,
        Math.min((sum+radius)/(n-1),n*(near+half)-sum)-bodyHalf];
}
export function limitCoopAxis(s:State,b:Body,axis:'x'|'y',proposed:number,previous=b[axis]):number {
    if(b!==s.player)return proposed;
    const range=coopAxis(s,b,axis);
    if(!range)return proposed;
    // A power change can briefly make the old position infeasible. Allow motion towards the valid interval.
    return Math.max(Math.min(range[0],previous),Math.min(Math.max(range[1],previous),proposed));
}
