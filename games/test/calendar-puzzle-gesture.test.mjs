import test from 'node:test';
import assert from 'node:assert/strict';
import { CalendarPieceGesture } from '../calendar-puzzle/piece-gesture.ts';
const point=(x,y)=>({clientX:x,clientY:y});
function tap(g,{piece='a',x=80,y=130,at=0,hold=70,dx=0,dy=0,type='touch'}={}) {
 g.begin(piece,point(x,y),at,type);
 g.move(point(x+dx,y+dy));
 return g.end(point(x+dx,y+dy),at+hold);
}
test('iOS and Android finger jitter and a shifted second tap still rotate exactly once',()=>{
 const g=new CalendarPieceGesture();
 assert.equal(tap(g,{dx:6,dy:5}),'tap');
 assert.equal(tap(g,{at:310,x:99,y:142,dx:5,dy:-4}),'double-tap');
 assert.equal(tap(g,{at:490}),'tap');
 assert.equal(tap(g,{at:700}),'double-tap');
});
test('drag threshold uses logical screen pixels at every board scale',()=>{
 for(const scale of [.4,.5,.75,1,2]) {
  const x=200*scale,y=240*scale;
  const g=new CalendarPieceGesture();g.begin('a',point(x,y),0,'touch');
  assert.equal(g.move(point(x+10,y)),false,`scale ${scale}: jitter remains a tap`);
  assert.equal(g.move(point(x+13,y)),true);
  assert.equal(g.move(point(x,y)),true);
  assert.equal(g.end(point(x,y),180),'drag');
  assert.equal(tap(g,{at:240,x,y}),'tap');
 }
});
test('separate pieces, distant taps, slow taps, holds and cancellation do not rotate',()=>{
 for(const second of [{piece:'b',at:200},{x:150,at:200},{at:600},{at:200,hold:550},{at:200,type:'mouse'}]) {
  const g=new CalendarPieceGesture();tap(g);assert.notEqual(tap(g,second),'double-tap');
 }
 const g=new CalendarPieceGesture();tap(g);g.cancel();assert.equal(tap(g,{at:200}),'tap');
});
test('release-only displacement is a drag, and mouse gestures retain precise thresholds',()=>{
 const g=new CalendarPieceGesture();g.begin('a',point(0,0),0,'touch');assert.equal(g.end(point(20,0),100),'drag');
 assert.equal(tap(g,{at:200,type:'mouse',dx:5}),'drag');
 assert.equal(tap(g,{at:400,type:'mouse',dx:2}),'tap');
 assert.equal(tap(g,{at:620,type:'mouse',dx:3}),'double-tap');
});
test('DOM pointer coordinates remain readable even when implemented as prototype getters',()=>{
 class Event {get clientX(){return 80;}get clientY(){return 130;}}
 const g=new CalendarPieceGesture();const e=new Event();
 g.begin('a',e,0,'touch');assert.equal(g.end(e,50),'tap');
 g.begin('a',e,200,'touch');assert.equal(g.end(e,250),'double-tap');
});
