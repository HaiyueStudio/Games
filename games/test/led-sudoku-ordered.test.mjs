import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,n) { return n(s.startsWith('.') && !/\.[a-z]+$/i.test(s) ? `${s}.ts` : s,c); } });
const { DEFAULT_OPTIONS, generate, candidates, validBoard, isSaveData, lineRuleDescription, cellRuleDetails } = await import('../led-sudoku/rules.ts');
const blank = (line=[0,1,2]) => ({version:1,seed:1,options:{...DEFAULT_OPTIONS,led:false,renban:true},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[],lines:[line],lineRule:'ordered',dots:[]});

test('ordered consecutive line permits either direction but rejects shuffled sets and jumps',()=>{
  const p=blank();
  for(const [values,valid] of [[[2,3,4],true],[[4,3,2],true],[[2,4,3],false],[[2,4,6],false],[[2,3,2],false]]) {
    const board=Array(81).fill(0);values.forEach((v,i)=>board[i]=v);
    assert.equal(validBoard(p,board),valid,values.join(','));
  }
});
test('partial candidates preserve both directions and use distances between nonadjacent clues',()=>{
  const p=blank(),b=Array(81).fill(0);b[0]=3;
  assert.deepEqual(candidates(p,b,1),[2,4]);assert.deepEqual(candidates(p,b,2),[1,5]);
  b[2]=5;assert.deepEqual(candidates(p,b,1),[4]);
  b[0]=5;b[2]=3;assert.deepEqual(candidates(p,b,1),[4]);
  const reversed={...p,lines:[[2,1,0]]};assert.deepEqual(candidates(reversed,b,1),[4]);
  b[0]=2;b[2]=3;assert.deepEqual(candidates(p,b,1),[]);
  const long=blank([0,1,2,3,4,5,6,7,8]);
  assert.deepEqual(candidates(long,Array(81).fill(0),0),[1,9]);
  assert.deepEqual(candidates(long,Array(81).fill(0),4),[5]);
});
test('LED still filters both ordered directions without treating dark segments as forbidden',()=>{
  const p=blank(),b=Array(81).fill(0);p.options.led=true;b[1]=4;
  p.lights[0]=16; // Lower-left tube: 5 lacks it, so neither 3 nor 5 fits.
  assert.deepEqual(candidates(p,b,0,false),[3,5]);assert.deepEqual(candidates(p,b,0),[]);
  p.lights[0]=64;assert.deepEqual(candidates(p,b,0),[3,5]);
});
test('generator creates monotonic paths in both directions and marks the saved rule',()=>{
  const directions=new Set();let long=0;
  for(const seed of [7,39,813]) {
    const g=generate({...DEFAULT_OPTIONS,renban:true},seed),p=g.puzzle;
    assert.equal(p.lineRule,'ordered');assert(p.lines.length);
    for(const path of p.lines) {
      const values=path.map(i=>g.solution[i]),step=values[1]-values[0];
      assert.equal(Math.abs(step),1);assert(values.every((v,n)=>!n||v-values[n-1]===step));
      directions.add(step);if(path.length>=3)long++;
    }
    const save={...g,board:p.givens.slice(),notes:Array(81).fill(0),elapsed:0,assisted:false};
    assert(isSaveData(save));assert.match(cellRuleDetails(p,p.lines[0][0]).join(''),/全部升序或全部降序/);
    p.lineRule='invalid';assert(!isSaveData(save));
  }
  assert.equal(directions.size,2);assert(long>0);
});
test('legacy unordered save retains its answer and is explicitly described as legacy',()=>{
  const p=blank();delete p.lineRule;
  const permutation=[2,4,3,1,5,6,7,8,9];
  const solution=Array.from({length:81},(_,i)=>{const r=Math.floor(i/9),c=i%9;return permutation[(r*3+Math.floor(r/3)+c)%9];});
  const save={puzzle:p,solution,board:p.givens.slice(),notes:Array(81).fill(0),elapsed:123,assisted:false};
  assert.deepEqual(solution.slice(0,3),[2,4,3]);assert(isSaveData(save));
  assert.match(lineRuleDescription(p),/旧版 Renban/);assert.match(cellRuleDetails(p,0).join(''),/顺序不限/);
  p.lineRule='ordered';assert(!validBoard(p,solution,true));assert(!isSaveData(save));
});
