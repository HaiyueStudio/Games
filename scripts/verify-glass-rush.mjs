import { mkdirSync,writeFileSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import { decodePng } from '../../Engine/scripts/visual-regression/png.mjs';
import { createHash } from 'node:crypto';
import { verifyOpaqueBend, verifyBallHueShift } from './glass-rush-visual-policy.mjs';
const root=resolve(import.meta.dirname,'..');
const output=resolve(root,'.artifacts/glass-rush');mkdirSync(output,{recursive:true});
const portrait=process.argv.includes('--portrait');
const scene=process.argv.find(arg=>arg.startsWith('--scene='))?.slice(8);
const shape=process.argv.find(arg=>arg.startsWith('--shape='))?.slice(8);
if(scene&&!['menu','occlusion','occlusion-clear','ball-a','ball-b','tunnel','shapes','rotation','impact','impact-center','impact-camera','shatter','shatter-near'].includes(scene))throw Error(`Unknown Glass Rush scene: ${scene}`);
if(shape&&(scene!=='shapes'||!['pinwheel','chevrons','hexagons','trident','iris'].includes(shape)))throw Error(`Unknown Glass Rush showcase shape: ${shape}`);
const result=await runChromeWebGpuFixture({root,fixture:'games/glass-rush/index.html',query:{seed:42,verify:1,...(scene?{scene}:{}),...(shape?{shape}:{})},timeoutMs:60000,visualCapture:{viewportWidth:portrait?390:1280,viewportHeight:portrait?844:800},interact:async cdp=>{
 const evaluate=async expression=>{
  const response=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(response.result?.exceptionDetails)throw Error(JSON.stringify(response.result.exceptionDetails));return response.result?.result?.value;
 };
 if(scene){
  let occlusionPixels=0,ballColorShift=0;
  if(scene==='occlusion'||scene==='ball-a'){
   const reference=scene==='occlusion'?'occlusion-clear':'ball-b';
   await evaluate(`(async()=>{for(let i=0;i<200&&!window.__glassRush;i++){if(document.body?.dataset.renderStatus==='failed')throw Error(document.querySelector('#status').textContent);await new Promise(r=>setTimeout(r,100));}if(!window.__glassRush)throw Error('Occlusion target did not initialize');await new Promise(r=>setTimeout(r,350));})()`);
   const capture=async name=>{const png=Buffer.from((await cdp.call('Page.captureScreenshot',{format:'png'})).result.data,'base64');writeFileSync(resolve(output,name+'.png'),png);return decodePng(png);};
   const before=await capture(scene==='occlusion'?'occlusion-target':'ball-color-a');
   const url=await evaluate(`(()=>{const url=new URL(location.href);url.searchParams.set('scene',${JSON.stringify(reference)});return url.href})()`);
   await cdp.call('Page.navigate',{url});
   let ready=false;
   for(let i=0;i<200;i++){
    try{ready=await evaluate(`new URLSearchParams(location.search).get('scene')===${JSON.stringify(reference)}&&!!window.__glassRush&&document.body?.dataset.renderStatus==='ready'`);}catch(error){if(!/context|navigat/i.test(String(error)))throw error;}
    if(ready)break;await new Promise(r=>setTimeout(r,100));
   }
   if(!ready)throw Error('Occlusion reference did not initialize');
   await evaluate(`new Promise(r=>setTimeout(r,350))`);
   const after=await capture(scene==='occlusion'?'occlusion-baseline':'ball-color-b');
   if(scene==='occlusion')occlusionPixels=verifyOpaqueBend(before,after);else ballColorShift=verifyBallHueShift(before,after);
  }
  const response=await cdp.call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
   for(let i=0;i<200&&!window.__glassRush;i++){
    if(document.body?.dataset.renderStatus==='failed')throw Error(document.querySelector('#status').textContent);
    await new Promise(r=>setTimeout(r,100));
   }
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   await new Promise(r=>setTimeout(r,200));
   const checks={ready:true,separatedSphere:true,obstacleMeshes:true,iconHud:true};
   if(${JSON.stringify(scene)}==='occlusion'){checks.opaqueTunnel=true;checks.hiddenObstacleChangedPixels=${occlusionPixels};}
   if(${JSON.stringify(scene)}==='ball-a'){checks.visibleBallColorChange=true;checks.ballMeanChannelShift=${ballColorShift};}
   if(${JSON.stringify(scene)}==='rotation'){
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const before=window.__glassRush.round;await wait(400);const after=window.__glassRush.round;
    const elapsed=after.time-before.time;if(elapsed<.15)throw Error('Rotation fixture did not advance');
    for(const index of [0,1,2]){
     const first=before.gates[index],last=after.gates[index];
     const actual=Math.atan2(Math.sin(last.angle-first.angle),Math.cos(last.angle-first.angle));
     if(Math.abs(actual-first.spin*elapsed)>.0001)throw Error('Rendered rotor diverged from game rules');
    }
    const key=()=>window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyP',bubbles:true}));
    key();await wait(50);const paused=window.__glassRush.round;await wait(180);
    if(JSON.stringify(window.__glassRush.round)!==JSON.stringify(paused))throw Error('Paused rotor moved');
    key();await wait(180);if(window.__glassRush.round.time<=paused.time)throw Error('Rotor did not resume');
    checks.rotatingObstacle=true;checks.staticObstacle=true;checks.rotationPauseResume=true;
   }
   const snap=window.__glassRush;if(!snap||snap.rendering.ballTriangles<500||snap.rendering.meshes<4)throw Error('Separated geometry missing');
   if(snap.ui.remainingBalls!==Math.max(0,4-snap.round.hits))throw Error('Ball icon count differs from remaining collisions');
   if(snap.hud.nodes.some(n=>n.visible&&(/按住左半屏|方向键/.test(n.text))))throw Error('Bottom instructions still visible');
   if(${JSON.stringify(scene)}==='menu'&&(!snap.ui.overlay||!snap.hud.nodes.some(n=>n.id==='leaderboard-panel'&&n.visible)))throw Error('Ranking background missing');
   if(['impact','impact-center','impact-camera','shatter','shatter-near'].includes(${JSON.stringify(scene)})&&snap.rendering.impactCount!==1)throw Error('Impact geometry missing');
   if(${JSON.stringify(scene)}==='shapes'&&new Set(snap.round.gates.map(g=>g.shape)).size!==5)throw Error('New shape coverage missing');
   const node=document.createElement('script');node.id='result';node.type='application/json';node.dataset.status='passed';node.textContent=JSON.stringify({status:'passed',scene:${JSON.stringify(scene)},checks,snapshot:snap});document.body.append(node);
  })()`});
  if(response.result?.exceptionDetails)throw Error(JSON.stringify(response.result.exceptionDetails));
  return;
 }
 const response=await cdp.call('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression:`(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<200&&!window.__glassRush;i++){if(document.body?.dataset.renderStatus==='failed')throw Error(document.querySelector('#status').textContent);await wait(100);}
  if(!window.__glassRush)throw Error('Game did not initialize');
  const key=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code,bubbles:true}));
  key('keydown','Enter');await wait(500);const before=window.__glassRush.round.angle;
  const initialAudio=window.__glassRush.audio;
  if(!initialAudio.musicPlaying||initialAudio.backend.buffers!==3||initialAudio.backend.voices!==1||initialAudio.backend.error)throw Error('Background music did not start');
  key('keydown','ArrowRight');await wait(600);key('keyup','ArrowRight');const after=window.__glassRush.round.angle;
  if(Math.atan2(Math.sin(after-before),Math.cos(after-before))>-.5)throw Error('Right keyboard steering is reversed or inactive');
  key('keydown','KeyP');const paused=window.__glassRush.round.time;await wait(200);if(window.__glassRush.round.time!==paused)throw Error('Pause failed');
  if(window.__glassRush.audio.backend.state!=='suspended')throw Error('Audio did not pause');
  key('keydown','KeyP');await wait(900);
  if(!window.__glassRush.audio.musicPlaying||window.__glassRush.audio.played.music!==1)throw Error('Resume duplicated music');
  key('keydown','KeyM');await wait(150);if(!window.__glassRush.audio.musicMuted||window.__glassRush.audio.backend.voices!==0)throw Error('Music toggle did not stop BGM');
  key('keydown','KeyM');await wait(150);if(!window.__glassRush.audio.musicPlaying||window.__glassRush.audio.backend.voices!==1)throw Error('Unmute duplicated or lost music');
  const canvas=document.querySelector('canvas'),rect=canvas.getBoundingClientRect();
  const snap=window.__glassRush;
  if(!snap.hud.nodes.some(n=>n.type==='GuiButton'))throw Error('Engine GUI missing');
  const result={status:'passed',checks:{ready:true,heldSteering:true,correctDirection:true,pause:true,engineGui:true,music:true,audioPauseResume:true,mute:true},snapshot:snap,canvas:[rect.width,rect.height]};
  const node=document.createElement('script');node.id='result';node.type='application/json';node.dataset.status='passed';node.textContent=JSON.stringify(result);document.body.append(node);return result;
 })()`});
 if(response.result?.exceptionDetails)throw Error(JSON.stringify(response.result.exceptionDetails));
 const clickIcon=async name=>{
  const point=await evaluate(`(()=>{const r=window.__glassRush.ui.${name}Rect,s=window.__glassRush.hud,c=document.querySelector('canvas').getBoundingClientRect();return{x:c.left+(r.x+r.width/2)*c.width/s.width,y:c.top+(r.y+r.height/2)*c.height/s.height}})()`);
  await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  await evaluate('new Promise(r=>setTimeout(r,130))');
 };
 await clickIcon('pause');if(await evaluate(`window.__glassRush.round.phase!=='paused'||window.__glassRush.ui.pauseIcon!=='play'`))throw Error('Pause icon did not pause');
 await clickIcon('pause');if(await evaluate(`window.__glassRush.round.phase!=='playing'||window.__glassRush.ui.pauseIcon!=='pause'`))throw Error('Play icon did not resume');
 await clickIcon('music');if(await evaluate(`!window.__glassRush.audio.musicMuted||window.__glassRush.ui.musicIcon!=='music-off'`))throw Error('Music icon did not mute BGM');
 await clickIcon('music');if(await evaluate(`!window.__glassRush.audio.musicPlaying||window.__glassRush.ui.musicIcon!=='music'`))throw Error('Music icon did not restore BGM');
 await evaluate(`(()=>{const node=document.querySelector('#result'),r=JSON.parse(node.textContent);r.checks.iconControls=true;node.textContent=JSON.stringify(r)})()`);
 const before=await evaluate('window.__glassRush.round.angle');
 await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:80,y:400,id:1}]});
 await evaluate('new Promise(r=>setTimeout(r,450))');
 await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const after=await evaluate('window.__glassRush.round.angle');if(Math.atan2(Math.sin(after-before),Math.cos(after-before))<.4)throw Error('Left half-screen steering is reversed or inactive');
 await evaluate(`(()=>{const node=document.querySelector('#result'),r=JSON.parse(node.textContent);r.checks.heldTouch=true;r.snapshot=window.__glassRush;node.textContent=JSON.stringify(r)})()`);
 if(process.argv.includes('--full')) {
  const complete=await evaluate(`(async()=>{
   const wait=ms=>new Promise(r=>setTimeout(r,ms));let held='';
   for(let i=0;i<900 && window.__glassRush.round.phase!=='over';i++){
    const r=window.__glassRush.round,g=r.gates.find(g=>!g.passed);if(!g){await wait(50);continue;}
    const target=g.angle+(g.shape==='diamonds'?g.width*.65:0);
    const d=Math.atan2(Math.sin(target-r.angle),Math.cos(target-r.angle));const next=Math.abs(d)<.07?'':d>0?'ArrowLeft':'ArrowRight';
    if(held!==next){if(held)window.dispatchEvent(new KeyboardEvent('keyup',{code:held}));if(next)window.dispatchEvent(new KeyboardEvent('keydown',{code:next}));held=next;}
    await wait(50);
   }
   if(held)window.dispatchEvent(new KeyboardEvent('keyup',{code:held}));await wait(150);
   const r=window.__glassRush;if(r.round.phase!=='over'||r.round.hits!==4||r.records.length!==1)throw Error('Fourth collision / record integration failed');
   if(!r.round.impacts.length||!r.round.impacts.every(i=>i.gate.shattered))throw Error('Collided obstacles did not shatter');
   if(r.audio.played.impact!==3||r.audio.played.shatter!==1||r.audio.musicPlaying||r.audio.backend.error)throw Error('Collision sound transitions failed');
   if(r.ui.remainingBalls!==0)throw Error('Remaining ball icons did not clear');
   const node=document.querySelector('#result'),out=JSON.parse(node.textContent);out.checks.fourthCollision=true;out.checks.savedRecord=true;out.checks.fractureAudio=true;out.finished=r;node.textContent=JSON.stringify(out);
   await wait(3200);if(window.__glassRush.round.impacts.length)throw Error('Impact resources did not expire');
   if(window.__glassRush.audio.backend.voices!==0)throw Error('Game over retained audio voices');
   window.dispatchEvent(new KeyboardEvent('keydown',{code:'Enter'}));await wait(1500);
   if(window.__glassRush.round.hits||window.__glassRush.round.impacts.length||window.__glassRush.rendering.meshes>32)throw Error('Restart retained effects');
   if(!window.__glassRush.audio.musicPlaying||window.__glassRush.audio.backend.voices!==1)throw Error('Restart duplicated audio');return true;
  })()`);
  if(!complete)throw Error('Full gameplay verification did not finish');
 }
}});
const generation=JSON.parse(readFileSync(resolve(root,'games/glass-rush/assets/audio/generation.json'),'utf8'));
for(const asset of generation.assets){
 const served=result.httpProvenance.files.find(file=>file.sourcePath===`games/glass-rush/assets/audio/${asset.id}.wav`);
 if(!served||served.sha256!==asset.sha256||served.byteLength!==asset.bytes)throw Error(`Audio HTTP provenance mismatch: ${asset.id}`);
}
result.checks.audioAssetProvenance=true;
const uiAssets=JSON.parse(readFileSync(resolve(root,'games/manifest.json'),'utf8')).entries.find(entry=>entry.id==='glass-rush').assets.filter(path=>path.startsWith('glass-rush/assets/ui/'));
for(const asset of uiAssets){
 const bytes=readFileSync(resolve(root,'games',asset)),served=result.httpProvenance.files.find(file=>file.sourcePath===`games/${asset}`);
 if(!served||served.byteLength!==bytes.length||served.sha256!==createHash('sha256').update(bytes).digest('hex'))throw Error(`UI HTTP provenance mismatch: ${asset}`);
}
result.checks.uiAssetProvenance=true;
const stem=(scene??'browser')+(shape?'-'+shape:'')+(portrait?'-portrait':'');
writeFileSync(resolve(output,stem+'.png'),Buffer.from(result.visualCapture.pngBase64,'base64'));delete result.visualCapture.pngBase64;
writeFileSync(resolve(output,stem+'.json'),JSON.stringify(result,null,2));
if(result.visualCapture.darkRatio>.995)throw Error('Rendered screenshot is blank');
// Promote a thumbnail only after reviewing the captured image.
if(process.argv.includes('--update-thumbnail'))writeFileSync(resolve(root,'site/screenshots/glass-rush.png'),(await import('node:fs')).readFileSync(resolve(output,stem+'.png')));
console.log(JSON.stringify({status:result.status,checks:result.checks,screenshot:resolve(output,stem+'.png'),diagnostics:result.browserDiagnostics}));
