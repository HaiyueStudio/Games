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
test('partial-search time limit still permits a complete fallback solution',()=>{
 const difficult={month:1,day:8,weekday:0,fixed:[{piece:0,row:1,col:0,rotation:0,flipped:false}]};
 const now=Date.now;let calls=0;
 // Expire only the partial-search budget, then let the fallback clock advance normally.
 Date.now=()=>++calls===1?0:6000;
 let result;try{result=solve(difficult,model);}finally{Date.now=now;}
 verify(difficult,result);assert.equal(result.compatible,false);assert.ok(calls>=3);
});
function clientFixture() {
 const workers=[];
 const client=new CalendarSolverClient(()=>{
  const w={onmessage:null,onerror:null,messages:[],postMessage(d){this.messages.push(d);},terminate(){this.terminated=true;}};
  workers.push(w);return w;
 });
 const reply=(w,result,id=w.messages.at(-1).id)=>w.onmessage({data:{kind:'calendar-solution',id,result}});
 return {client,workers,reply};
}
test('repeated hints reuse one worker; cancelling drops stale results and bounds the queue',async()=>{
 const {client,workers,reply}=clientFixture(),result=solve(input,model);
 const first=client.solve(input),second=client.solve(input),third=client.solve(input);
 assert.equal(await first,null);assert.equal(await second,null);
 const w=workers[0];assert.equal(workers.length,1);assert.equal(w.messages.length,1);assert.ok(!w.terminated);
 reply(w,result,-1);assert.equal(w.messages.length,1);
 reply(w,result);assert.equal(w.messages.length,2);assert.equal(w.messages[1].id,3);
 reply(w,result,1); // stale response cannot finish the latest request
 reply(w,result);assert.equal(await third,result);
 for(let i=0;i<20;i++){const request=client.solve(input);reply(w,result);assert.equal(await request,result);}
 assert.equal(workers.length,1);assert.ok(!w.terminated);
 const cancelled=client.solve(input);client.cancel();assert.equal(await cancelled,null);
 reply(w,result);assert.ok(!w.terminated);
 client.dispose();assert.equal(w.terminated,true);assert.equal(w.onmessage,null);
 assert.equal(await client.solve(input),null);assert.equal(workers.length,1);
});
test('worker error and timeout recover for the newest request without retaining old callbacks',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const {client,workers,reply}=clientFixture(),result=solve(input,model);
 const first=client.solve(input);const rejected=assert.rejects(first,/worker failed/);
 workers[0].onerror(new Error('worker failed'));await rejected;assert.equal(workers[0].terminated,true);
 const slow=client.solve(input);const next=client.solve(input);assert.equal(await slow,null);
 t.mock.timers.tick(8000);assert.equal(workers[1].terminated,true);assert.equal(workers.length,3);
 reply(workers[2],result);assert.equal(await next,result);
 const active=client.solve(input),waiting=client.solve(input);client.dispose();
 assert.equal(await active,null);assert.equal(await waiting,null);assert.equal(workers[2].terminated,true);
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
