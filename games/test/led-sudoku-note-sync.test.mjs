import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {noteCrossedMasks,noteDisplayMasks,noteChoices,inputChoices}=await import('../led-sudoku/preferences.ts');
const {place,restoreMove}=await import('../led-sudoku/session.ts');
const {findLogicalHint,applyHintToNotes}=await import('../led-sudoku/logical-hints.ts');
const {paintBoard}=await import('../led-sudoku/board-painter.ts');
const fixture=name=>JSON.parse(readFileSync(new URL('../led-sudoku/evidence/hints/'+name+'.json',import.meta.url),'utf8'));
const fresh=()=>fixture('notebook-stale-crosses'),bit=d=>1<<(d-1);
const digits=mask=>Array.from({length:9},(_,i)=>i+1).filter(d=>mask&bit(d));

test('reported R3C2 excludes obsolete crossed 4/6 from both notebook and input keys',()=>{
 const s=fresh(),before=structuredClone(s);assert.deepEqual(digits(s.crossed[19]),[1,4,6,8]);
 assert.deepEqual(inputChoices(s,19),[1,8,9]);assert.deepEqual(noteChoices(s,19),[1,8,9]);
 const crosses=noteCrossedMasks(s);assert.deepEqual(digits(crosses[19]),[1,8]);
 for(const pencil of [true,false])for(const overlay of [true,false]){
  const masks=noteDisplayMasks(s,19,pencil,true,overlay);assert.deepEqual(digits(masks[19]|crosses[19]),[1,8,9]);
 }
 assert.deepEqual(s,before);assert.deepEqual(noteCrossedMasks(JSON.parse(JSON.stringify(s))),crosses);
});

test('renderer does not revive obsolete marks when overlay is on or off',()=>{
 const s=fresh();for(const showAll of [true,false]){
  const texts=[],c=new Proxy({fillText(d,x,y){if(x>=94&&x<=126&&y>=156&&y<=192)texts.push([String(d),this.fillStyle]);}}, {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
  paintBoard(c,{...s,crossed:noteCrossedMasks(s),candidateMasks:noteDisplayMasks(s,19,true,true,showAll),selected:19,hint:-1});
  assert.deepEqual(texts.map(([d])=>d),['1','8','9']);assert.equal(texts[0][1],'#c08894');assert.equal(texts[2][1],'#83b6ba');
 }
});

test('erase and undo restore only marks compatible with the restored board',()=>{
 const s=fresh(),erased=place(s,18,0);assert(erased);
 assert.deepEqual(digits(noteCrossedMasks(erased)[19]),[1,4,6,8]);
 const written=place(erased,18,6);assert(written);assert.deepEqual(digits(noteCrossedMasks(written)[19]),[1,8]);
 assert.deepEqual(digits(noteCrossedMasks(restoreMove(written,erased))[19]),[1,4,6,8]);
 assert.deepEqual(digits(noteCrossedMasks(restoreMove(erased,s))[19]),[1,8]);
});

test('turning automatic filtering off retains the full manual notebook',()=>{
 const s=fresh();assert.deepEqual(digits(noteCrossedMasks(s,false)[19]),[1,4,6,8]);assert.deepEqual(noteChoices(s,19,false),[1,2,3,4,5,6,7,8,9]);
 assert.deepEqual(digits(noteCrossedMasks(s,true)[19]),[1,8]);
});

test('advanced-technique crosses remain visible/restorable and still advance hints',()=>{
 const s=fixture('elimination'),h=findLogicalHint(s),next=applyHintToNotes(s,h),{cell,digits:removed}=h.eliminations[0];
 for(const d of removed){assert(noteCrossedMasks(next)[cell]&bit(d));assert(noteChoices(next,cell).includes(d));assert(!inputChoices(next,cell).includes(d));}
 assert.notDeepEqual(findLogicalHint(next).eliminations,h.eliminations);
 const filtered=noteCrossedMasks(next);assert.deepEqual(findLogicalHint({...next,crossed:filtered}),findLogicalHint(next));
});
