/** Transfer only a completed Worker job, in bounded CDP messages rather than one large trajectory object. */
export async function readOfflineResult(evaluate,{chunkChars=256*1024,maximumChars=256*1024*1024}={}){
  if(!Number.isSafeInteger(chunkChars)||chunkChars<1||chunkChars>1024*1024||!Number.isSafeInteger(maximumChars)||maximumChars<chunkChars)throw Error('Invalid offline transfer bounds');
  const meta=await evaluate('(()=>{globalThis.__offlineText=JSON.stringify(__offlinePending.result);return {length:__offlineText.length}})()');
  try{
    if(!Number.isSafeInteger(meta?.length)||meta.length<1||meta.length>maximumChars)throw Error('Offline trajectory result too large; use a smaller batch');const chunks=[];
    for(let start=0;start<meta.length;start+=chunkChars){const end=Math.min(meta.length,start+chunkChars),part=await evaluate(`__offlineText.slice(${start},${end})`);if(typeof part!=='string'||part.length!==end-start)throw Error('Incomplete offline trajectory transfer');chunks.push(part);}
    return JSON.parse(chunks.join(''));
  }finally{await evaluate('delete globalThis.__offlineText;true').catch(()=>{});}
}
