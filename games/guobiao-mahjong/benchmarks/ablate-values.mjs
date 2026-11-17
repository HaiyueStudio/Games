import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {game,hash,json,write,assetURL,runOffline} from './offline-runner.mjs';
import {validateComparison,summarizeComparison,mean,seedInterval} from './statistics.mjs';
import {validateLearningSplit} from './learning-validation.mjs';
import {pinnedJson} from './offline-inputs.mjs';
const config=json(resolve(process.argv[2]??resolve(import.meta.dirname,'teacher-ablation.json'))),output=resolve(process.argv[3]??'artifacts/guobiao-mahjong/strength/teacher-ablation-v1'),modelDir=resolve(process.argv[4]??'artifacts/guobiao-mahjong/distillation/model-v1-ablation'),training=json(resolve(modelDir,'training-report.json'));
validateComparison(config);assert.equal(config.baseline,'kd-value-v1');assert.equal(config.concurrency,1);assert.equal(config.rotateSeats,true);assert.ok(config.seeds.length>=4);assert.equal(training.status,'passed');const used=validateLearningSplit(training.folds);assert.ok(config.seeds.every(s=>!used.has(s)));assert.ok(config.suites.every(s=>s.agents.every(p=>['kd-value-v1','kd-teacher','kd-student-fp32','kd-student-fp16'].includes(p))));
const assets=[];
for(const [policy,name,key,hidden] of [['kd-teacher','teacher.json','teacherSha256',training.config.teacherHidden],['kd-student-fp32','student-fp32.json','studentFp32Sha256',training.config.studentHidden],['kd-student-fp16','student.json','studentSha256',training.config.studentHidden]]){
  const bytes=readFileSync(resolve(modelDir,name));assert.equal(hash(bytes),training[key]);const path=resolve(output,'heads',name);mkdirSync(resolve(output,'heads'),{recursive:true});if(existsSync(path))assert.equal(hash(readFileSync(path)),hash(bytes),'Existing model differs; use a fresh output directory');else writeFileSync(path,bytes);assets.push({policy,url:assetURL(path),sha256:hash(bytes),hidden});
}
pinnedJson(resolve(output,'training-report.json'),training);
function breakdown(records){
  const totals={};for(const g of records)for(const d of g.decisionAudit){const policy=g.seats[d.seat].policy,key=policy+'/'+d.action.type,t=totals[key]??={policy,action:d.action.type,decisions:0,overrides:0,winsAfter:0,dealInsAfter:0,relativeFanAfter:0};t.decisions++;t.overrides+=+d.changed;const r=g.results[d.hand],fans=g.seats.map((_,i)=>r.winner===i?r.win.total:0);t.winsAfter+=+(r.winner===d.seat);t.dealInsAfter+=+(r.winner!==null&&!r.selfDrawn&&r.from===d.seat);t.relativeFanAfter+=fans[d.seat]-fans.filter((_,i)=>i!==d.seat).reduce((a,b)=>a+b,0)/3;}
  return Object.values(totals).map(t=>({...t,meanRelativeFanAfter:t.relativeFanAfter/t.decisions,interpretation:'Observed hand outcome after this action; descriptive and not causal action value'}));
}
const jobs=config.suites.flatMap(s=>config.seeds.flatMap(seed=>Array.from({length:4},(_,rotation)=>({suite:s.id,seed,rotation,policies:Array.from({length:4},(_,i)=>s.agents[(i+rotation)%4])})))),records=[],started=Date.now();mkdirSync(resolve(output,'matches'),{recursive:true});let runKey;
const result=await runOffline(output,assets,async({call,fingerprints,preparation})=>{
  runKey=hash(JSON.stringify({config,fingerprints,assets:assets.map(({policy,sha256,hidden})=>({policy,sha256,hidden}))}));
  for(let at=0;at<jobs.length;at+=config.batchMatches){const batch=jobs.slice(at,at+config.batchMatches),missing=batch.filter(j=>!existsSync(resolve(output,'matches',`${j.suite}-${j.seed}-${j.rotation}.json`)));
    if(missing.length){const reply=await call({kind:'matches',jobs:missing});for(const record of reply.matches)write(resolve(output,'matches',`${record.suite}-${record.seed}-${record.rotation}.json`),{runKey,...record});}
    for(const j of batch){const r=json(resolve(output,'matches',`${j.suite}-${j.seed}-${j.rotation}.json`));assert.equal(r.runKey,runKey,'Stale ablation evidence; use a fresh output directory');records.push(r);console.log(`[${records.length}/${jobs.length}] ${j.suite} ${j.seed}/${j.rotation} `+r.seats.map(s=>s.policy+':'+s.fan).join(' '));}
    write(resolve(output,'report.json'),{schemaVersion:1,runKey,config,fingerprints,assets,completed:records.length,expected:jobs.length,strict:true,skipForced:true,summary:summarizeComparison(records,config),preparation,elapsedMs:Date.now()-started});
  }return {matches:records.length};
});
const summary=summarizeComparison(records,config),teacher=summary.find(s=>s.id==='teacher-vs-original'),comparison=teacher.paired.find(p=>p.policy==='kd-teacher'),target=teacher.rows.find(p=>p.policy==='kd-teacher'),base=teacher.rows.find(p=>p.policy==='kd-value-v1');
const teacherQualified=!!comparison.fanDelta95&&comparison.fanDelta95.low>0&&target.averagePlace<=base.averagePlace&&summary.every(s=>s.rows.every(r=>r.faults===0&&r.missedHu===0));
const suiteFor=p=>summary.find(s=>s.rows.some(r=>r.policy===p)),pairedDelta=(a,b)=>{const x=suiteFor(a).paired.find(p=>p.policy===a),y=suiteFor(b).paired.find(p=>p.policy===b),d=x.seedDeltas.map(v=>v.fan-y.seedDeltas.find(w=>w.seed===v.seed).fan);return {policies:[a,b],fanDeltaPerHand:mean(d),fanDelta95:seedInterval(d),meaning:'Difference of each challenger-versus-original seed deltas; separate matched-wall suites'};};
write(resolve(output,'report.json'),{schemaVersion:1,generatedAt:new Date().toISOString(),status:'passed',runKey,config,fingerprints:result.fingerprints,assets,completed:records.length,expected:jobs.length,strict:true,skipForced:true,summary,teacherQualified,compressionComparisons:[pairedDelta('kd-student-fp32','kd-teacher'),pairedDelta('kd-student-fp16','kd-student-fp32')],actionBreakdown:breakdown(records),preparation:result.preparation,browser:result.browser.browserEvidence,httpProvenance:result.browser.httpProvenance,elapsedMs:Date.now()-started,limitations:['Same KD0 backbone, legal candidates, conservative thresholds and current-hand objective for all four heads','Action breakdown is descriptive; a hand outcome does not causally measure an individual action','Fresh seed blocks with all four seat rotations; limited opponents, not a universal strength ranking','Teacher must qualify independently before a new student is promoted; no deployment by this script']});
console.log(JSON.stringify({teacherQualified,summary},null,2));
