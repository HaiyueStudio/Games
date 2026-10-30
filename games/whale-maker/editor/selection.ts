import {P2_TOOLS} from '../rules/p2-schema';
import { elementBounds, elementFits, SIZED_OBJECTS } from './p1-geometry';
import { P1_TOOLS, PATH_TILES } from '../rules/p1-schema';
import { tile, type Level, type Tile, type BlockContent } from '../rules/model';
import type { ElementProperties } from '../rules/catalog';
import { cannonCells } from '../rules/advanced';
import { stoneCells } from '../rules/adventure';
import { isGlass, glassAt, glassCells } from '../rules/glass';
import { bossCells } from '../rules/fortress';
import { setCell } from '../rules/terrain';
import { initialSnake, validSnakePath } from '../rules/snake-path';
import { isPipe, pipeAt } from '../rules/pipes';
import { cactusCells } from '../rules/desert';

export type EditorTool = 'paint' | 'select' | 'box' | 'erase';
export interface CellStamp { dx: number; dy: number; tile: Tile; content?: BlockContent; properties?:ElementProperties }
export interface Stamp { cells: CellStamp[]; width: number; height: number;origin?:[number,number] }

/** Pipes are one editor object even though collision uses individual cells. */
export function objectCells(level: Level, x: number, y: number): number[] {
    for(let id=0;id<level.cells.length;id++)if((level.cells[id]==='snake-block'||level.cells[id]==='snake-fast')&&initialSnake(level,id).some(b=>x>=Math.floor(b.x)&&x<Math.ceil(b.x+1)&&y>=Math.floor(b.y)&&y<Math.ceil(b.y+1)))return [id];
    // A pearl is anchored at its lower-left cell, like other floor items.
    // Include its visible upper half when clicking, moving or copying it.
    for(const ay of [y,y+1])for(const ax of [x,x-1])if(tile(level,ax,ay)==='giant-pearl'&&ax>=0&&ax+1<level.width&&ay>0&&ay<level.height){const anchor=ay*level.width+ax;return [anchor-level.width,anchor-level.width+1,anchor,anchor+1];}
    const t = tile(level, x, y);
    if(t==='.')for(let id=0;id<level.cells.length;id++)if(SIZED_OBJECTS.has(level.cells[id]!)){const b=elementBounds(level.cells[id]!,id%level.width,Math.floor(id/level.width),level.properties?.[id],level.theme);if(x>=Math.floor(b.x)&&x<Math.ceil(b.x+b.w)&&y>=Math.floor(b.y)&&y<Math.ceil(b.y+b.h))return [id];}
    if (t === '.') return [];
    if(t==='gentle-up'||t==='gentle-down')return [y*level.width+x,y*level.width+x+1];
    if(t==='gentle-up-body'||t==='gentle-down-body')return [y*level.width+x-1,y*level.width+x];
    if(isPipe(t))return pipeAt(level,y*level.width+x)?.cells??[];
    if(t==='turtle-boss'||t==='boss-body')return bossCells(level,y*level.width+x);
    if(t==='cactus'||t==='cactus-body')return cactusCells(level,y*level.width+x);
    if(t==='cannon'||t==='cannon-body')return cannonCells(level,y*level.width+x);
    if(t==='stone'||t==='stone-body')return stoneCells(level,y*level.width+x);
    if(isGlass(t)){const r=glassAt(level,y*level.width+x);if(r)return glassCells(level,r.anchor,r.path);}
    if (!['glass-pipe','glass-right','glass-left-shaft','glass-right-shaft'].includes(t)) return [y * level.width + x];
    if (t==='glass-right'||t==='glass-right-shaft') x--;
    while (y > 0 && tile(level, x, y) === 'glass-left-shaft') y--;
    if (tile(level, x, y) !== 'glass-pipe') return [];
    const cells: number[] = [];
    do {
        cells.push(y * level.width + x, y * level.width + x + 1);
        y++;
    } while (tile(level, x, y) === 'glass-left-shaft' && tile(level, x + 1, y) === 'glass-right-shaft');
    return cells;
}

