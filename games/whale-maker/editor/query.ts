import type {Level,Tile} from '../rules/model';
import {findEndZone} from '../rules/course-bounds';
import {elementBounds,SIZED_OBJECTS} from './p1-geometry';
import {initialSnake} from '../rules/snake-path';
import {pipeShape} from '../rules/pipes';

/** One authored-grid pass per selection operation or editor revision. */
export function indexEditorLevel(level:Level){
    const snakes=new Map<number,number>(),sized=new Map<number,number>(),snakeAnchors:number[]=[],pipes:{id:number;y:number;h:number}[]=[],extended:{id:number;x:number;y:number;w:number;h:number}[]=[];
    const own=(map:Map<number,number>,id:number,b:{x:number;y:number;w:number;h:number})=>{
        for(let y=Math.max(0,Math.floor(b.y));y<Math.min(level.height,Math.ceil(b.y+b.h));y++)for(let x=Math.max(0,Math.floor(b.x));x<Math.min(level.width,Math.ceil(b.x+b.w));x++){
            const cell=y*level.width+x;if(!map.has(cell))map.set(cell,id);
        }
    };
    level.cells.forEach((t:Tile,id:number)=>{
        if(t==='snake-block'||t==='snake-fast'){snakeAnchors.push(id);for(const b of initialSnake(level,id))own(snakes,id,b);}
        if(SIZED_OBJECTS.has(t)){const b=elementBounds(t,id%level.width,Math.floor(id/level.width),level.properties?.[id],level.theme);own(sized,id,b);extended.push({id,x:b.x,y:b.y,w:b.w,h:b.h});}
        if(t==='P'){const pipe=pipeShape(level,id)!;pipes.push({id,y:pipe.y,h:pipe.height});}
    });
    return {snakes,sized,snakeAnchors,pipes,extended,endZone:findEndZone(level)};
}
export type EditorIndex=ReturnType<typeof indexEditorLevel>;

/** Long legacy pipe anchors may lie above the viewport; retain them explicitly. */
export function* editorVisibleCells(level:Level,index:Pick<EditorIndex,'pipes'|'extended'>,cam:number,cy:number,w:number,h:number,allRows=false){
    const left=Math.max(0,Math.floor(cam)-10),right=Math.min(level.width,Math.ceil(cam+w+10)),top=allRows?0:Math.max(0,Math.floor(cy)-16),bottom=Math.min(level.height,Math.ceil(cy+h+12));
    for(let x=left;x<right;x++)for(let y=top;y<bottom;y++)yield y*level.width+x;
    for(const pipe of index.pipes)if(pipe.y<top&&pipe.y+pipe.h>=cy&&pipe.id%level.width>=left&&pipe.id%level.width<right)yield pipe.id;
    for(const b of index.extended){const x=b.id%level.width,y=Math.floor(b.id/level.width);
        if((x<left||x>=right||y<top||y>=bottom)&&b.x<cam+w&&b.x+b.w>cam&&b.y<cy+h&&b.y+b.h>cy)yield b.id;
    }
}
