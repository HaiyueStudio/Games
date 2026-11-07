import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
// Explicit offline entry point. A failed training/calibration stage never publishes a student.
const args=process.argv.slice(2).filter(v=>!v.startsWith('--')),game=resolve(import.meta.dirname,'..'),root=resolve(game,'../..'),data=resolve(args[0]??'artifacts/guobiao-mahjong/value/data-v2'),out=resolve(args[1]??'artifacts/guobiao-mahjong/distillation/model-v1'),python=process.env.MAHJONG_PYTHON??resolve(game,'model-service/.venv/bin/python');
let child=null,stopped=false;const stop=()=>{stopped=true;child?.kill('SIGTERM')};process.once('SIGINT',stop);process.once('SIGTERM',stop);
const run=(command,args)=>new Promise((resolve,reject)=>{if(stopped){reject(Error('Offline distillation cancelled'));return;}child=spawn(command,args,{cwd:root,stdio:'inherit',env:{...process.env,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1',VECLIB_MAXIMUM_THREADS:'1'}});child.once('error',reject);child.once('exit',code=>{child=null;code===0&&!stopped?resolve():reject(Error('Offline stage failed: '+args[0]+' ('+code+')'))});});
try{
  await run(process.execPath,[resolve(game,'benchmarks/archive-value-data.mjs'),data]);
  if(!process.argv.includes('--export-only'))await run(python,[resolve(game,'benchmarks/train-distillation.py'),data,'--output',out]);
  const report=JSON.parse(readFileSync(resolve(out,'training-report.json')));if(report.status!=='passed')throw Error('Calibration rejected the student');
  await run(process.execPath,[resolve(game,'benchmarks/check-distillation.mjs'),data,out,'--candidate-only']);
  await run(process.execPath,[resolve(game,'benchmarks/export-distilled.mjs'),out]);
  await run(process.execPath,[resolve(game,'benchmarks/check-distillation.mjs'),data,out]);
  await run(process.execPath,[resolve(game,'benchmarks/export-value-decisions.mjs'),data,'distilled']);
  console.log('Offline distillation completed. Build the game to publish the compact Worker model.');
}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
