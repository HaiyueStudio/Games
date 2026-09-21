import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {littleKillerPath,littleKillerLocations,domainSumPossible,validLittleKillers}=await import('../led-sudoku/little-killer.ts');
const {generate,DEFAULT_OPTIONS,search,candidates,units,validBoard,isSaveData,findHint,analyzeSingles,meetsChallenge}=await import('../led-sudoku/rules.ts');
const {advancedDeduction,advancedText}=await import('../led-sudoku/advanced-hints.ts');
const {selectRule,optionConflict}=await import('../led-sudoku/extra-rules.ts');
const {boardGeometry,boardCellAt,paintBoard}=await import('../led-sudoku/board-painter.ts');
const {ruleCopy}=await import('../led-sudoku/i18n.ts');
const bit=d=>1<<(d-1),mask=(...ds)=>ds.reduce((m,d)=>m|bit(d),0);
const blank=()=>({version:1,seed:39,options:{...DEFAULT_OPTIONS,led:false,littleKiller:true},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[],lines:[],dots:[],littleKillers:[{side:'top',index:1,sum:3}]});
const save=g=>({...g,board:g.puzzle.givens.slice(),notes:Array(81).fill(0),elapsed:0,assisted:false});
test('all four arrows continue diagonally to an edge without wrapping or duplicate reverse lines',()=>{
 assert.deepEqual(littleKillerPath({side:'top',index:3}),[3,11,19,27]);
 assert.deepEqual(littleKillerPath({side:'left',index:5}),[45,55,65,75]);
 assert.deepEqual(littleKillerPath({side:'bottom',index:5}),[77,69,61,53]);
 assert.deepEqual(littleKillerPath({side:'right',index:3}),[35,25,15,5]);
 const all=littleKillerLocations();assert(validLittleKillers(all.map(c=>({...c,sum:littleKillerPath(c).length*5})),Array(81).fill(false)));
 for(const c of all){const path=littleKillerPath(c);assert(path.length>=2);for(let n=1;n<path.length;n++){assert.equal(Math.abs(path[n]%9-path[n-1]%9),1);assert.equal(Math.abs(Math.floor(path[n]/9)-Math.floor(path[n-1]/9)),1);}}
});
test('sum propagation is exact for independent domains including holes and repeated digits',()=>{
 assert(domainSumPossible([mask(1,3),mask(2,4)],7));assert(!domainSumPossible([mask(1,3),mask(2,4)],6));assert(domainSumPossible([bit(5),bit(5)],10));assert(domainSumPossible([],0));assert(!domainSumPossible([0],0));
 for(let a=1;a<512;a+=13)for(let b=1;b<512;b+=17)for(let sum=1;sum<=18;sum++)assert.equal(domainSumPossible([a,b],sum),Array.from({length:9},(_,n)=>n+1).some(x=>(a&bit(x))&&sum-x>=1&&sum-x<=9&&(b&bit(sum-x))));
});
test('little killer does not make the diagonal all-different or change unrelated cells',()=>{
 const p=blank(),board=Array(81).fill(0);assert.deepEqual(candidates(p,board,1),[1,2]);assert.deepEqual(candidates(p,board,80),[1,2,3,4,5,6,7,8,9]);assert.equal(units(p).length,27);
 p.littleKillers=[{side:'top',index:3,sum:13}];board[3]=5;board[11]=1;board[19]=2;board[27]=5;
 assert(validBoard(p,board),'5 can repeat in different houses');board[27]=6;assert(!validBoard(p,board));assert.equal(search(p,board).count,0);
});
for(const difficulty of ['easy','normal','hard'])for(const led of [false,true])test(`little killer ${difficulty} LED ${led} unique and valid`,()=>{
 const g=generate({...DEFAULT_OPTIONS,littleKiller:true,difficulty,led},39);assert(isSaveData(save(g)));assert(validBoard(g.puzzle,g.solution,true));const result=search(g.puzzle);assert(!result.exhausted);assert.equal(result.count,1);
 for(const c of g.puzzle.littleKillers){const path=littleKillerPath(c);assert.equal(path.reduce((s,i)=>s+g.solution[i],0),c.sum);assert(path.some(i=>!g.puzzle.givens[i]));}
 if(difficulty==='hard')assert(meetsChallenge(analyzeSingles(g.puzzle)));
});
test('candidate-only sum deduction and explanations work in all three languages',()=>{
 const p=blank(),board=Array(81).fill(0),masks=Array(81).fill(511);p.littleKillers[0].sum=7;masks[1]=mask(1,3);masks[9]=mask(2,4,8);
 const d=advancedDeduction(p,board,masks,[]);assert.equal(d.technique,'little-killer-sum');assert.deepEqual(d.eliminations,[{cell:1,digits:[1]},{cell:9,digits:[2,8]}]);
 for(const lang of ['zh','en','ja']){const explanation=advancedText(d,lang);assert(explanation.reason.includes('7−1=6'));assert(explanation.reason.includes('R1C2'));assert(explanation.title.includes(ruleCopy(lang,'littleKiller')[0]));}
 p.littleKillers[0].sum=3;board[9]=1;for(const lang of ['zh','en','ja']){const hint=findHint(p,board,lang);assert.equal(hint.cell,1);assert.equal(hint.value,2);assert(hint.steps.some(s=>s.text.includes('3−1−')));}
});
test('malformed sums/positions, duplicate reverse lines and incompatible saves are rejected',()=>{
 const g=generate({...DEFAULT_OPTIONS,littleKiller:true,led:false,difficulty:'easy'},39),s=save(g);assert.deepEqual(generate(g.puzzle.options,39),g);
 for(const change of [p=>p.littleKillers[0].sum++,p=>p.littleKillers[0].sum=0,p=>p.littleKillers[0].index=9,p=>p.littleKillers[0].side='diagonal',p=>p.littleKillers.push(p.littleKillers[0]),p=>p.options.littleKiller=false,p=>p.options.littleKiller='yes',p=>p.littleKillers=[],p=>p.littleKillers=null]){const copy=structuredClone(s);change(copy.puzzle);assert(!isSaveData(copy));}
 const old=save(generate({...DEFAULT_OPTIONS,led:false},3));delete old.puzzle.options.littleKiller;assert(isSaveData(old));
 for(const other of ['skyscraper','missing']){const a=selectRule({...DEFAULT_OPTIONS,[other]:true},'littleKiller',true);assert(a.options.littleKiller&&!a.options[other]);assert(selectRule(a.options,other,true).options[other]);assert(!selectRule(a.options,other,true).options.littleKiller);assert(optionConflict({...DEFAULT_OPTIONS,littleKiller:true,[other]:true}));}
});
for(const variants of [{extraRegion:true},{nonConsecutive:true},{diagonal:true},{xv:true},{killer:true,thermometer:true}])test(`little killer combines with ${Object.keys(variants)}`,()=>{
 const g=generate({...DEFAULT_OPTIONS,...variants,littleKiller:true,led:false,difficulty:'normal'},39);assert(isSaveData(save(g)));const proof=search(g.puzzle);assert(!proof.exhausted);assert.equal(proof.count,1);
});
test('outside arrows and sums render in both themes; gutters do not select cells',()=>{
 const p=blank();p.littleKillers=littleKillerLocations().map(c=>({...c,sum:littleKillerPath(c).length*5}));const state={puzzle:p,board:p.givens.slice(),solution:Array(81).fill(1),notes:Array(81).fill(0),selected:-1,hint:-1};
 assert.deepEqual(boardGeometry(p),{inset:40,size:550});assert.equal(boardCellAt(p,20/630,.5),-1);assert.equal(boardCellAt(p,50/630,50/630),0);assert.equal(boardCellAt(p,580/630,580/630),80);
 for(const theme of ['dark','light-blue']){const labels=[],ctx=new Proxy({fillText(text,x,y){labels.push({text,x,y});}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});const before=structuredClone(state);paintBoard(ctx,{...state,theme});assert.equal(labels.length,p.littleKillers.length);for(const {x,y} of labels){assert(x>=12&&x<=618);assert(y>=12&&y<=618);}assert.deepEqual(state,before);}
});
