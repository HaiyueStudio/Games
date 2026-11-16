import type { Body, Level } from './model';

/** Ten columns including the goal's column, aligned to the editor grid. */
export const END_ZONE_WIDTH=10;
export interface EndZone {x:number;y:number;right:number}
type Area=Pick<Level,'width'> & Partial<Pick<Level,'cells'|'endZone'|'rooms'|'warps'>>;
export function findEndZone(l:Pick<Level,'width'|'cells'>):EndZone|undefined {
    const id=l.cells.indexOf('E');if(id<0)return;
    const x=id%l.width;return {x,y:Math.floor(id/l.width),right:x+END_ZONE_WIDTH};
}
export const editorCourseWidth=(l:Pick<Level,'width'|'cells'>):number=>Math.max(l.width,findEndZone(l)?.right??0);
export function courseBounds(l:Area,p:Body):{left:number;right:number} {
    const room=l.rooms?.find(r=>p.x+p.w>r.x&&p.x<r.x+r.w&&p.y>=r.y);
    if(room)return {left:room.x,right:room.x+room.w};
    // Pre-subarea blueprints kept their underground pipe room past column 220.
    if(p.x>=221&&l.warps?.some(w=>w.to[0]>=221))return {left:221,right:l.width};
    const end='endZone'in l?l.endZone:l.cells?findEndZone(l as Pick<Level,'width'|'cells'>):undefined;
    return {left:0,right:end?.right??l.width};
}
export const virtualEndGround=(l:Pick<Level,'width'> & Partial<Pick<Level,'endZone'>>,x:number,y:number):boolean=>
    !!l.endZone&&x>=l.width&&x<l.endZone.right&&y>l.endZone.y;