export function selectBox(level: Level, a: [number, number], b: [number, number]): Set<number> {
    const cells = new Set<number>();
    for (let y = Math.max(0, Math.min(a[1], b[1])); y <= Math.min(level.height - 1, Math.max(a[1], b[1])); y++)
        for (let x = Math.max(0, Math.min(a[0], b[0])); x <= Math.min(level.width - 1, Math.max(a[0], b[0])); x++)
            for (const id of objectCells(level, x, y)) cells.add(id);
    return cells;
}

export function clearCells(level: Level, cells: Iterable<number>): void {
    const removed = new Set(cells);
    for (const id of removed) { setCell(level,id,'.'); if (level.contents) delete level.contents[id];if(level.properties)delete level.properties[id]; }
    if (level.warps) level.warps = level.warps.filter(w => !removed.has(w.from[1] * level.width + w.from[0]));
}

export function stampSelection(level: Level, selected: Set<number>): Stamp | null {
    if (!selected.size) return null;
    const ids = [...selected], left = Math.min(...ids.map(id => id % level.width)), top = Math.min(...ids.map(id => Math.floor(id / level.width)));
    return { width: Math.max(...ids.map(id => id % level.width)) - left + 1, height: Math.max(...ids.map(id => Math.floor(id / level.width))) - top + 1,origin:[left,top],
        cells: ids.map(id => ({ dx: id % level.width - left, dy: Math.floor(id / level.width) - top, tile: level.cells[id]!, ...(level.contents?.[id] ? { content: level.contents[id] } : {}),...(level.properties?.[id]?{properties:structuredClone(level.properties[id])}:{}) })) };
}

export function pasteStamp(level: Level, stamp: Stamp, x: number, y: number): Set<number> | null {
    if (x < 0 || y < 0 || x + stamp.width > level.width || y + stamp.height > level.height) return null;
    if(stamp.cells.some(c=>([...P1_TOOLS,...P2_TOOLS] as readonly string[]).includes(c.tile)&&!elementFits(level,c.tile,x+c.dx,y+c.dy,c.properties)))return null;
    if(stamp.cells.some(c=>PATH_TILES.has(c.tile)&&c.properties?.path&&!validSnakePath(level,(y+c.dy)*level.width+x+c.dx,c.properties.path)))return null;
    const targets = new Set<number>();
    for (const c of stamp.cells) for (const id of objectCells(level, x + c.dx, y + c.dy)) targets.add(id);
    clearCells(level, targets);
    const result = new Set<number>();
    for (const c of stamp.cells) {
        const id = (y + c.dy) * level.width + x + c.dx;
        setCell(level,id,c.tile); result.add(id);
        if (c.content) (level.contents ??= {})[id] = c.content;
        if(c.properties){
            const p=structuredClone(c.properties),origin=stamp.origin;
            if(origin&&c.tile==='moving-platform'&&p.range){const delta=p.axis==='y'?y-origin[1]:x-origin[0];p.range=[p.range[0]+delta,p.range[1]+delta];}
            if(origin&&p.flight)p.flight=[p.flight[0]+y-origin[1],p.flight[1]+y-origin[1]];
            (level.properties??={})[id]=p;
        }
    }
    return result;
}

export function moveSelection(level: Level, selected: Set<number>, dx: number, dy: number): Set<number> | null {
    const stamp = stampSelection(level, selected);
    if (!stamp) return null;
    const ids = [...selected], x = Math.min(...ids.map(id => id % level.width)) + dx, y = Math.min(...ids.map(id => Math.floor(id / level.width))) + dy;
    if (x < 0 || y < 0 || x + stamp.width > level.width || y + stamp.height > level.height) return null;
    if(stamp.cells.some(c=>([...P1_TOOLS,...P2_TOOLS] as readonly string[]).includes(c.tile)&&!elementFits(level,c.tile,x+c.dx,y+c.dy,c.properties)))return null;
    if(stamp.cells.some(c=>PATH_TILES.has(c.tile)&&c.properties?.path&&!validSnakePath(level,(y+c.dy)*level.width+x+c.dx,c.properties.path)))return null;
    const warps = level.warps?.filter(w => selected.has(w.from[1] * level.width + w.from[0])).map(w => ({ from: [w.from[0] + dx, w.from[1] + dy] as [number, number], to: [...w.to] as [number, number] })) ?? [];
    clearCells(level, selected);
    const result = pasteStamp(level, stamp, x, y)!;
    if (warps.length) (level.warps ??= []).push(...warps);
    return result;
}
