import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c)}});
const {DEFAULT_OPTIONS,units,findHint,search,validBoard}=await import('../led-sudoku/rules.ts');
const {advancedDeduction,advancedText}=await import('../led-sudoku/advanced-hints.ts');
const {findInferenceChain}=await import('../led-sudoku/inference-chains.ts');
const {findLogicalHint,applyHintToNotes,logicalCandidateMasks}=await import('../led-sudoku/logical-hints.ts');
const {place,complete}=await import('../led-sudoku/session.ts');
const fixture=JSON.parse(readFileSync(new URL('../led-sudoku/evidence/hints/missing-xv-stalled.json',import.meta.url),'utf8'));
const fresh=()=>structuredClone(fixture),bit=d=>1<<(d-1),mask=(...ds)=>ds.reduce((m,d)=>m|bit(d),0);
const blank=()=>({version:1,seed:0,options:{...DEFAULT_OPTIONS,led:false},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[],lines:[],dots:[]});
test('actual screenshot starts with a verifiable V pairing elimination without reading the answer',()=>{
 const s=fresh(),before=structuredClone(s);assert.equal(s.board.filter(Boolean).length,26);assert.equal(findHint(s.puzzle,s.board),null);Object.defineProperty(s,'solution',{get(){throw Error('must not inspect answer');}});
 const h=findLogicalHint(s);assert.equal(h.kind,'elimination');assert.equal(h.steps[1].title,'XV 候选配对');assert.deepEqual(h.eliminations,[{cell:8,digits:[2]},{cell:17,digits:[2]}]);assert.match(h.steps[1].text,/\(1, 4\), \(4, 1\)/);assert.deepEqual(s.board,before.board);assert.deepEqual(s.notes,before.notes);
 for(const lang of ['en','ja']){const other=findLogicalHint(s,lang);assert.deepEqual(other.eliminations,h.eliminations);assert(other.steps[1].text.includes('(1, 4)'));}
});
test('the entire missing XV screenshot is solvable by explained deductions, each independently verified',()=>{
 let s=fresh(),chains=0,placed=0;const verified=new Set();
 for(let n=0;n<220&&!complete(s);n++){
  const h=findLogicalHint(s);assert(h,`stalled after ${placed} placements`);
  if(h.kind==='placement'){assert.equal(h.value,s.solution[h.cell]);s=place(s,h.cell,h.value);placed++;continue;}
  if(h.steps.some(step=>step.title.includes('检验假设'))){chains++;assert(h.steps.some(step=>step.title==='发现矛盾'));assert(h.steps.filter(step=>step.title==='沿假设继续推导').every(step=>step.eliminations.length===0));}
  for(const e of h.eliminations)for(const d of e.digits){const key=`${e.cell}:${d}`;if(verified.has(key))continue;verified.add(key);const b=s.board.slice();b[e.cell]=d;const result=search(s.puzzle,b,1,250000);assert(!result.exhausted);assert.equal(result.count,0,`invalid elimination ${key}`);}
  const old=structuredClone(s);s=applyHintToNotes(s,h);assert(s);assert.deepEqual(s.board,old.board);assert.deepEqual(logicalCandidateMasks(JSON.parse(JSON.stringify(s))),logicalCandidateMasks(s));
 }
 assert(complete(s));assert.equal(placed,46);assert(chains>=1);assert(validBoard(s.puzzle,s.board,true));
});
test('negative XV markers prune unsupported sums and never pair missing cells',()=>{
 const p=blank();p.options.xv=true;p.xvClues=[];const masks=Array(81).fill(511);masks[0]=mask(1,2,4);masks[1]=mask(1,4);
 const d=advancedDeduction(p,p.givens,masks,units(p));assert.equal(d.technique,'xv-support');assert.equal(d.target,null);assert.deepEqual(d.eliminations,[{cell:0,digits:[1,4]}]);assert.match(advancedText(d,'zh').reason,/没有 X\/V/);
 p.blocked[1]=true;const other=advancedDeduction(p,p.givens,masks,units(p));assert(!other||!other.evidence.includes(1));
});
test('both white dots and their absence use candidate support',()=>{
 const p=blank();p.options.consecutive=true;p.dots=[[0,1]];const masks=Array(81).fill(511);masks[0]=mask(1,3,7);masks[1]=mask(2,4);
 let d=advancedDeduction(p,p.givens,masks,units(p));assert.equal(d.technique,'consecutive-support');assert.deepEqual(d.eliminations,[{cell:0,digits:[7]}]);
 p.dots=[];masks[1]=mask(2);d=advancedDeduction(p,p.givens,masks,units(p));assert.equal(d.target,null);assert.deepEqual(d.eliminations,[{cell:0,digits:[1,3]}]);
});
for(const xyz of [false,true])test(`${xyz?'XYZ':'XY'}-Wing requires the correct common peers`,()=>{
 const p=blank(),masks=Array(81).fill(511);masks[0]=xyz?mask(1,2,3):mask(1,2);masks[3]=mask(1,3);masks[xyz?9:27]=mask(2,3);
 const d=advancedDeduction(p,p.givens,masks,units(p));assert.equal(d.technique,xyz?'xyz-wing':'xy-wing');assert(d.eliminations.some(e=>e.cell===(xyz?1:30)&&e.digits.includes(3)));if(xyz)assert(!d.eliminations.some(e=>e.cell===12));
 for(const a of [1,2,3].filter(x=>masks[0]&bit(x)))for(const b of [1,3])for(const c of [2,3])if(a!==b&&a!==c)assert(xyz?a===3||b===3||c===3:b===3||c===3);
 for(const lang of ['zh','en','ja'])assert(advancedText(d,lang).reason.includes('R1C1'));
});
test('hidden pairs require nine cells but naked quads work in shortened units',()=>{
 const p=blank(),masks=Array(81).fill(511);for(let i=2;i<9;i++)masks[i]&=~mask(3,4);masks[0]=mask(1,3,4);masks[1]=mask(2,3,4);
 let d=advancedDeduction(p,p.givens,masks,units(p));assert.equal(d.technique,'hidden-subset');assert.deepEqual(d.eliminations,[{cell:0,digits:[1]},{cell:1,digits:[2]}]);
 p.blocked[8]=true;d=advancedDeduction(p,p.givens,masks,units(p));assert(!d||d.technique!=='hidden-subset');masks.fill(511);[mask(1,2),mask(2,3),mask(3,4),mask(1,4)].forEach((m,i)=>masks[i]=m);d=advancedDeduction(p,p.givens,masks,units(p));assert.equal(d.technique,'quad');assert(d.eliminations.every(e=>e.cell>=4&&e.cell<8));
});
test('short units with two possible positions must not create strong links',()=>{
 const p=blank();p.blocked[8]=true;const masks=Array(81).fill(511);for(let i=2;i<8;i++)masks[i]&=~bit(9);assert.equal(findInferenceChain(p,p.givens,masks,units(p)),null);
});
