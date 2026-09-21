import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
registerHooks({ resolve(s,c,n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? `${s}.ts` : s,c); } });
const { DEFAULT_OPTIONS, generate, search, candidates, validBoard, pruneImpliedInequalities, analyzeSingles, meetsChallenge } = await import('../led-sudoku/rules.ts');
const blank = () => ({version:1,seed:1,options:{...DEFAULT_OPTIONS,led:false,inequality:true},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[],lines:[],dots:[],inequalities:[]});

test('reported player seed keeps its givens but removes the redundant R2C5 sign',()=>{
  const fixture=JSON.parse(readFileSync(new URL('../led-sudoku/evidence/clue-pruning/player-seed.json',import.meta.url),'utf8'));
  const old={...blank(),...fixture.before};
  assert.equal(old.inequalities.length,15);assert(old.inequalities.some(([a,b])=>a===22&&b===13));
  assert.equal(pruneImpliedInequalities(old),3);assert(!old.inequalities.some(([a,b])=>a===22&&b===13));
  const g=generate(fixture.options,fixture.seed);
  assert.deepEqual(g.puzzle.givens,fixture.before.givens);assert(g.puzzle.inequalities.length<fixture.before.inequalities.length);
  assert(!g.puzzle.inequalities.some(([a,b])=>a===22&&b===13));
  const proof=search(g.puzzle);assert.equal(proof.count,1);assert.equal(proof.exhausted,false);assert.deepEqual(proof.solution,g.solution);
});

test('screenshot: given 1 in the box makes R2C5 > the given 2 at R3C5 redundant, even as the only sign',()=>{
  const p=blank();p.givens[3]=1;p.givens[22]=2;p.inequalities=[[22,13]];
  const without={...p,inequalities:[]};
  assert.deepEqual(candidates(without,p.givens,13),[3,4,5,6,7,8,9]);
  const before=p.givens.slice();
  assert.equal(pruneImpliedInequalities(p),1);assert.deepEqual(p.inequalities,[]);assert.deepEqual(p.givens,before);
});
test('without that 1, the same inequality is informative and survives',()=>{
  const p=blank();p.givens[22]=2;p.inequalities=[[22,13]];
  assert.equal(pruneImpliedInequalities(p),0);assert.deepEqual(p.inequalities,[[22,13]]);
});
for(const [name,givenAt] of [['row',9],['column',49],['box',3]])test(`candidate pruning uses ${name} peers`,()=>{
  const p=blank();p.givens[givenAt]=1;p.givens[22]=2;p.inequalities=[[22,13]];
  assert.equal(pruneImpliedInequalities(p),1);
});
test('LED, parity and thermometer constraints can make signs redundant',()=>{
  for(const kind of ['LED','parity','thermometer']){
    const p=blank();p.givens[22]=2;p.inequalities=[[22,13]];
    if(kind==='LED'){p.options.led=true;p.lights[13]=32;}
    if(kind==='parity'){p.options.parity=true;p.parity=Array(81).fill(0);p.parity[13]=2;}
    if(kind==='thermometer'){p.options.thermometer=true;p.thermometers=[[22,13,14]];}
    assert.equal(pruneImpliedInequalities(p),1,kind);
  }
});
test('shared-unit equality is impossible even when candidate bounds touch',()=>{
  const p=blank();p.givens[2]=3;p.givens[3]=4;p.givens[4]=5;p.givens[5]=6;p.givens[6]=7;p.givens[7]=8;p.givens[8]=9;
  p.options.parity=true;p.parity=Array(81).fill(0);p.parity[1]=2;p.inequalities=[[0,1]];
  assert.equal(pruneImpliedInequalities(p),1);
});
test('transitive paths and duplicate signs are removed sequentially, without circular proofs',()=>{
  const p=blank();p.inequalities=[[0,1],[0,9],[9,10],[10,1]];
  assert.equal(pruneImpliedInequalities(p),1);assert.deepEqual(p.inequalities,[[0,9],[9,10],[10,1]]);
  const q=blank();q.inequalities=[[0,1],[0,1]];
  assert.equal(pruneImpliedInequalities(q),1);assert.deepEqual(q.inequalities,[[0,1]]);
});
test('pruning preserves the number of solutions, including non-unique inputs',()=>{
  const g=generate({...DEFAULT_OPTIONS,led:false},39),p=g.puzzle;
  p.options.inequality=true;
  p.givens=g.solution.map(v=>v===1||v===2?0:v);
  p.inequalities=[];
  for(let i=0;i<8;i++)p.inequalities.push(g.solution[i]<g.solution[i+1]?[i,i+1]:[i+1,i]);
  const before=search(p);pruneImpliedInequalities(p);const after=search(p);
  assert.equal(before.exhausted,false);assert.equal(after.exhausted,false);assert.equal(after.count,before.count);
});
for(const difficulty of ['easy','normal','hard'])for(const led of [false,true])test(`new puzzles retain useful signs and an independently verified unique solution: ${difficulty}, LED=${led}`,()=>{
  for(const seed of [39,20260920,20260921]){
    const opts={...DEFAULT_OPTIONS,difficulty,led,inequality:true,parity:true};
    const g=generate(opts,seed),p=g.puzzle,copy=structuredClone(p);
    assert(p.inequalities.length>0);assert.equal(pruneImpliedInequalities(copy),0);
    const proof=search(p);assert.equal(proof.exhausted,false);assert.equal(proof.count,1);assert.deepEqual(proof.solution,g.solution);assert(validBoard(p,g.solution,true));
    if(difficulty==='hard')assert(meetsChallenge(analyzeSingles(p)));
    assert.deepEqual(generate(opts,seed),g);
  }
});
