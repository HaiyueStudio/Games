import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const {createScorer}=await import('../guobiao-mahjong/rules/scorer.ts');
const {createMatch,observe}=await import('../guobiao-mahjong/rules/match.ts');
const {actionKey}=await import('../guobiao-mahjong/rules/types.ts');
const {coachingObservation,positionKey,visibleCounts,readOpponents,tileDanger,forecastHorizon,forecastFlags,actionPublicCounts,prepareAction,baseReport}=await import('../guobiao-mahjong/ai/coaching/publicAnalysis.ts');
const {analyzePosition,drawChance,keyTileChance,wilson}=await import('../guobiao-mahjong/ai/coaching/forecast.ts');
const {CoachSystem,COACH_LOG_LIMIT}=await import('../guobiao-mahjong/ai/coaching/CoachSystem.ts');
const scorer=await createScorer(readFileSync(new URL('../guobiao-mahjong/assets/mcr.wasm',import.meta.url)));
const observation=()=>observe(createMatch(20261105),0,scorer),options={samples:16,horizon:3};
const withoutTime=r=>({...r,elapsedMs:0});
test('coaching strips spectator hands, wall/RNG, concealed tile faces and past private hands before Worker transport',()=>{
  const o=observation();Object.assign(o,{wall:[1,2,3],rng:123456789,seed:123456789,responses:{1:{type:'hu'}}});o.players[1].hand=[31,31,31];o.players[1].melds=[{kind:'kong',from:1,concealed:true,promoted:false,tiles:[32,32,32,32]}];o.events.push({index:99,hand:0,seat:1,type:'concealed-kong',tile:32,tiles:[32,32,32,32],text:'暗杠32'});o.results=[{hand:0,winner:null,from:null,selfDrawn:false,win:null,deltas:[0,0,0,0],hands:[[31],[32],[33],[30]],melds:[[],[],[],[]]}];
  const clean=coachingObservation(o);assert.ok(!('wall' in clean)&&!('rng' in clean)&&!('seed' in clean)&&!('responses' in clean));assert.ok(clean.players.every(p=>!('hand' in p)));assert.deepEqual(clean.players[1].melds[0].tiles,[null,null,null,null]);assert.deepEqual(clean.results[0].hands,[]);assert.equal(clean.events.at(-1).tile,undefined);assert.equal(clean.events.at(-1).text,'暗杠');assert.deepEqual(clean.hand,o.hand);assert.ok(o.players[1].hand);
});
test('unknown opponent concealed identities do not alter any report, including route estimates',async()=>{
  const a=observation();a.players[1].melds=[{kind:'kong',from:1,concealed:true,promoted:false,tiles:[31,31,31,31]}];a.players[1].hand=[27,28,29,30];const b=structuredClone(a);b.players[1].melds[0].tiles=[4,4,4,4];b.players[1].hand=[0,0,0,0];
  assert.deepEqual(withoutTime(await analyzePosition(a,scorer,options)),withoutTime(await analyzePosition(b,scorer,options)));
});
test('uniform draw and required-type forecasts agree with exact small-deck combinatorics',()=>{
  assert.ok(Math.abs(drawChance(5,2,2)-.7)<1e-12);assert.equal(drawChance(5,0,3),0);assert.equal(drawChance(5,2,5),1);
  assert.ok(Math.abs(keyTileChance(5,[2,1],2,2)-.2)<1e-12);assert.ok(Math.abs(keyTileChance(5,[2,1],1,2)-.9)<1e-12);assert.equal(keyTileChance(5,[2,1],0,2),1);assert.equal(keyTileChance(5,[2,1],2,1),0);
  const zero=wilson(0,64);assert.equal(zero.low,0);assert.ok(zero.high>0&&zero.high<.1);assert.ok(wilson(64,64).low<1);assert.throws(()=>keyTileChance(2,[3],1,1));
});
test('public sequences exclude all-pungs guesses and hidden kongs never create a visible dragon fact',()=>{
  const o=observation();o.players[1].melds=[{kind:'chow',tiles:[0,1,2],from:0,concealed:false,promoted:false},{kind:'chow',tiles:[3,4,5],from:0,concealed:false,promoted:false},{kind:'kong',tiles:[null,null,null,null],from:1,concealed:true,promoted:false}];o.players[1].handCount=4;
  const p=readOpponents(o).find(p=>p.seat===1);assert.ok(p.patterns.some(v=>v.name.includes('一色')));assert.ok(!p.patterns.some(v=>v.name.includes('碰碰和')));assert.ok(!p.knownFan.some(v=>v.includes('箭刻')));assert.ok(p.evidence.some(v=>v.includes('排除碰碰和')));
});
test('a suited fourth visible tile can still deal into a sequence and a prior discard is never absolute safety in MCR',()=>{
  const o=observation();o.hand=[0,1,2,4,6,9,10,11,18,19,20,27,31];o.drawn=null;o.players[2].river=[4,4,4];
  const high=tileDanger(o,4);assert.equal(visibleCounts(o)[4],4);assert.ok(high.score>0);assert.ok(high.opponents.some(p=>p.reasons.some(t=>t.includes('顺子和张'))));
  const before=tileDanger(o,6).opponents.find(p=>p.seat===1).score;o.players[1].river=[6];const after=tileDanger(o,6).opponents.find(p=>p.seat===1);assert.ok(after.score>0&&after.score<before);assert.ok(after.reasons.some(t=>t.includes('没有振听')));
});
test('recommendations are legal, preserve the source observation and report only eight-fan-or-higher waits',async()=>{
  const cases=JSON.parse(readFileSync(new URL('./fixtures/mahjong-browser-models.json',import.meta.url))).cases;
  for(const {observation:o} of cases){const before=JSON.stringify(o),r=baseReport(coachingObservation(o),scorer,options);if(r.recommendation)assert.ok(o.legalActions.some(a=>actionKey(a)===actionKey(r.recommendation)));for(const c of r.candidates){assert.ok(c.risk>=0&&c.risk<=100);for(const w of c.waits){assert.ok(w.selfFan===null||w.selfFan>=8);assert.ok(w.ronFan===null||w.ronFan>=8);}}assert.equal(JSON.stringify(o),before);}
  const o=observation(),before=JSON.stringify(o),a=await analyzePosition(o,scorer,options),b=await analyzePosition(o,scorer,options);assert.deepEqual(withoutTime(a),withoutTime(b));assert.equal(JSON.stringify(o),before);assert.equal(a.stage,'完成');for(const c of a.candidates){assert.ok(c.forecast.probability>=0&&c.forecast.probability<=1)}assert.ok(a.assumptions.some(t=>t.includes('不是整局胜率')));
});
test('analysis cooperatively yields and observes cancellation between bounded sample chunks',async()=>{
  let cancelled=false,yields=0,reports=0;await assert.rejects(analyzePosition(observation(),scorer,{samples:32,horizon:6},{check(){if(cancelled)throw new DOMException('cancel','AbortError')},yield:async()=>{yields++;cancelled=true},report(){reports++}}),{name:'AbortError'});assert.equal(reports,1);assert.equal(yields,1);
});
class FakeWorker{
  onmessage=null;onerror=null;messages=[];terminated=0;
  postMessage(data){this.messages.push(structuredClone(data))}terminate(){this.terminated++}
  ready(){const init=this.messages.find(v=>v.kind==='init');this.onmessage?.({data:{id:init.id,kind:'ready'}})}
  report(job,overrides={}){this.onmessage?.({data:{id:job.id,kind:'report',report:{protocol:'haiyue.mcr.coach/1',key:positionKey(job.observation),revision:job.observation.revision,handIndex:job.observation.handIndex,roundWind:job.observation.roundWind,seat:job.observation.seat,stage:'完成',mode:'进攻',summary:'建议打西',recommendation:null,candidates:[],routes:[],opponents:[],danger:[],assumptions:[],horizon:3,samples:16,elapsedMs:5,...overrides}}})}
}
const setup=()=>{const workers=[];let time=1000;const coach=new CoachSystem(new ArrayBuffer(8),()=>{const w=new FakeWorker();workers.push(w);return w},()=>time);return{coach,workers,advance:n=>{time+=n}}};
test('one analysis Worker coalesces idle frames and equivalent passes; stale jobs cannot overwrite a newer hand',()=>{
  const {coach,workers,advance}=setup(),o=observation();coach.sync(o,1);assert.equal(workers.length,1);const w=workers[0];w.ready();const first=w.messages.at(-1);w.report(first);for(let i=0;i<100;i++)coach.sync(o,1);assert.equal(w.messages.length,2);
  const same={...o,revision:o.revision+1};coach.sync(same,1);assert.equal(w.messages.length,2);const changed=structuredClone(same);changed.hand[0]=8;changed.revision++;advance(200);coach.sync(changed,1);const next=w.messages.at(-1);assert.equal(next.kind,'analyze');w.report(first,{summary:'stale'});assert.equal(coach.report,null);w.report(next,{summary:'new'});assert.equal(coach.report.summary,'new');
  advance(200);coach.sync({...changed,revision:0,handIndex:1},2);const last=w.messages.at(-1);w.report(next,{summary:'old match'});assert.equal(coach.report,null);w.report(last,{summary:'new hand'});assert.equal(coach.logs[0].handIndex,1);coach.dispose();assert.equal(w.terminated,1);
});
test('stopping releases resources, explicit refresh retries initialization failures and disposed replies are ignored',()=>{
  const {coach,workers}=setup();coach.sync(observation(),1);const w=workers[0];w.onmessage({data:{id:w.messages[0].id,kind:'error',error:'missing wasm'}});assert.equal(coach.busy,false);assert.equal(coach.snapshot().liveWorkers,0);assert.match(coach.message,/missing wasm/);coach.refresh();const nw=workers[1];nw.ready();const job=nw.messages.at(-1),late=nw.onmessage;coach.setEnabled(false);assert.equal(nw.terminated,1);late({data:{id:job.id,kind:'progress',done:1,total:16}});assert.equal(coach.busy,false);coach.dispose();assert.equal(coach.snapshot().liveWorkers,0);
});
test('continuous logs are bounded and exported copies cannot mutate the live history',()=>{
  const {coach,workers}=setup();coach.sync(observation(),1);const w=workers[0];w.ready();w.report(w.messages.at(-1));for(let i=0;i<COACH_LOG_LIMIT+30;i++){coach.refresh();w.report(w.messages.at(-1),{summary:'建议 '+i})}assert.equal(coach.logs.length,COACH_LOG_LIMIT);const exported=coach.exportLog();assert.ok(exported.droppedEntries>0);exported.entries[0].text='mutated';assert.notEqual(coach.logs[0].text,'mutated');coach.clearLog();assert.equal(coach.logs.length,0);coach.dispose();
});

