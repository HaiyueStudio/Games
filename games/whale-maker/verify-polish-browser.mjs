import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runChromeWebGpuFixture} from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import {decodePng} from '../../../Engine/scripts/visual-regression/png.mjs';
const root=resolve(import.meta.dirname,'../..'),output=resolve(root,'artifacts/whale-maker-polish');mkdirSync(output,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const result=await runChromeWebGpuFixture({root,fixture:'games/whale-maker/index.html',query:{verify:1},timeoutMs:90000,disableDx12InfoCollection:true,visualCapture:{viewportWidth:1280,viewportHeight:860},interact:async cdp=>{
 const evaluate=async expression=>{const r=await cdp.call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.result?.exceptionDetails)throw Error(r.result.exceptionDetails.exception?.description??r.result.exceptionDetails.text);return r.result?.result?.value;};
 const capture=async name=>{const r=await cdp.call('Page.captureScreenshot',{format:'png'}),bytes=Buffer.from(r.result.data,'base64');writeFileSync(resolve(output,name),bytes);return bytes;};
 const click=async(x,y)=>{await cdp.call('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});await delay(100);};
 const advance=async(n,keys=[])=>{await evaluate(`(()=>{const g=window.__whaleMaker;g.clearControls();for(const k of ${JSON.stringify(keys)})g.keys.add(k);g.accumulator=0;g.paused=false;for(let n=0;n<${n};n++)g.tick(1/120);g.paused=true;})()`);await delay(65);};
 const load=async setup=>{await evaluate(`(()=>{const g=window.__whaleMaker,width=100,height=24,cells=Array(width*height).fill('.'),properties={},contents={};for(let y=15;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[14*width+95]='E';const put=(x,y,t)=>cells[y*width+x]=t;${setup};g.level={version:1,name:'机关回归',width,height,cells,properties,contents,spawn:[2,14.2]};g.state.phase='playing';g.restart();g.paused=true;g.system.disabled=true;g.camera=0;g.cameraY=4;g.state.grounded=true;g.state.items.forEach(i=>i.cooldown=0);g.state.invincible=0;g.character=0;})()`);await delay(80);};
 const changed=(a,b,rect)=>{const p=decodePng(a),q=decodePng(b);let n=0;for(let y=rect.y;y<rect.y+rect.height;y++)for(let x=rect.x;x<rect.x+rect.width;x++){const i=(y*p.width+x)*4;if(Math.abs(p.data[i]-q.data[i])+Math.abs(p.data[i+1]-q.data[i+1])+Math.abs(p.data[i+2]-q.data[i+2])>24)n++;}return n;};



 let ready=false;for(let n=0;n<180;n++){ready=await evaluate('document.body?.dataset.renderStatus==="passed"');if(ready)break;await delay(250);}assert.ok(ready);await delay(250);
 await load("put(10,14,'pow');put(18,14,'J');");
 await evaluate('Object.assign(window.__whaleMaker.state.player,{x:10.15,y:10,vy:0});window.__whaleMaker.state.grounded=false');await advance(120);
 assert.ok(await evaluate('window.__whaleMaker.state.items[0].alive'));assert.ok(await evaluate('window.__whaleMaker.state.grounded'));
 assert.deepEqual(await evaluate('(()=>{const r=window.__whaleMaker.scene.draws.find(d=>d.id==="gadgets:10").rect;return [r.width,r.height]})()'),[48,48]);await capture('pow-stand-full-tile.png');
 await evaluate('window.__whaleMaker.editing=true;window.__whaleMaker.editY=4');await delay(80);assert.deepEqual(await evaluate('(()=>{const r=window.__whaleMaker.scene.draws.find(d=>d.id==="gadgets:10").rect;return [r.width,r.height]})()'),[36,36]);await capture('editor-pow-full-tile.png');await evaluate('window.__whaleMaker.editing=false');
 await evaluate('Object.assign(window.__whaleMaker.state.player,{x:10.15,y:11,vy:0});window.__whaleMaker.state.grounded=false;window.__whaleMaker.state.coyote=0');await advance(12,['KeyS']);await capture('pow-ground-pound-windup.png');await advance(38,['KeyS']);assert.equal(await evaluate('window.__whaleMaker.state.items.length'),0);assert.equal(await evaluate('window.__whaleMaker.state.enemies[0].alive'),false);await capture('pow-ground-pound-blast.png');
 await load("put(10,8,'stone');put(11,8,'stone-body');put(10,9,'stone-body');put(11,9,'stone-body');put(10,14,'pow');");
 for(const [phase,frame]of [['idle',3],['alert',4],['charge',5]]){
  await evaluate(`window.__whaleMaker.state.stones[0].phase='${phase}'`);await delay(80);const rect=await evaluate(`window.__whaleMaker.scene.draws.find(d=>d.id==='adventure:${frame}').rect`);assert.equal(rect.width,96);assert.equal(rect.height,96);await capture(`stone-${phase}-correct-crop.png`);
 }
 await evaluate('window.__whaleMaker.state.stones[0].vy=18;window.__whaleMaker.state.player.x=13');await advance(30);assert.equal(await evaluate('window.__whaleMaker.state.stones.length'),0);assert.ok(await evaluate('window.__whaleMaker.state.effects.some(e=>e.kind==="stone")'));await capture('stone-pow-defeated.png');
 await load("put(10,12,'o');");assert.equal(await evaluate('window.__whaleMaker.frames.tokens.length'),12);
 for(const n of [0,3,6,9,11]){await evaluate(`window.__whaleMaker.state.time=${n}/24+.001`);await delay(80);assert.ok(await evaluate(`window.__whaleMaker.scene.draws.some(d=>d.id==='tokens:${n}')`));await capture(`coin-half-turn-${n}.png`);}
 const widths=await evaluate(`(()=>{const g=window.__whaleMaker,c=document.createElement('canvas');c.width=g.tokens.naturalWidth;c.height=g.tokens.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(g.tokens,0,0);return [0,6].map(n=>{const [u,v,w,h]=g.frames.tokens[n],x=Math.round(u*c.width),y=Math.round(v*c.height),width=Math.round(w*c.width),height=Math.round(h*c.height),data=ctx.getImageData(x,y,width,height).data;let lo=width,hi=0;for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++)if(data[(yy*width+xx)*4+3]>128){lo=Math.min(lo,xx);hi=Math.max(hi,xx);}return hi-lo;});})()`);assert.ok(widths[0]>widths[1]*2,widths);
 await evaluate('window.__whaleMaker.editing=true;window.__whaleMaker.system.disabled=false;window.__whaleMaker.selection.clear();window.__whaleMaker.editY=4');await delay(120);await capture('editor-far-background-choices.png');
 for(const [name,n]of [['castle',1],['mountains',2],['plains',3]]){
  await click(1155,378+n*76);assert.equal(await evaluate('window.__whaleMaker.level.backdrop'),name);assert.ok(await evaluate(`window.__whaleMaker.scene.draws.some(d=>d.id==='backdrops:${n-1}')`));await capture(`editor-${name}.png`);
  await evaluate('window.__whaleMaker.editing=false;window.__whaleMaker.restart();window.__whaleMaker.paused=true');await delay(100);assert.equal(await evaluate('window.__whaleMaker.state.level.backdrop'),name);await capture(`play-${name}.png`);
  await evaluate('window.__whaleMaker.editing=true;window.__whaleMaker.selection.clear()');await delay(80);
 }
 await evaluate(`(()=>{const n=document.createElement('pre');n.id='result';n.dataset.status='passed';n.textContent=JSON.stringify({status:'passed',checks:['pow-one-tile-standing','pow-ground-pound-only','pow-stone-defeat','stone-three-correct-crops','coin-twelve-half-turn-painted-views','coin-real-edge-perspective','editor-backdrop-three-choices','backdrop-persists-into-play','optimized-runtime-load']});n.hidden=true;document.body.append(n);})()`);
}});writeFileSync(resolve(output,'browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks:result.checks,diagnostics:result.browserDiagnostics}));
