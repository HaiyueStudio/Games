import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {CompletionSweep,completionCellOpacity,COMPLETION_SWEEP_MS}=await import('../led-sudoku/completion-sweep.ts');
const {paintBoard}=await import('../led-sudoku/board-painter.ts');
const {generate,DEFAULT_OPTIONS}=await import('../led-sudoku/rules.ts');

test('completion sweep runs once, clears its final frame and can run after undo/recompletion',()=>{
 const wave=new CompletionSweep(),p={};wave.observe(p,false,0);assert(!wave.active);
 wave.observe(p,true,100);assert(wave.active);assert.equal(wave.progress(100),0);
 wave.observe(p,true,500);assert.equal(wave.progress(1200),.5,'re-render does not restart');
 assert.equal(wave.progress(100+COMPLETION_SWEEP_MS),undefined);assert(!wave.active);
 wave.observe(p,true,3000);assert(!wave.active);
 wave.observe(p,false,3500);wave.observe(p,true,4000);assert(wave.active);
 wave.observe(p,false,4100);assert(!wave.active,'undo cancels immediately');
});
test('restored complete boards, new games and resume never leave or replay an old sweep',()=>{
 const wave=new CompletionSweep(),p={};wave.observe(p,true,0);assert(!wave.active,'restored completed board stays still');
 wave.observe(p,false,1);wave.observe(p,true,2);wave.cancel();wave.observe(p,true,3);assert(!wave.active,'resume does not replay');
 wave.observe(p,false,4);wave.observe(p,true,5);wave.observe({},false,6);assert(!wave.active,'new puzzle cancels');
});
test('wave traverses top left, centre, bottom right with a gentle fade at each end',()=>{
 const corners=[0,40,80],peaks=[3/22,11/22,19/22];
 peaks.forEach((phase,i)=>{assert.equal(completionCellOpacity(corners[i],phase),.336);corners.forEach((cell,j)=>{if(i!==j)assert.equal(completionCellOpacity(cell,phase),0);});});
 for(let i=0;i<81;i++){assert.equal(completionCellOpacity(i,0),0);assert.equal(completionCellOpacity(i,1),0);assert.equal(completionCellOpacity(i),0);}
 assert.equal(completionCellOpacity(8,.5),completionCellOpacity(72,.5),'wave front is diagonal');
});
test('completion sweep paints cell backgrounds before digits and leaves missing cells dark',()=>{
 const g=generate({...DEFAULT_OPTIONS,led:false,missing:true},7),s={...g,board:g.solution.slice(),notes:Array(81).fill(0),selected:-1,hint:-1,completed:true,completionProgress:.5};
 const ops=[],c=new Proxy({fillRect(x,y,w,h){if(String(this.fillStyle).startsWith('rgba(99,255,197,'))ops.push({kind:'wave',cell:Math.floor(y/70)*9+Math.floor(x/70)});},fillText(){ops.push({kind:'text'});}}, {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 const before=structuredClone(s);paintBoard(c,s);assert(ops.some(o=>o.kind==='wave'));assert(ops.filter(o=>o.kind==='wave').every(o=>!s.puzzle.blocked[o.cell]));
 assert(ops.findIndex(o=>o.kind==='text')>ops.map(o=>o.kind).lastIndexOf('wave'));assert.deepEqual(s,before);
});
