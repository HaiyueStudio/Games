import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const output = resolve(root, 'artifacts/entanglement-path'); mkdirSync(output, { recursive: true });
for (const [name, width, height] of [['desktop', 1200, 760], ['portrait', 390, 844]]) {
  const result = await runChromeWebGpuFixture({ root, fixture: 'games/entanglement-path/index.html', query: { verify: 1 },
    timeoutMs: 120000, disableDx12InfoCollection: true, visualCapture: { viewportWidth: width, viewportHeight: height },
    interact: async cdp => {
      const evaluate = async expression => {
        const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text);
        return response.result?.result?.value;
      };
      const wait = async (expression, label) => {
        const deadline = Date.now() + 30000;
        while (!await evaluate(expression)) { assert.ok(Date.now() < deadline, label); await new Promise(resolve => setTimeout(resolve, 40)); }
      };
      const ready = () => wait('!!window.__entanglementPath?.versus && !__entanglementPath.introActive && !__entanglementPath.versus.loading && !__entanglementPath.versus.toolbar.hidden', 'game ready');
      const browse = () => wait('__entanglementPath.versus.selector.phase === "browse"', 'scroll opens selection page');
      const closed = () => wait('__entanglementPath.versus.selector.phase === "closed" && !__entanglementPath.versus.loading', 'scroll returns to gameplay');
      const frames = () => evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const capture = async suffix => {
        await frames(); const response = await cdp.call('Page.captureScreenshot', { format: 'png' });
        writeFileSync(resolve(output, `${name}-selector-${suffix}.png`), Buffer.from(response.result.data, 'base64'));
      };
      const click = async point => {
        await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      };
      const hit = async id => {
        await frames();
        await click(await evaluate(`(() => { const r=__entanglementPath.versus.selector.hits.get(${JSON.stringify(id)}); return {x:r.x+r.w/2,y:r.y+r.h/2}; })()`));
      };
      const key = async value => {
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: value });
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: value });
      };
      const currentPreviewReady = () => wait(`(() => {const s=__entanglementPath.versus.selector;return !!s.previews.get(s.level(),s.choice.seed,s.choice.mode==='life')&&!s.previous;})()`, 'selected terrain preview is ready');
      const soloRecord = () => evaluate(`(() => {const g=__entanglementPath;return JSON.stringify({placed:[...g.placed],score:g.score,rotation:g.rotation,index:g.levelIndex});})()`);
      await ready();
      await evaluate('__entanglementPath.versus.seed=177');
      await key('ArrowLeft'); const before = await soloRecord();
      await click(await evaluate(`(() => {const r=document.querySelector('[data-action="choose-board"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`));
      assert.ok(await evaluate('__entanglementPath.versus.selector.visible && __entanglementPath.versus.toolbar.hidden'), 'real selection entry consumes gameplay');
      // Freeze only the presentation clock to inspect a genuine halfway rolled frame.
      await evaluate(`(() => { const v=__entanglementPath.versus,s=v.selector;window.__selectorClock=v.options.now;const t=s.started+240;v.options.now=()=>t;s.dirty=true; })()`);
      await capture('closing');
      assert.ok(await evaluate(`(() => {const s=__entanglementPath.versus.selector,c=s.canvas;return s.entry===null&&c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data[3]===0;})()`), 'roll reveals the live solo game through its central aperture');
      await evaluate('__entanglementPath.versus.options.now=__selectorClock'); await browse(); await currentPreviewReady();
      await capture('browse');
      assert.ok(await evaluate('__entanglementPath.versus.selector.previews.art.connected !== __entanglementPath.art.connected'), 'preview terrain cannot replace live terrain caches');
      await wait(`(() => {const s=__entanglementPath.versus.selector;return !!s.previews.get(s.options.levels[1],s.choice.seed,false);})()`, 'neighbor prewarmed');
      await hit('board-next'); assert.equal(await evaluate('__entanglementPath.versus.selector.choice.board'), 1);
      await evaluate(`(() => {const v=__entanglementPath.versus,s=v.selector,t=s.changeAt+320;v.options.now=()=>t;s.dirty=true;})()`);
      await capture('noise');
      const mask = await evaluate(`(() => {const s=__entanglementPath.versus.selector,d=s.maskPixels.data;let clear=0,opaque=0,soft=0;for(let i=3;i<d.length;i+=4){if(d[i]<100)clear++;else if(d[i]>235)opaque++;else soft++;}return {clear,opaque,soft};})()`);
      assert.ok(mask.clear>0 && mask.opaque>0 && mask.soft>0, 'noise reveals scattered regions with crossfaded edges');
      await evaluate('__entanglementPath.versus.options.now=__selectorClock');
      for (const expected of [2,3,0]) { await key('ArrowRight'); assert.equal(await evaluate('__entanglementPath.versus.selector.choice.board'), expected); }
      for (const expected of ['shared','race','life']) { await hit('mode-next'); assert.equal(await evaluate('__entanglementPath.versus.selector.choice.mode'), expected); }
      const lifeBoard = await evaluate('__entanglementPath.versus.selector.choice.board');
      await key('ArrowRight'); await frames();
      assert.equal(await evaluate('__entanglementPath.versus.selector.choice.board'), lifeBoard);
      assert.ok(await evaluate('!__entanglementPath.versus.selector.hits.has("board-next")'), 'unbounded life map has no bounded-map carousel');
      await currentPreviewReady(); await capture('life');
      assert.equal(await soloRecord(), before, 'browsing all maps/modes never changes the current game');
      await key('b'); await closed(); assert.equal(await soloRecord(), before, 'cancel resumes the exact same game');
      await key('Escape'); await browse();
      await key('ArrowRight'); await key('ArrowRight'); await key('ArrowDown');
      assert.deepEqual(await evaluate('({...__entanglementPath.versus.selector.choice,seed:0})'), { mode:'shared',board:2,seed:0 });
      await hit('start'); await closed();
      assert.deepEqual(await evaluate('({mode:__entanglementPath.versus.mode,index:__entanglementPath.versus.levelIndex,moves:__entanglementPath.versus.match.moves.length})'), { mode:'shared',index:2,moves:0 });
      // Open in the middle of an outstanding AI turn: choosing must pause its deadline.
      const safeMove = await evaluate(`(() => {const v=__entanglementPath.versus,m=v.match;for(const swap of [false,true])for(let rotation=0;rotation<6;rotation++){const probe=m.constructor.restore(m.level,m.record());probe.play('human',{swap,rotation});if(!probe.winner){v.swapped=swap;v.rotations[Number(swap)]=rotation;v.place();v.openSelector();return true;}}return false;})()`);
      assert.ok(safeMove, 'fixture has a surviving opening move'); await browse();
      assert.equal(await evaluate('__entanglementPath.versus.match.moves.length'), 1, 'AI remains paused throughout scroll transition');
      await hit('back'); await closed();
      await wait('__entanglementPath.versus.match.moves.length===2', 'pending AI resumes exactly once');
      await evaluate(`(() => {window.__selectionPad={index:0,connected:true,mapping:'standard',id:'Selection pad',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0,pressed:false,touched:false}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[__selectionPad]});})()`);
      const pad = async index => {
        await frames(); await evaluate(`Object.assign(__selectionPad.buttons[${index}],{value:1,pressed:true})`);
        await frames(); await evaluate(`Object.assign(__selectionPad.buttons[${index}],{value:0,pressed:false})`); await frames();
      };
      await pad(10); await browse();
      await pad(4); assert.equal(await evaluate('__entanglementPath.versus.selector.choice.board'), 1, 'LB cycles maps in selector');
      await pad(5); assert.equal(await evaluate('__entanglementPath.versus.selector.choice.board'), 2, 'RB cycles maps in selector');
      await pad(13); assert.equal(await evaluate('__entanglementPath.versus.selector.choice.mode'), 'race');
      await currentPreviewReady(); await capture('race');
      await pad(9); assert.equal(await evaluate('__entanglementPath.versus.selector.choice.mode'), 'life', 'Start cycles modes in selector');
      await pad(0); await closed();
      assert.deepEqual(await evaluate('({mode:__entanglementPath.versus.mode,lives:__entanglementPath.versus.match.lives,walls:__entanglementPath.versus.match.level.wallKeys.size})'), { mode:'life',lives:6,walls:0 });
      await pad(10); await browse(); await pad(1); await closed();
      assert.equal(await evaluate('__entanglementPath.versus.mode'), 'life', 'B cancels without resetting the selected match');
      await evaluate('__selectionPad.connected=false');
      await key('Escape'); await browse(); await key('ArrowDown');
      const oldBoard = await evaluate('__entanglementPath.versus.selector.choice.board');
      // Use native touch events so pointer gestures and synthetic click suppression are covered.
      await cdp.call('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:width*.67,y:height*.4}]});
      await cdp.call('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:width*.33,y:height*.4}]});
      await cdp.call('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
      assert.equal(await evaluate('__entanglementPath.versus.selector.choice.board'), (oldBoard+1)%4, 'horizontal swipe cycles boards');
      assert.equal(await evaluate('__entanglementPath.versus.selector.phase'), 'browse', 'swipe does not accidentally confirm');
      const choiceBeforeResize = await evaluate('JSON.stringify(__entanglementPath.versus.selector.choice)');
      await cdp.call('Emulation.setDeviceMetricsOverride', {width:width<500?1000:390,height:width<500?700:844,deviceScaleFactor:1,mobile:false}); await frames();
      assert.equal(await evaluate('JSON.stringify(__entanglementPath.versus.selector.choice)'), choiceBeforeResize, 'responsive layout preserves selection');
      assert.ok(await evaluate(`(() => {const s=__entanglementPath.versus.selector;return [...s.hits].filter(([k])=>!k.startsWith('board-')).every(([,r])=>r.x>=0&&r.x+r.w<=innerWidth&&r.y>=0&&r.y+r.h<=innerHeight)&&s.previews.cache.size<=8;})()`), 'responsive controls fit and preview cache stays bounded');
      await currentPreviewReady();
      await cdp.call('Emulation.setDeviceMetricsOverride', {width:844,height:390,deviceScaleFactor:1,mobile:false}); await frames();
      await wait(`(() => {const g=__entanglementPath,s=g.versus.selector;return s.width===innerWidth&&s.height===innerHeight&&Math.abs(g.viewWidth/g.viewHeight-innerWidth/innerHeight)<1e-5;})()`,'camera and selection layout resize together');
      assert.ok(await evaluate(`(() => {const g=__entanglementPath,t=g.versusOverlay.transform;return Math.abs(t.scale[0]-g.viewWidth)<1e-5&&Math.abs(t.scale[1]-g.viewHeight)<1e-5&&Math.abs(t.position[0]-g.cameraX)<1e-5;})()`),'idle selection overlay keeps the resized camera dimensions');
      assert.ok(await evaluate(`(() => {const r=__entanglementPath.versus.selector.hits.get('start');return r.y>innerHeight*.774+6;})()`),'short landscape leaves space between mode description and start');
      await capture('short-landscape');
      await cdp.call('Emulation.setDeviceMetricsOverride', {width,height,deviceScaleFactor:1,mobile:false}); await currentPreviewReady();
      await capture('final');
      await key('Enter'); await closed();
      assert.equal(await evaluate('__entanglementPath.versus.mode'), 'solo', 'selected solo scroll starts normally');
      const rotation=await evaluate('__entanglementPath.rotation');await key('ArrowRight');
      assert.equal(await evaluate('__entanglementPath.rotation'),(rotation+1)%6,'gameplay input restored after transition');
      const payload={status:'passed',checks:['scroll-close-open','live-game-aperture','noise-crossfade','four-map-carousel','four-mode-carousel','unbounded-life-map','cancel-preserves-match','preview-worker-isolation','confirm-selection','pause-and-resume-AI','gamepad-selector','touch-swipe','responsive-selection','bounded-preview-cache','restore-gameplay-input'],mask};
      await evaluate(`(() => {const node=document.createElement('pre');node.id='result';node.hidden=true;node.dataset.status='passed';node.textContent=${JSON.stringify(JSON.stringify(payload))};document.body.append(node);})()`);
    },
  });
  assert.equal(result.status,'passed',`${name} selection browser regression`);
  assert.equal(result.browserDiagnostics.unclassifiedFailureCount,0);
  delete result.visualCapture.pngBase64;
  writeFileSync(resolve(output,`${name}-selector.json`),JSON.stringify(result,null,2));
  console.log(`${name}: selection checks passed`);
}
