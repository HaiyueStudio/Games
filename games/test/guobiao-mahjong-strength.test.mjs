import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {createHash} from 'node:crypto';
import {validateComparison,summarizeComparison,seedInterval} from '../guobiao-mahjong/benchmarks/statistics.mjs';
import {validateEvidence} from '../guobiao-mahjong/benchmarks/evidence.mjs';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const {createScorer}=await import('../guobiao-mahjong/rules/scorer.ts');
const {createMatch,observe}=await import('../guobiao-mahjong/rules/match.ts');
const {decide,decideExperimental}=await import('../guobiao-mahjong/ai/strategy.ts');
const {decide:legacy}=await import('../guobiao-mahjong/benchmarks/strategy-v1.ts');
const {runTournament}=await import('../guobiao-mahjong/api/tournament.ts');
const {HandAnalysisCache,handAnalysisCache}=await import('../guobiao-mahjong/ai/analysisCache.ts');
const scorer=await createScorer(readFileSync(new URL('../guobiao-mahjong/assets/mcr.wasm',import.meta.url)));
test('comparison baseline and evaluated experimental policy stay frozen',()=>{
  const hash=createHash('sha256').update(readFileSync(new URL('../guobiao-mahjong/benchmarks/strategy-v1.ts',import.meta.url))).digest('hex');
  assert.equal(hash,'eecac644aeb061223f6f69262952762c75e645af02670373b05ebd574d27f93b');
  const experimental=createHash('sha256').update(readFileSync(new URL('../guobiao-mahjong/benchmarks/strategy-experimental-v2.ts',import.meta.url))).digest('hex');
  assert.equal(experimental,'d2607946b12f3e2969a07df24243dd100a470c36aaf4abdb527b215ac307b651');
});
test('fully exposed all-from-others hands keep ron-only eight-fan waits',()=>{
  const o=observe(createMatch(7),0,scorer);o.hand=[31,32];o.drawn=32;o.players[0].handCount=2;o.players[0].melds=[[0,1,2],[3,4,5],[10,11,12],[19,20,21]].map(tiles=>({kind:'chow',tiles,concealed:false,promoted:false,from:1}));o.legalActions=o.hand.map(tile=>({type:'discard',tile}));
  assert.equal(scorer.score([31],o.players[0].melds,31,0,1,0,0).fan,4);assert.equal(scorer.score([31],o.players[0].melds,31,0,0,0,0).fan,8);
  assert.ok(legacy(o,scorer,1).candidates.every(c=>c.legalWaits===0));assert.ok(decide(o,scorer,1).candidates.every(c=>c.legalWaits===1&&c.ukeire>0));
});
test('candidate scoring counts its planned discard toward the last-copy bonus',()=>{
  const o=observe(createMatch(7),0,scorer),waiting=[2,3,6,7,7,7,8,9,10,11,18,19,20];o.hand=[...waiting,4].sort((a,b)=>a-b);o.drawn=4;o.players[1].river=[4,4];o.legalActions=[...new Set(o.hand)].map(tile=>({type:'discard',tile}));
  assert.equal(scorer.score(waiting,[],4,0,1,0,0).fan,7);assert.equal(scorer.score(waiting,[],4,0,3,0,0).fan,11);
  assert.equal(legacy(o,scorer,1,128).candidates.find(c=>c.action.tile===4).legalWaits,0);assert.equal(decide(o,scorer,1,128).candidates.find(c=>c.action.tile===4).legalWaits,1);
});
test('four visible copies do not make a suited discard risk-free against sequence waits',()=>{
  const o=observe(createMatch(7),0,scorer);o.hand=[0,1,2,4,6,9,10,11,18,19,20,27,31,33];o.players[1].river=[4,4,4];o.players[1].melds=[8,17,26].map(tile=>({kind:'pung',tiles:[tile,tile,tile],concealed:false,promoted:false,from:2}));
  const before=JSON.stringify(o),d=decide(o,scorer,1,128);assert.ok(d.candidates.find(c=>c.action.tile===4).risk>0);assert.equal(JSON.stringify(o),before);
  // No hidden 5-wan is needed for this real, score-qualified sequence wait.
  assert.ok(scorer.score([2,3,9,10,11,18,19,20,31,31,31,27,27],[],4,0,2,0,0).fan>=8);
});
test('strict tournaments abort a provider fault instead of silently contaminating strength results',async()=>{
  const a={name:'invalid',decide:()=>({type:'hu'})};await assert.rejects(runTournament(scorer,[a,a,a,a],[41],{rotateSeats:false,skipForced:true,strict:true}),/Tournament agent invalid failed/);
});
test('forced passes keep identical games, event delivery and rotation with fewer provider calls',async()=>{
  const run=async skipForced=>{let calls=0,forced=0;const events=[];const agents=Array.from({length:4},(_,i)=>({name:'Fixture '+i,decide(o){calls++;if(o.legalActions.length===1)forced++;return o.legalActions.find(a=>a.type==='hu')??o.legalActions.find(a=>a.type==='pass')??o.legalActions[0]}}));return{result:await runTournament(scorer,agents,[41],{rotateSeats:false,skipForced,strict:true,onEvent:e=>events.push(e)}),calls,forced,events}};
  const a=await run(false),b=await run(true);assert.deepEqual(a.result,b.result);assert.deepEqual(a.events,b.events);assert.ok(b.calls<a.calls);assert.equal(b.forced,0);assert.ok(a.forced>0);
});
test('comparison rates normalize policy exposures and confidence intervals resample seeds',()=>{
  const config={schemaVersion:1,seeds:[1,2],rotateSeats:true,concurrency:2,suites:[{id:'fixture',agents:['kd-s0','v1','v1','v1']}]};validateComparison(config);
  const records=config.seeds.flatMap(seed=>[0,1,2,3].map(rotation=>({suite:'fixture',seed,rotation,draws:0,seats:config.suites[0].agents.map(policy=>({policy,hands:16,fan:policy==='kd-s0'?64:16,score:policy==='kd-s0'?48:-16,wins:policy==='kd-s0'?8:2,dealIns:1,place:policy==='kd-s0'?1:3,latencyMs:[5,10],forced:10,missedHu:0,unqualifiedReady:0,faults:0}))})));
  const s=summarizeComparison(records,config)[0],kd=s.rows.find(r=>r.policy==='kd-s0'),base=s.rows.find(r=>r.policy==='v1');assert.equal(kd.fanPerHand,4);assert.equal(base.fanPerHand,1);assert.equal(base.hands,kd.hands*3);assert.equal(s.paired[0].fanDeltaPerHand,3);assert.equal(s.paired[0].fanDelta95.blocks,2);assert.deepEqual(seedInterval([1,2,3]),seedInterval([1,2,3]));assert.equal(seedInterval([3]),null);assert.equal(s.complete,true);
  assert.throws(()=>validateComparison({...config,seeds:[1,1]}));assert.throws(()=>validateComparison({...config,concurrency:0}));
});
test('cross-turn shape reuse is bounded, scorer-local and immune to caller mutation',()=>{
  let calls=0;const fake={analyze(hand){calls++;return {shanten:hand[0],effective:[hand[0]+1]}}},cache=new HandAnalysisCache(fake,2);
  const first=cache.analyze([0]);first.effective[0]=33;assert.deepEqual(cache.analyze([0]),{shanten:0,effective:[1]});assert.equal(calls,1);
  cache.analyze([1]);cache.analyze([0]);cache.analyze([2]);assert.equal(cache.snapshot().entries,2);assert.equal(cache.snapshot().evictions,1);cache.analyze([1]);assert.equal(calls,4);
  fake.analyze=()=>({shanten:7,effective:[31]});assert.equal(cache.analyze([1]).shanten,7);
  assert.equal(handAnalysisCache(scorer),handAnalysisCache(scorer));assert.notEqual(handAnalysisCache(fake),handAnalysisCache(scorer));assert.throws(()=>new HandAnalysisCache(fake,0));
});
test('enhanced comparisons use the specified baseline and retain deterministic reason counts',()=>{
  const config={schemaVersion:1,seeds:[1,2],rotateSeats:false,concurrency:2,parallelProcesses:true,enhancedMetrics:true,depth:1,baseline:'kd-s0',suites:[{id:'paired',agents:['kd-safe','kd-s0','kd-s0','kd-s0']}]};validateComparison(config);
  const records=config.seeds.map(seed=>({suite:'paired',seed,rotation:0,draws:0,seats:config.suites[0].agents.map(policy=>({policy,hands:16,fan:policy==='kd-safe'?32:16,score:0,wins:0,dealIns:0,place:2.5,latencyMs:[],forced:0,missedHu:0,unqualifiedReady:0,faults:0,enhancements:policy==='kd-safe'?1:0,reasonCounts:policy==='kd-safe'?{model:2,'last-tile-safe':1}:{}}))}));
  const report=summarizeComparison(records,config)[0];assert.equal(report.paired[0].baseline,'kd-s0');assert.equal(report.paired[0].fanDeltaPerHand,1);assert.equal(report.rows[0].enhancements,2);assert.deepEqual(report.rows[0].reasonCounts,{'last-tile-safe':2,model:4});
  for(const change of [{baseline:'v1'},{parallelProcesses:1},{enhancedMetrics:'yes'},{depth:3}])assert.throws(()=>validateComparison({...config,...change}));
});
test('evidence rejects missing/duplicate seats, faults, impossible fan and edited summaries',()=>{
  const config={schemaVersion:1,seeds:[1],rotateSeats:false,concurrency:1,suites:[{id:'fixture',agents:['v1','v1','v1','v1']}]};
  const game={runKey:'fixture',suite:'fixture',seed:1,rotation:0,draws:16,replay:{seed:1,handIndex:15,actions:[]},results:Array.from({length:16},(_,hand)=>({hand,winner:null,from:null,selfDrawn:false,win:null,deltas:[0,0,0,0]})),seats:Array.from({length:4},(_,seat)=>({policy:'v1',seat,hands:16,fan:0,score:0,wins:0,dealIns:0,place:2.5,faults:0,forced:0,latencyMs:[],missedHu:0,unqualifiedReady:0}))};
  const report={schemaVersion:1,runKey:'fixture',config,strict:true,skipForced:true,completed:1,expected:1,summary:summarizeComparison([game],config)};
  assert.equal(validateEvidence(report,[game]).hands,16);assert.throws(()=>validateEvidence(report,[]),/Incomplete/);
  const bad=structuredClone(game);bad.seats[0].faults=1;assert.throws(()=>validateEvidence(report,[bad]),/metrics/);
  bad.seats[0].faults=0;bad.results[0]={...bad.results[0],winner:0,win:{fan:7,flowers:1,total:8}};assert.throws(()=>validateEvidence(report,[bad]),/eight-fan/);
  const edited=structuredClone(report);edited.summary[0].rows[0].fanPerHand=10;assert.throws(()=>validateEvidence(edited,[game]),/summary/);
  const larger={...report,config:{...config,seeds:[1,2]},completed:2,expected:2};assert.throws(()=>validateEvidence(larger,[game,game]),/duplicate/);
});
test('opt-in experimental policy reproduces the evaluated frozen variant despite shape caching',async()=>{
  const {decide:frozen}=await import('../guobiao-mahjong/benchmarks/strategy-experimental-v2.ts');
  const cases=JSON.parse(readFileSync(new URL('./fixtures/mahjong-browser-models.json',import.meta.url))).cases;
  for(const{observation:o}of cases){const expected=frozen(o,scorer,2,128),actual=decideExperimental(o,scorer,2,128);assert.deepEqual({...actual,elapsedMs:0},{...expected,elapsedMs:0});}
});
