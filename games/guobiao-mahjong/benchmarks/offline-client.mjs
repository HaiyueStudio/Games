const arena=new Worker(new URL('./offline.worker.js',import.meta.url),{type:'module',name:'mcr-offline-arena'}),pending=new Map();let serial=0,model=null;
const fail=error=>{for(const p of pending.values())p.reject(error);pending.clear()};
arena.onmessage=({data})=>{
  if(data.kind==='progress'){window.mahjongOffline.progress.push(data);return;}
  if(data.kind==='model-dispose'){model?.terminate();model=null;return;}
  if(data.kind==='model-job'){
    if(!model){model=new Worker(new URL('../ai/tfjs.worker.js',import.meta.url),{name:'mcr-offline-kd'});model.onmessage=({data:reply})=>arena.postMessage({kind:'model-reply',reply});model.onerror=e=>fail(Error(e.message));}model.postMessage(data.job);return;
  }
  const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(Error(data.error)):p.resolve(data.result);
};
arena.onerror=e=>fail(Error(e.message));
window.mahjongOffline={progress:[],call(data){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});arena.postMessage({...data,id})})}};
document.body.dataset.renderStatus='ready';
window.addEventListener('pagehide',()=>{model?.terminate();arena.terminate();fail(Error('Offline arena closed'))},{once:true});
