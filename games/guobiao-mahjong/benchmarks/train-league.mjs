import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {validateLeagueConfig} from './league-validation.mjs';
const game=resolve(import.meta.dirname,'..'),python=process.env.MAHJONG_PYTHON??resolve(game,'model-service/.venv/bin/python'),configPath=resolve(process.argv[2]??resolve(import.meta.dirname,'league-config.json')),config=validateLeagueConfig(JSON.parse(readFileSync(configPath))),base=resolve(process.argv[3]??'artifacts/guobiao-mahjong/league');let child=null,cancelled=false;
const stop=()=>{cancelled=true;child?.kill('SIGTERM')};process.once('SIGINT',stop);process.once('SIGTERM',stop);
const run=(command,args)=>new Promise((yes,no)=>{if(cancelled){no(Error('League cancelled'));return;}child=spawn(command,args,{stdio:'inherit',env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',VECLIB_MAXIMUM_THREADS:'1'}});child.once('error',no);child.once('exit',code=>{child=null;code===0&&!cancelled?yes():no(Error('League stage failed: '+args[0]+' ('+code+')'))});});
try{
  assert.ok(existsSync(resolve(base,'teacher-g0/model.json')),'Run joint pretraining first');
  const roundPath=resolve(base,'round-value/model.json'),roundArgs=config.roundValueEpisodes?['--round-value',roundPath]:[];
  if(config.roundValueEpisodes){
    await run(python,[resolve(game,'benchmarks/train-round-value.py'),'--episodes',...config.roundValueEpisodes,'--output',resolve(base,'round-value')]);
    const report=JSON.parse(readFileSync(resolve(base,'round-value/report.json'))),used=new Set(Object.values(report.folds).flat());for(const seed of [...config.trainingSeeds.flat(),...config.evaluationSeeds])assert.ok(!used.has(seed),'Round-value fit walls overlap current learning/evaluation');
    assert.equal(report.modelSha256,createHash('sha256').update(readFileSync(roundPath)).digest('hex'));
  }
  const statePath=resolve(base,'state-value/model.json'),creditArgs=[...roundArgs,...(config.stateValueEpisodes?['--state-value',statePath]:[])];
  if(config.stateValueEpisodes){
    await run(python,[resolve(game,'benchmarks/train-state-value.py'),'--episodes',...config.stateValueEpisodes,'--round-value',roundPath,'--output',resolve(base,'state-value')]);
    const report=JSON.parse(readFileSync(resolve(base,'state-value/report.json'))),used=new Set(Object.values(report.folds).flat());for(const seed of [...config.trainingSeeds.flat(),...config.evaluationSeeds])assert.ok(!used.has(seed),'State-value fitting walls overlap current campaign');
    assert.equal(report.modelSha256,createHash('sha256').update(readFileSync(statePath)).digest('hex'));
  }
  for(let g=0;g<config.generations;g++){
    await run(process.execPath,[resolve(game,'benchmarks/league-generation.mjs'),configPath,String(g),resolve(base,`generation-${g}`),base]);
    await run(python,[resolve(game,'benchmarks/train-joint.py'),'ppo','--model',resolve(base,`teacher-g${g}/model.json`),'--episodes',resolve(base,`generation-${g}/episodes.json`),'--generation',String(g),...creditArgs,'--output',resolve(base,`teacher-g${g+1}`)]);
  }
  const qualificationPath=resolve(base,'teacher-qualification.json'),teacherPath=resolve(base,`teacher-g${config.generations}/model.json`),teacherHash=createHash('sha256').update(readFileSync(teacherPath)).digest('hex'),qualification=existsSync(qualificationPath)?JSON.parse(readFileSync(qualificationPath)):null;
  if(qualification?.qualified&&qualification.teacherModelSha256===teacherHash){
  await run(python,[resolve(game,'benchmarks/train-joint.py'),'distill','--bootstrap',resolve(base,'bootstrap-v1'),'--expanded',resolve(base,'joint-data-v1'),'--model',resolve(base,`teacher-g${config.generations}/model.json`),'--episodes',resolve(base,`generation-${config.generations-1}/episodes.json`),...creditArgs,'--output',resolve(base,'student-v1')]);
  }else console.log('Teacher training complete; distillation skipped until independent tournament qualification matches this checkpoint.');

}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
