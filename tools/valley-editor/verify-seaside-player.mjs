import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});
const result=await runChromeWebGpuFixture({root,fixture:'games/valley-of-light/index.html',query:{verify:1,map:'../../artifacts/valley-editor/seaside-export.json'},timeoutMs:60000,visualCapture:{viewportWidth:1280,viewportHeight:800},interact:async cdp=>{
  async function snapshot(){const r=await cdp.call('Runtime.evaluate',{expression:'window.__valleyMapPlayer?.snapshot()',returnByValue:true});return r.result?.result?.value;}
  async function wait(test,label){const start=Date.now();while(Date.now()-start<18000){const s=await snapshot();if(test(s))return s;await new Promise(r=>setTimeout(r,80));}throw new Error(`${label}: ${JSON.stringify(await snapshot())}`);}
  let s=await wait(s=>s?.model==='loaded','loaded sea map');assert.equal(s.map.id,'seaside-garden');assert.equal(s.map.objects.filter(o=>o.type===12).length,4);assert.ok(s.water.surfaces[0].gpu);
  async function turn(degrees){
    const before=await snapshot(),f=before.wheelFrames.wheel,[cx,cy]=f.center,radius=Math.hypot(...f.right)*.76,start=Math.atan2(f.right[1],f.right[0]);
    async function touch(type,angle){await cdp.call('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:cx+Math.cos(angle)*radius,y:cy+Math.sin(angle)*radius,id:1,radiusX:2,radiusY:2,force:1}]});}
    const steps=Math.ceil(Math.abs(degrees)/5);await touch('touchStart',start);
    for(let i=1;i<=steps;i++){await touch('touchMove',start+f.direction*degrees*Math.PI/180*i/steps);await new Promise(r=>setTimeout(r,15));}
    await touch('touchEnd',start);const target=(before.poses.mechanisms.wheel??0)+degrees;await wait(s=>s.poses.mechanisms.wheel===target,`touch turn to ${target}`);
  }
  await turn(-450);await turn(720);
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.call('Input.dispatchMouseEvent',{type,x:1196,y:742,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1});
  s=await wait(s=>s.completed,'Engine GUI go to exit');assert.deepEqual(s.errors,[]);
}});
writeFileSync(resolve(output,'seaside-player.png'),Buffer.from(result.visualCapture.pngBase64,'base64'));delete result.visualCapture.pngBase64;writeFileSync(resolve(output,'seaside-player.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks:['exported sea map and attached columns load in game','touch turns -450 degrees, releases, then reverses for another 720 degrees','Engine GUI reaches the newly connected exit'],output},null,2));
