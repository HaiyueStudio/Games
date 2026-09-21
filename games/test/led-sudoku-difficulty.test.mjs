import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? `${s}.ts` : s,c); } });
const { DEFAULT_OPTIONS, generate, analyzeSingles, meetsChallenge, findHint, search, validBoard, isSaveData, cellRuleDetails } = await import('../led-sudoku/rules.ts');
const { skyLinePossible } = await import('../led-sudoku/extra-rules.ts');
const blank = () => ({version:1, seed:1, options:{...DEFAULT_OPTIONS},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[],lines:[],dots:[]});
const saved = g => ({...g,board:g.puzzle.givens.slice(),notes:Array(81).fill(0),elapsed:0,assisted:false});

test('difficulty evaluator counts visible singles, rejects contradictions and never mutates clues', () => {
  const p = blank(); p.lights[0] = 127;
  const before = structuredClone(p), rating = analyzeSingles(p);
  assert.equal(rating.naked,1); assert.equal(rating.remaining,80); assert(!rating.solved); assert.deepEqual(p,before);
  p.givens[1] = p.givens[2] = 4; assert(analyzeSingles(p).contradiction);
  const solved = generate(DEFAULT_OPTIONS,7); assert(analyzeSingles(solved.puzzle,solved.solution).solved);
  assert(!meetsChallenge(analyzeSingles(solved.puzzle,solved.solution)));
});
test('hidden singles count toward basic solving; shortened units do not require every digit', () => {
  const p=blank(); for(let i=1;i<9;i++)p.lights[i]=64;
  const rating=analyzeSingles(p); assert.equal(rating.hidden,1); assert.equal(rating.naked,0);
  p.blocked[0]=true; p.options.missing=true;
  const shortened=analyzeSingles(p); assert.equal(shortened.hidden,0); assert.equal(shortened.naked,0);
});
test('challenge threshold rejects nearly finished or contradictory positions', () => {
  const a={solved:false,contradiction:false,empty:64,remaining:16,naked:48,hidden:0};
  assert(meetsChallenge(a)); assert(!meetsChallenge({...a,remaining:15}));
  assert(!meetsChallenge({...a,contradiction:true})); assert(!meetsChallenge({...a,empty:20,remaining:10}));
});
for (const [name,flags,seed] of [
  ['LED formerly singles-only',{},39],
  ['classic formerly singles-only',{led:false},20260920],
  ['four advanced rules',{thermometer:true,skyscraper:true,xv:true,quadruple:true},20260921],
  ['many simultaneous rules',{diagonal:true,missing:true,killer:true,renban:true,consecutive:true,inequality:true,multiDiagonal:true,exclusion:true,parity:true},20260920],
]) test(`challenge survives repeated actual game hints: ${name}`, () => {
  const options={...DEFAULT_OPTIONS,...flags,difficulty:'hard'},g=generate(options,seed),p=g.puzzle;
  assert.deepEqual(generate(options,seed),g); assert(validBoard(p,g.solution,true)); assert(isSaveData(saved(g)));
  const proof=search(p); assert.equal(proof.count,1); assert(!proof.exhausted); assert.deepEqual(proof.solution,g.solution);
  const board=p.givens.slice(); let steps=0;
  // Replay the production hint interface, independently of the grading loop.
  for(let n=0;n<81;n++) { const h=findHint(p,board); if(!h)break; assert.equal(h.value,g.solution[h.cell]); board[h.cell]=h.value; steps++; }
  const remaining=board.filter((v,i)=>!v&&!p.blocked[i]).length,rating=analyzeSingles(p);
  assert.equal(remaining,rating.remaining); assert.equal(steps,rating.naked+rating.hidden);
  assert(meetsChallenge(rating)); assert.equal(findHint(p,board),null); assert(!validBoard(p,board,true));
});
test('omitted skyscraper clues are unconstrained, both orientations still constrain', () => {
  assert(skyLinePossible([9,0,0,0,0,0,0,0,0],1,0));
  assert(!skyLinePossible([8,0,0,0,0,0,0,0,0],1,0));
  assert(skyLinePossible([0,0,0,0,0,0,0,0,9],0,1));
  assert(!skyLinePossible([0,0,0,0,0,0,0,0,8],0,1));
  assert(skyLinePossible([9,8,7,6,5,4,3,2,1],0,9));
  assert(!skyLinePossible([9,8,7,6,5,4,3,2,1],0,8));
  assert(!skyLinePossible([1,1,0,0,0,0,0,0,0],0,0));
  const g=generate({...DEFAULT_OPTIONS,skyscraper:true,difficulty:'hard'},813),s=saved(g);
  assert(isSaveData(s)); assert(Object.values(g.puzzle.skyClues).flat().includes(0));
  assert(!cellRuleDetails(g.puzzle,0).join('').includes('可见 0 栋'));
  for(const side of Object.values(s.puzzle.skyClues))side.fill(0);
  assert(!isSaveData(s));
});
