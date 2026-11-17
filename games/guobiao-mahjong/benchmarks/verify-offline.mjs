import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {hash,json,write,assetURL,runOffline} from './offline-runner.mjs';
import {pinnedJson,selectValuePositions} from './offline-inputs.mjs';
import {valueFeatureError} from './value-parity.mjs';
const output=resolve(process.argv[2]??'artifacts/guobiao-mahjong/offline-published-smoke'),source=json(resolve('artifacts/guobiao-mahjong/value/data-v2/groups.json')),positions=selectValuePositions(source,{positionsPerFold:3}).slice(0,2),path=resolve(output,'positions.json');pinnedJson(path,positions);const sha=hash(readFileSync(path));
const result=await runOffline(output,[],async({call})=>{
  const job={kind:'label',positionsUrl:assetURL(path),positionsSha256:sha,budget:{stages:[2,4],ordinaryMinimum:2,tacticalMinimum:4,closeFan:.5,confidenceZ:1.96,dangerThreshold:.2,parallelTrials:16}};
  await assert.rejects(call({...job,positionsSha256:'0'.repeat(64),ids:[positions[0].id]}),/checksum mismatch/);
  let simulations=0,maximumFeatureError=0;for(const p of positions){const reply=await call({...job,ids:[p.id]});assert.equal(reply.positionLoads,1);assert.equal(reply.runtime.actualBackend,'webgpu');assert.equal(reply.groups.length,1);const g=reply.groups[0],original=source.find(v=>v.id===p.id);assert.deepEqual(g.rows.map(r=>r.plan),original.rows.map(r=>r.plan));
    for(const [i,r] of g.rows.entries()){maximumFeatureError=Math.max(maximumFeatureError,valueFeatureError(r.features,original.rows[i].features));for(const o of r.outcomes){assert.equal(o.scores.reduce((a,b)=>a+b,0),0);if(o.winner!==null)assert.ok(o.fans[o.winner]>=8);simulations++;}}
  }return {groups:positions.length,simulations,maximumFeatureError,positionLoads:1,checks:['bad-input-checksum-rejected','two-label-jobs-one-position-load','actual-webgpu-kd-rollouts','feature-parity','legal-eight-fan-outcomes','zero-sum-settlement']};
});
write(resolve(output,'report.json'),{schemaVersion:1,status:'passed',...result.details,fingerprints:result.fingerprints,scriptSha256:hash(readFileSync(import.meta.filename)),positionsSha256:sha,preparation:result.preparation,browser:result.browser.browserEvidence});console.log(JSON.stringify(result.details,null,2));
