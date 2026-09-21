import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {symmetricRegions,rotateCell,validExtraRegions,regionLetter}=await import('../led-sudoku/extra-regions.ts');
const {generate,DEFAULT_OPTIONS,search,candidates,units,validBoard,isSaveData,findHint,analyzeSingles,meetsChallenge,cellRuleDetails}=await import('../led-sudoku/rules.ts');
const {selectRule,optionConflict}=await import('../led-sudoku/extra-rules.ts');
const {paintBoard}=await import('../led-sudoku/board-painter.ts');
const {LANGUAGES,ruleCopy}=await import('../led-sudoku/i18n.ts');
const saved=g=>({...g,board:g.puzzle.givens.slice(),notes:Array(81).fill(0),elapsed:0,assisted:false});
const key=cells=>cells.slice().sort((a,b)=>a-b).join(',');
for(const shape of [0,.9])for(const reflection of [0,.9])test(`nine-cell symmetric layout, shape=${shape} reflection=${reflection}`,()=>{
 let call=0;const regions=symmetricRegions(()=>call++?reflection:shape);
 assert.equal(regions.length,4);assert(validExtraRegions(regions,Array(81).fill(false)));assert.equal(new Set(regions.flat()).size,36);
 const keys=regions.map(key);for(const region of regions)assert(keys.includes(key(region.map(rotateCell))));
});
for(const difficulty of ['easy','normal','hard'])for(const led of [false,true])test(`extra region generation is unique and deterministic: ${difficulty}, LED ${led}`,()=>{
 const options={...DEFAULT_OPTIONS,extraRegion:true,difficulty,led},g=generate(options,39);
 assert.deepEqual(generate(options,39),g);assert(validBoard(g.puzzle,g.solution,true));assert(isSaveData(saved(g)));assert(isSaveData(JSON.parse(JSON.stringify(saved(g)))));
 assert.equal(units(g.puzzle).length,31);for(const region of g.puzzle.extraRegions)assert.deepEqual(region.map(i=>g.solution[i]).sort(),[1,2,3,4,5,6,7,8,9]);
 const result=search(g.puzzle);assert(!result.exhausted);assert.equal(result.count,1);
 if(difficulty==='hard')assert(meetsChallenge(analyzeSingles(g.puzzle)));
});
test('extra house constrains distant peers even when their basic row/column/box differs',()=>{
 const {puzzle:p}=generate({...DEFAULT_OPTIONS,extraRegion:true,led:false},5);p.givens.fill(0);p.lights.fill(0);
 const region=p.extraRegions[0];let pair;for(const a of region)for(const b of region)if(a!==b&&!units({...p,options:{...p.options,extraRegion:false}}).some(u=>u.includes(a)&&u.includes(b)))pair=[a,b];
 assert(pair);const [a,b]=pair,board=Array(81).fill(0);board[b]=9;
 assert(candidates({...p,options:{...p.options,extraRegion:false}},board,a).includes(9));assert(!candidates(p,board,a).includes(9));
 board[a]=9;assert(!validBoard(p,board));assert(validBoard({...p,options:{...p.options,extraRegion:false}},board));
});
test('beginner explanations name the actual extra house in every language',()=>{
 const {puzzle:p,solution}=generate({...DEFAULT_OPTIONS,extraRegion:true,led:false},5);p.givens.fill(0);p.lights.fill(0);
 const region=p.extraRegions[0],cell=region[0],board=Array(81).fill(0);for(const i of region)if(i!==cell)board[i]=solution[i];
 assert(candidates({...p,options:{...p.options,extraRegion:false}},board,cell).length>1);
 for(const language of LANGUAGES){const hint=findHint(p,board,language);assert(hint);assert.equal(hint.cell,cell);assert.equal(hint.value,solution[cell]);assert(hint.steps.some(s=>s.text.includes(language==='zh'?'额外区域 A':language==='en'?'extra region A':'追加領域 A')));assert(!hint.explanation.includes('{extra}'));assert(cellRuleDetails(p,cell,language).some(s=>s.includes(ruleCopy(language,'extraRegion')[0])));}
});
test('region saves reject malformed, disconnected, redundant and overlapping houses; old saves stay valid',()=>{
 const g=generate({...DEFAULT_OPTIONS,extraRegion:true,led:false},5),s=saved(g);
 for(const mutate of [p=>p.extraRegions[0].pop(),p=>p.extraRegions[0][0]=81,p=>p.extraRegions[0][0]=p.extraRegions[0][1],p=>p.extraRegions.push(p.extraRegions[0].slice()),p=>p.extraRegions[0]=[0,1,2,3,4,5,6,7,8],p=>p.extraRegions[0]=[0,2,4,6,8,18,20,22,24],p=>p.options.extraRegion=false,p=>p.extraRegions=[],p=>p.options.extraRegion='yes']){const copy=structuredClone(s);mutate(copy.puzzle);assert(!isSaveData(copy));}
 const old=saved(generate({...DEFAULT_OPTIONS,led:false},3));delete old.puzzle.options.extraRegion;assert(isSaveData(old));
});
test('last chosen rule resolves incompatible missing cells and parity backgrounds',()=>{
 for(const other of ['missing','parity']){const a=selectRule({...DEFAULT_OPTIONS,[other]:true},'extraRegion',true);assert(a.options.extraRegion&&!a.options[other]);assert(a.notice);const b=selectRule(a.options,other,true);assert(b.options[other]&&!b.options.extraRegion);assert(optionConflict({...DEFAULT_OPTIONS,extraRegion:true,[other]:true}));}
});
for(const variants of [{diagonal:true,multiDiagonal:true},{inequality:true},{xv:true},{thermometer:true,quadruple:true}])test(`extra houses combine with ${Object.keys(variants).join('+')}`,()=>{
 const g=generate({...DEFAULT_OPTIONS,...variants,extraRegion:true,led:false},20260921);assert(isSaveData(saved(g)));assert.equal(search(g.puzzle).count,1);
});
test('region backgrounds, perimeter and labels render in both skins without changing state',()=>{
 const g=generate({...DEFAULT_OPTIONS,extraRegion:true,led:false},5),state={...g,board:g.puzzle.givens.slice(),notes:Array(81).fill(0),selected:-1,hint:-1};
 for(const theme of ['dark','light-blue']){const labels=[],fills=[],ctx=new Proxy({fillRect(){fills.push(this.fillStyle);},fillText(text){labels.push(text);}}, {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)}),before=structuredClone(state);paintBoard(ctx,{...state,theme});for(let n=0;n<4;n++)assert(labels.includes(regionLetter(n)));assert(fills.includes(theme==='dark'?'#233747':'#e0e7f2'));assert.deepEqual(state,before);}
});
