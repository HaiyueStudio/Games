import type {Level,State} from './model';
import {collectKey} from './adventure';
import {emit} from './events';

export interface PinkProgress {collected:Set<string>;checkpoint:Set<string>;awarded:boolean}
export const newPinkProgress=():PinkProgress=>({collected:new Set(),checkpoint:new Set(),awarded:false});
export function pinkTotal(l:Level):number {
    return [l,...Object.values(l.areas??{})].reduce((n,a)=>n+a.cells.filter(t=>t==='pink-coin').length,0);
}
const identity=(s:State,id:number)=>`${s.currentArea}:${id}`;
export function syncPinkCoins(s:State):void {
    s.pinkCollected=s.pinkProgress.collected.size;
    s.level.cells.forEach((t,id)=>{if(t==='pink-coin'&&s.pinkProgress.collected.has(identity(s,id)))s.level.cells[id]='.';});
}
export function collectPinkCoin(s:State,id:number):void {
    s.level.cells[id]='.';const progress=s.pinkProgress,key=identity(s,id);
    if(progress.collected.has(key))return;
    progress.collected.add(key);s.pinkCollected=progress.collected.size;emit(s,'coin',id%s.level.width);
    if(!progress.awarded&&s.pinkTotal>0&&s.pinkCollected===s.pinkTotal){progress.awarded=true;collectKey(s,s.player.x,s.player.y);}
}
export function checkpointPinkCoins(s:State):void {s.pinkProgress.checkpoint=new Set(s.pinkProgress.collected);}
/** A completed set becomes a key. Losing that key resets the entire set (key death). */
export function retryPinkCoins(s:State):PinkProgress {
    const saved=s.pinkProgress.awarded?new Set<string>():new Set(s.pinkProgress.checkpoint);
    return {collected:new Set(saved),checkpoint:saved,awarded:false};
}
