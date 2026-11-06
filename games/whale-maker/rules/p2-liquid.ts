import type { State } from './model';
/** Only changed rows are touched. Decorative terrain and mechanisms stay intact. */
export function advanceLiquid(s:State,dt:number):void {
    const l=s.level.liquid;if(!l)return;const t=s.time/l.period,phase=l.mode==='cycle'?(1-Math.cos(t*Math.PI*2))/2:Math.min(1,t),surface=l.mode==='fall'?l.high+(l.low-l.high)*phase:l.low-(l.low-l.high)*phase;s.liquidLevel=surface;s.level.liquidSurface=surface;
    const first=Math.max(0,Math.floor(surface)),x0=l.x??0,x1=x0+(l.width??s.level.width);
    if(s.liquidRow===first)return;
    if(s.liquidRow===undefined)for(let y=Math.floor(l.high);y<s.level.height;y++)for(let x=x0;x<x1;x++){const id=y*s.level.width+x;if(s.level.cells[id]===l.kind)s.liquidCells.add(id);}
    const previous=s.liquidRow??s.level.height;s.liquidRow=first;
    for(const id of s.liquidCells)if(Math.floor(id/s.level.width)<first){if(s.level.cells[id]===l.kind)s.level.cells[id]='.';s.liquidCells.delete(id);}
    for(let y=first;y<previous;y++)for(let x=x0;x<x1;x++){const id=y*s.level.width+x;if(s.level.cells[id]==='.'||s.liquidCells.has(id)){s.level.cells[id]=l.kind;s.liquidCells.add(id);}}
}
