import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {sumCombinationDeduction,sumCombinationSteps}=await import('../led-sudoku/sum-combinations.ts');
const {findLogicalHint,logicalCandidateMasks,applyHintToNotes}=await import('../led-sudoku/logical-hints.ts');
const {units,search,validBoard,DEFAULT_OPTIONS,generate}=await import('../led-sudoku/rules.ts');
const {place,restoreMove,complete}=await import('../led-sudoku/session.ts');
const fixture=()=>JSON.parse(readFileSync(new URL('../led-sudoku/evidence/hints/little-killer-45-stalled.json',import.meta.url),'utf8'));
const bit=d=>1<<(d-1),mask=(...ds)=>ds.reduce((m,d)=>m|bit(d),0);
test('screenshot continues with box 45 minus diagonal 26, without accessing the saved answer',()=>{
 const s=fixture(),original=structuredClone(s);Object.defineProperty(s,'solution',{get(){throw Error('solution must not be read');},enumerable:false});
 const hint=findLogicalHint(s);assert.equal(hint.kind,'elimination');assert.equal(hint.cell,1);assert.deepEqual(hint.eliminations,[{cell:1,digits:[7,8]},{cell:9,digits:[2,3]},{cell:3,digits:[2,7]},{cell:27,digits:[8]}]);
 assert(hint.steps.some(step=>step.title.includes('45')));assert(hint.steps.some(step=>step.text.includes('26 − 9 = 17')));assert(hint.steps.some(step=>step.text.includes('R3C2')&&step.title.includes('相减')));assert(hint.steps.some(step=>step.text.includes('共有 2 种')));
 assert.deepEqual(s.board,original.board);assert.deepEqual(s.crossed,original.crossed);
 for(const e of hint.eliminations)for(const d of e.digits){const board=s.board.slice();board[e.cell]=d;const proof=search(s.puzzle,board,1,500000);assert(!proof.exhausted);assert.equal(proof.count,0,`${e.cell} != ${d}`);}
});
test('applying, reloading, undo and manually recording the new proof lead to R2C1=8, never repeat the old hint',()=>{
 const s=fixture(),hint=findLogicalHint(s),after=applyHintToNotes(s,hint);assert(after);assert.deepEqual(after.board,s.board);
 for(const next of [after,JSON.parse(JSON.stringify(after)),{...s,crossed:after.crossed}]){const h=findLogicalHint(next);assert.equal(h.kind,'placement');assert.equal(h.cell,9);assert.equal(h.value,8);}
 assert.deepEqual(restoreMove(after,s),s);assert.deepEqual(findLogicalHint(restoreMove(after,s)).eliminations,hint.eliminations);
 assert.equal(applyHintToNotes({...after,board:after.board.map((d,i)=>i===9?8:d)},hint),null);
});
test('all three languages explain the arithmetic and cancellation before notebook changes',()=>{
 const s=fixture();for(const lang of ['zh','en','ja']){const hint=findLogicalHint(s,lang);assert.equal(hint.steps.length,7);assert(hint.steps.some(x=>x.text.includes('45 − 20 = 25')));assert(hint.steps.some(x=>x.text.includes('R1C2=5')&&x.text.includes('R2C1=8')));assert(hint.steps.every(x=>x.title&&x.text&&!x.text.includes('undefined')));}
});
test('screenshot can be completed entirely by explained hints, with no answer fill or search in the hint path',()=>{
 let s=fixture(),steps=0;const solution=s.solution.slice();
 while(!complete(s)&&steps<100){const h=findLogicalHint(s);assert(h,`stalled at ${steps}`);s=h.kind==='placement'?place(s,h.cell,h.value,false,false):applyHintToNotes(s,h);assert(s);steps++;}
 assert(complete(s));assert.deepEqual(s.board,solution);assert.equal(steps,59);assert(!s.assisted);
});
test('bounded enumeration never claims an exclusion from an incomplete scan',()=>{
 const s=fixture(),m=logicalCandidateMasks({...s,deductionSteps:729}),groups=units(s.puzzle);
 // Recreate the pre-new-technique state by the masks attached to the first proof.
 const before=findLogicalHint(s).steps[0].candidateMasks;
 assert.equal(sumCombinationDeduction(s.puzzle,s.board,before,groups,0),null);
 assert.equal(sumCombinationDeduction(s.puzzle,s.board,before,groups,1),null);
 assert(sumCombinationDeduction(s.puzzle,s.board,before,groups));
});
test('local combinations allow repeated digits on a little killer diagonal when cells are not peers',()=>{
 const p={version:1,seed:0,options:{...DEFAULT_OPTIONS,led:false,littleKiller:true},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[],lines:[],dots:[],littleKillers:[{side:'top',index:3,sum:13}]},board=Array(81).fill(0),m=Array(81).fill(511);
 board[11]=1;board[19]=2;m[11]=m[19]=0;m[3]=mask(5,6);m[27]=bit(5);
 const d=sumCombinationDeduction(p,board,m,units(p));assert(d);assert(d.combinations.some(tuple=>tuple.every(v=>v===5)));assert(d.eliminations.some(e=>e.cell===3&&e.digits.includes(6)));assert(!d.eliminations.some(e=>e.digits.includes(5)));
});
test('shortened units cannot supply a false 45 equation',()=>{
 const p={version:1,seed:0,options:{...DEFAULT_OPTIONS,led:false,missing:true,killer:true},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[{cells:[0,1],sum:4}],lines:[],dots:[]};
 for(let r=0;r<9;r++)p.blocked[r*9+(r*3+Math.floor(r/3))%9]=true;
 assert(units(p).every(u=>u.length===8));p.cages=[{cells:[1,2],sum:4}];const board=Array(81).fill(0),m=Array(81).fill(511);m[1]=mask(1,2);m[2]=mask(2,3);
 const d=sumCombinationDeduction(p,board,m,[...units(p),[1,2]]);assert(d);assert(d.sources.every(s=>s.kind!=='unit'));assert.deepEqual(d.eliminations,[{cell:1,digits:[2]},{cell:2,digits:[2]}]);
});
