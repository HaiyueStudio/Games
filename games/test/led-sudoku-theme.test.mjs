import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {preferences}=await import('../led-sudoku/preferences.ts');
const {THEMES,boardInk}=await import('../led-sudoku/theme.ts');
const {paintBoard}=await import('../led-sudoku/board-painter.ts');
const {DEFAULT_OPTIONS}=await import('../led-sudoku/rules.ts');
const {t,LANGUAGES}=await import('../led-sudoku/i18n.ts');
test('theme preference migrates old settings and round-trips without changing candidate options',()=>{
 assert.equal(preferences({language:'ja'}).theme,'dark');assert.equal(preferences({theme:'invalid'}).theme,'dark');
 const p=preferences({theme:'light-blue',language:'en',filterCandidates:false,showCandidates:true});
 assert.deepEqual(preferences(JSON.parse(JSON.stringify(p))),p);assert.equal(p.theme,'light-blue');assert.equal(p.showCandidates,false);
 for(const language of LANGUAGES)for(const key of ['skin','darkSkin','lightBlueSkin'])assert(t(language,key).length>0);
});
test('light theme keeps text and candidate ink legible, with distinct rule colors',()=>{
 const luminance=hex=>{const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 const c=THEMES['light-blue'];
 for(const color of [c.text,c.muted,c.user,c.given,c.clue,c.crossed,boardInk('light-blue','#83b6ba')])assert(ratio(color,c.panel)>=4.5,`${color} readable on panels`);
 assert(ratio(c.accent,c.accentText)>=4.5);assert.notEqual(boardInk('light-blue','#ff9fb3'),boardInk('light-blue','#91caff'));
 assert.equal(boardInk('dark','#091a22'),'#091a22');
});
test('light board renders empty LEDs, dark missing cells and notes without mutating the puzzle',()=>{
 const puzzle={version:1,seed:1,options:{...DEFAULT_OPTIONS,led:true,missing:true},givens:Array(81).fill(0),lights:Array(81).fill(0),blocked:Array(81).fill(false),cages:[],lines:[],dots:[]};puzzle.blocked[1]=true;
 const state={theme:'light-blue',puzzle,board:Array(81).fill(0),notes:Array(81).fill(0),crossed:Array(81).fill(0),selected:0,hint:-1,solution:Array(81).fill(1)};state.notes[2]=257;state.crossed[2]=1;
 const ink=[],ctx=new Proxy({fillRect(){ink.push(this.fillStyle);},fill(){ink.push(this.fillStyle);},fillText(){ink.push(this.fillStyle);}}, {get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)}),before=structuredClone(state);
 paintBoard(ctx,state);assert(ink.includes(THEMES['light-blue'].tube),'all-dark segments remain visible');assert(ink.includes('#2c4659'),'missing cells stay dark');assert(ink.includes('#315f7b'),'candidate ink uses light palette');assert(ink.includes(THEMES['light-blue'].crossed));assert.deepEqual(state,before);
});
