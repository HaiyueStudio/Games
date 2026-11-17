/** Independent compiler processes bound memory while retaining every required output check. */
export function workspaceBuildStages(id){
  if(!/^[a-z0-9-]+$/.test(id))throw Error('Invalid build workspace');
  if(id==='guobiao-mahjong')return [
    ['games/guobiao-mahjong/ai/mahjong.worker.ts','games/guobiao-mahjong/ai/mahjong.worker.js'],
    ['games/guobiao-mahjong/ai/browser/tfjs.worker.ts','games/guobiao-mahjong/ai/tfjs.worker.js'],
    ['games/guobiao-mahjong/ai/coach.worker.ts','games/guobiao-mahjong/ai/coach.worker.js'],
    ['games/guobiao-mahjong/main.ts','games/guobiao-mahjong/bundle.js'],
  ].map(([entry,output])=>({entry,outputs:[output]}));
  return [{entry:null,outputs:[id==='platform'?'site':id==='gravity-maze'?'games/gravity-maze/dist':`games/${id}/bundle.js`]}];
}
