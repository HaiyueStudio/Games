import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarViewport, calendarPointer, calendarLayout } from '../calendar-puzzle/viewport.ts';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,next) { return next(s === './model' && c.parentURL?.endsWith('/calendar-puzzle/tray.ts') ? './model.ts' : s,c); } });
const { calendarTray, calendarOrientedCells } = await import('../calendar-puzzle/tray.ts');
import { CALENDAR_PIECES, isCalendarPuzzleSaveData } from '../calendar-puzzle/model.ts';
for (const [width,height] of [[1200,720],[932,430],[814,409],[1100,720],[393,814]]) {
 test(`full surface and square cells at ${width}×${height}`,()=>{
  const v=calendarViewport(width,height);assert.equal(v.x,0);assert.equal(v.y,0);
  assert.ok(Math.abs(v.width*v.scale-width)<1e-7);assert.ok(Math.abs(v.height*v.scale-height)<1e-7);
  const p=calendarPointer(48+600*v.scale,20+200*v.scale,{left:48,top:20,width,height});
  assert.ok(Math.abs(p.x-600)<1e-7 && Math.abs(p.y-200)<1e-7);
 });
 test(`shuffled pieces fit left tray at ${width}×${height}`,()=>{
  const l=calendarLayout(width,height);assert.ok(l.tray.x+l.tray.width<l.board.x);
  for(let seed=1;seed<=30;seed++){
   const homes=calendarTray(l.tray.width,l.tray.height,seed);assert.deepEqual(homes,calendarTray(l.tray.width,l.tray.height,seed));
   const rects=homes.map((h,i)=>{
    const c=calendarOrientedCells(CALENDAR_PIECES[i].cells,h.rotation,h.flipped);
    const r={x:h.x,y:h.y,w:(Math.max(...c.map(c=>c.x))*74+64)*h.scale,h:(Math.max(...c.map(c=>c.y))*74+64)*h.scale};
    assert.ok(r.x>=0&&r.y>=0&&r.x+r.w<=l.tray.width&&r.y+r.h<=l.tray.height);return r;
   });
   rects.forEach((a,i)=>rects.slice(i+1).forEach(b=>assert.ok(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y))));
  }
 });
}
test('language saves are backward compatible',()=>{
 const old={month:9,day:19,weekday:6,pieces:[]};assert.equal(isCalendarPuzzleSaveData(old),true);
 for(const language of ['zh','en','ja']) assert.equal(isCalendarPuzzleSaveData({...old,language}),true);
 assert.equal(isCalendarPuzzleSaveData({...old,language:'xx'}),false);
});
