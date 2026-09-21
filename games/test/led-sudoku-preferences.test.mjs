import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {preferences,inputChoices,candidateMasks,noteChoices,noteDisplayMasks}=await import('../led-sudoku/preferences.ts');
const {DEFAULT_OPTIONS,DIGITS,generate,search,isSaveData,findHint}=await import('../led-sudoku/rules.ts');
const {place,restoreMove}=await import('../led-sudoku/session.ts');
const {LANGUAGES,RULE_KEYS,ruleCopy,t}=await import('../led-sudoku/i18n.ts');
const {paintBoard}=await import('../led-sudoku/board-painter.ts');
const blank=()=>({puzzle:{version:1,seed:1,options:{...DEFAULT_OPTIONS},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[],lines:[],dots:[]},board:Array(81).fill(0),notes:Array(81).fill(0),solution:Array(81).fill(1),elapsed:0,assisted:false});
test('preferences sanitize saved values and enforce candidate dependency',()=>{
 assert.deepEqual(preferences(null,'ja-JP'),{manualCandidates:false,theme:'dark',language:'ja',filterCandidates:true,showCandidates:false});
 assert.deepEqual(preferences({language:'en',filterCandidates:false,showCandidates:true}),{manualCandidates:false,theme:'dark',language:'en',filterCandidates:false,showCandidates:false});
 assert.equal(preferences({language:'bad'},'zh-Hant').language,'zh');
 assert.equal(preferences({filterCandidates:'false',showCandidates:1},'en-US').showCandidates,false);
});
test('candidate assistance uses constraints without reading the answer; free entry and undo data stay intact',()=>{
 const s=blank();s.puzzle.lights[0]=64;Object.defineProperty(s,'solution',{get(){throw Error('answer accessed');},enumerable:false});
 assert.deepEqual(inputChoices(s,0),[2,3,4,5,6,8,9]);assert.deepEqual(inputChoices(s,0,false),DIGITS);
 assert.equal(candidateMasks(s)[0],511&~1&~64);assert.equal(place(s,0,1),null);
 const note=place(s,0,1,true,false);assert.equal(note.crossed[0],1);assert.equal(note.notes[0],510);assert.equal(s.notes[0],0);
 const entered=place(s,0,1,false,false);assert.equal(entered.board[0],1);assert.equal(s.board[0],0);
 s.puzzle.givens[1]=2;s.board[1]=2;assert.equal(place(s,1,3,false,false),null);
 s.puzzle.blocked[2]=true;assert.deepEqual(inputChoices(s,2,false),[]);
});
test('candidate overlay is 3 by 3, preserves manual notes and all dark segments',()=>{
 const s=blank();s.notes[0]=1;let fills=0;const texts=[];
 const c=new Proxy({fill(){fills++;},fillText(...v){texts.push(v);}}, {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 paintBoard(c,{...s,selected:-1,hint:-1,candidateMasks:[511,...Array(80).fill(0)]});
 assert.equal(fills,81*7);assert.equal(texts.length,9);assert.equal(new Set(texts.map(v=>v[1])).size,3);assert.equal(new Set(texts.map(v=>v[2])).size,3);assert.equal(s.notes[0],1);
});
test('every rule has three localized descriptions; hints mention only enabled diagonals',()=>{
 for(const lang of LANGUAGES){for(const key of RULE_KEYS){const [name,body]=ruleCopy(lang,key);assert(name.length);assert(body.length>30);}assert(t(lang,'filter').length);}
 const s=blank();s.puzzle.givens=[0,2,3,4,5,6,7,8,9,...Array(72).fill(0)];
 assert.match(findHint(s.puzzle,s.puzzle.givens,'en').explanation,/only one candidate/);
 assert.match(findHint(s.puzzle,s.puzzle.givens,'ja').explanation,/候補は 1/);
});
test('additional constraints replace givens and redundant inequality/parity markers',()=>{
 const base=generate(DEFAULT_OPTIONS,20260920),opts={...DEFAULT_OPTIONS,inequality:true,parity:true,killer:true,renban:true};
 const g=generate(opts,20260920),p=g.puzzle;
 assert(p.givens.filter(Boolean).length < base.puzzle.givens.filter(Boolean).length);
 assert(p.inequalities.length>0&&p.inequalities.length<24);
 assert(p.inequalities.every(([a,b])=>!(p.givens[a]&&p.givens[b])&&p.givens[a]!==1&&p.givens[b]!==9));
 assert(p.parity.every((v,i)=>!v||!p.givens[i]));
 assert.equal(search(p).count,1);assert(isSaveData({...g,board:p.givens.slice(),notes:Array(81).fill(0),elapsed:0,assisted:false}));
});

test('pencil clicks cross out and restore, keeping crossed keys available without affecting rules',()=>{
 let s=blank();const original=structuredClone(s);
 assert.equal(noteDisplayMasks(s,0,true)[0],511);assert.equal(noteDisplayMasks(s,0,false)[0],0);
 s=place(s,0,3,true);assert.equal(s.crossed[0],4);assert.equal(s.notes[0],507);assert.equal(s.board[0],0);
 assert.deepEqual(inputChoices(s,0),DIGITS);assert.deepEqual(noteChoices(s,0),DIGITS);
 for(const filter of [true,false])for(const show of [true,false])assert.equal(noteDisplayMasks(s,-1,false,filter,show)[0],511);
 s=place(s,0,3,true);assert.equal(s.crossed[0],0);assert.equal(s.notes[0],511);
 for(const d of DIGITS)s=place(s,0,d,true);
 assert.equal(s.crossed[0],511);assert.equal(s.notes[0],0);assert.equal(noteDisplayMasks(s,0,false)[0],511);
 const erased=place(s,0,0,true);assert.equal(erased.crossed[0],0);assert.equal(erased.notes[0],0);
 assert.deepEqual(restoreMove(s,original),original);assert.equal(original.crossed,undefined);
 const entered=place(s,0,3);assert.equal(entered.crossed[0],0);assert.equal(entered.notes[0],0);
 assert.deepEqual(noteChoices(entered,0,false),[]);assert.equal(place(entered,0,1,true,false),null);
 // Base-rule exclusions disappear from the notebook and keypad; raw marks survive undo.
 s=place(blank(),0,1,true);s.board[1]=1;
 assert(!noteChoices(s,0).includes(1));assert(!inputChoices(s,0).includes(1));
 assert.equal(place(s,0,1,true),null);assert.equal(place(s,0,1,true,false).crossed[0],0);assert.equal(place(s,0,1),null);
});
test('crossed candidates survive JSON and invalid crossed saves are rejected',()=>{
 const g=generate(DEFAULT_OPTIONS,20260920),base={...g,board:g.puzzle.givens.slice(),notes:Array(81).fill(0),elapsed:0,assisted:false};
 const i=base.board.findIndex((v,i)=>!v&&!g.puzzle.blocked[i]),d=inputChoices(base,i)[0];
 const s=place(base,i,d,true),copy=JSON.parse(JSON.stringify(s));assert(isSaveData(copy));assert.equal(copy.crossed[i],1<<(d-1));assert(isSaveData(base));
 for(const crossed of [[],Array(81).fill(-1),Array(81).fill(512),Array(81).fill(1.5)])assert(!isSaveData({...base,crossed}));
 const given=base.board.findIndex(Boolean),bad=Array(81).fill(0);bad[given]=1;assert(!isSaveData({...base,crossed:bad}));
});
test('painter draws muted crossed digits and deletion strokes without manual highlighting',()=>{
 const s=place(blank(),0,3,true),texts=[],strokes=[];
 const c=new Proxy({fillText(d,x,y){texts.push([d,this.fillStyle]);},stroke(){strokes.push(this.strokeStyle);}}, {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
 paintBoard(c,{...s,selected:0,hint:-1,candidateMasks:noteDisplayMasks(s,0,true)});
 assert.equal(texts.length,9);assert(texts.some(([d,color])=>String(d)==='3'&&color==='#c08894'));assert(strokes.includes('#dc9aa7'));
 assert(texts.filter(([d])=>String(d)!=='3').every(([,color])=>color==='#83b6ba'));
});
