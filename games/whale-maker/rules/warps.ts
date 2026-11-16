import type {State} from './model';
import {overlaps} from './geometry';

export const isWarp=(t:unknown):boolean=>t==='warp-box'||t==='locked-warp';
export function touchesWarp(s:State,id:number):boolean {
    const box={x:id%s.level.width,y:Math.floor(id/s.level.width),w:1,h:1,vx:0,vy:0};
    return overlaps(s.player,box)||!!s.vehicle&&overlaps(s.vehicle,box);
}
/** Only inspect cells touched by the player or car, rather than scanning the map. */
export function touchingWarps(s:State):number[] {
    const ids=new Set<number>();
    for(const b of [s.player,s.vehicle])if(b)for(let y=Math.max(0,Math.floor(b.y));y<=Math.min(s.level.height-1,Math.floor(b.y+b.h));y++)
        for(let x=Math.max(0,Math.floor(b.x));x<=Math.min(s.level.width-1,Math.floor(b.x+b.w));x++){
            const id=y*s.level.width+x;if(isWarp(s.level.cells[id])&&touchesWarp(s,id))ids.add(id);
        }
    return [...ids];
}
