import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url)), output = resolve(root, 'artifacts/ink-twin');
mkdirSync(output, { recursive: true });
for (const [name, width, height] of [['desktop', 1200, 850], ['portrait', 390, 844]]) {
  const result = await runChromeWebGpuFixture({
    root, fixture: 'games/ink-twin/index.html', query: { verify: 1, verifyDate: '2026-11-01' }, timeoutMs: 45000,
    disableDx12InfoCollection: true, visualCapture: { viewportWidth: width, viewportHeight: height },
    interact: async cdp => {
      const evaluate = async expression => {
        const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (response.result?.exceptionDetails) throw Error(response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text);
        return response.result?.result?.value;
      };
      const frame = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const wait = async expression => { const end = Date.now() + 20000; while (!await evaluate(expression)) { assert.ok(Date.now() < end, expression); await new Promise(resolve => setTimeout(resolve, 60)); } };
      const capture = async label => { await frame(); const response = await cdp.call('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve(output, `${name}-${label}.png`), Buffer.from(response.result.data, 'base64')); };
      const key = async key => { await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key === ' ' ? 'Space' : key.length === 1 ? 'Key' + key.toUpperCase() : key }); await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key }); };
      const click = async selector => {
        const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
        await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      };
      const point = (index, white = false) => evaluate(`(() => {const g=__inkTwin,r=g.canvas.getBoundingClientRect(),n=g.state.puzzle.size;let c=g.state.puzzle.solution[${index}];if(${white})c=n*n-1-c;return {x:r.x+(c%n+.5)*r.width/n,y:r.y+(Math.floor(c/n)+.5)*r.height/n};})()`);
      const drag = async (from, to, white = false, touch = false) => {
        const start = await point(from, white);
        if (touch) await cdp.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        else await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', clickCount: 1 });
        for (let i = from + 1; i <= to; i++) {
          const position = await point(i, white);
          if (touch) await cdp.call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [position] });
          else await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...position, button: 'left', buttons: 1 });
        }
        if (touch) await cdp.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        else await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...await point(to, white), button: 'left', clickCount: 1 });
      };
      await wait('!!window.__inkTwin && document.body.dataset.renderStatus === "ready"');
      const layout = await evaluate(`(() => {const c=__inkTwin.canvas.getBoundingClientRect(),t=document.querySelector('.tools').getBoundingClientRect();return {x:c.x,y:c.y,width:c.width,height:c.height,bottom:t.bottom,scroll:document.documentElement.scrollWidth,bitmap:__inkTwin.art.bitmapDraws};})()`);
      assert.ok(layout.width >= 300 && Math.abs(layout.width - layout.height) < 1);
      assert.ok(layout.x >= 0 && layout.x + layout.width <= width && layout.bottom <= height && layout.scroll <= width, JSON.stringify(layout));
      assert.ok(layout.bitmap >= 10); await capture('initial');
      await click('[data-difficulty="hard"]');
      const solution = await evaluate('__inkTwin.state.puzzle.solution'); assert.equal(solution.length, 50);
      await drag(0, 7, false, name === 'portrait');
      assert.equal(await evaluate('__inkTwin.state.path.length'), 8, 'black mouse/touch drag moves both strokes');
      await drag(7, 16, true, name === 'portrait');
      assert.equal(await evaluate('__inkTwin.state.path.length'), 17, 'white drag follows the rotated route');
      assert.equal(await evaluate('__inkTwin.active'), 'white');
      await capture('strokes');
      if (name === 'desktop') { const screenshot = readFileSync(resolve(output, `${name}-strokes.png`)); writeFileSync(resolve(root, 'site/screenshots/ink-twin.png'), screenshot); }
      const delta = solution[17] - solution[16], arrow = delta === 1 ? 'ArrowLeft' : delta === -1 ? 'ArrowRight' : delta > 0 ? 'ArrowUp' : 'ArrowDown';
      await key(arrow); assert.equal(await evaluate('__inkTwin.state.path.length'), 18, 'keyboard moves the currently held white brush');
      await key('z'); assert.equal(await evaluate('__inkTwin.state.path.length'), 17);
      await click('#hint'); assert.equal(await evaluate('__inkTwin.state.path.length'), 18);
      await click('#restart'); assert.equal(await evaluate('__inkTwin.state.path.length'), 1);
      assert.deepEqual(await evaluate('__inkTwin.state.puzzle.solution'), solution, 'restart preserves daily puzzle');
      await drag(0, 49, false, name === 'portrait');
      assert.ok(await evaluate('__inkTwin.state.won && !document.querySelector("#complete").hidden'));
      assert.equal(await evaluate('document.querySelector("#progress").textContent'), '已落笔 100 / 100');
      await capture('complete');
      await click('#undo'); assert.ok(await evaluate('!__inkTwin.state.won && __inkTwin.state.path.length === 49 && document.querySelector("#complete").hidden'));
      await click('#practice'); assert.ok(await evaluate('__inkTwin.mode === "practice" && __inkTwin.state.path.length === 1'));
      assert.notDeepEqual(await evaluate('__inkTwin.state.puzzle.solution'), solution);
      await click('#daily'); assert.deepEqual(await evaluate('__inkTwin.state.puzzle.solution'), solution);
      await click('#rules-toggle'); assert.ok(await evaluate('!document.querySelector("#mobile-help").hidden'));
      await click('#rules-toggle');
      // Repeated resets must never multiply handlers.
      await evaluate('for(let i=0;i<8;i++)__inkTwin.reset()');
      const next = await evaluate('__inkTwin.state.puzzle.solution[1] - __inkTwin.state.puzzle.solution[0]');
      await key(next === 1 ? 'ArrowRight' : next === -1 ? 'ArrowLeft' : next > 0 ? 'ArrowDown' : 'ArrowUp');
      assert.equal(await evaluate('__inkTwin.state.path.length'), 2);
      const savedPath = await evaluate('(async()=>{await __inkTwin.saves.flush();return [...__inkTwin.state.path];})()');
      await evaluate('window.__inkTwin=undefined'); await cdp.call('Page.reload');
      await wait('!!window.__inkTwin && document.body.dataset.renderStatus === "ready"');
      assert.deepEqual(await evaluate('__inkTwin.state.path'), savedPath, 'engine autosave restores progress after reload');
      await evaluate('__inkTwin.destroy()'); await key('h'); assert.equal(await evaluate('__inkTwin.state.path.length'), 2, 'destroy removes gameplay listeners');
      // Mount the same game through the actual game-host boundary, then dispose it.
      await evaluate(`(async()=>{const root=document.createElement('div');root.id='verify-host';root.style.cssText='position:fixed;inset:0;background:#aaa9a3;z-index:50';document.body.append(root);const mod=await import('./bundle.js');window.__mountedTwin=await mod.mountGame({root,url:location.href,width:${width},height:${height}});await __mountedTwin.ready;})()`);
      assert.ok(await evaluate('!!__mountedTwin.canvas && !__mountedTwin.disposed'));
      await frame(); await capture('hosted');
      await evaluate('__mountedTwin.dispose(); document.querySelector("#verify-host").remove()');
      assert.ok(await evaluate('__mountedTwin.disposed'));
      await evaluate(`(async()=>{const root=document.createElement('div');root.id='verify-texture';root.style.cssText='position:fixed;inset:0;z-index:50';document.body.append(root);const mod=await import('./bundle.js');window.__textureTwin=await mod.mountGame({root,url:location.href,width:${width},height:${height},mode:'texture'});await __textureTwin.ready;})()`);
      assert.ok(await evaluate('!!__textureTwin.texture && !__textureTwin.disposed'), 'device simulator receives a real Engine render texture');
      await frame();
      await evaluate('__textureTwin.dispose();document.querySelector("#verify-texture").remove()');
      assert.ok(await evaluate('__textureTwin.disposed && __textureTwin.engine.state === "destroyed"'));
      const payload = { status: 'passed', checks: ['responsive-layout', 'generated-bitmap-font', 'mouse-and-touch-drag', 'white-rotated-drag', 'keyboard', 'undo', 'hint', 'restart-determinism', 'full-coverage-win', 'practice-and-daily', 'reset-listener-lifetime', 'autosave-reload', 'destroy', 'host-mount-and-dispose', 'texture-mount-and-dispose'] };
      await evaluate(`(()=>{const node=document.createElement('pre');node.id='result';node.hidden=true;node.dataset.status='passed';node.textContent=${JSON.stringify(JSON.stringify(payload))};document.body.append(node);})()`);
    },
  });
  assert.equal(result.status, 'passed'); assert.equal(result.browserDiagnostics.unclassifiedFailureCount, 0);
  for (const asset of ['xuan-paper.png', 'brush-digits.png', 'brush-digits.fnt.json']) {
    const path = `games/ink-twin/assets/${asset}`, bytes = readFileSync(resolve(root, path));
    assert.ok(result.httpProvenance.files.some(record => record.sourcePath === path && record.byteLength === bytes.length && record.sha256 === createHash('sha256').update(bytes).digest('hex')), `served real asset ${asset}`);
  }
  delete result.visualCapture.pngBase64;
  writeFileSync(resolve(output, `${name}.json`), JSON.stringify(result, null, 2));
  console.log(`${name}: ${result.checks.length} browser checks passed`);
}
