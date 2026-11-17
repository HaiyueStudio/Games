import type { Meld, Tile } from '../rules/types';
import type { Rect } from './layout';
import { HAND_STAND_ANGLE, TILE_THICKNESS } from '../rendering/tableModel';
export interface HandTile { tile: Tile; index: number; drawn: boolean }
/** Preserve the exact source index even when the drawn tile duplicates another tile. */
export function handTiles(hand: readonly Tile[], drawn: Tile | null): HandTile[] {
  const drawnIndex = drawn === null ? -1 : hand.lastIndexOf(drawn);
  const standing = hand.map((tile, index) => ({ tile, index, drawn: false })).filter(t => t.index !== drawnIndex).sort((a, b) => a.tile - b.tile || a.index - b.index);
  return drawnIndex < 0 ? standing : [...standing, { tile: hand[drawnIndex]!, index: drawnIndex, drawn: true }];
}
export function handTileRects(tiles: readonly HandTile[], area: Rect, width: number): Rect[] {
  const gap = Math.max(2, width * .085), drawGap = tiles.some(t => t.drawn) ? width * .38 : 0;
  const total = tiles.length * width + Math.max(0, tiles.length - 1) * gap + drawGap;
  const x = area.x + (area.width - total) / 2;
  return tiles.map((t, i) => ({ x: x + i * (width + gap) + (t.drawn ? drawGap : 0), y: area.y, width, height: width * 176 / 128 }));
}
export interface MeldTile { tile: Tile | null; group: number; index: number; rect: Rect }
/** Keep every meld atomic. Four-tile kongs cannot flow into the next group's row. */
export function meldTileRects(melds: ReadonlyArray<Pick<Meld, 'kind'> & { tiles: readonly (Tile | null)[] }>, area: Rect, requestedWidth: number, vertical = false): MeldTile[] {
  const gapRatio = .06, groupGapRatio = .45;
  const units = melds.reduce((n, m) => n + m.tiles.length + Math.max(0, m.tiles.length - 1) * gapRatio, 0) + Math.max(0, melds.length - 1) * groupGapRatio;
  const width = Math.min(requestedWidth, area.width / Math.max(1, vertical ? 4.18 : units), area.height / Math.max(1, vertical ? melds.length * (176 / 128 + groupGapRatio) : 176 / 128));
  let offset = 0;
  return melds.flatMap((m, group) => {
    const row = m.tiles.map((tile, index) => ({ tile, group, index, rect: { x: area.x + (vertical ? index * width * (1 + gapRatio) : offset + index * width * (1 + gapRatio)), y: area.y + (vertical ? group * width * (176 / 128 + groupGapRatio) : 0), width, height: width * 176 / 128 } }));
    offset += width * (m.tiles.length + Math.max(0, m.tiles.length - 1) * gapRatio + groupGapRatio); return row;
  });
}
export const PLAYER_ROW_EDGE = 450, PLAYER_ROW_SPAN = 780, RIVER_OFFSET = 145;
export function seatPlacement(along: number, outward: number, width: number, relative: number) {
  const yaw=[0,Math.PI/2,Math.PI,-Math.PI/2][relative]!, height=width*1.375;
  const x=500+along*Math.cos(yaw)+outward*Math.sin(yaw), z=500-along*Math.sin(yaw)+outward*Math.cos(yaw);
  return {yaw,rect:{x:x-width/2,y:z-height/2,width,height}};
}
/** One physical rack per player, with exposed groups first and an independently spaced draw last. */
export function playerRowTiles(tiles: readonly HandTile[], melds: ReadonlyArray<{tiles:readonly (Tile|null)[]}>, relative: number, standingAngle=HAND_STAND_ANGLE, flowers:readonly Tile[]=[]) {
  const hw=relative===0?46:40, mw=relative===0?32:30, fw=relative===0?24:22, hg=hw*.085, mg=mw*.06, fg=fw*.06, groupGap=mw*.5;
  const flowerWidth=flowers.length*fw+Math.max(0,flowers.length-1)*fg,flowerGap=flowers.length&&(melds.length||tiles.length)?20:0;
  const meldWidth=melds.reduce((n,m)=>n+m.tiles.length*mw+Math.max(0,m.tiles.length-1)*mg,0)+Math.max(0,melds.length-1)*groupGap;
  const handWidth=tiles.length*hw+Math.max(0,tiles.length-1)*hg+(tiles.some(t=>t.drawn)?hw*.38:0);
  const separator=melds.length&&tiles.length?24:0, total=flowerWidth+flowerGap+meldWidth+separator+handWidth, scale=Math.min(1,PLAYER_ROW_SPAN/Math.max(1,total));
  let cursor=-total*scale/2;
  const placed=(along:number,width:number,standing:boolean)=>seatPlacement(along,PLAYER_ROW_EDGE-(standing?Math.cos(standingAngle)*width*1.375/2+Math.sin(standingAngle)*TILE_THICKNESS:width*1.375/2),width,relative);
  const flowerTiles=flowers.map((tile,index)=>{const p=placed(cursor+fw*scale/2,fw*scale,false);cursor+=(fw+fg)*scale;return{tile,index,...p}});
  if(flowers.length)cursor-=fg*scale;
  cursor+=flowerGap*scale;
  const groups=melds.flatMap((m,group)=>{
    const result=m.tiles.map((tile,index)=>{const p=placed(cursor+mw*scale/2,mw*scale,false);cursor+=(mw+mg)*scale;return{tile,group,index,...p}});
    cursor+=(groupGap-mg)*scale;return result;
  });
  if(melds.length)cursor-=groupGap*scale;
  cursor+=separator*scale;
  const hands=tiles.map(t=>{if(t.drawn)cursor+=hw*.38*scale;const p=placed(cursor+hw*scale/2,hw*scale,true);cursor+=(hw+hg)*scale;return{...t,...p}});
  return {hands,melds:groups,flowers:flowerTiles};
}
/** Open a generous empty ring around the wind panel; keep late-game rivers inside the wall. */
export function riverTileRects(count: number, relative: number): Rect[] {
  const rows=Math.max(1,Math.ceil(count/6)), gap=3, width=Math.min(28,(180/rows-gap)/1.375), height=width*1.375, span=6*(width+gap);
  return Array.from({length:count},(_,i)=>{
    const col=i%6,row=Math.floor(i/6);
    if(relative===0)return{x:500-span/2+col*(width+gap),y:500+RIVER_OFFSET+row*(height+gap),width,height};
    if(relative===2)return{x:500-span/2+(5-col)*(width+gap),y:500-RIVER_OFFSET-height-row*(height+gap),width,height};
    return{x:relative===1?500+RIVER_OFFSET+row*(width+gap):500-RIVER_OFFSET-width-row*(width+gap),y:500-3*(height+gap)+col*(height+gap),width,height};
  });
}
