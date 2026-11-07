import {spawn} from 'node:child_process';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import assert from 'node:assert/strict';
import {validateLeagueConfig} from './league-validation.mjs';
import {pinnedJson} from './offline-inputs.mjs';
const game=resolve(import.meta.dirname,'..'),root=resolve(game,'../..'),base=resolve(process.argv[2]??'artifacts/guobiao-mahjong/league-new'),configPath=resolve(process.argv[3]??resolve(import.meta.dirname,'league-config.json')),config=validateLeagueConfig(JSON.parse(readFileSync(configPath))),python=process.env.MAHJONG_PYTHON??resolve(game,'model-service/.venv/bin/python'),within=relative(root,base);
assert.ok(within&&!within.startsWith('..'),'League output must be inside the Games HTTP root');
const path=name=>resolve(base,name),script=name=>resolve(import.meta.dirname,name),steps=[
  [process.execPath,[script('belief-data.mjs'),path('belief-data-v1')]],
  [python,[script('train-belief.py'),path('belief-data-v1'),'--output',path('belief-v1')]],
  [process.execPath,[script('joint-bootstrap.mjs'),path('bootstrap-v1'),path('belief-v1/belief.json')]],
  [process.execPath,[script('joint-data.mjs'),path('joint-data-v1'),path('belief-v1/belief.json')]],
  [python,[script('train-joint.py'),'pretrain','--bootstrap',path('bootstrap-v1'),'--expanded',path('joint-data-v1'),'--output',path('teacher-g0')]],
  [process.execPath,[script('train-league.mjs'),configPath,base]],
];
if(process.argv.includes('--plan-only'))console.log(JSON.stringify({output:base,config,steps},null,2));
else{
  assert.ok(!existsSync(base)||!readdirSync(base).length||existsSync(path('campaign.json')),'Existing non-campaign data; choose a fresh output directory');pinnedJson(path('campaign.json'),{schemaVersion:1,config,steps});
  for(const [command,args]of steps)await new Promise((yes,no)=>{const child=spawn(command,args,{cwd:root,stdio:'inherit',env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',VECLIB_MAXIMUM_THREADS:'1'}});child.once('error',no);child.once('exit',code=>code===0?yes():no(Error('League stage failed: '+args[0]+' ('+code+')')));});
  console.log('Offline training complete: '+path('student-v1/model.json')+'. Export and independently evaluate before choosing this candidate.');
}
