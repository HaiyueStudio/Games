import {registerHooks} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {resolve,relative} from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {validateComparison,summarizeComparison} from './statistics.mjs';
registerHooks({resolve(s,c,next){return next(/^\.{1,2}\//.test(s)&&!/\.[a-z0-9]+$/i.test(s)?s+'.ts':s,c)}});
const root=resolve(import.meta.dirname,'../../..'),game=resolve(import.meta.dirname,'..');
const {createScorer}=await import('../rules/scorer.ts'),{decide:legacy}=await import('./strategy-v1.ts'),{decideExperimental:current}=await import('../ai/strategy.ts');
const {runTournament}=await import('../api/tournament.ts'),{actionKey}=await import('../rules/types.ts');
const {prepareAction,visibleCounts,actionPublicCounts,forecastFlags}=await import('../ai/coaching/publicAnalysis.ts');
const {enhancePolicy}=await import('../ai/hybrid.ts'),{actionIndex}=await import('../ai/browser/features.ts');
const {referenceValue}=await import('./reference-value.ts');
const configPath=resolve(process.argv[2]??resolve(import.meta.dirname,'compare.json')),config=JSON.parse(readFileSync(configPath));validateComparison(config);
const laneId=process.env.MAHJONG_BENCH_LANE===undefined?null:Number(process.env.MAHJONG_BENCH_LANE);if(laneId!==null&&(!Number.isInteger(laneId)||laneId<0||laneId>=config.concurrency||!config.parallelProcesses))throw Error('Invalid process lane');
const output=resolve(process.argv[3]??resolve(root,'artifacts/guobiao-mahjong/strength/development'));mkdirSync(resolve(output,'matches'),{recursive:true});
const sources=['benchmarks/run.mjs','benchmarks/statistics.mjs','benchmarks/model-pipe.py','benchmarks/strategy-v1.ts','api/tournament.ts','api/agents.ts','rules/scorer.ts','rules/match.ts','rules/types.ts','rules/replay.ts','rules/handAnalysis.ts','ai/coaching/publicAnalysis.ts','ai/strategy.ts','ai/analysisCache.ts','ai/lastTileDefense.ts','assets/mcr.wasm','model-service/runtime.py','model-service/adapter.py','model-service/models.lock.json','model-service/requirements.txt','model-service/vendor/numpy_resfused.py'];
if(config.suites.some(s=>s.agents.includes('v2')))sources.push('ai/strategy.ts','ai/analysisCache.ts');
if(config.suites.some(s=>s.agents.some(p=>['kd-safe','kd-ready','kd-search','kd-learned','kd-value','kd-value-v1','kd-distilled'].includes(p))))sources.push('ai/hybrid.ts','ai/browser/features.ts','ai/browser/policy.ts','ai/browser/catalog.ts');
if(config.suites.some(s=>s.agents.includes('kd-learned')))sources.push('ai/candidates/features.ts','ai/candidates/targets.ts','ai/candidates/schema.ts','ai/candidates/weights.ts','ai/candidates/learned.ts');
if(config.suites.some(s=>s.agents.includes('kd-value')))sources.push('ai/value/actions.ts','ai/value/features.ts','ai/value/simulation.ts','ai/value/model.ts','ai/value/weights.ts','ai/value/training.json','ai/candidates/features.ts','ai/candidates/targets.ts','ai/candidates/schema.ts','ai/candidates/weights.ts','ai/candidates/learned.ts');
sources.push('ai/value/observation.ts','ai/value/types.ts','ai/value/actions.ts','ai/value/features.ts','ai/value/model.ts','ai/value/packed.ts','ai/value/distilledWeights.ts','ai/value/distillation.json','benchmarks/reference-value.ts','ai/value/weights.ts');
const hash=data=>createHash('sha256').update(data).digest('hex'),fingerprints=Object.fromEntries(sources.map(p=>[p,hash(readFileSync(resolve(game,p)))]));
const runKey=hash(JSON.stringify({config,fingerprints})),revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirty=!!execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim();
const scorer=await createScorer(readFileSync(resolve(game,'assets/mcr.wasm'))),started=Date.now(),abort=new AbortController();process.once('SIGINT',()=>abort.abort());
class ModelPipe{
  serial=0;pending=new Map();stderr='';
  constructor(){
    const python=process.env.MAHJONG_PYTHON??resolve(game,'model-service/.venv/bin/python');
    this.child=spawn(python,[resolve(import.meta.dirname,'model-pipe.py')],{env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',VECLIB_MAXIMUM_THREADS:'1'},stdio:['pipe','pipe','pipe']});
    this.lines=createInterface({input:this.child.stdout});this.lines.on('line',line=>{try{const response=JSON.parse(line),p=this.pending.get(response.requestId);if(p){this.pending.delete(response.requestId);response.error?p.reject(Error(response.error)):p.resolve(response)}}catch(e){this.fail(e)}});
    this.child.stderr.on('data',b=>{this.stderr=(this.stderr+b.toString()).slice(-4096)});this.child.on('error',e=>this.fail(e));this.child.on('exit',code=>this.fail(Error('KD transport exited '+code+' '+this.stderr)));
  }
  fail(error){for(const p of this.pending.values())p.reject(error);this.pending.clear()}
  request(data){return new Promise((resolve,reject)=>{const requestId='bench-'+(++this.serial);this.pending.set(requestId,{resolve,reject});this.child.stdin.write(JSON.stringify({...data,requestId})+'\n',e=>{if(e){this.pending.delete(requestId);reject(e)}})})}
  dispose(){this.lines.close();this.child.kill();this.fail(Error('KD transport disposed'))}
}
const allJobs=config.suites.flatMap(s=>config.seeds.flatMap(seed=>Array.from({length:config.rotateSeats?4:1},(_,rotation)=>({suite:s.id,policies:s.agents,seed,rotation})))),jobs=laneId===null?allJobs:allJobs.filter((_,i)=>i%config.concurrency===laneId);
const records=[],pipes=new Set();let cursor=0;
const write=(file,data)=>{writeFileSync(file+'.tmp',JSON.stringify(data,null,2)+'\n');renameSync(file+'.tmp',file)};
const reportFile=resolve(output,laneId===null?'report.json':`report-lane-${laneId}.json`);
const report=()=>({schemaVersion:1,generatedAt:new Date().toISOString(),runKey,revision,dirty,config:JSON.parse(JSON.stringify(config)),configPath:relative(root,configPath),fingerprints,backend:'pinned production NumPy CPU, one BLAS thread per lane; temperature 0',device:{platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,node:process.version},elapsedMs:Date.now()-started,completed:records.length,expected:allJobs.length,strict:true,skipForced:true,summary:summarizeComparison(records,config)});
async function lane(){
  let pipe;
  try{for(;;){const job=jobs[cursor++];if(!job)return;abort.signal.throwIfAborted();const file=resolve(output,'matches',`${job.suite}-${job.seed}-${job.rotation}.json`);
    if(existsSync(file)){const cached=JSON.parse(readFileSync(file));if(cached.runKey!==runKey)throw Error('Refusing stale benchmark evidence: '+file+'; choose a new output directory for this source/configuration.');records.push(cached);continue;}
    const policies=Array.from({length:4},(_,i)=>job.policies[(i+job.rotation)%4]),stats=policies.map(policy=>({policy,latencyMs:[],missedHu:0,unqualifiedReady:0,examples:[],enhancements:0,reasonCounts:{}}));
    if(policies.some(p=>p.startsWith('kd'))&&!pipe){pipe=new ModelPipe();pipes.add(pipe);await pipe.request({kind:'prepare',members:[0,1,2]});}
    const agents=policies.map((policy,who)=>({name:policy+'#'+who,async decide(o,ctx){
      abort.signal.throwIfAborted();const t=performance.now();let action;
      if(policy==='v1'||policy==='v2')action=(policy==='v1'?legacy:current)(o,scorer,config.depth??2).action;
      else {const enhanced=['kd-safe','kd-ready','kd-search','kd-learned','kd-value','kd-value-v1','kd-distilled'].includes(policy),r=await pipe.request({protocol:o.protocol,model:enhanced?'kd-s0':policy,observation:o,parameters:{temperature:0,seed:20261105},...(enhanced?{includePolicy:true}:{})});if(r.revision!==o.revision)throw Error('Stale KD response');action=r.action;
        if(enhanced){if(JSON.stringify(r.policy?.indices)!==JSON.stringify(o.legalActions.map(actionIndex)))throw Error('Policy indices mismatch');const selected=o.legalActions.findIndex(a=>actionKey(a)===actionKey(r.action)),d=['kd-value','kd-value-v1'].includes(policy)?referenceValue(o,r.policy.probabilities,selected,scorer):enhancePolicy(o,r.policy.probabilities,selected,scorer,policy.slice(3));action=d.action;stats[who].reasonCounts[d.reason]=(stats[who].reasonCounts[d.reason]??0)+1;if(d.changed)stats[who].enhancements++;}
      }
      ctx.signal.throwIfAborted();const st=stats[who];st.latencyMs.push(performance.now()-t);
      if(o.legalActions.some(a=>a.type==='hu')&&action.type!=='hu')st.missedHu++;
      if(action.type==='discard'){
        const after=prepareAction(o,action,scorer),a=scorer.analyze(after.hand);
        if(a.shanten===0){const known=visibleCounts(o),exposed=actionPublicCounts(o,action,after.melds,after.followUpDiscard),wind=(o.seat-o.dealer+4)%4;
          const legal=a.effective.some(tile=>known[tile]<4&&[false,true].some(self=>(scorer.score(after.hand,after.melds,tile,0,forecastFlags(o,tile,self,false,exposed),o.roundWind,wind)?.fan??0)>=8));
          if(!legal){st.unqualifiedReady++;if(st.examples.length<2)st.examples.push({observation:o,action});}
        }
      }
      if(!o.legalActions.some(a=>actionKey(a)===actionKey(action)))throw Error('Illegal policy output');return action;
    }}));
    const t=performance.now(),result=await runTournament(scorer,agents,[job.seed],{rotateSeats:false,timeoutMs:30000,skipForced:true,strict:true,signal:abort.signal}),match=result.matches[0];
    const seats=match.players.map((p,i)=>{const better=match.players.filter(q=>q.fan>p.fan||q.fan===p.fan&&q.score>p.score).length,tied=match.players.filter(q=>q.fan===p.fan&&q.score===p.score).length;return {...stats[i],...p,seat:i,hands:16,place:1+better+(tied-1)/2,dealIns:match.results.filter(r=>r.winner!==null&&!r.selfDrawn&&r.from===i).length,forced:match.replay.actions.filter(a=>a.seat===i).length-stats[i].latencyMs.length,faults:result.ranking.find(r=>r.name===p.name).faults}});
    const record={runKey,suite:job.suite,seed:job.seed,rotation:job.rotation,elapsedMs:performance.now()-t,seats,draws:match.results.filter(r=>r.winner===null).length,results:match.results,replay:match.replay};records.push(record);write(file,record);write(reportFile,report());
    console.log(`[${records.length}/${jobs.length}] ${job.suite} seed=${job.seed} rotation=${job.rotation} ${Math.round(record.elapsedMs/1000)}s `+seats.map(s=>`${s.policy}:${s.fan}番/${s.wins}胜/${s.dealIns}铳`).join(' '));
  }}finally{if(pipe){pipes.delete(pipe);pipe.dispose()}}
}
async function parallel(){
  const loaded=new Set(),children=[];
  const collect=()=>{for(const f of readdirSync(resolve(output,'matches')).filter(f=>f.endsWith('.json')&&!loaded.has(f))){const r=JSON.parse(readFileSync(resolve(output,'matches',f)));if(r.runKey!==runKey)throw Error('Stale parallel evidence: '+f);records.push(r);loaded.add(f);}write(reportFile,report());};
  collect();let collectionError=null;const timer=setInterval(()=>{try{collect()}catch(e){collectionError=e;for(const c of children)c.kill('SIGINT')}},2000);
  try{await Promise.all(Array.from({length:config.concurrency},(_,id)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(import.meta.url),configPath,output],{env:{...process.env,MAHJONG_BENCH_LANE:String(id)},stdio:'inherit'});children.push(child);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Benchmark lane failed: '+id+' code='+code)))})));if(collectionError)throw collectionError;collect();if(records.length!==allJobs.length)throw Error('Missing parallel matches');}
  finally{clearInterval(timer);for(const c of children)if(c.exitCode===null)c.kill('SIGINT');}
}
try{if(config.parallelProcesses&&laneId===null)await parallel();else await Promise.all(Array.from({length:laneId===null?config.concurrency:1},()=>lane()));const changed=sources.filter(p=>hash(readFileSync(resolve(game,p)))!==fingerprints[p]);if(changed.length)throw Error('Source changed during comparison: '+changed.join(','));write(reportFile,report());if(laneId===null)console.log(JSON.stringify(report().summary,null,2));}
catch(e){abort.abort(e);for(const p of pipes)p.dispose();throw e;}
