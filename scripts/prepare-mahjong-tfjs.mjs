import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const root=resolve(import.meta.dirname,'..'),require=createRequire(resolve(root,'games/guobiao-mahjong/package.json'));
const game=resolve(root,'games/guobiao-mahjong'),vendor=resolve(game,'ai/tfjs'),models=resolve(game,'assets/models');
mkdirSync(vendor,{recursive:true});mkdirSync(models,{recursive:true});
const sources=[['@tensorflow/tfjs','tf.min.js'],['@tensorflow/tfjs-backend-webgpu','tf-backend-webgpu.min.js'],['@tensorflow/tfjs-backend-wasm','tf-backend-wasm.min.js'],
  ['@tensorflow/tfjs-backend-wasm','tfjs-backend-wasm.wasm'],['@tensorflow/tfjs-backend-wasm','tfjs-backend-wasm-simd.wasm'],['@tensorflow/tfjs-backend-wasm','tfjs-backend-wasm-threaded-simd.wasm']];
const files=[];
for(const [pkg,name] of sources){const base=dirname(require.resolve(pkg+'/package.json')),meta=JSON.parse(readFileSync(resolve(base,'package.json')));if(meta.version!=='4.22.0')throw new Error('Unexpected TensorFlow.js version');const source=resolve(base,'dist',name);copyFileSync(source,resolve(vendor,name));files.push({name,size:statSync(source).size,sha256:createHash('sha256').update(readFileSync(source)).digest('hex')});}
copyFileSync(resolve(game,'ai/browser/LICENSE.tensorflow.txt'),resolve(vendor,'LICENSE.txt'));
copyFileSync(resolve(dirname(require.resolve('fflate')),'../LICENSE'),resolve(vendor,'LICENSE.fflate.txt'));
writeFileSync(resolve(vendor,'provenance.json'),JSON.stringify({version:'4.22.0',source:'https://github.com/tensorflow/tfjs',license:'Apache-2.0',files},null,2)+'\n');
const lock=JSON.parse(readFileSync(resolve(game,'model-service/models.lock.json')));
for(const record of lock.files){
  const source=resolve(game,'model-service/weights',record.name),target=resolve(models,record.name);
  if(!existsSync(source))continue;
  if(statSync(source).size!==record.size||createHash('sha256').update(readFileSync(source)).digest('hex')!==record.sha256)throw new Error('Invalid local KD checkpoint: '+record.name);
  if(!existsSync(target)||statSync(target).size!==record.size||createHash('sha256').update(readFileSync(target)).digest('hex')!==record.sha256)copyFileSync(source,target);
}
copyFileSync(resolve(game,'model-service/vendor/LICENSE.txt'),resolve(models,'LICENSE.txt'));
writeFileSync(resolve(models,'catalog.json'),JSON.stringify({...lock,tfjsVersion:'4.22.0',localWeights:lock.files.filter(f=>existsSync(resolve(models,f.name))).map(f=>f.name)},null,2)+'\n');
const {actionValueModel}=await import(pathToFileURL(resolve(game,'ai/value/weights.ts'))),{ORIGINAL_VALUE_ASSET}=await import(pathToFileURL(resolve(game,'ai/value/legacyAsset.ts'))),original=JSON.stringify(actionValueModel);
if(Buffer.byteLength(original)!==ORIGINAL_VALUE_ASSET.size||createHash('sha256').update(original).digest('hex')!==ORIGINAL_VALUE_ASSET.sha256)throw Error('Original value export metadata mismatch');
writeFileSync(resolve(models,ORIGINAL_VALUE_ASSET.name),original);
const {JOINT_ASSET}=await import(pathToFileURL(resolve(game,'ai/joint/asset.ts'))),joint=readFileSync(resolve(game,'ai/joint/candidate.json'));
if(joint.length!==JOINT_ASSET.size||createHash('sha256').update(joint).digest('hex')!==JOINT_ASSET.sha256)throw Error('Joint candidate export metadata mismatch');
writeFileSync(resolve(models,JOINT_ASSET.name),joint);
console.log('Prepared TensorFlow.js runtime and '+lock.files.filter(f=>existsSync(resolve(models,f.name))).length+' local KD checkpoints.');
