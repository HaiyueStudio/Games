import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {generate,DEFAULT_OPTIONS,candidates,diagonalNeighbors,units,search,validBoard,isSaveData,analyzeSingles,meetsChallenge}=await import('../led-sudoku/rules.ts');
const {buildHintSteps}=await import('../led-sudoku/hint-explanation.ts');
const api=await import('../led-sudoku/rules.ts');
const {RULE_KEYS,ruleCopy}=await import('../led-sudoku/i18n.ts');
const blank=()=>({version:1,seed:39,options:{...DEFAULT_OPTIONS,led:false,antiKing:true},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[],lines:[],dots:[]});
const save=g=>({...g,board:g.puzzle.givens.slice(),notes:Array(81).fill(0),elapsed:0,assisted:false});
test('anti-king restricts all four immediate diagonals across boxes, not whole diagonals',()=>{
 const p=blank(),board=Array(81).fill(0);
 for(const [a,b] of [[20,30],[21,29],[29,21],[30,20]]){board.fill(0);board[a]=5;assert(!candidates(p,board,b).includes(5));board[b]=5;assert(!validBoard(p,board));assert.equal(search(p,board).count,0);p.options.antiKing=false;assert(validBoard(p,board));p.options.antiKing=true;}
 board.fill(0);board[20]=5;assert(candidates(p,board,40).includes(5),'two steps along a diagonal are unrestricted');
 assert.deepEqual(diagonalNeighbors(0),[10]);assert.deepEqual(diagonalNeighbors(8),[16]);assert.deepEqual(diagonalNeighbors(80),[70]);assert.deepEqual(diagonalNeighbors(40),[30,32,48,50]);
 assert(!diagonalNeighbors(8).includes(18),'no row wrapping');
 p.blocked[30]=true;assert(!units(p).some(u=>u.includes(30)));assert.deepEqual(candidates(p,board,30),[]);
});
test('pair constraints are not nine-cell houses or complete diagonals',()=>{
 const p=blank(),us=units(p);assert.equal(us.filter(u=>u.length===9).length,27);assert(us.slice(27).every(u=>u.length===2));
 for(const pair of us.slice(27))assert(diagonalNeighbors(pair[0]).includes(pair[1]));
});
for(const difficulty of ['easy','normal','hard'])for(const led of [false,true])test(`anti-king ${difficulty} LED ${led} remains unique`,()=>{
 const g=generate({...DEFAULT_OPTIONS,antiKing:true,difficulty,led},39);
 assert(validBoard(g.puzzle,g.solution,true));assert(isSaveData(save(g)));
 for(let i=0;i<81;i++)for(const j of diagonalNeighbors(i))assert.notEqual(g.solution[i],g.solution[j]);
 const result=search(g.puzzle);assert(!result.exhausted);assert.equal(result.count,1);
 if(difficulty==='hard')assert(meetsChallenge(analyzeSingles(g.puzzle)));
});
for(const extra of [{diagonal:true},{missing:true},{extraRegion:true},{nonConsecutive:true},{nonConsecutive:true,extraRegion:true},{littleKiller:true},{xv:true}])test(`anti-king combines with ${JSON.stringify(extra)}`,()=>{
 const opts={...DEFAULT_OPTIONS,led:false,antiKing:true,...extra},g=generate(opts,39);
 assert(isSaveData(save(g)));assert(validBoard(g.puzzle,g.solution,true));const result=search(g.puzzle);assert.equal(result.count,1);assert(!result.exhausted);
 assert.deepEqual(generate(opts,39),g);
});
test('anti-king removal has localized step-by-step justification',()=>{
 const p=blank(),board=Array(81).fill(0);board[20]=5;
 for(const language of ['zh','en','ja']){const steps=buildHintSteps(p,board,30,1,undefined,language,api);const step=steps.find(s=>s.eliminations.some(e=>e.cell===30&&e.digits.includes(5)));assert(step);assert(step.evidence.includes(20));assert(step.text.includes(language==='zh'?'无缘':language==='en'?'anti-king':'アンチキング'));}
 assert(RULE_KEYS.includes('antiKing'));for(const language of ['zh','en','ja'])assert(ruleCopy(language,'antiKing').every(Boolean));
});
test('legacy saves stay valid and malformed anti-king options are rejected',()=>{
 const g=generate({...DEFAULT_OPTIONS,led:false},39),s=save(g);delete s.puzzle.options.antiKing;assert(isSaveData(s));s.puzzle.options.antiKing='yes';assert(!isSaveData(s));
});
test('several seeds generate valid anti-king and combined non-consecutive puzzles',()=>{
 for(const seed of [1,5,17,20260921])for(const nonConsecutive of [false,true]){const g=generate({...DEFAULT_OPTIONS,antiKing:true,nonConsecutive,led:false},seed);assert(isSaveData(save(g)));const result=search(g.puzzle);assert(!result.exhausted);assert.equal(result.count,1);}
});
