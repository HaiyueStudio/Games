import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runChromeWebGpuFixture} from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=resolve(import.meta.dirname,'..'),output=resolve(root,'.artifacts/game-os');mkdirSync(output,{recursive:true});
const portrait=process.argv.includes('--portrait');
const direct=process.argv.includes('--direct');
const result=await runChromeWebGpuFixture({root,fixture:'site/index.html',mounts:[{prefix:'/site/games',directory:resolve(root,'games')}],query:{verify:1,...(direct?{game:'glass-rush'}:{})},timeoutMs:45000,visualCapture:{viewportWidth:portrait?390:1440,viewportHeight:portrait?844:960},interact:async cdp=>{
  const evaluate=async expression=>{const response=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.result?.exceptionDetails)throw Error(JSON.stringify(response.result.exceptionDetails));return response.result?.result?.value;};
  if(direct)await evaluate(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));for(let i=0;i<200&&!window.__gameOS?.ready;i++)await wait(100);await wait(400);if(!document.querySelector('#game-dialog').open||window.__gameOS.frames!==0||window.__gameOS.running)throw Error('Direct game link rendered the launcher');document.querySelector('#player-close').click();await wait(400);})()`);
  await evaluate(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    for(let i=0;i<200&&!document.body?.dataset.osReady;i++){if(document.body?.dataset.osError)throw Error('Engine desktop failed');await wait(100);}
    if(!window.__gameOS?.ready)throw Error('Desktop did not initialize');await wait(700);
    if(window.__gameOS.nodes<80||window.__gameOS.images<3)throw Error('Engine GUI or covers missing');
    const before=window.__gameOS.frames;await wait(250);if(window.__gameOS.frames<=before)throw Error('Home rendering is not advancing');
    const input=document.querySelector('#game-search');input.value='玻璃';input.dispatchEvent(new Event('input',{bubbles:true}));await wait(150);
    if(document.querySelectorAll('.card-visual').length!==1)throw Error('Search failed');
    document.querySelector('#favorite-toggle').click();document.querySelector('[data-view="favorites"]').click();await wait(100);
    if(!document.querySelector('.card-visual[data-game-id="glass-rush"]'))throw Error('Favorites failed');
    document.querySelector('[data-view="all"]').click();await wait(300);
  })()`);
  const firstWallpaper=(await cdp.call('Page.captureScreenshot',{format:'png'})).result.data;
  await evaluate('new Promise(r=>setTimeout(r,400))');
  const nextWallpaper=(await cdp.call('Page.captureScreenshot',{format:'png'})).result.data;
  if(firstWallpaper===nextWallpaper)throw Error('Shader wallpaper did not change pixels');
  // Native pointer input still lands on the accessible controls underneath the GUI.
  const target=await evaluate(`(()=>{const r=document.querySelector('.card-visual').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+Math.min(30,r.height/2)}})()`);
  await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',...target,button:'left',clickCount:1});
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',...target,button:'left',clickCount:1});
  const checks=await evaluate(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(400);
    if(!document.querySelector('#game-dialog').open||window.__gameOS.running)throw Error('Opening game did not pause renderer');
    const stopped=window.__gameOS.frames;await wait(400);if(window.__gameOS.frames!==stopped)throw Error('Launcher rendered behind game');
    document.querySelector('.card-visual[data-game-id="2048"]').click();await wait(500);if(window.__gameOS.running||window.__gameOS.frames!==stopped)throw Error('Game switching resumed the desktop');
    document.querySelector('#player-close').click();await wait(400);if(!window.__gameOS.running||window.__gameOS.frames<=stopped)throw Error('Returning did not resume renderer');
    for(let i=0;i<2;i++){document.querySelector('#spotlight-play').click();await wait(100);if(window.__gameOS.running)throw Error('Repeat launch did not pause');document.querySelector('#player-close').click();await wait(100);}
    document.querySelector('.card-visual[data-game-id="glass-rush"]').focus();await wait(500);
    return {engineGui:true,shaderAnimated:true,search:true,favorites:true,nativePointer:true,pausedInGame:true,pausedDuringSwitch:true,resumedOnReturn:true,repeatedLaunch:true};
  })()`);
  if(direct)checks.directGameStartsPaused=true;
  await evaluate(`(()=>{const node=document.createElement('script');node.id='result';node.type='application/json';node.dataset.status='passed';node.textContent=JSON.stringify({status:'passed',checks:${JSON.stringify(checks)},snapshot:window.__gameOS});document.body.append(node)})()`);
}});
const stem=direct?'direct':portrait?'portrait':'desktop';writeFileSync(resolve(output,stem+'.png'),Buffer.from(result.visualCapture.pngBase64,'base64'));delete result.visualCapture.pngBase64;
writeFileSync(resolve(output,stem+'.json'),JSON.stringify(result,null,2));if(result.visualCapture.darkRatio>.995)throw Error('Desktop screenshot is blank');
console.log(JSON.stringify({status:result.status,checks:result.checks,snapshot:result.snapshot,screenshot:resolve(output,stem+'.png'),diagnostics:result.browserDiagnostics}));
