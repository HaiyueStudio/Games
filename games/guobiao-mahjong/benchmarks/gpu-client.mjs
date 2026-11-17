const worker=new Worker(new URL('./gpu-arena.worker.js',import.meta.url),{type:'module',name:'mcr-gpu-arena'}),pending=new Map();let serial=0;
let model=null;
worker.onmessage=({data})=>{
  if(data.kind==='model-dispose'){model?.terminate();model=null;return}
  if(data.kind==='model-job'){
    if(!model){model=new Worker(new URL('../ai/tfjs.worker.js',import.meta.url),{name:'mcr-arena-tfjs'});model.onmessage=({data:reply})=>worker.postMessage({kind:'model-reply',reply});model.onerror=e=>{for(const p of pending.values())p.reject(Error(e.message));pending.clear()};}
    model.postMessage(data.job);return;
  }
  const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result)
};
worker.onerror=e=>{for(const p of pending.values())p.reject(Error(e.message));pending.clear()};
window.mahjongBenchmark={call(data){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});worker.postMessage({...data,id})})}};
document.body.dataset.renderStatus='ready';
window.addEventListener('pagehide',()=>{model?.terminate();worker.terminate();for(const p of pending.values())p.reject(Error('Arena closed'));pending.clear()},{once:true});
