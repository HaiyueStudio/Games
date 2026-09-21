import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {generate,DEFAULT_OPTIONS,candidates,neighbors,units,search,validBoard,isSaveData,findHint,analyzeSingles,meetsChallenge,seeded}=await import('../led-sudoku/rules.ts');
const {advancedDeduction,advancedText}=await import('../led-sudoku/advanced-hints.ts');
const {selectRule,optionConflict}=await import('../led-sudoku/extra-rules.ts');
const {nonConsecutiveSolution}=await import('../led-sudoku/non-consecutive.ts');
const {validExtraRegions}=await import('../led-sudoku/extra-regions.ts');
const blank=()=>({version:1,seed:39,options:{...DEFAULT_OPTIONS,led:false,nonConsecutive:true},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[],lines:[],dots:[]});
const save=g=>({...g,board:g.puzzle.givens.slice(),notes:Array(81).fill(0),elapsed:0,assisted:false});
const mask=(...digits)=>digits.reduce((m,d)=>m|1<<(d-1),0);
test('non-consecutive filters only orthogonal playable neighbors, with no wrapping',()=>{
 const p=blank(),board=Array(81).fill(0);board[40]=3;
 for(const cell of [31,39,41,49])for(const digit of [2,4])assert(!candidates(p,board,cell).includes(digit));
 for(const cell of [30,32,48,50])for(const digit of [2,4])assert(candidates(p,board,cell).includes(digit));
 board.fill(0);board[8]=3;assert(candidates(p,board,9).includes(2));assert(candidates(p,board,9).includes(4));
 board.fill(0);board[40]=1;assert(!candidates(p,board,39).includes(2));assert(candidates(p,board,39).includes(9));
 board[40]=9;assert(!candidates(p,board,39).includes(8));assert(candidates(p,board,39).includes(1));
 board[40]=0;p.blocked[40]=true;board[41]=3;assert(candidates(p,board,39).includes(2),'a missing cell does not connect its opposite neighbors');
});
test('validation and uniqueness search both reject an adjacent consecutive pair',()=>{
 const p=blank(),board=Array(81).fill(0);board[0]=2;board[1]=3;
 assert(!validBoard(p,board));assert.equal(search(p,board).count,0);
 p.options.nonConsecutive=false;assert(validBoard(p,board));
});
for(const difficulty of ['easy','normal','hard'])for(const led of [false,true])test(`non-consecutive ${difficulty} LED ${led} generates a unique valid puzzle`,()=>{
 const g=generate({...DEFAULT_OPTIONS,nonConsecutive:true,difficulty,led},39);
 assert(validBoard(g.puzzle,g.solution,true));assert(isSaveData(save(g)));
 for(let i=0;i<81;i++)for(const j of neighbors(i))assert.notEqual(Math.abs(g.solution[i]-g.solution[j]),1);
 const result=search(g.puzzle);assert(!result.exhausted);assert.equal(result.count,1);
 if(difficulty==='hard')assert(meetsChallenge(analyzeSingles(g.puzzle)));
});
test('candidate pairing excludes unsupported digits without consulting a solution',()=>{
 const p=blank(),board=Array(81).fill(0),masks=Array(81).fill(511);masks[0]=mask(2,4);masks[1]=mask(1,3,8);
 const d=advancedDeduction(p,board,masks,units(p));assert.equal(d.technique,'nonconsecutive-support');assert(d.eliminations.some(e=>e.cell===1&&e.digits.includes(3)));
 for(const language of ['zh','en','ja']){const text=advancedText(d,language);assert(text.reason.includes(language==='zh'?'不连续':language==='en'?'non-consecutive':'非連続'));assert(!text.reason.includes('白点'));}
});
test('beginner hint steps explain a non-consecutive exclusion',()=>{
 const g=generate({...DEFAULT_OPTIONS,nonConsecutive:true,led:false,difficulty:'easy'},39),board=g.puzzle.givens.slice();let found=false;
 for(let n=0;n<81;n++){const hint=findHint(g.puzzle,board);if(!hint)break;if(hint.steps.some(s=>s.text.includes('不连续规则'))){found=true;break;}board[hint.cell]=hint.value;}
 assert(found);
});
test('conflicting positive consecutive rules switch off and stale options are rejected',()=>{
 for(const key of ['consecutive','renban']){let opts=selectRule({...DEFAULT_OPTIONS,[key]:true},'nonConsecutive',true).options;assert(opts.nonConsecutive&&!opts[key]);opts=selectRule(opts,key,true).options;assert(!opts.nonConsecutive&&opts[key]);assert(optionConflict({...DEFAULT_OPTIONS,nonConsecutive:true,[key]:true}));}
 const s=save(generate({...DEFAULT_OPTIONS,nonConsecutive:true,led:false},39));s.puzzle.options.nonConsecutive='yes';assert(!isSaveData(s));
});
test('non-consecutive plus extra regions grows two compact half-turn symmetric houses',()=>{
 const options={...DEFAULT_OPTIONS,nonConsecutive:true,extraRegion:true,led:false,difficulty:'hard'},g=generate(options,39),regions=g.puzzle.extraRegions;
 assert.deepEqual(generate(options,39),g);assert.equal(regions.length,2);assert(validExtraRegions(regions,g.puzzle.blocked));assert.deepEqual(regions[0].map(i=>80-i).sort((a,b)=>a-b),regions[1]);
 assert(isSaveData(save(g)));assert.equal(search(g.puzzle).count,1);assert(meetsChallenge(analyzeSingles(g.puzzle)));
});
for(const extra of [{diagonal:true},{missing:true},{xv:true}])test(`non-consecutive combines with ${Object.keys(extra)[0]}`,()=>{
 const g=generate({...DEFAULT_OPTIONS,...extra,nonConsecutive:true,led:false},39);assert(isSaveData(save(g)));assert.equal(search(g.puzzle).count,1);
});
test('full-grid construction respects its work budget without returning a partial solution',()=>{
 const result=nonConsecutiveSolution(units(blank()),seeded(1),0);assert(result.exhausted);assert.equal(result.solution,null);
});
