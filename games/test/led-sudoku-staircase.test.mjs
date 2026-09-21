import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {generate,DEFAULT_OPTIONS,candidates,units,search,validBoard,isSaveData,analyzeSingles,meetsChallenge,findHint}=await import('../led-sudoku/rules.ts');
const {boardWidth,staircaseGap}=await import('../led-sudoku/topology.ts');
const {boardCellAt}=await import('../led-sudoku/board-painter.ts');
const {place,complete}=await import('../led-sudoku/session.ts');
const {findLogicalHint,applyHintToNotes}=await import('../led-sudoku/logical-hints.ts');
const {selectRule}=await import('../led-sudoku/extra-rules.ts');
const {RULE_KEYS,ruleCopy}=await import('../led-sudoku/i18n.ts');
const blank=()=>({version:1,seed:39,options:{...DEFAULT_OPTIONS,led:false,staircase:true},givens:Array(144).fill(0),lights:Array(144).fill(0),blocked:Array.from({length:144},(_,i)=>staircaseGap(i)),cages:[],lines:[],dots:[]});
const save=g=>({...g,board:g.puzzle.givens.slice(),notes:Array(g.puzzle.givens.length).fill(0),elapsed:0,assisted:false});
const at=(r,c)=>(r-1)*12+c-1;
test('reference staircase has 108 cells, twelve boxes, and cross-gap nine-cell rows/columns',()=>{
 const p=blank(),us=units(p);assert.equal(boardWidth(p),12);assert.equal(p.blocked.filter(x=>!x).length,108);assert.equal(us.length,36);assert(us.every(u=>u.length===9&&new Set(u).size===9));
 for(let i=0;i<144;i++)assert.equal(us.filter(u=>u.includes(i)).length,p.blocked[i]?0:3);
 assert.deepEqual(us[9],[36,37,38,39,40,41,45,46,47]);
 const board=p.givens.slice();board[at(4,1)]=5;assert(!candidates(p,board,at(4,12)).includes(5));board[at(4,12)]=5;assert(!validBoard(p,board));
 board.fill(0);board[at(1,4)]=7;assert(!candidates(p,board,at(12,4)).includes(7));assert(candidates(p,board,at(12,12)).includes(7));
});
test('the supplied screenshot solves uniquely with the same geometry',()=>{
 const p=blank(),rows=[[0,0,0,7,0,0,1,0,3,0,0,0],[0,7,9,0,0,5,0,0,0,0,0,0],[1,8,0,3,4,0,0,9,0,0,0,0],[0,0,0,0,0,0,0,0,0,9,0,4],[0,0,0,0,0,0,0,0,0,6,0,5],[0,0,8,4,0,9,0,0,0,0,0,1],[5,0,0,0,0,0,8,0,2,1,0,0],[2,0,4,0,0,0,0,0,0,0,0,0],[8,0,7,0,0,0,0,0,0,0,0,0],[0,0,0,0,6,0,0,4,9,0,1,8],[0,0,0,0,0,0,7,0,0,3,6,0],[0,0,0,8,0,2,0,0,6,0,0,0]];
 p.givens=rows.flat();const r=search(p);assert(!r.exhausted);assert.equal(r.count,1);assert(validBoard(p,r.solution,true));
});
for(const difficulty of ['easy','normal','hard'])for(const led of [false,true])test(`staircase ${difficulty} LED ${led}: unique, deterministic, saveable`,()=>{
 const options={...DEFAULT_OPTIONS,staircase:true,difficulty,led},g=generate(options,39);assert.deepEqual(generate(options,39),g);assert(isSaveData(save(g)));assert.equal(g.solution.filter(Boolean).length,108);
 const r=search(g.puzzle);assert(!r.exhausted);assert.equal(r.count,1);assert.deepEqual(r.solution,g.solution);if(difficulty==='hard')assert(meetsChallenge(analyzeSingles(g.puzzle)));
});
test('LED and parity combine; incompatible geometry rules switch off explicitly',()=>{
 const g=generate({...DEFAULT_OPTIONS,staircase:true,parity:true},19);assert(isSaveData(save(g)));assert.equal(search(g.puzzle).count,1);assert(g.puzzle.parity.some(Boolean));
 const selected=selectRule({...DEFAULT_OPTIONS,missing:true,diagonal:true,killer:true,parity:true},'staircase',true);assert(selected.notice);assert(selected.options.led&&selected.options.parity&&selected.options.staircase);assert(!selected.options.missing&&!selected.options.diagonal&&!selected.options.killer);
 assert(!selectRule(selected.options,'missing',true).options.staircase);
});
test('gaps cannot be hit or edited; all 108 cells map correctly including last row',()=>{
 const p=blank(),s=save({puzzle:p,solution:p.givens.slice()});for(let i=0;i<144;i++){const hit=boardCellAt(p,(i%12+.5)/12,(Math.floor(i/12)+.5)/12);assert.equal(hit,p.blocked[i]?-1:i);if(p.blocked[i])assert.equal(place(s,i,1),null);}
 for(const [x,y] of [[-0.01,.5],[1,.5],[.5,1]])assert.equal(boardCellAt(p,x,y),-1);
});
test('placement hints address the lower-right cell in all languages',()=>{
 const g=generate({...DEFAULT_OPTIONS,staircase:true,led:false},39),p=g.puzzle;p.givens=g.solution.slice();p.givens[143]=0;const s=save(g);
 for(const lang of ['zh','en','ja']){const h=findHint(p,s.board,lang);assert.equal(h.cell,143);assert(h.steps.some(step=>step.text.includes('R12C12')));}
 assert(complete(place(s,143,g.solution[143])));
});
test('save validation rejects filled/missing gaps and wrong array sizes, preserves legacy saves',()=>{
 const s=save(generate({...DEFAULT_OPTIONS,staircase:true},39));assert(isSaveData(s));for(const field of ['board','notes','solution']){const bad=structuredClone(s);bad[field]=bad[field].slice(0,81);assert(!isSaveData(bad));}
 const gap=s.puzzle.blocked.findIndex(Boolean),bad=structuredClone(s);bad.puzzle.blocked[gap]=false;assert(!isSaveData(bad));const filled=structuredClone(s);filled.board[gap]=1;assert(!isSaveData(filled));
 const old=save(generate({...DEFAULT_OPTIONS,led:false},39));delete old.puzzle.options.staircase;assert(isSaveData(old));
 for(const lang of ['zh','en','ja'])assert(ruleCopy(lang,'staircase').every(Boolean));assert(RULE_KEYS.includes('staircase'));
});
test('advanced hint replay remains sound on the 144-slot board',()=>{
 let s=save(generate({...DEFAULT_OPTIONS,staircase:true,led:false,difficulty:'hard'},39)),eliminations=0;
 for(let n=0;n<160&&!complete(s);n++){
  const h=findLogicalHint(s);if(!h)break;
  for(const step of h.steps)for(const e of step.eliminations)assert(!e.digits.includes(s.solution[e.cell]));
  if(h.kind==='placement'){assert.equal(h.value,s.solution[h.cell]);s=place(s,h.cell,h.value);assert(s);}else{eliminations++;s=applyHintToNotes(s,h);assert(s);}
 }
 assert(eliminations>0,'challenge reaches advanced eliminations');assert(complete(s),'supported reasoning completes deterministic staircase');
});
