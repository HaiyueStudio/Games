import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {generate,DEFAULT_OPTIONS,candidates,validBoard,search,isSaveData,neighbors,exclusionCells,findHint,analyzeSingles,meetsChallenge}=await import('../led-sudoku/rules.ts');
const {selectRule,optionConflict,RULE_CONFLICTS,visibleBuildings,skyLinePossible}=await import('../led-sudoku/extra-rules.ts');
const {boardCellAt,paintBoard}=await import('../led-sudoku/board-painter.ts');
const {COLORS,drawDigit}=await import('../led-sudoku/led-display.ts');
const blank=(options={})=>({version:1,seed:1,options:{...DEFAULT_OPTIONS,...options},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[],lines:[],dots:[]});
const save=g=>({...g,board:g.puzzle.givens.slice(),notes:Array(81).fill(0),elapsed:0,assisted:false});
test('thermometer outlines and interiors follow the same cell centers as their bulbs',()=>{
 for(const theme of ['dark','light-blue']) for(const led of [false,true]) {
  const p=blank({thermometer:true,led});p.thermometers=[[7,8,17,16],[54,63,64,73,74,65]];
  const strokes=[],bulbs=[];let points=[];
  const ctx=new Proxy({
   beginPath(){points=[];},moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);},
   stroke(){if(this.lineWidth===21||this.lineWidth===15)strokes.push(points.slice());},
   arc(x,y,r){if(r===25)bulbs.push([x,y]);},
  },{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
  paintBoard(ctx,{theme,puzzle:p,board:p.givens,notes:Array(81).fill(0),selected:-1,hint:-1,solution:Array(81).fill(1)});
  const expected=[[[525,35],[595,35],[595,105],[525,105]],[[35,455],[35,525],[105,525],[105,595],[175,595],[175,525]]];
  assert.deepEqual(strokes,[expected[0],expected[0],expected[1],expected[1]]);
  assert.deepEqual(bulbs,[[525,35],[35,455]]);
 }
});
test('thermometers enforce strict order, empty-cell distances, and both endpoints',()=>{
 const p=blank({thermometer:true});p.thermometers=[[0,1,10,19]];
 assert.deepEqual(candidates(p,p.givens,0),[1,2,3,4,5,6]);assert.deepEqual(candidates(p,p.givens,19),[4,5,6,7,8,9]);
 const b=p.givens.slice();b[0]=4;b[19]=8;assert.deepEqual(candidates(p,b,10),[6,7]);
 b[10]=5;assert(!validBoard(p,b));b[10]=7;assert(validBoard(p,b));
});
test('skyscrapers count only new maxima from each side and prune partial lines exactly',()=>{
 const row=[2,1,4,3,6,5,8,7,9];assert.equal(visibleBuildings(row),5);assert.equal(visibleBuildings(row.slice().reverse()),1);
 assert(skyLinePossible(row,5,1));assert(!skyLinePossible(row,4,1));
 assert(skyLinePossible([9,0,0,0,0,0,0,0,0],1,9));assert(!skyLinePossible([8,0,0,0,0,0,0,0,0],1,9));
 const p=blank({skyscraper:true});p.skyClues={left:Array(9).fill(1),right:Array(9).fill(9),top:Array(9).fill(1),bottom:Array(9).fill(9)};
 assert.deepEqual(candidates(p,p.givens,0),[9]);
});
test('XV marks every sum 5/10 edge, including unmarked negative constraints',()=>{
 const p=blank({xv:true});p.xvClues=[{cells:[0,1],sum:5}];const b=p.givens.slice();b[0]=2;
 assert.deepEqual(candidates(p,b,1),[3]);assert(!candidates(p,b,9).includes(3));assert(!candidates(p,b,9).includes(8));
 p.xvClues=[{cells:[0,1],sum:10}];assert.deepEqual(candidates(p,b,1),[8]);b[1]=3;assert(!validBoard(p,b));
});
test('four-cell sums use all four cells and allow legal diagonal repetitions',()=>{
 const p=blank({quadruple:true});p.fourSums=[{at:20,sum:7}];const b=p.givens.slice();b[21]=2;b[29]=3;b[30]=1;
 assert.deepEqual(candidates(p,b,20),[1]);b[20]=1;assert(validBoard(p,b));p.fourSums[0].sum=8;assert(!validBoard(p,b));
 const q=blank({quadruple:true});q.fourSums=[{at:0,sum:10}];assert.deepEqual(candidates(q,q.givens,0),[1,2,3,4]);
});
test('rule conflicts are symmetric and rejected outside UI too',()=>{
 for(const [a,b] of RULE_CONFLICTS) {
  const options={...DEFAULT_OPTIONS,[a]:true,[b]:true};assert(optionConflict(options));assert.throws(()=>generate(options,1),/不能同时开启/);
  for(const [on,off] of [[a,b],[b,a]]) { const r=selectRule(options,on,true);assert(r.options[on]);assert.equal(r.options[off],false);assert(r.notice.includes('已关闭'));assert.equal(optionConflict(r.options),null); }
 }
});
test('outer skyscraper clues are excluded from both native and browser cell hit testing',()=>{
 const p=blank({skyscraper:true});assert.equal(boardCellAt(p,.01,.5),-1);assert.equal(boardCellAt(p,.5,.99),-1);assert.equal(boardCellAt(p,30/630+.001,30/630+.001),0);assert.equal(boardCellAt(p,.5,.5),40);assert.equal(boardCellAt(p,599/630,599/630),80);
 p.options.skyscraper=false;assert.equal(boardCellAt(p,.01,.01),0);
});
test('LED tubes are always crisp and empty cells retain all seven darker tubes',()=>{
 const blur=[],colors=[];let fills=0;const ctx=new Proxy({fill(){fills++;colors.push(this.fillStyle);}}, {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>{if(k==='shadowBlur')blur.push(v);o[k]=v;return true;}});
 drawDigit(ctx,0,0,0,50,'#fff');assert.equal(fills,7);assert(colors.every(c=>c===COLORS.muted));assert(blur.every(v=>v===0));
 fills=0;const p=blank();paintBoard(ctx,{puzzle:p,board:p.givens,notes:Array(81).fill(0),selected:-1,hint:-1,solution:Array(81).fill(1)});assert.equal(fills,81*7);
});
for(let flags=1;flags<16;flags++) for(const led of [true,false]) test(`new variants unique and valid: flags=${flags}, LED=${led}`,()=>{
 const keys=['thermometer','skyscraper','xv','quadruple'];const opts={...DEFAULT_OPTIONS,led,difficulty:['easy','normal','hard'][flags%3],...Object.fromEntries(keys.map((k,i)=>[k,!!(flags&(1<<i))]))};
 const g=generate(opts,320+flags),p=g.puzzle;assert(validBoard(p,g.solution,true));assert(isSaveData(save(g)));const proof=search(p);assert.equal(proof.count,1);assert(!proof.exhausted);assert.deepEqual(proof.solution,g.solution);
 if(opts.thermometer) {assert(p.thermometers.length);for(const path of p.thermometers)path.forEach((i,n)=>{if(n)assert(g.solution[i]>g.solution[path[n-1]]);});}
 if(opts.skyscraper) {
  assert(Object.values(p.skyClues).flat().some(Boolean));
  for(const side of Object.values(p.skyClues)) assert(side.filter(Boolean).length <= (opts.difficulty==='hard'?4:9));
  for(let n=0;n<9;n++) {
   const row=g.solution.slice(n*9,n*9+9),col=Array.from({length:9},(_,r)=>g.solution[r*9+n]);
   for(const [clue,values] of [[p.skyClues.left[n],row],[p.skyClues.right[n],row.slice().reverse()],[p.skyClues.top[n],col],[p.skyClues.bottom[n],col.slice().reverse()]]) if(clue)assert.equal(clue,visibleBuildings(values));
  }
 }
 if(opts.difficulty==='hard') assert(meetsChallenge(analyzeSingles(p)));
 if(opts.xv)for(let i=0;i<81;i++)for(const j of neighbors(i))if(i<j){const sum=g.solution[i]+g.solution[j],clue=p.xvClues.find(c=>c.cells.includes(i)&&c.cells.includes(j));assert.equal(!!clue,sum===5||sum===10);if(clue)assert.equal(clue.sum,sum);}
 if(opts.quadruple) {assert(p.fourSums.length);for(const c of p.fourSums)assert.equal(c.sum,exclusionCells(c.at).reduce((sum,i)=>sum+g.solution[i],0));}
 const hint=findHint(p,p.givens);if(hint)assert.equal(hint.value,g.solution[hint.cell]);
});
test('combined advanced rules are deterministic; saves reject missing and corrupt clues',()=>{
 const opts={...DEFAULT_OPTIONS,thermometer:true,skyscraper:true,xv:true,quadruple:true,killer:true,diagonal:true,multiDiagonal:true,parity:true};const g=generate(opts,33);assert.deepEqual(generate(opts,33),g);assert(isSaveData(save(g)));
 for(const corrupt of [p=>p.thermometers[0].reverse(),p=>p.thermometers=[],p=>p.skyClues.top[0]=10,p=>delete p.skyClues,p=>p.fourSums[0].sum++,p=>p.fourSums[0].at=80,p=>p.xvClues.shift(),p=>p.xvClues.push(p.xvClues[0]),p=>p.options.exclusion=true]) {const s=save(structuredClone(g));corrupt(s.puzzle);assert(!isSaveData(s));}
 const legacy=save(generate(DEFAULT_OPTIONS,7));for(const k of ['thermometer','skyscraper','xv','quadruple'])delete legacy.puzzle.options[k];for(const k of ['thermometers','skyClues','xvClues','fourSums'])delete legacy.puzzle[k];assert(isSaveData(legacy));
});
