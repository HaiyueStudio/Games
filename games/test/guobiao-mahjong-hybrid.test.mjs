import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{registerHooks}from'node:module';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const{createScorer}=await import('../guobiao-mahjong/rules/scorer.ts'),{createMatch,observe}=await import('../guobiao-mahjong/rules/match.ts');
const{cannotComplete,guaranteedSafe,lastTileAlternative,KNITTED_PATTERNS}=await import('../guobiao-mahjong/ai/lastTileDefense.ts'),{enhancePolicy}=await import('../guobiao-mahjong/ai/hybrid.ts');
const{decide}=await import('../guobiao-mahjong/ai/strategy.ts'),{baseReport}=await import('../guobiao-mahjong/ai/coaching/publicAnalysis.ts'),{withLastTileDefense}=await import('../guobiao-mahjong/api/defensiveAgent.ts');
const{COACH_CHARS}=await import('../guobiao-mahjong/ui/coachChars.ts');
const scorer=await createScorer(readFileSync(new URL('../guobiao-mahjong/assets/mcr.wasm',import.meta.url)));
const counts=hand=>Array.from({length:34},(_,t)=>hand.filter(x=>x===t).length);
test('safety never rules out generated ordinary legal wins with a unique sequence completion',()=>{
  let seed=0x4932,checked=0;const random=n=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)%n};
  for(let trial=0;trial<1800;trial++){
    const groups=Array.from({length:4},()=>random(2)?{kind:'pung',tiles:Array(3).fill(random(34)),concealed:false,promoted:false,from:1}:{kind:'chow',tiles:(()=>{const t=random(3)*9+random(7);return[t,t+1,t+2]})(),concealed:false,promoted:false,from:1}),fixed=random(5),pair=random(34),hand=[...groups.slice(fixed).flatMap(m=>m.tiles),pair,pair];
    if(counts([...groups.flatMap(g=>g.tiles),pair,pair]).some(n=>n>4))continue;
    for(const tile of new Set(hand)){const standing=[...hand];standing.splice(standing.indexOf(tile),1);if(standing.includes(tile))continue;assert.ok(scorer.score(standing,groups.slice(0,fixed),tile,0,8,0,0)?.fan>=8);assert.equal(cannotComplete(tile,fixed,counts(standing)),false);checked++;}
  }assert.ok(checked>1000);
});
test('safety retains thirteen orphans, all-unconnected and knitted-straight completions',()=>{
  const honors=[27,28,29,30,31,32,33],orphans=[0,8,9,17,18,26,...honors],fullHands=[{hand:[...orphans,31],melds:[]}];
  for(const p of KNITTED_PATTERNS){fullHands.push({hand:[...p,...honors.slice(0,5)],melds:[]},{hand:[...p.slice(0,7),...honors],melds:[]},{hand:[...p,31,31,27,27,27],melds:[]},{hand:[...p,31,31],melds:[{kind:'pung',tiles:[27,27,27],concealed:false,promoted:false,from:1}]});}
  for(const{hand,melds}of fullHands)for(const tile of new Set(hand)){const standing=[...hand];standing.splice(standing.indexOf(tile),1);assert.ok(scorer.score(standing,melds,tile,0,8,0,0)?.fan>=8);assert.equal(cannotComplete(tile,melds.length,counts(standing)),false);}
});
function lastPosition(){const o=observe(createMatch(7),0,scorer);o.hand=[0,1,2,3,4,5,9,10,11,18,19,20,21,31];o.players[1].river=[31,31,31,...Array(4).fill(27),...Array(4).fill(32),...Array(4).fill(33)];o.wallRemaining=0;o.legalActions=o.hand.map(tile=>({type:'discard',tile}));return o;}
test('last-tile guard only overrides to a proven safe legal discard, never earlier or over a win',()=>{
  const o=lastPosition(),preferred={type:'discard',tile:4},before=JSON.stringify(o);assert.equal(guaranteedSafe(o,31),true);assert.equal(lastTileAlternative(o,preferred).tile,31);assert.equal(JSON.stringify(o),before);
  o.wallRemaining=1;assert.equal(lastTileAlternative(o,preferred),null);o.wallRemaining=0;o.legalActions.unshift({type:'hu'});assert.equal(lastTileAlternative(o,preferred),null);
});
function readyPosition(){const o=observe(createMatch(7),0,scorer);o.hand=[31,32];o.drawn=32;o.players[0].handCount=2;o.players[0].melds=[[0,1,2],[3,4,5],[10,11,12],[19,20,21]].map(tiles=>({kind:'chow',tiles,concealed:false,promoted:false,from:1}));o.players[1].river=[31,31];o.legalActions=[{type:'discard',tile:31},{type:'discard',tile:32}];return o;}
test('fan-aware ready search improves ron-only live waits and respects a confident neural prior',()=>{
  const o=readyPosition(),before=JSON.stringify(o),d=enhancePolicy(o,[.4,.6],1,scorer,'ready');assert.equal(d.changed,true);assert.equal(d.action.tile,31);assert.equal(d.reason,'qualified-waits');assert.ok(d.quality>d.baselineQuality);assert.equal(JSON.stringify(o),before);
  assert.equal(enhancePolicy(o,[.01,.99],1,scorer,'ready').changed,false);assert.equal(enhancePolicy(o,[.4,.6],1,scorer,'safe').changed,false);assert.throws(()=>enhancePolicy(o,[0,0],1,scorer,'ready'));
});
test('hybrid never reads extra opponent hands or concealed identities and always accepts legal hu',()=>{
  const a=readyPosition(),b=structuredClone(a);b.players[1].hand=[0,0,0,0];assert.deepEqual(enhancePolicy(a,[.4,.6],1,scorer,'search'),enhancePolicy(b,[.4,.6],1,scorer,'search'));
  a.legalActions.unshift({type:'hu'});const d=enhancePolicy(a,[.01,.3,.69],2,scorer,'search');assert.equal(d.action.type,'hu');
});
test('built-in decisions and coaching keep proven safety ahead of shape value at the last discard',()=>{
  const o=lastPosition(),decision=decide(o,scorer,1,128),report=baseReport(o,scorer,{samples:16,horizon:6});
  assert.ok(guaranteedSafe(o,decision.action.tile));assert.ok(guaranteedSafe(o,report.recommendation.tile));assert.equal(report.mode,'防守');assert.equal(report.candidates[0].risk,0);assert.match(report.candidates[0].reasons[0],/牌墙已空/);
  for(const c of report.candidates[0].reasons[0])if(/\p{Script=Han}/u.test(c))assert.ok(COACH_CHARS.includes(c),'Missing advice glyph: '+c);
  const known=structuredClone(o);known.players[2].melds=[{kind:'kong',tiles:[33,33,33,33],concealed:true}];assert.deepEqual(lastTileAlternative(known,{type:'discard',tile:4}),lastTileAlternative(o,{type:'discard',tile:4}));
});
test('public agent guard preserves ordinary choices, enforces cancellation and rejects illegal model actions',async()=>{
  const o=lastPosition(),action={type:'discard',tile:4},context={signal:new AbortController().signal,requestId:'safe'},agent=withLastTileDefense({name:'third-party',decide:()=>action});
  assert.equal((await agent.decide(o,context)).tile,31);o.wallRemaining=1;assert.deepEqual(await agent.decide(o,context),action);
  const abort=new AbortController();abort.abort();await assert.rejects(agent.decide(o,{...context,signal:abort.signal}),{name:'AbortError'});
  await assert.rejects(withLastTileDefense({name:'invalid',decide:()=>({type:'hu'})}).decide(o,context),/illegal/);
});
test('pinned real KD discard is corrected with only redacted public information',()=>{
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/mahjong-last-tile.json',import.meta.url)));
  for(const c of fixture.cases){assert.deepEqual(lastTileAlternative(c.observation,c.rawAction),c.expectedAction);assert.ok(guaranteedSafe(c.observation,c.expectedAction.tile));assert.equal(lastTileAlternative({...c.observation,wallRemaining:1},c.rawAction),null);}
});
