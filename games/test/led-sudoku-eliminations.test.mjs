import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c)}});
const {findHint,search,DEFAULT_OPTIONS,isSaveData,validBoard}=await import('../led-sudoku/rules.ts');
const {findLogicalHint,applyHintToNotes,logicalCandidateMasks}=await import('../led-sudoku/logical-hints.ts');
const {place}=await import('../led-sudoku/session.ts');
const {candidateMasks,inputChoices}=await import('../led-sudoku/preferences.ts');
const fixture=JSON.parse(readFileSync(new URL('../led-sudoku/evidence/hints/elimination.json',import.meta.url),'utf8'));
const fresh=()=>structuredClone(fixture),bit=d=>1<<(d-1);
test('stalled puzzle yields a reduction without filling or consulting the answer',()=>{
 const state=fresh(),before=structuredClone(state);assert.equal(findHint(state.puzzle,state.board),null);
 Object.defineProperty(state,'solution',{get(){throw Error('hint must not read solution');}});
 const h=findLogicalHint(state);assert.equal(h.kind,'elimination');assert.equal(h.cell,38);assert.equal(h.value,0);assert.deepEqual(h.eliminations,[{cell:38,digits:[2]}]);
 assert.equal(h.steps.length,4);assert.match(h.steps[1].text,/必须包含/);assert.match(h.steps[1].text,/第 3 列/);assert.match(h.steps[2].text,/R5C3/);assert.match(h.steps[3].text,/应用到笔记/);assert.deepEqual(state.board,before.board);assert.deepEqual(state.notes,before.notes);
});
test('five cumulative notebook reductions lead to a placement with a proof trail',()=>{
 let state=fresh();const titles=[];let prior=logicalCandidateMasks(state);
 for(let n=0;n<5;n++){
  const h=findLogicalHint(state);assert.equal(h.kind,'elimination');titles.push(h.steps[1].title);
  const before=structuredClone(state);state=applyHintToNotes(state,h);assert(state);assert.equal(state.deductionSteps,n+1);assert.deepEqual(state.board,before.board);
  const masks=logicalCandidateMasks(state);assert(masks.some((m,i)=>m!==prior[i]));assert(masks.every((m,i)=>(m&prior[i])===m));
  for(const e of h.eliminations){assert.equal(state.notes[e.cell],masks[e.cell]);for(const d of e.digits){assert(!(masks[e.cell]&bit(d)));assert(!inputChoices(state,e.cell).includes(d));assert(inputChoices(state,e.cell,false).includes(d));}}
  assert.deepEqual(candidateMasks(state),masks);prior=masks;
 }
 assert(titles.includes('显性数对'));const h=findLogicalHint(state);assert.equal(h.kind,'placement');assert.equal(h.cell,8);assert.equal(h.value,6);assert.equal(h.steps.length,16);assert.deepEqual(h.steps.at(-1).candidates,[6]);assert(h.steps.slice(0,-1).every(step=>Number.isInteger(step.candidateCell)));assert.equal(state.notes[8],bit(6));
});
test('every proposed elimination is impossible in every completion',()=>{
 let state=fresh();for(let n=0;n<5;n++){
  const h=findLogicalHint(state);for(const {cell,digits} of h.eliminations)for(const d of digits){const board=state.board.slice();board[cell]=d;const result=search(state.puzzle,board,1,250000);assert(!result.exhausted);assert.equal(result.count,0,`cannot exclude ${d} at ${cell}`);}
  state=applyHintToNotes(state,h);
 }
});
test('sparse incorrect notes never create a false single or change the proof',()=>{
 const s=fresh(),expected=findLogicalHint(s);for(let i=0;i<81;i++)if(!s.board[i])s.notes[i]=bit(1);
 assert.deepEqual(findLogicalHint(s),expected);const next=applyHintToNotes(s,expected);assert.equal(next.notes[38],s.notes[38]&logicalCandidateMasks(next)[38]);assert.equal(next.notes[0],s.notes[0]);
 const partial=fresh();partial.notes[38]=bit(partial.solution[38]);assert.equal(applyHintToNotes(partial,findLogicalHint(partial)).notes[38],partial.notes[38]);
});
test('immutable apply rejects stale hints; board edits reset the proof context',()=>{
 const s=fresh(),before=structuredClone(s),h=findLogicalHint(s),next=applyHintToNotes(s,h);assert.deepEqual(s,before);assert.equal(applyHintToNotes(next,h),null);
 const changed=place(s,0,s.solution[0]);assert(changed);assert.equal(applyHintToNotes(changed,h),null);
 const written=place(next,0,s.solution[0]);assert.equal(written.deductionSteps,0);
 const noted=place(next,0,inputChoices(next,0)[0],true);assert.equal(noted.deductionSteps,1);const restored=place(next,h.cell,h.eliminations[0].digits[0],true);assert(restored);assert(!(restored.crossed[h.cell]&bit(h.eliminations[0].digits[0])));assert(!inputChoices(restored,h.cell).includes(h.eliminations[0].digits[0]));
});
test('save round trip preserves reductions and old saves remain valid',()=>{
 const s=fresh();assert(isSaveData(s));const next=applyHintToNotes(s,findLogicalHint(s)),copy=JSON.parse(JSON.stringify(next));assert(isSaveData(copy));assert.deepEqual(logicalCandidateMasks(copy),logicalCandidateMasks(next));assert.deepEqual(findLogicalHint(copy),findLogicalHint(next));
 for(const count of [-1,1.5,730,'1'])assert(!isSaveData({...copy,deductionSteps:count}));
 assert(logicalCandidateMasks({...s,deductionSteps:729}).every((m,i)=>s.board[i]||m&bit(s.solution[i])));
});
test('Chinese, English and Japanese express the same reduction',()=>{
 const hints=['zh','en','ja'].map(lang=>findLogicalHint(fresh(),lang));for(const h of hints){assert.deepEqual(h.eliminations,hints[0].eliminations);assert.equal(h.steps.length,4);assert(h.steps.every(s=>s.text.length>10));}
 assert(!/[\u3400-\u9fff]/.test(hints[1].steps.map(s=>s.text).join()));assert.match(hints[1].steps.at(-1).text,/Apply to notes/);assert.match(hints[2].steps.at(-1).text,/メモに反映/);
});
test('shortened units do not invent mandatory digits',()=>{
 const p={version:1,seed:0,options:{...DEFAULT_OPTIONS,led:false,missing:true,multiDiagonal:true},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array.from({length:81},(_,i)=>i%10===0),cages:[],lines:[],dots:[],slants:[[2,12,22],[54,64,74]]};
 const s={puzzle:p,board:p.givens.slice()};assert(validBoard(p,s.board));assert.equal(findLogicalHint(s),null);
});
for(const transpose of [false,true])test(`X-Wing in ${transpose?'columns':'rows'} removes only unsupported candidates`,()=>{
 const solution=Array.from({length:81},(_,i)=>{const r=Math.floor(i/9),c=i%9;return (3*r+Math.floor(r/3)+c)%9+1;});
 let givens=solution.map((d,i)=>[0,4].includes(Math.floor(i/9))&&![4,8].includes(i%9)?d:0);
 if(transpose)givens=givens.map((_,i)=>givens[i%9*9+Math.floor(i/9)]);
 const p={version:1,seed:0,options:{...DEFAULT_OPTIONS,led:false},givens,lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[],lines:[],dots:[]};
 const h=findLogicalHint({puzzle:p,board:givens});assert.equal(h.kind,'elimination');assert.equal(h.steps[1].title,'X-Wing');assert.equal(h.eliminations.length,14);
 for(const e of h.eliminations){assert.deepEqual(e.digits,[9]);const board=givens.slice();board[e.cell]=9;const result=search(p,board,1,10000);assert(!result.exhausted);assert.equal(result.count,0);}
});