test('native log text wraps Chinese and ASCII deterministically without losing characters',async()=>{
  const {wrapCoachText}=await import('../guobiao-mahjong/ui/coachText.ts');const text='建议打3条，危险度24/100；未来6次自摸约5%。';const lines=wrapCoachText(text,12);assert.ok(lines.length>1);assert.equal(lines.join(''),text);assert.deepEqual(wrapCoachText('进攻\n防守',12),['进攻','防守']);
});

test('late-wall forecast counts the actual next draw and distinguishes passing, claiming and replacement draws',()=>{
  const o=observation();o.phase='response';o.last={seat:3,tile:2,robKong:false};o.wallRemaining=1;
  assert.equal(forecastHorizon(o,{type:'pass'},6),1);assert.equal(forecastHorizon(o,{type:'chow',tile:2,tiles:[0,1,2]},6),0);
  o.phase='turn';o.turn=0;assert.equal(forecastHorizon(o,{type:'discard',tile:0},6),0);assert.equal(forecastHorizon(o,{type:'concealed-kong',tile:0},6),1);
  o.wallRemaining=0;assert.equal(forecastHorizon(o,{type:'concealed-kong',tile:0},6),0);
});

// These flags can decide whether a seemingly complete hand reaches the MCR eight-fan threshold.
test('forecast counts planned discards for last-copy scoring and transfers a called tile only once',()=>{
  const o=observation();o.hand=[0,1,2,4,6,9,10,11,18,19,20,27,31,33];o.players[1].river=[4,4];
  assert.equal(forecastFlags(o,4,true),1);
  const discard={type:'discard',tile:4},after=prepareAction(o,discard,scorer),exposed=actionPublicCounts(o,discard,after.melds,after.followUpDiscard);
  assert.equal(exposed[4],3);assert.equal(forecastFlags(o,4,true,false,exposed),3);
  o.players[1].river=[];o.players[3].river=[31];o.hand=[31,31,0,1,2,9,10,11,18,19,20,27,33];o.last={seat:3,tile:31,robKong:false};o.phase='response';
  const pung={type:'pung',tile:31},called=prepareAction(o,pung,scorer),publicAfter=actionPublicCounts(o,pung,called.melds,called.followUpDiscard);assert.equal(publicAfter[31],3);assert.equal(o.players[3].river.length,1);
});

test('a seven-pairs ready hand reports a positive score-gated exact forecast with its fan route',async()=>{
  const o=observation();o.hand=[0,0,1,1,9,9,10,10,18,18,19,19,31,32];o.drawn=32;o.legalActions=[...new Set(o.hand)].map(tile=>({type:'discard',tile}));
  const report=await analyzePosition(o,scorer,{samples:16,horizon:6}),ready=report.candidates.find(c=>c.forecast.method==='exact-waits'&&c.forecast.fans.some(f=>f.name==='七对'));
  assert.ok(ready);assert.ok(ready.waits.every(w=>w.selfFan>=8));assert.equal(ready.forecast.interval,null);assert.equal(ready.forecast.samples,0);
  const copies=ready.waits.filter(w=>w.selfFan!==null).reduce((n,w)=>n+w.copies,0);assert.ok(Math.abs(ready.forecast.probability-drawChance(122,copies,6))<1e-12);assert.ok(ready.forecast.probability>0);assert.ok(report.routes.some(r=>r.name==='七对'));
});
