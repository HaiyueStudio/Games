import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {preferences,autoCandidateFiltering,inputChoices,noteChoices,noteDisplayMasks,noteCrossedMasks}=await import('../led-sudoku/preferences.ts');
const {DEFAULT_OPTIONS}=await import('../led-sudoku/rules.ts');
const {place,restoreMove}=await import('../led-sudoku/session.ts');
const {t}=await import('../led-sudoku/i18n.ts');
const blank=()=>({puzzle:{version:1,seed:1,options:{...DEFAULT_OPTIONS,inequality:true},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[],lines:[],dots:[],inequalities:[[0,1]]},board:Array(81).fill(0),notes:Array(81).fill(0),solution:Array(81).fill(1),elapsed:0,assisted:false});
test('manual preference overrides assistance, survives persistence and preserves the prior filter choice',()=>{
 const p=preferences({manualCandidates:true,filterCandidates:true,showCandidates:true});assert(p.manualCandidates);assert(p.filterCandidates);assert(!autoCandidateFiltering(p));assert(!p.showCandidates);assert.deepEqual(preferences(JSON.parse(JSON.stringify(p))),p);
 assert(autoCandidateFiltering(preferences({...p,manualCandidates:false})));assert(!autoCandidateFiltering(preferences({manualCandidates:false,filterCandidates:false})));
 assert(!preferences({}).manualCandidates);assert(!preferences({manualCandidates:'true'}).manualCandidates);
});
test('manual input and notebook ignore basic, LED and extra-rule auto eliminations',()=>{
 const s=blank();s.board[1]=3;s.puzzle.givens[1]=3;s.puzzle.lights[0]=64;s.crossed=Array(81).fill(0);s.crossed[0]=4;s.notes[0]=507;
 assert.deepEqual(inputChoices(s,0),[2]);const original=structuredClone(s);
 const filter=autoCandidateFiltering(preferences({manualCandidates:true}));
 assert.deepEqual(inputChoices(s,0,filter),[1,2,3,4,5,6,7,8,9]);assert.deepEqual(noteChoices(s,0,filter),[1,2,3,4,5,6,7,8,9]);
 assert.equal(noteDisplayMasks(s,0,true,filter)[0],511);assert.equal(noteCrossedMasks(s,filter)[0],4);assert.equal(noteCrossedMasks(s,true)[0],0);assert.deepEqual(s,original);
 const restored=place(s,0,3,true,filter);assert.equal(restored.crossed[0],0);assert.equal(restored.notes[0],511);assert.equal(place(s,0,3,false,filter).board[0],3);
 assert.equal(place(s,1,4,false,filter),null);s.puzzle.blocked[2]=true;assert.deepEqual(inputChoices(s,2,filter),[]);
});
test('manual peer entry preserves notebook exactly and still supports undo and reload',()=>{
 let s=blank();s.puzzle.options.inequality=false;s.puzzle.inequalities=[];
 s=place(s,0,4,true,false);const old=structuredClone(s);const next=place(s,1,4,false,false);
 assert.deepEqual(next.notes,old.notes);assert.deepEqual(next.crossed,old.crossed);assert.equal(noteCrossedMasks(next,false)[0],8);assert.equal(noteDisplayMasks(next,0,false,false)[0],511);
 assert.deepEqual(restoreMove(next,old),old);const reload=JSON.parse(JSON.stringify(next));assert.equal(noteCrossedMasks(reload,false)[0],8);
 const automatic=place(s,1,4,false,true);assert.equal(noteCrossedMasks(automatic,true)[0],0);
});
test('manual setting has localized name, explanation and dependency text',()=>{
 for(const lang of ['zh','en','ja'])for(const key of ['manualCandidates','manualCandidatesDetail','manualCandidatesActive'])assert(t(lang,key).length>8);
});
