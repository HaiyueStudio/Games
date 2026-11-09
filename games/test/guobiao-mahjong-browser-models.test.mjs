import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const {actionIndex,encodeObservation,choosePolicyAction}=await import('../guobiao-mahjong/ai/browser/features.ts');
const {readNpy,decodeModelArray,checkpointArrays}=await import('../guobiao-mahjong/ai/browser/weights.ts');
const {BrowserModelRuntime}=await import('../guobiao-mahjong/ai/browser/BrowserModelRuntime.ts');
const {initialBrowserInfo}=await import('../guobiao-mahjong/ai/browser/protocol.ts');
const {ModelHub}=await import('../guobiao-mahjong/api/ModelHub.ts');
const {isSavedGame}=await import('../guobiao-mahjong/rules/replay.ts');
const {zipSync}=await import('fflate');
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/mahjong-browser-models.json',import.meta.url))).cases;
const observation=()=>structuredClone(fixtures[0].observation);
const signal=()=>new AbortController().signal;
test('all 235 policy actions have unique indices, including every claimed position in chow',()=>{
  const actions=[{type:'pass'},{type:'hu'}];
  for(const type of ['discard','pung','kong','concealed-kong','add-kong'])for(let tile=0;tile<34;tile++)actions.push({type,tile});
  for(let suit=0;suit<3;suit++)for(let start=0;start<7;start++)for(let claimed=0;claimed<3;claimed++){const tile=suit*9+start;actions.push({type:'chow',tile:tile+claimed,tiles:[tile,tile+1,tile+2]});}
  assert.deepEqual(actions.map(actionIndex).sort((a,b)=>a-b),Array.from({length:235},(_,i)=>i));
  assert.throws(()=>actionIndex({type:'chow',tile:8,tiles:[8,9,10]}));assert.throws(()=>actionIndex({type:'discard',tile:34}));
});
test('public observation encoding and temperature-zero policy match all 12 pinned NumPy reference cases',()=>{
  for(const f of fixtures){const before=JSON.stringify(f.observation),encoded=encodeObservation(f.observation);
    assert.deepEqual(Array.from(encoded.features),f.features);assert.deepEqual(encoded.indices,f.indices);
    assert.deepEqual(Array.from(encoded.mask).flatMap((v,i)=>v?[i]:[]),[...f.indices].sort((a,b)=>a-b));
    assert.equal(f.indices[choosePolicyAction([f.logits],encoded.indices,f.observation,{temperature:0,seed:42})],f.best);
    assert.equal(JSON.stringify(f.observation),before);
  }
});
test('encoding rejects hidden hands and keeps opponents concealed kongs out of visible meld planes',()=>{
  const o=observation();o.players[1].melds=[{kind:'kong',tiles:[null,null,null,null],concealed:true}];
  const encoded=encodeObservation(o);assert.ok(encoded.features.slice(26*36,30*36).every(v=>v===0));
  o.players[1].melds[0].tiles=[30,30,30,30];assert.deepEqual(encodeObservation(o).features,encoded.features);
  o.players[0].melds=[{kind:'kong',tiles:[30,30,30,30],concealed:true}];assert.equal(encodeObservation(o).features[22*36+30],1);
  o.players[1].hand=[1];assert.throws(()=>encodeObservation(o),/redacted/);
  const bad=observation();bad.hand=[0,0,0,0,0];assert.throws(()=>encodeObservation(bad),/four/);
});
test('ensemble averages legal probabilities; seeded sampling is repeatable and never chooses a masked action',()=>{
  const o=observation(),indices=[2,3,4],a=new Float32Array(235).fill(100),b=new Float32Array(235).fill(100),c=new Float32Array(235).fill(100);
  [a[2],a[3],a[4]]=[10,0,0];[b[2],b[3],b[4]]=[0,2,-10];[c[2],c[3],c[4]]=[0,2,-10];
  assert.equal(choosePolicyAction([a,b,c],indices,o,{temperature:0,seed:1}),1,'probability mean differs from the logit mean');
  for(let seed=0;seed<40;seed++){const p={temperature:1,seed},x=choosePolicyAction([a,b],indices,o,p);assert.ok(x>=0&&x<3);assert.equal(x,choosePolicyAction([a,b],indices,o,p));}
  a[2]=NaN;assert.throws(()=>choosePolicyAction([a],indices,o,{temperature:0,seed:1}),/Non-finite/);
});
function npy(shape,values,dtype='<f2'){
  const header=`{'descr': '${dtype}', 'fortran_order': False, 'shape': (${shape.join(',')},), }\n`,h=Buffer.from(header),b=Buffer.alloc(10+h.length+values.length*2);b.set([0x93,78,85,77,80,89,1,0]);b.writeUInt16LE(h.length,8);h.copy(b,10);values.forEach((v,i)=>b.writeUInt16LE(v,10+h.length+i*2));return b;
}
test('checkpoint decoding preserves half precision and transposes convolutions and dense heads correctly',()=>{
  const a=decodeModelArray(readNpy(npy([2,2],[0x3c00,0xc000,0x3800,0x0001])));assert.deepEqual(a.shape,[2,2]);assert.deepEqual(Array.from(a.values),[1,.5,-2,2**-24]);
  const b=decodeModelArray(readNpy(npy([2,1,1,2],[0x3c00,0x4000,0x4200,0x4400])));assert.deepEqual(b.shape,[1,2,1,2]);assert.deepEqual(Array.from(b.values),[1,3,2,4]);
  assert.throws(()=>readNpy(npy([3],[0,1])));assert.throws(()=>readNpy(new Uint8Array(12)));
  assert.throws(()=>checkpointArrays(zipSync({'unexpected.npy':npy([1],[0])})),/Unexpected/);
});
class FakeWorker{
  onmessage=null;onerror=null;messages=[];terminated=0;
  postMessage(data){this.messages.push(data)}terminate(){this.terminated++}
  reply(job,overrides={}){this.onmessage?.({data:{id:job.id,kind:'result',info:{...initialBrowserInfo(job.backend),actualBackend:job.backend,state:'ready',loadedModels:[0]},...overrides}})}
}
const fakeRuntime=()=>{const workers=[];return {workers,runtime:new BrowserModelRuntime(()=>{const w=new FakeWorker();workers.push(w);return w})}};
test('all seats share one model Worker; backend switches terminate it and stale replies cannot settle new requests',async()=>{
  const {runtime:r,workers}=fakeRuntime(),a=r.prepare(['browser-kd-s0'],'webgpu',signal()),b=r.prepare(['browser-kd-s0'],'webgpu',signal());
  assert.equal(workers.length,1);const w=workers[0];w.reply(w.messages[0]);w.reply(w.messages[1]);await Promise.all([a,b]);
  const pending=r.prepare(['browser-kd-s1'],'webgpu',signal()),rejected=assert.rejects(pending,{name:'AbortError'}),stale=w.onmessage;
  r.setBackend('wasm');await rejected;assert.equal(w.terminated,1);
  const next=r.prepare(['browser-kd-s0'],'wasm',signal()),nw=workers[1];stale({data:{id:w.messages.at(-1).id,kind:'error',error:'stale',info:initialBrowserInfo('webgpu')}});
  assert.equal(r.snapshot().requestedBackend,'wasm');nw.reply(nw.messages[0]);await next;
  assert.equal(r.snapshot().liveWorkers,1);r.dispose();assert.equal(nw.terminated,1);assert.equal(r.snapshot().liveWorkers,0);
});
test('cancellation sends a bounded job cancel and validation rejects illegal or stale model responses',async()=>{
  const {runtime:r,workers}=fakeRuntime(),abort=new AbortController(),o=observation(),agent=r.agent('browser-kd-s0',()=>({temperature:0,seed:1}),()=>r.backend);
  const cancelled=agent.decide(o,{signal:abort.signal,requestId:'cancel'}),rejected=assert.rejects(cancelled,{name:'AbortError'});abort.abort();await rejected;
  const w=workers[0];assert.deepEqual(w.messages.at(-1),{id:1,kind:'cancel'});w.reply(w.messages[0],{action:o.legalActions[0],revision:o.revision});assert.equal(r.busy,false);
  const invalid=agent.decide(o,{signal:signal(),requestId:'illegal'}),failure=assert.rejects(invalid,/非法/);w.reply(w.messages.at(-1),{action:{type:'discard',tile:33},revision:o.revision});await failure;
  const stale=agent.decide(o,{signal:signal(),requestId:'stale'}),staleFailure=assert.rejects(stale,/过期/);w.reply(w.messages.at(-1),{action:o.legalActions[0],revision:o.revision+1});await staleFailure;
  const broken=agent.decide(o,{signal:signal(),requestId:'error'}),brokenFailure=assert.rejects(broken,/worker failed/);w.onerror({message:'worker failed'});await brokenFailure;assert.equal(r.snapshot().state,'failed');r.dispose();
});
test('browser models remain available offline and persisted backend and model seats restore without a service',async()=>{
  const changed=[],registered=new Map(),game={human:0,agentAt:who=>registered.get(who)??null,setAgent:(who,agent)=>{changed.push([who,agent]);if(agent)registered.set(who,agent);else registered.delete(who)}},{runtime,workers}=fakeRuntime(),hub=new ModelHub(game,runtime),original=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error('offline')};
  try{await assert.rejects(hub.refresh());assert.equal(hub.models.length,9);assert.ok(hub.models.every(m=>m.source==='browser'));
    hub.apply(['builtin','browser-kd-s0-value','browser-kdens3','browser-kd-s0-distilled'],{temperature:.3,seed:42},'wasm');
    assert.equal(workers.length,0,'assigning a model is lazy until prepare or decide');const saved=hub.savedConfiguration();assert.equal(saved.backend,'wasm');
    const fixture=JSON.parse(readFileSync(new URL('./fixtures/mahjong-ui-melds.json',import.meta.url)));assert.ok(isSavedGame({...fixture,browserModels:saved}));
    for(const override of [{backend:'cpu'},{assignments:['browser-unknown',null,null,null]},{seed:-1},{temperature:3}])assert.equal(isSavedGame({...fixture,browserModels:{...saved,...override}}),false);
    hub.restoreConfiguration(saved);assert.deepEqual(hub.savedConfiguration(),saved);assert.equal(hub.snapshot().browser.liveWorkers,0);
    assert.throws(()=>hub.apply(['builtin','browser-kd-s0','invalid','builtin'],{temperature:0,seed:1}));assert.deepEqual(hub.savedConfiguration(),saved);
  }finally{globalThis.fetch=original;hub.dispose()}
});
test('batched policy requests validate per-row revisions and legal-action probabilities',async()=>{
  const {runtime:r,workers}=fakeRuntime(),o=observation(),pending=r.policies('browser-kd-s0',[o,o],{temperature:0,seed:1},'webgpu',signal()),w=workers[0],job=w.messages[0],probabilities=o.legalActions.map(()=>1/o.legalActions.length),row={action:o.legalActions[0],revision:o.revision,probabilities};
  assert.equal(job.kind,'policies');assert.equal(job.observations.length,2);w.reply(job,{rows:[row,row]});const result=await pending;assert.equal(result.rows.length,2);
  const bad=r.policies('browser-kd-s0',[o],{temperature:0,seed:1},'webgpu',signal()),rejected=assert.rejects(bad,/batch row/);w.reply(w.messages.at(-1),{rows:[{...row,revision:o.revision+1}]});await rejected;
  await assert.rejects(r.policies('browser-kd-s0',Array(17).fill(o),{temperature:0,seed:1},'webgpu',signal()),/batch/);r.dispose();
});
test('joint policy exposes its same-inference KD prior separately and rejects malformed priors',async()=>{
  const {runtime:r,workers}=fakeRuntime(),o=observation(),policy=o.legalActions.map((_,i)=>+(i===0)),priorPolicy=o.legalActions.map(()=>1/o.legalActions.length),pending=r.policy('browser-kd-s0-joint',o,{temperature:0,seed:1},'webgpu',signal()),w=workers[0];w.reply(w.messages.at(-1),{action:o.legalActions[0],revision:o.revision,policy,priorPolicy});const result=await pending;assert.deepEqual(result.probabilities,policy);assert.deepEqual(result.priorProbabilities,priorPolicy);assert.notEqual(result.priorProbabilities,priorPolicy);
  const invalid=r.policy('browser-kd-s0-joint',o,{temperature:0,seed:1},'webgpu',signal()),rejected=assert.rejects(invalid,/policy prior/);w.reply(w.messages.at(-1),{action:o.legalActions[0],revision:o.revision,policy,priorPolicy:[NaN]});await rejected;r.dispose();
});
test('browser claim sessions receive changing match and settings contexts through ModelHub',async()=>{
  const {runtime:r,workers}=fakeRuntime(),game={human:null,presentationEpoch:1,setAgent(){},agentAt(){return null}},hub=new ModelHub(game,r),o=observation();
  hub.apply(Array(4).fill('browser-kd-s0-joint'),{temperature:.5,seed:7});const agent=hub.browserAgent('browser-kd-s0-joint'),seen=[];
  for(let i=0;i<3;i++){const pending=agent.decide(o,{signal:signal(),requestId:'context-'+i}),w=workers[0],job=w.messages.at(-1);seen.push(job.policyContext);w.reply(job,{action:o.legalActions[0],revision:o.revision});await pending;if(i===0)game.presentationEpoch++;if(i===1)hub.apply(Array(4).fill('browser-kd-s0-joint'),{temperature:.5,seed:7});}
  assert.deepEqual(seen,['1:1','2:1','2:2']);const pending=r.policy('browser-kd-s0-joint',o,{temperature:0,seed:7},'webgpu',signal(),'analysis-session'),w=workers[0],job=w.messages.at(-1);assert.equal(job.policyContext,'analysis-session');w.reply(job,{action:o.legalActions[0],revision:o.revision,policy:o.legalActions.map((_,i)=>+(i===0))});await pending;hub.dispose();
});
