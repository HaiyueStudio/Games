import type { State, Enemy } from './model';
import {defeatEnemy} from './combat';
export function drownEnemies(s:State):void{
    for(const e of s.enemies){
        if(!e.alive||e.held||e.kind==='fire-jumper'||e.kind==='lava-dragon'||e.kind==='ring-ghost')continue;
        let surface:number|undefined;
        for(let y=Math.max(0,Math.floor(e.y));y<Math.min(s.level.height,Math.ceil(e.y+e.h+.01));y++)for(let x=Math.max(0,Math.floor(e.x));x<Math.min(s.level.width,Math.ceil(e.x+e.w));x++)if(s.level.cells[y*s.level.width+x]==='lava')surface=Math.min(surface??Infinity,y);
        if(surface===undefined||s.level.liquid?.kind==='lava'&&s.level.liquidSurface!==undefined&&e.y+e.h<s.level.liquidSurface)continue;
        defeatEnemy(s,e,'lava');const d=s.defeated.at(-1)!;d.lavaY=surface;
    }
}
