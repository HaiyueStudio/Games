import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {validateLeagueConfig} from './league-validation.mjs';
const game=resolve(import.meta.dirname,'..'),python=process.env.MAHJONG_PYTHON??resolve(game,'model-service/.venv/bin/python'),configPath=resolve(process.argv[2]??resolve(import.meta.dirname,'league-config.json')),config=validateLeagueConfig(JSON.parse(readFileSync(configPath))),base=resolve(process.argv[3]??'artifacts/guobiao-mahjong/league');let child=null,cancelled=false;
const stop=()=>{cancelled=true;child?.kill('SIGTERM')};process.once('SIGINT',stop);process.once('SIGTERM',stop);
const run=(command,args)=>new Promise((yes,no)=>{if(cancelled){no(Error('League cancelled'));return;}child=spawn(command,args,{stdio:'inherit',env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',VECLIB_MAXIMUM_THREADS:'1'}});child.once('error',no);child.once('exit',code=>{child=null;code===0&&!cancelled?yes():no(Error('League stage failed: '+args[0]+' ('+code+')'))});});
try{
  assert.ok(existsSync(resolve(base,'teacher-g0/model.json')),'Run joint pretraining first');
  for(let g=0;g<config.generations;g++){
    await run(process.execPath,[resolve(game,'benchmarks/league-generation.mjs'),configPath,String(g),resolve(base,`generation-${g}`),base]);
    await run(python,[resolve(game,'benchmarks/train-joint.py'),'ppo','--model',resolve(base,`teacher-g${g}/model.json`),'--episodes',resolve(base,`generation-${g}/episodes.json`),'--generation',String(g),'--output',resolve(base,`teacher-g${g+1}`)]);
  }
  await run(python,[resolve(game,'benchmarks/train-joint.py'),'distill','--bootstrap',resolve(base,'bootstrap-v1'),'--expanded',resolve(base,'joint-data-v1'),'--model',resolve(base,`teacher-g${config.generations}/model.json`),'--episodes',resolve(base,`generation-${config.generations-1}/episodes.json`),'--output',resolve(base,'student-v1')]);
}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
