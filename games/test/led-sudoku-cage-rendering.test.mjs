import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s,c,n) { return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c); } });
const { cageOutlines } = await import('../led-sudoku/cage-outline.ts');
const { paintBoard } = await import('../led-sudoku/board-painter.ts');
const { DEFAULT_OPTIONS } = await import('../led-sudoku/rules.ts');

test('cage contours cross shared borders without inset gaps or internal edges',()=>{
 assert.deepEqual(cageOutlines([0,1],9),[[[5,5],[70,5],[135,5],[135,65],[70,65],[5,65]]]);
 assert.deepEqual(cageOutlines([0,9],9),[[[5,5],[65,5],[65,70],[65,135],[5,135],[5,70]]]);
 const [bend]=cageOutlines([0,1,9],9);
 assert(bend.some(([x,y])=>x===65&&y===65),'concave corner joins at its inset intersection');
 for(let i=0;i<bend.length;i++) {
  const a=bend[i],b=bend[(i+1)%bend.length];
  assert(a[0]===b[0]||a[1]===b[1],'every corner connects through an axis-aligned edge');
 }
 assert.equal(cageOutlines([8,9],9).length,2,'end of a row does not connect to start of next row');
 assert.equal(cageOutlines([0,1,2,9,11,18,19,20],9).length,2,'holes have their own continuous contour');
 assert.equal(cageOutlines([0,10],9).length,2,'corner-touching cells remain separate contours');
});

test('killer totals, mini LEDs and all nine notes occupy separate space in both themes',()=>{
 for(const theme of ['dark','light-blue']) {
  const p={version:1,seed:1,options:{...DEFAULT_OPTIONS,killer:true},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[{cells:[0,1],sum:12}],lines:[],dots:[]};
  const labels=[],translations=[];
  const ctx=new Proxy({fillText(text,x,y){labels.push({text,x,y});},translate(x,y){translations.push([x,y]);}},
   {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
  const state={theme,puzzle:p,board:p.givens,notes:[511,...Array(80).fill(0)],selected:-1,hint:-1,solution:Array(81).fill(1)};
  const before=structuredClone(state);paintBoard(ctx,state);
  assert.deepEqual(labels.find(l=>l.text==='12'),{text:'12',x:8,y:15});
  assert.deepEqual(translations[1],[7,23],'mini LED sits below the total');
  const notes=labels.filter(l=>/^[1-9]$/.test(l.text));
  assert.equal(notes.length,9);
  for(const note of notes) {
   assert(note.y-6.5>15,'candidate glyphs sit below the total');
   assert(note.x-6.5>7+37*14/50,'candidates clear the mini LED');
   assert(note.y+6.5<65&&note.x+6.5<65,'notes stay within the cage border');
  }
  assert.deepEqual(state,before);
 }
});
