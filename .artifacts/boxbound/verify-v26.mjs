import {runChromeWebGpuFixture} from '/Users/qingque/Desktop/HaiyueStudio/Engine/scripts/webgpu-gate/chrome-runner.mjs';
import {readFileSync,writeFileSync} from 'node:fs';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const root='/Users/qingque/Desktop/HaiyueStudio/Games',out=root+'/.artifacts/boxbound/';
for(const arg of process.argv.slice(2)){
 const [view,w='1440']=arg.split(':');const width=Number(w);
 const result=await runChromeWebGpuFixture({root,fixture:'games/boxbound/index.html',query:{verify:1,view},timeoutMs:120000,visualCapture:{viewportWidth:width,viewportHeight:width===390?844:1000,sampleWidth:32,sampleHeight:24}});
 if(result.visualCapture?.pngBase64){writeFileSync(out+`v26-${view}-${width}.png`,Buffer.from(result.visualCapture.pngBase64,'base64'));delete result.visualCapture.pngBase64;}
 result.bundleSha256=createHash('sha256').update(readFileSync(root+'/games/boxbound/bundle.js')).digest('hex');result.generatedAt=new Date().toISOString();
 writeFileSync(out+`v26-${view}-${width}.json`,JSON.stringify(result,null,2));
 console.log(view,width,result.status,result.cases?.length,result.errors);
 assert.equal(result.status,'passed');assert.equal(result.browserDiagnostics.unclassifiedFailureCount,0);assert.equal(result.cases.length,view.startsWith('camera-')?42:view.startsWith('recursive-crate')?44:['outer-render','outer-push'].includes(view)?40:view.startsWith('recursive-exit')?41:view.startsWith('exit-')?41:view.startsWith('actor-')?39:view==='box-identity'?45:view==='completion-return'?38:view==='completion-outro'?35:view==='outer-context'?36:view==='parabox-recursive'?51:view==='parabox-nested'?43:view.startsWith('parabox-')?42:['undo-step','undo-box','outer-wall'].includes(view)?37:view.startsWith('box-')?40:['transition','climb','descent'].includes(view)?30:29);
}
