import type { CalendarPoint } from './model';
export interface CalendarPiecePose { x: number; y: number; scale: number; rotation: number; flipped: boolean }
/** Samples cell centres from stable source cells, so flip/rotate never remap tiles mid-animation. */
export function calendarMotionCells(cells: readonly CalendarPoint[], from: CalendarPiecePose, to: CalendarPiecePose, progress: number, lift = 0) {
  const t = Math.max(0, Math.min(1, progress)), e = t*t*(3-2*t);
  const maxX = Math.max(...cells.map(c=>c.x)), maxY = Math.max(...cells.map(c=>c.y));
  const center = (p: CalendarPiecePose) => ({ x:p.x+((p.rotation%2?maxY:maxX)*74+64)*p.scale/2, y:p.y+((p.rotation%2?maxX:maxY)*74+64)*p.scale/2 });
  const a=center(from), b=center(to), scale=from.scale+(to.scale-from.scale)*e;
  const turn=((to.rotation-from.rotation+6)%4)-2, angle=-(from.rotation+turn*e)*Math.PI/2;
  const flip=(from.flipped?-1:1)*(from.flipped===to.flipped?1:Math.cos(Math.PI*e));
  const x=a.x+(b.x-a.x)*e, y=a.y+(b.y-a.y)*e-Math.sin(Math.PI*t)*lift;
  return cells.map(c=>{
    const dx=(c.x-maxX/2)*74*scale*flip, dy=(c.y-maxY/2)*74*scale;
    return { x:x+Math.cos(angle)*dx-Math.sin(angle)*dy-32*scale, y:y+Math.sin(angle)*dx+Math.cos(angle)*dy-32*scale, scale, scaleX:scale*Math.max(.025,Math.abs(flip)), angle:-angle };
  });
}
