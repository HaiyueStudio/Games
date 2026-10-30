import {isP2Boss} from '../rules/p2-schema';
import type { Body, Level, Tile } from '../rules/model';
import type { ElementProperties } from '../rules/catalog';
import { makeEnemy, makeItem, modifyEnemy } from '../rules/body-factory';
import { EXTRA_ENEMIES, ITEM_KINDS } from '../rules/catalog';
import { PATH_TILES } from '../rules/p1-schema';
export const SIZED_OBJECTS=new Set(['tree','semi-platform','trampoline','trampoline-on','trampoline-moving','bill-blaster','boom-boss','pom-boss','cat-boss','camera-stop','tornado','beat-block','fall-block','icicle']);
export function elementBounds(tile:Tile,x:number,y:number,p:ElementProperties={},theme:Level['theme']='coast'):Body {
    if(tile==='T'||tile==='J'||EXTRA_ENEMIES.includes(tile))return modifyEnemy(makeEnemy(tile==='T'?'turtle':tile==='J'?'duck':tile as never,x,y,p),p,theme);
    if(ITEM_KINDS.includes(tile))return makeItem(tile as never,x,y);
    if(isP2Boss(tile)){const size=tile==='cat-boss'?3:2;return {x,y,w:size,h:size,vx:0,vy:0};}
    if(tile==='camera-stop'||tile==='tornado')return {x,y,w:p.width??(tile==='camera-stop'?4:2),h:tile==='camera-stop'?p.depth??4:p.height??5,vx:0,vy:0};
    if(tile==='beat-block'||tile==='fall-block'||tile==='icicle')return {x,y,w:tile==='icicle'?1:p.width??1,h:tile==='icicle'?p.height??2:tile==='fall-block'?.3:1,vx:0,vy:0};
    const h=tile==='tree'||tile==='bill-blaster'?p.height??(tile==='tree'?5:2):tile==='semi-platform'?p.depth??2:tile.startsWith('trampoline')?.35:tile==='stone'||tile==='turtle-boss'?2:1;
    return {x,y:tile==='tree'||tile==='bill-blaster'?y-h+1:y,w:tile==='tree'||tile==='stone'||tile==='turtle-boss'?2:tile==='semi-platform'||tile.startsWith('trampoline')?p.width??3:1,h,vx:0,vy:0};
}
export function elementFits(level:Level,tile:Tile,x:number,y:number,p:ElementProperties={}):boolean {
    const b=elementBounds(tile,x,y,p,level.theme),path=PATH_TILES.has(tile)?p.path??[[0,0]]:[[0,0]];
    return path.every(v=>b.x+v[0]!>=0&&b.y+v[1]!>=0&&b.x+v[0]!+b.w<=level.width+.001&&b.y+v[1]!+b.h<=level.height+.001);
}
