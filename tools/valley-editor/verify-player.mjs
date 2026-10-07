import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});
const result=await runChromeWebGpuFixture({root,fixture:'games/valley-of-light/index.html',query:{verify:1,map:'../../artifacts/valley-editor/exported-map.json'},timeoutMs:60000,visualCapture:{viewportWidth:1280,viewportHeight:800},interact:async cdp=>{
  async function snapshot(){const r=await cdp.call('Runtime.evaluate',{expression:'window.__valleyMapPlayer?.snapshot()',returnByValue:true});return r.result?.result?.value;}
  async function wait(test,label){const start=Date.now();while(Date.now()-start<20000){const s=await snapshot();if(test(s))return s;await new Promise(r=>setTimeout(r,80));}throw new Error(`${label}: ${JSON.stringify(await snapshot())}`);}
  async function click(id){const s=await snapshot(),[x,y]=s.targets[id];for(const type of ['mousePressed','mouseReleased'])await cdp.call('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mousePressed'?1:0,clickCount:1});}
  let s=await wait(s=>s?.model==='loaded','exported map loaded');assert.equal(s.map.id,'switch-garden');assert.equal(s.map.objects.find(o=>o.id==='switch-lift').trigger.actions[0].duration,.8);
  await click('exit');s=await snapshot();assert.equal(s.walking,false);
  await click('switch-lift');await wait(s=>s.busy,'first switch');await wait(s=>!s.busy&&!s.walking,'first animation');
  await click('switch-turn');await wait(s=>s.busy,'second switch');await wait(s=>!s.busy&&!s.walking,'second animation');
  await click('exit');s=await wait(s=>s.completed,'exit');assert.deepEqual(s.fired,['switch-lift','switch-turn']);assert.deepEqual(s.errors,[]);
}});
writeFileSync(resolve(output,'exported-map-player.png'),Buffer.from(result.visualCapture.pngBase64,'base64'));delete result.visualCapture.pngBase64;
writeFileSync(resolve(output,'player.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks:['loads the actual JSON exported by the editor','Engine GUI and animated glTF loaded','two switches connect the route to the exit'],output},null,2));
