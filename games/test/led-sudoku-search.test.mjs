import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? `${s}.ts` : s,c); } });
const { DEFAULT_OPTIONS, generate, search, candidates, validBoard } = await import('../led-sudoku/rules.ts');
// Deliberately uses public array candidates and board scans, without incremental
// occupancy masks, to detect search trail/rollback mistakes in the optimized path.
function reference(p, initial, limit, budget) {
  const board=initial.slice(),r={count:0,solution:null,exhausted:false,nodes:0};
  if(!validBoard(p,board)) return r;
  function visit() {
    if(++r.nodes>budget) {r.exhausted=true;return;}
    let best=-1,values=[];
    for(let i=0;i<81;i++)if(!p.blocked[i]&&!board[i]) {
      const vs=candidates(p,board,i);if(!vs.length)return;
      if(best<0||vs.length<values.length){best=i;values=vs;if(vs.length===1)break;}
    }
    if(best<0){r.count++;r.solution??=board.slice();return;}
    for(const v of values){board[best]=v;visit();board[best]=0;if(r.count>=limit||r.exhausted)return;}
  }
  visit();return r;
}
for(const [name,flags] of [
  ['classic',{led:false}], ['LED',{}],
  ['short and diagonal units',{diagonal:true,missing:true,multiDiagonal:true}],
  ['advanced',{thermometer:true,skyscraper:true,xv:true,quadruple:true}],
  ['sums and negative adjacency',{killer:true,renban:true,consecutive:true,inequality:true,exclusion:true,parity:true}],
])test(`incremental search agrees with board-scan reference: ${name}`,()=>{
  const g=generate({...DEFAULT_OPTIONS,...flags},39),p=g.puzzle;
  const initial=g.solution.map((v,i)=>i%3===0?p.givens[i]:v),before=structuredClone(p);
  for(const budget of [0,1,12,200])assert.deepEqual(search(p,initial,2,budget),reference(p,initial,2,budget));
  assert.deepEqual(p,before);assert.deepEqual(initial,g.solution.map((v,i)=>i%3===0?p.givens[i]:v));
  // Clue edits between searches must not see a stale structural/global cache.
  p.lights[0]=127;p.givens[0]=0;
  const changed=initial.slice();changed[0]=0;
  assert.deepEqual(search(p,changed,2,200),reference(p,changed,2,200));
});
test('branch rollback counts multiple solutions and candidate callers cannot mutate lookup tables',()=>{
  const g=generate({...DEFAULT_OPTIONS,led:false},39),p=g.puzzle;
  p.givens=g.solution.map(v=>v===1||v===2?0:v);
  const before=structuredClone(p),proof=search(p,p.givens,2,500);
  assert.equal(proof.count,2);assert.equal(proof.exhausted,false);
  assert.deepEqual(proof,reference(p,p.givens,2,500));assert.deepEqual(p,before);
  const i=p.givens.indexOf(0),values=candidates(p,p.givens,i),copy=values.slice();values.length=0;
  assert.deepEqual(candidates(p,p.givens,i),copy);
});
