import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {DEFAULT_OPTIONS,findHint,candidates,generate,units}=await import('../led-sudoku/rules.ts');
const {paintBoard}=await import('../led-sudoku/board-painter.ts');
const fixture=JSON.parse(readFileSync(new URL('../led-sudoku/evidence/hints/screenshot.json',import.meta.url),'utf8'));
const blank=()=>({version:1,seed:0,options:{...DEFAULT_OPTIONS,led:false},givens:Array(81).fill(0),blocked:Array(81).fill(false),lights:Array(81).fill(0),cages:[],lines:[],dots:[]});
const example=()=>({...blank(),options:{...DEFAULT_OPTIONS,led:false,inequality:true},givens:fixture.givens.slice(),inequalities:fixture.inequalities.map(p=>p.slice())});
function verify(p,board,hint){
 assert(hint.steps.length>=2);assert.equal(hint.steps.at(-1).kind,'conclusion');assert.deepEqual(hint.steps.at(-1).candidates,[hint.value]);
 for(const step of hint.steps){assert(step.text.length>10);for(const i of [...step.cells,...step.evidence])assert(i>=0&&i<81&&!p.blocked[i]);for(const e of step.eliminations)for(const d of e.digits)assert(!candidates(p,board,e.cell).includes(d));}
 const unit=hint.steps.find(s=>s.kind==='unit');
 if(unit){assert.equal(unit.cells.length,9);assert(units(p).some(u=>u.join()===unit.cells.join()));for(const i of unit.cells.filter(i=>!board[i]&&i!==hint.cell))assert(hint.steps.some(s=>s.eliminations.some(e=>e.cell===i&&e.digits.includes(hint.value))));}
}
test('screenshot proof explains basic 6/9, both inequalities, box 3 and the exact row',()=>{
 const p=example(),board=fixture.board.slice(),before=JSON.stringify({p,board});
 Object.defineProperty(p,'solution',{get(){throw Error('must not read an answer');}});
 const h=findHint(p,board);assert.equal(h.cell,10);assert.equal(h.value,9);assert.equal(h.steps.length,6);assert.deepEqual(h.steps[0].candidates,[6,9]);
 const text=h.steps.map(s=>s.text).join('\n');assert.match(text,/R2C1 < R1C1/);assert.match(text,/最大是 9/);assert.match(text,/R2C5 < R2C4/);assert.match(text,/R2C4 = 8/);assert.match(text,/第 3 宫/);assert.match(text,/R3C8/);assert.match(text,/第 2 行/);assert(!text.includes('对角线'));assert(!text.includes('LED'));
 const box=h.steps.find(s=>s.evidence.includes(25));assert.deepEqual(box.eliminations.map(e=>e.cell),[15,16,17]);verify(p,board,h);assert.equal(JSON.stringify({p,board}),before);
});
test('all three languages share the same proof and cell references',()=>{
 const p=example(),hints=['zh','en','ja'].map(lang=>findHint(p,fixture.board,lang));
 const structure=h=>h.steps.map(({kind,cells,evidence,eliminations,candidates})=>({kind,cells,evidence,eliminations,candidates}));
 assert.deepEqual(structure(hints[0]),structure(hints[1]));assert.deepEqual(structure(hints[0]),structure(hints[2]));
 assert.match(hints[1].steps.map(s=>s.text).join(' '),/box 3/);assert(!/[\u3400-\u9fff]/.test(hints[1].steps.map(s=>s.text).join(' ')));assert.match(hints[2].steps.map(s=>s.text).join(' '),/ブロック/);
});
test('a changed inequality cannot reuse the old R2C2 conclusion',()=>{
 const p=example();p.inequalities=p.inequalities.filter(([a,b])=>!(a===13&&b===12));
 assert(candidates(p,fixture.board,13).includes(9));const h=findHint(p,fixture.board);assert(!h||h.cell!==10||h.value!==9);if(h)verify(p,fixture.board,h);
});
test('basic naked singles and invalid boards have honest explanations',()=>{
 const p=blank();p.givens=[0,2,3,4,5,6,7,8,9,...Array(72).fill(0)];const h=findHint(p,p.givens);assert.equal(h.value,1);assert(!h.steps[0].text.includes('还不能'));verify(p,p.givens,h);
 p.givens[0]=2;assert.equal(findHint(p,p.givens),null);
});
for(const [name,flags] of [ ['LED',{}],['inequality and parity',{inequality:true,parity:true}],['missing diagonals',{missing:true,diagonal:true,multiDiagonal:true}],['killer and ordered line',{killer:true,renban:true,consecutive:true}],['advanced',{thermometer:true,skyscraper:true,xv:true,quadruple:true}],['exclusion',{exclusion:true}] ])test(`every elimination is verifiable: ${name}`,()=>{
 const g=generate({...DEFAULT_OPTIONS,...flags},20260920),before=structuredClone(g.puzzle),h=findHint(g.puzzle,g.puzzle.givens);if(h)verify(g.puzzle,g.puzzle.givens,h);assert.deepEqual(g.puzzle,before);
});
test('step highlights draw coordinates and exclusions without changing notes or digits',()=>{
 const p=example(),h=findHint(p,fixture.board),text=[],strokes=[];
 const ctx=new Proxy({fillText(...a){text.push(a[0]);},strokeRect(...a){strokes.push(a);}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 const state={puzzle:p,board:fixture.board.slice(),notes:Array(81).fill(0),selected:10,hint:10,solution:fixture.board.slice(),lesson:h.steps.find(s=>s.evidence.includes(25))};const before=structuredClone(state);
 paintBoard(ctx,state);assert(text.includes('R3C8'));assert(text.includes('R2C7'));assert(strokes.length>=4);assert.deepEqual(state,before);
});
