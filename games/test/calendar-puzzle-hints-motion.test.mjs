import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,next){return next(s.startsWith('./') && !s.endsWith('.ts') && c.parentURL?.includes('/calendar-puzzle/') ? s+'.ts' : s,c);}});
const {solveCalendarPuzzle:solve,CALENDAR_SOLVER_MODEL:model}=await import('../calendar-puzzle/solver.ts');
const {calendarOrientedCells:orient}=await import('../calendar-puzzle/tray.ts');
const {calendarMotionCells:motion}=await import('../calendar-puzzle/motion.ts');
const {CalendarSolverClient}=await import('../calendar-puzzle/solver-client.ts');
const input={month:2,day:28,weekday:3,fixed:[]};
function covered(p){return orient(model.pieces[p.piece].cells,p.rotation,p.flipped).map(c=>`${p.row+c.y},${p.col+c.x}`).sort();}
function verify(input,result){
 assert.equal(result.status,'solved');assert.equal(result.solution.length,10);
 assert.equal(new Set(result.solution.map(p=>p.piece)).size,10);
 const actual=result.solution.flatMap(covered).sort();
 const blocked=new Set(['m'+input.month,'d'+input.day,'w'+input.weekday]);
 assert.deepEqual(actual,model.board.filter(c=>!blocked.has(c.key)).map(c=>`${c.row},${c.col}`).sort());
}
test('exact-cover solver covers all legal cells for every month and weekday',()=>{
 for(let month=1;month<=12;month++)for(let weekday=0;weekday<7;weekday++){
  const i={month,weekday,day:1+(month*7+weekday*3)%28,fixed:[]};verify(i,solve(i,model));
 }
});
test('hint preserves a compatible partial board and recognises symmetric orientations',()=>{
 const base=solve(input,model);const fixed=base.solution.filter(p=>p.piece!==9);
 const result=solve({...input,fixed},model);verify(input,result);assert.equal(result.compatible,true);
 for(const p of fixed)assert.deepEqual(covered(p),covered(result.solution[p.piece]));
 const j=base.solution[9];verify(input,solve({...input,fixed:[{...j,rotation:(j.rotation+2)%4,flipped:!j.flipped}]},model));
});
test('invalid pinned pieces are rejected',()=>{
 const p=solve(input,model).solution[0];
 for(const fixed of [[p,p],[{...p,row:-9}],[{...p,piece:20}]])assert.equal(solve({...input,fixed},model).status,'invalid');
});
test('incompatible legal position returns a complete alternative instead of a conflicting hint',()=>{
 let found=false;
 for(let row=0;row<8&&!found;row++)for(let col=0;col<7&&!found;col++){
  const result=solve({...input,fixed:[{piece:0,row,col,rotation:0,flipped:false}]},model);
  if(result.status==='solved'&&!result.compatible){verify(input,result);found=true;}
 }
 assert.ok(found);
});
test('worker cancellation and request IDs prevent stale hints',async()=>{
 const workers=[];const client=new CalendarSolverClient(()=>{const w={onmessage:null,onerror:null,postMessage(d){this.message=d;},terminate(){this.terminated=true;}};workers.push(w);return w;});
 const first=client.solve(input),second=client.solve(input);assert.equal(await first,null);assert.equal(workers[0].terminated,true);
 const w=workers[1],result=solve(input,model);
 w.onmessage({data:{kind:'calendar-solution',id:-1,result}});assert.ok(w.onmessage);
 w.onmessage({data:{kind:'calendar-solution',id:w.message.id,result}});assert.equal(await second,result);assert.equal(w.terminated,true);
 const third=client.solve(input);client.cancel();assert.equal(await third,null);
});
test('rotation, flip and shuffle end exactly at logical tile positions',()=>{
 const rounded=cells=>cells.map(c=>`${Math.round(c.x*1e6)},${Math.round(c.y*1e6)}`).sort();
 for(const piece of model.pieces)for(let rotation=0;rotation<4;rotation++)for(const flipped of [false,true]){
  const from={x:50,y:60,scale:.75,rotation,flipped};
  for(const to of [{...from,rotation:(rotation+1)%4},{...from,flipped:!flipped},{x:200,y:300,scale:.5,rotation:(rotation+2)%4,flipped:!flipped}]){
   for(const [t,p] of [[0,from],[1,to]])assert.deepEqual(rounded(motion(piece.cells,from,to,t,30)),rounded(orient(piece.cells,p.rotation,p.flipped).map(c=>({x:p.x+c.x*74*p.scale,y:p.y+c.y*74*p.scale}))));
   assert.ok(motion(piece.cells,from,to,.5,30).every(c=>Number.isFinite(c.x)&&Number.isFinite(c.y)&&c.scaleX>0));
  }
 }
});
