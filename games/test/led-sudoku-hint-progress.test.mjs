import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {findLogicalHint,applyHintToNotes,logicalCandidateMasks}=await import('../led-sudoku/logical-hints.ts');
const {place}=await import('../led-sudoku/session.ts');
const {isSaveData,search}=await import('../led-sudoku/rules.ts');
const fixture=file=>JSON.parse(readFileSync(new URL('../led-sudoku/evidence/hints/'+file+'.json',import.meta.url),'utf8'));
const bit=d=>1<<(d-1);
function crossHint(s,h){for(const e of h.eliminations)for(const d of e.digits){s=place(s,e.cell,d,true);assert(s);}return s;}

test('manual deductions advance explanation to a proved placement without changing saved progress',()=>{
 let s=fixture('elimination'),automatic=structuredClone(s);const seen=new Set();
 for(let n=0;n<5;n++){
  const before=structuredClone(s),h=findLogicalHint(s),expected=findLogicalHint(automatic);
  assert.deepEqual(s,before);assert.equal(h.kind,'elimination');assert.deepEqual(h.eliminations,expected.eliminations);
  for(const e of h.eliminations)for(const d of e.digits){const key=e.cell+':'+d;assert(!seen.has(key));seen.add(key);}
  s=crossHint(s,h);automatic=applyHintToNotes(automatic,expected);assert(automatic);
  assert.equal(s.deductionSteps,0);assert(isSaveData(s));
  assert.deepEqual(logicalCandidateMasks(s),logicalCandidateMasks({...s,crossed:undefined,deductionSteps:0}));
 }
 const h=findLogicalHint(s);assert.equal(h.kind,'placement');assert.equal(h.cell,8);assert.equal(h.value,6);assert.equal(h.deductionSteps,5);
 assert(h.steps.length>5);assert.deepEqual(findLogicalHint(JSON.parse(JSON.stringify(s))),h);
});

test('partially recorded XV result selects the other cell and only reports pending exclusions',()=>{
 const s=fixture('missing-xv-stalled'),h=findLogicalHint(s);assert.deepEqual(h.eliminations,[{cell:8,digits:[2]},{cell:17,digits:[2]}]);
 const partial=place(s,8,2,true),next=findLogicalHint(partial);
 assert.equal(next.cell,17);assert.deepEqual(next.eliminations,[{cell:17,digits:[2]}]);
 assert.deepEqual(next.steps.at(-1).cells,[17]);assert.deepEqual(next.steps.at(-2).eliminations,next.eliminations);
 assert.equal(applyHintToNotes(partial,h),null);
 const applied=applyHintToNotes(partial,next);assert(applied);assert(applied.crossed[8]&bit(2));assert(applied.crossed[17]&bit(2));assert.equal(applied.deductionSteps,1);
});

test('apply after manual deductions persists the complete prefix; restoring a cross invalidates the later hint',()=>{
 const s=fixture('elimination'),h=findLogicalHint(s),manual=crossHint(s,h),before=structuredClone(manual),next=findLogicalHint(manual);
 assert.equal(next.deductionSteps,1);const applied=applyHintToNotes(manual,next);assert(applied);assert.equal(applied.deductionSteps,2);assert.deepEqual(manual,before);
 const automatic=applyHintToNotes(applyHintToNotes(s,h),next);assert(automatic);assert.deepEqual(logicalCandidateMasks(applied),logicalCandidateMasks(automatic));
 assert.notDeepEqual(findLogicalHint(applied).eliminations,next.eliminations);
 const restored=place(manual,h.cell,h.eliminations[0].digits[0],true);assert(restored);assert.deepEqual(findLogicalHint(restored).eliminations,h.eliminations);
 assert.equal(applyHintToNotes(restored,next),null);
});

test('incorrect crosses never become proof premises, even with every candidate crossed',()=>{
 const s=fixture('elimination');s.crossed=s.board.map(v=>v?0:511);
 const before=structuredClone(s),h=findLogicalHint(s);assert(h);assert.deepEqual(s,before);assert.equal(h.kind,'placement');assert.equal(h.value,s.solution[h.cell]);
 const remaining=logicalCandidateMasks({...s,deductionSteps:h.deductionSteps});
 assert(remaining.every((mask,i)=>s.board[i]||s.puzzle.blocked[i]||mask&bit(s.solution[i])));
 for(let d=1;d<=9;d++)if(d!==h.value){const board=s.board.slice();board[h.cell]=d;const proof=search(s.puzzle,board,1,250000);assert(!proof.exhausted);assert.equal(proof.count,0);}
});

test('same cell can get a different exclusion, identified as further progress in every language',()=>{
 let s=fixture('missing-xv-stalled'),found=false;
 for(let n=0;n<100;n++){
  const h=findLogicalHint(s);if(!h)break;
  if(h.kind==='placement'){s=place(s,h.cell,h.value);assert(s);continue;}
  if(s.crossed?.[h.cell]){
   found=true;assert.match(h.explanation,/进一步排除/);assert(h.eliminations.every(e=>e.digits.every(d=>!((s.crossed?.[e.cell]??0)&bit(d)))));
   assert.match(findLogicalHint(s,'en').explanation,/further exclude/);assert.match(findLogicalHint(s,'ja').explanation,/さらに/);break;
  }
  s=applyHintToNotes(s,h);assert(s);
 }
 assert(found);
});

test('next explanation draws verified evidence domains without reviving crossed candidates',async()=>{
 const {paintBoard}=await import('../led-sudoku/board-painter.ts');
 const s=fixture('missing-xv-stalled'),manual=crossHint(s,findLogicalHint(s)),h=findLogicalHint(manual);
 assert.equal(h.cell,7);assert.equal(h.steps[0].candidateMasks[8],bit(1)|bit(4));assert.equal(h.steps[0].candidateMasks[17],bit(1)|bit(4));
 const texts=[],c=new Proxy({fillText(d,x,y){texts.push([String(d),x,y]);}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 paintBoard(c,{...manual,selected:h.cell,hint:h.cell,candidateMasks:logicalCandidateMasks(manual),lesson:h.steps[0]});
 assert(texts.some(([d,x,y])=>d==='1'&&x===584&&y===16));
 assert(!texts.some(([d,x,y])=>d==='2'&&x===600&&y===16),'R1C9 must display the proved pair 1/4, not the old 1/2/4');
});
