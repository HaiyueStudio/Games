import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(root,'artifacts/valley-editor');mkdirSync(output,{recursive:true});
const checks=[];
const result=await runChromeWebGpuFixture({root,fixture:'tools/valley-editor/index.html',query:{verify:1,demo:'sea'},timeoutMs:120000,visualCapture:{viewportWidth:1536,viewportHeight:960},interact:async cdp=>{
  async function evaluate(expression){const r=await cdp.call('Runtime.evaluate',{expression,returnByValue:true});if(r.result?.exceptionDetails)throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result?.result?.value;}
  const pause=(ms=100)=>new Promise(r=>setTimeout(r,ms)),snapshot=()=>evaluate('window.__valleyEditor?.snapshot()');
  async function wait(predicate,label){for(let i=0;i<180;i++){const s=await snapshot();if(predicate(s))return s;await pause();}throw new Error(label);}
  async function mouse(type,p,held=false){await cdp.call('Input.dispatchMouseEvent',{type,x:p[0],y:p[1],button:type==='mouseMoved'&&!held?'none':'left',buttons:held?1:0,clickCount:1});await pause(60);}
  async function point(p){await mouse('mouseMoved',p);await mouse('mousePressed',p,true);await mouse('mouseReleased',p);}
  async function click(selector){const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await point(p);}
  async function capture(name){const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(output,name),Buffer.from(r.result.data,'base64'));}
  async function key(key,code=key,modifiers=0){await cdp.call('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,windowsVirtualKeyCode:({Escape:27,Tab:9,Backspace:8,ArrowRight:39,ArrowLeft:37,Enter:13}[key]??key.toUpperCase().charCodeAt(0))});await cdp.call('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers,windowsVirtualKeyCode:({Escape:27,Tab:9,Backspace:8,ArrowRight:39,ArrowLeft:37,Enter:13}[key]??key.toUpperCase().charCodeAt(0))});await pause();}
  const layout=()=>evaluate(`(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};return {splits:[...document.querySelectorAll('hy-split')].map(e=>({id:e.id,ratio:e.ratio,box:box(e)})),left:box(document.querySelector('.left')),right:box(document.querySelector('.right')),inspector:box(document.querySelector('#inspector')),hierarchy:box(document.querySelector('#hierarchy')),canvas:box(document.querySelector('#canvas'))}})()`);
  async function bar(id){return evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)}).shadowRoot.querySelector('[role="separator"]');const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);}
  async function drag(id,dx,dy){const from=await bar(id);await mouse('mouseMoved',from);await mouse('mousePressed',from,true);for(let i=1;i<=6;i++)await mouse('mouseMoved',[from[0]+dx*i/6,from[1]+dy*i/6],true);await mouse('mouseReleased',[from[0]+dx,from[1]+dy]);}
  async function input(id,value){await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.scrollIntoView({block:'nearest'});e.focus();e.select();})()`);await cdp.call('Input.insertText',{text:value});await key('Tab');}
  async function choose(id,value){await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)}),native=e.shadowRoot.querySelector('select');native.value=${JSON.stringify(value)};native.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause();}
  async function selectNode(id){const p=await evaluate(`(()=>{const tree=document.getElementById('object-list');tree.reveal(${JSON.stringify(id)});const e=tree.shadowRoot.querySelector('[data-id="'+${JSON.stringify(id)}+'"]');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return [r.x+r.width*.55,r.y+r.height/2]})()`);await point(p);}

  let s=await wait(s=>s?.map&&s.model==='loaded','editor ready');const initial=s.json,history=s.history;
  assert.deepEqual(await evaluate("['hy-button','hy-input','hy-select','hy-dialog','hy-split','hy-tree','hy-context-menu','hy-tabs'].map(tag=>!!customElements.get(tag))"),[true,true,true,true,true,true,true,true]);
  assert.equal(await evaluate("document.querySelectorAll('button,select,input:not([type=file])').length"),0,'visible controls use library components');
  const before=await layout();await drag('layout-left',100,0);const afterLeft=await layout();await drag('layout-right',-70,0);await drag('layout-library',-35,0);await drag('layout-inspector',0,-85);const after=await layout();await capture('ui-resized.png');writeFileSync(resolve(output,'ui-layout.json'),JSON.stringify({before,afterLeft,after},null,2));
  assert.ok(after.left.width>before.left.width+80);assert.ok(after.right.width>afterLeft.right.width+50);assert.ok(after.hierarchy.width>before.hierarchy.width+60);assert.ok(after.inspector.height<before.inspector.height-65);
  s=await snapshot();assert.equal(s.json,initial);assert.deepEqual(s.history,history);assert.equal(s.canvas.width,after.canvas.width);assert.equal(s.canvas.height,after.canvas.height);await capture('ui-resized.png');
  await pause(250);const ratios=after.splits.map(s=>s.ratio);await cdp.call('Page.reload',{ignoreCache:true});await pause(800);await wait(s=>s?.map&&s.model==='loaded','reload ready');assert.deepEqual((await layout()).splits.map(s=>s.ratio),ratios,'pane ratios persist across reload');
  checks.push('four public Split components resize independently, update the canvas and restore without changing map history');

  await evaluate("document.querySelector('#layout-left').shadowRoot.querySelector('[role=separator]').focus()");const old=(await layout()).left.width;await key('ArrowRight');assert.ok((await layout()).left.width>old);
  await drag('layout-left',1200,0);let small=await layout();assert.ok(small.canvas.width>=299&&small.right.width>=249,'viewport and inspector retain minimum width');
  await click('#reset-layout');const reset=await layout();assert.equal(reset.left.width,before.left.width);assert.equal(reset.right.width,before.right.width);
  const from=await bar('layout-library');await cdp.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from[0],y:from[1],id:1}]});await pause();await cdp.call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from[0]+30,y:from[1],id:1}]});await pause();await cdp.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause();assert.ok((await layout()).hierarchy.width<reset.hierarchy.width-20);await click('#reset-layout');
  checks.push('mouse, touch and keyboard separators honor minimum sizes; reset restores the default layout');

  await input('map-name','面板布局验证');assert.equal((await snapshot()).map.name,'面板布局验证');await click('#undo');assert.equal((await snapshot()).json,initial);
  await selectNode('road-1');s=await snapshot();assert.deepEqual(s.selected,['road-1']);const road=s.map.objects.find(o=>o.id==='road-1'),count=s.map.objects.length;
  assert.equal(await evaluate("document.getElementById('position-1').tagName"),'HY-INPUT');
  await input('position-1','2.5');assert.equal((await snapshot()).map.objects.find(o=>o.id==='road-1').position[1],2.5);await click('#undo');
  await evaluate("document.querySelector('#object-name').focus();document.querySelector('#object-name').select()");await key('Backspace');assert.equal((await snapshot()).map.objects.length,count,'typing never deletes the selected map node');await cdp.call('Input.insertText',{text:'正在输入'});const preUndo=(await snapshot()).json;await key('z','KeyZ',2);assert.equal((await snapshot()).json,preUndo,'text undo must not undo a map action');await key('Tab');await input('object-name',road.name);
  await input('color-surface','#aaccee');assert.equal((await snapshot()).map.objects.find(o=>o.id==='road-1').colors.surface,'#aaccee');await click('#undo');
  await selectNode('wheel');await choose('motion-axis','x');assert.equal((await snapshot()).map.objects.find(o=>o.id==='wheel').motion.axis,'x');await click('#undo');
  checks.push('library text, number, color and select controls commit correctly; Shadow DOM text editing cannot trigger map shortcuts');

  await click('#json');assert.equal(await evaluate("document.querySelector('#json-dialog').open"),true);assert.equal(await evaluate("document.querySelector('#json-dialog').shadowRoot.querySelector('dialog').open"),true);
  const json=(await snapshot()).json;await key('Backspace');assert.equal((await snapshot()).json,json,'modal keystrokes never edit the map');await capture('ui-json-dialog.png');await key('Escape');assert.equal(await evaluate("document.querySelector('#json-dialog').open"),false);
  await click('#json');const map=JSON.parse((await snapshot()).json);map.name='UI 组件地图';await evaluate(`document.querySelector('#json-text').value=${JSON.stringify(JSON.stringify(map))}`);await click('#apply-json');assert.equal((await snapshot()).map.name,'UI 组件地图');await click('#undo');
  await click('#play');s=await snapshot();assert.equal(s.playing,true);assert.equal(await evaluate("document.querySelector('#demo-sea').shadowRoot.querySelector('button').disabled"),true);const playing=s.json;await evaluate("document.querySelector('#new').click();document.querySelector('#delete').click()");assert.equal((await snapshot()).json,playing);await drag('layout-right',-30,0);await click('#play');assert.equal((await snapshot()).playing,false);await click('#reset-layout');checks.push('library Dialog handles JSON import and Escape; play mode disables real controls while panes remain resizable');

  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1000,height:720,deviceScaleFactor:1,mobile:false});await pause(300);s=await snapshot();small=await layout();assert.ok(small.canvas.width>=299);assert.equal(s.canvas.width,small.canvas.width);assert.equal(s.canvas.height,small.canvas.height);await capture('ui-narrow.png');
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:1536,height:960,deviceScaleFactor:1,mobile:false});await pause(300);await selectNode('road-1');await click('#select-tool');s=await snapshot();const p=s.targets['road-1'];await point([s.canvas.x+p[0],s.canvas.y+p[1]]);assert.ok((await snapshot()).selected.length>0);assert.deepEqual((await snapshot()).errors,[]);await capture('ui-final.png');checks.push('narrow and restored viewports resize correctly and scene picking still works');
}});
if(result.visualCapture?.pngBase64)delete result.visualCapture.pngBase64;writeFileSync(resolve(output,'ui-browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,checks,output},null,2));
