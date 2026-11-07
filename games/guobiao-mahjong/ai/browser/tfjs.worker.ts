import type * as Tensorflow from '@tensorflow/tfjs';
import {BROWSER_MODELS,browserModel,KD_WEIGHTS,WEIGHTS_REVISION,validBackend,type BrowserBackend} from './catalog';
import {encodeObservation,choosePolicyAction} from './features';
import {checkpointArrays,decodeModelArray} from './weights';
import {initialBrowserInfo,type BrowserInfo,type BrowserJob,type BrowserReply} from './protocol';
import {policyProbabilities} from './policy';
import {enhancePolicy} from '../hybrid';
import {createScorer} from '../../rules/scorer';
import {lastTileAlternative} from '../lastTileDefense';
import {ORIGINAL_VALUE_ASSET} from '../value/legacyAsset';
import {validateActionValueModel,type ActionValueModel} from '../value/model';
import {JOINT_ASSET} from '../joint/asset';
import {decodeJointBundle,type PackedJointBundle} from '../joint/packed';
import {JointPolicy,type JointBundle} from '../joint/model';
import {jointRandom} from '../joint/random';

declare const tf:typeof Tensorflow&{wasm:{setWasmPaths(path:string):void;setThreadsCount(count:number):void}};
const scope=globalThis as unknown as {importScripts(...urls:string[]):void;location:{href:string};navigator:{gpu?:unknown};onmessage:((e:MessageEvent<BrowserJob|{kind:'cancel';id:number}>)=>void)|null;postMessage(data:BrowserReply):void};
const models=new Map<number,Tensorflow.NamedTensorMap>();
const cancelled=new Set<number>(),controllers=new Map<number,AbortController>();
const queued=new Set<number>();
let info:BrowserInfo=initialBrowserInfo('webgpu'),backendPromise:Promise<void>|null=null,queue=Promise.resolve();
let scorerPromise:ReturnType<typeof createScorer>|null=null;
let originalValueModel:ActionValueModel|undefined;
let jointBundle:JointBundle|undefined,jointPolicy:JointPolicy|undefined;
async function loadJoint(id:number,signal:AbortSignal){
  if(jointBundle)return;publish(id,'正在加载联合候选');
  const url=new URL('../assets/models/'+JOINT_ASSET.name,scope.location.href);url.searchParams.set('sha256',JOINT_ASSET.sha256);
  const response=await fetch(url,{signal,cache:'force-cache'});if(!response.ok)throw Error('Joint model HTTP '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==JOINT_ASSET.size||await checksum(bytes)!==JOINT_ASSET.sha256)throw Error('Joint model checksum mismatch');check(id);
  jointBundle=decodeJointBundle(JSON.parse(new TextDecoder().decode(bytes)) as PackedJointBundle);jointPolicy=new JointPolicy();info={...info,jointModelLoaded:true,jointModelBytes:bytes.length};
}
async function loadOriginalValue(id:number,signal:AbortSignal){
  if(originalValueModel)return;publish(id,'正在加载原版行动价值');
  const url=new URL('../assets/models/'+ORIGINAL_VALUE_ASSET.name,scope.location.href);url.searchParams.set('sha256',ORIGINAL_VALUE_ASSET.sha256);
  const response=await fetch(url,{signal,cache:'force-cache'});if(!response.ok)throw Error('Original value model HTTP '+response.status);
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length!==ORIGINAL_VALUE_ASSET.size||await checksum(bytes)!==ORIGINAL_VALUE_ASSET.sha256)throw Error('Original value model checksum mismatch');check(id);
  const model=JSON.parse(new TextDecoder().decode(bytes)) as ActionValueModel;validateActionValueModel(model);originalValueModel=model;info={...info,originalValueLoaded:true};
}
async function rules(signal:AbortSignal){const pending=scorerPromise??=fetch(new URL('../assets/mcr.wasm',scope.location.href),{signal}).then(async r=>{if(!r.ok)throw Error('MCR rules HTTP '+r.status);return createScorer(await r.arrayBuffer())});try{return await pending}catch(e){if(scorerPromise===pending)scorerPromise=null;throw e;}}
const abort=()=>new DOMException('模型任务已取消','AbortError');
function check(id:number){if(cancelled.has(id))throw abort();}
function publish(id:number,message:string,state:BrowserInfo['state']='loading'){
  if(cancelled.has(id))return;
  info={...info,message,state,loadedModels:[...models.keys()].sort()};scope.postMessage({id,kind:'progress',info:{...info}});
}
async function initialize(backend:BrowserBackend,id:number){
  if(backendPromise)return backendPromise;
  info=initialBrowserInfo(backend);
  backendPromise=(async()=>{
    publish(id,'正在启动浏览器模型');
    scope.importScripts(new URL('./tfjs/tf.min.js',scope.location.href).href);
    let actual:BrowserBackend=backend;
    if(backend==='webgpu'){
      try{
        if(!scope.navigator.gpu)throw new Error('WebGPU unavailable');
        scope.importScripts(new URL('./tfjs/tf-backend-webgpu.min.js',scope.location.href).href);
        if(!await tf.setBackend('webgpu'))throw new Error('WebGPU initialization failed');await tf.ready();
      }catch{
        actual='wasm';info={...info,fallback:true};publish(id,'WebGPU 不可用，正在使用 WASM');
      }
    }
    if(actual==='wasm'){
      scope.importScripts(new URL('./tfjs/tf-backend-wasm.min.js',scope.location.href).href);
      tf.wasm.setWasmPaths(new URL('./tfjs/',scope.location.href).href);tf.wasm.setThreadsCount(1);
      if(!await tf.setBackend('wasm'))throw new Error('WASM 初始化失败');await tf.ready();
    }
    info={...info,actualBackend:actual};
  })();
  try{await backendPromise;}catch(e){backendPromise=null;throw e;}
}
async function checksum(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer as ArrayBuffer)),n=>n.toString(16).padStart(2,'0')).join('');}
async function weightBytes(index:number,id:number,signal:AbortSignal){
  const record=KD_WEIGHTS[index];if(!record)throw new Error('未知模型权重');
  const local=new URL('../assets/models/'+record.name,scope.location.href);local.searchParams.set('sha256',record.sha256);
  let cache:Cache|null=null;
  try{cache=await caches.open('haiyue-mcr-kd-'+WEIGHTS_REVISION);}catch{/* Private browsing may disable persistent caches. */}
  const valid=async(bytes:Uint8Array)=>bytes.length===record.size&&await checksum(bytes)===record.sha256;
  const cached=await cache?.match(local.href).catch(()=>undefined);
  if(cached){const bytes=new Uint8Array(await cached.arrayBuffer());if(await valid(bytes)){info={...info,cacheHits:info.cacheHits+1};return bytes;}await cache?.delete(local.href);}
  check(id);let response=await fetch(local,{signal,cache:'force-cache'});
  if(response.status===404)response=await fetch('https://huggingface.co/Dannibal/ijcai-mahjong-ckpts-2026/resolve/'+WEIGHTS_REVISION+'/champion/'+record.name,{signal,cache:'force-cache'});
  if(!response.ok)throw new Error('模型权重下载失败 HTTP '+response.status);
  const bytes=new Uint8Array(record.size),reader=response.body?.getReader();let offset=0,last=-1;
  if(!reader)throw new Error('模型权重响应为空');
  try{
    while(true){check(id);const {value,done}=await reader.read();if(done)break;if(offset+value.length>record.size)throw new Error('模型权重大小不符');bytes.set(value,offset);offset+=value.length;info={...info,networkBytes:info.networkBytes+value.length};const p=Math.floor(offset/record.size*20)*5;if(p!==last){last=p;publish(id,'正在下载 KD '+index+' · '+p+'%');}}
  }finally{reader.releaseLock();}
  publish(id,'正在校验 KD '+index);if(!await valid(bytes))throw new Error('模型权重校验失败');check(id);
  try{await cache?.put(local.href,new Response(bytes.buffer as ArrayBuffer,{headers:{'Content-Type':'application/octet-stream'}}));}catch{/* In-memory inference still works when the cache quota is full. */}
  return bytes;
}
function forward(weights:Tensorflow.NamedTensorMap,features:Float32Array,batch=1){
  return tf.tidy(()=>{
    const conv=(x:Tensorflow.Tensor4D,name:string,relu:boolean)=>tf.fused.conv2d({x,filter:weights[name+'.weight'] as Tensorflow.Tensor4D,bias:weights[name+'.bias'] as Tensorflow.Tensor1D,strides:1,pad:'same',activation:relu?'relu':'linear'});
    let x=conv(tf.tensor4d(features,[batch,38,4,9]).transpose([0,2,3,1]),'stem',true);
    for(let i=0;i<40;i++)x=x.add(conv(conv(x,'body.'+i+'.c1',true),'body.'+i+'.c2',false)).relu();
    // The original dense head flattens C,H,W, even though convolutions run in NHWC.
    const f=x.transpose([0,3,1,2]).reshape([batch,4608]) as Tensorflow.Tensor2D;
    const h=tf.fused.matMul({a:f,b:weights['foot.1.weight'] as Tensorflow.Tensor2D,bias:weights['foot.1.bias'] as Tensorflow.Tensor1D,activation:'relu'});
    return tf.matMul(h,weights['foot.3.weight'] as Tensorflow.Tensor2D).add(weights['foot.3.bias']!).reshape([batch,235]);
  });
}
async function load(index:number,id:number,signal:AbortSignal){
  const cached=models.get(index);if(cached)return cached;
  const bytes=await weightBytes(index,id,signal);check(id);publish(id,'正在加载 KD '+index);
  const arrays=checkpointArrays(bytes),weights:Tensorflow.NamedTensorMap={};let count=0;
  try{
    for(const [name,array] of arrays){check(id);const decoded=decodeModelArray(array);weights[name]=tf.tensor(decoded.values,decoded.shape,'float32');if(++count%8===0)await new Promise(r=>setTimeout(r,0));}
    publish(id,'正在预热 KD '+index);const warm=forward(weights,new Float32Array(38*36));try{await warm.data();}finally{warm.dispose();}check(id);
    models.set(index,weights);return weights;
  }catch(e){Object.values(weights).forEach(t=>t.dispose());throw e;}
}
async function execute(job:BrowserJob){
  const {id}=job,controller=new AbortController();controllers.set(id,controller);
  try{
    check(id);if(!validBackend(job.backend))throw new Error('无效的推理后端');
    const selected=job.models.map(name=>{const m=browserModel(name);if(!m)throw new Error('未知浏览器模型');return m;});
    if(!selected.length||selected.length>BROWSER_MODELS.length)throw new Error('无效的模型选择');
    if(job.enhancement&&!['safe','ready','search','learned','value','distilled','joint'].includes(job.enhancement))throw Error('Unknown enhancement');
    const configured=selected[0],enhancement=job.enhancement??(selected.length===1&&configured&&'enhancement' in configured?configured.enhancement:undefined);
    const encoded=job.kind==='decide'&&job.observation?encodeObservation(job.observation):null;
    await initialize(job.backend,id);check(id);
    info={...info,enhancement:enhancement??null,enhancementChanged:false,decisionReason:null,analysisCalls:0,searchMs:null};
    for(const index of new Set(selected.flatMap(m=>[...m.members])))await load(index,id,controller.signal);
    if(enhancement==='value'||job.kind==='prepare'&&selected.some(m=>'enhancement' in m&&m.enhancement==='value'))await loadOriginalValue(id,controller.signal);
    if(enhancement==='joint'||job.kind==='prepare'&&selected.some(m=>'enhancement' in m&&m.enhancement==='joint'))await loadJoint(id,controller.signal);
    if(enhancement&&enhancement!=='safe')await rules(controller.signal);check(id);
    if(job.kind==='prepare'){
      if(enhancement!=='value'&&!selected.some(m=>'enhancement' in m&&m.enhancement==='value')){originalValueModel=undefined;info={...info,originalValueLoaded:false};}
      if(enhancement!=='joint'&&!selected.some(m=>'enhancement' in m&&m.enhancement==='joint')){jointBundle=undefined;jointPolicy=undefined;info={...info,jointModelLoaded:false,jointModelBytes:0};}
      const keep=new Set<number>(selected.flatMap(m=>[...m.members]));
      for(const [index,weights] of models)if(!keep.has(index)){Object.values(weights).forEach(t=>t.dispose());models.delete(index);}
    }
    let action,revision,policy:number[]|undefined,priorPolicy:number[]|undefined,rows:BrowserReply['rows'];
    if(job.kind==='policies'){
      if(selected.length!==1||enhancement||!job.parameters||!job.observations?.length||job.observations.length>16)throw Error('Invalid raw policy batch');
      const entries=job.observations.map(encodeObservation),joined=new Float32Array(entries.length*38*36),outputs:Float32Array[]=[];entries.forEach((e,i)=>joined.set(e.features,i*38*36));
      const begin=performance.now();for(const member of selected[0]!.members){check(id);const out=forward(models.get(member)!,joined,entries.length);try{outputs.push(new Float32Array(await out.data()));}finally{out.dispose();}}
      check(id);info={...info,inferenceMs:performance.now()-begin};
      rows=entries.map((e,i)=>{const o=job.observations![i]!,logits=outputs.map(v=>v.subarray(i*235,(i+1)*235)),index=choosePolicyAction(logits,e.indices,o,job.parameters!);return {action:o.legalActions[index]!,revision:o.revision,probabilities:Array.from(policyProbabilities(logits,e.indices))}});
    }
    if(job.kind==='decide'){
      if(!encoded||!job.observation||!job.parameters||selected.length!==1)throw new Error('无效的模型决策请求');
      publish(id,'KD 正在计算 · '+info.actualBackend,'running');const started=performance.now(),outputs:Float32Array[]=[];
      for(const index of selected[0]!.members){check(id);const out=forward(models.get(index)!,encoded.features);try{outputs.push(new Float32Array(await out.data()));}finally{out.dispose();}}
      check(id);let selectedIndex=choosePolicyAction(outputs,encoded.indices,job.observation,enhancement==='joint'?{...job.parameters,temperature:0}:job.parameters);revision=job.observation.revision;
      info={...info,inferenceMs:performance.now()-started};
      if(enhancement==='safe'){
        const begin=performance.now(),original=selectedIndex,hu=job.observation.legalActions.findIndex(a=>a.type==='hu');
        const safe=hu<0?lastTileAlternative(job.observation,job.observation.legalActions[selectedIndex]!):null;
        if(hu>=0)selectedIndex=hu;else if(safe)selectedIndex=job.observation.legalActions.findIndex(a=>a.type==='discard'&&a.tile===safe.tile);
        info={...info,enhancementChanged:selectedIndex!==original,decisionReason:hu>=0?'legal-win':safe?'last-tile-safe':'model',searchMs:performance.now()-begin};
      }
      if(enhancement&&enhancement!=='safe'||job.includePolicy)policy=Array.from(policyProbabilities(outputs,encoded.indices));
      if(enhancement==='joint'){
        if(job.includePolicy)priorPolicy=[...policy!];
        if(!jointBundle||!jointPolicy)throw Error('Joint model not loaded');const begin=performance.now(),d=jointPolicy.decide(job.observation,policy!,selectedIndex,await rules(controller.signal),jointBundle,job.parameters.temperature>0?jointRandom(job.parameters.seed,job.observation):undefined,job.parameters.temperature||1);selectedIndex=d.index;
        if(job.includePolicy){policy=Array<number>(job.observation.legalActions.length).fill(0);if(d.evaluation)d.evaluation.plans.forEach((p,i)=>policy![p.index]!+=d.evaluation!.probabilities[i]!);else policy[selectedIndex]=1;}
        info={...info,enhancementChanged:d.changed,decisionReason:d.reason,analysisCalls:d.analysisCalls,searchMs:performance.now()-begin};
      }else if(enhancement&&enhancement!=='safe'){const begin=performance.now(),mode=['learned','value','distilled'].includes(enhancement)&&job.parameters.temperature!==0?'safe':enhancement,d=enhancePolicy(job.observation,policy!,selectedIndex,await rules(controller.signal),mode,originalValueModel);selectedIndex=d.index;info={...info,enhancementChanged:d.changed,decisionReason:mode!==enhancement&&!d.changed?'temperature-prior':d.reason,analysisCalls:d.analysisCalls,searchMs:performance.now()-begin};}
      action=job.observation.legalActions[selectedIndex]!;
    }
    const memory=tf.memory();info={...info,state:'ready',loadedModels:[...models.keys()].sort(),numTensors:memory.numTensors,tensorBytes:memory.numBytes,message:(info.fallback?'WebGPU 不可用，已使用 WASM':'浏览器模型 · '+info.actualBackend)+' · 已就绪'};
    scope.postMessage({id,kind:'result',info:{...info},...(action?{action,revision:revision!}:{}),...(job.includePolicy&&policy?{policy}:{}),...(priorPolicy?{priorPolicy}:{}),...(rows?{rows}:{})});
  }catch(e){
    if(!cancelled.has(id)){info={...info,state:'failed',message:String(e)};scope.postMessage({id,kind:'error',error:String(e),info:{...info}});}
  }finally{controllers.delete(id);cancelled.delete(id);queued.delete(id);}
}
scope.onmessage=({data})=>{
  if(data.kind==='cancel'){if(queued.has(data.id)){cancelled.add(data.id);controllers.get(data.id)?.abort();}return;}
  queued.add(data.id);
  queue=queue.then(()=>execute(data)).catch(()=>{});
};
