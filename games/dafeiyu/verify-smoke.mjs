import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import { installSceneRenderProbe } from './verification/render-probe.mjs';

const root = resolve(import.meta.dirname, '../..'), output = resolve(root, 'artifacts/dafeiyu/smoke');
mkdirSync(output, { recursive: true });
const gpuErrors = [];
const result = await runChromeWebGpuFixture({
  root, fixture: 'games/dafeiyu/index.html', query: { verify: 1, start: 'coral', autoplay: 1 }, timeoutMs: 60000,
  disableDx12InfoCollection: true, visualCapture: { viewportWidth: 1000, viewportHeight: 680 },
  interact: async cdp => {
    cdp.on('Log.entryAdded', ({ entry }) => {
      if (/^(error|warning)$/.test(entry.level) && /webgpu|gpuvalidation|gpudevice|device\s*lost|pipeline.*invalid/i.test(entry.text)) gpuErrors.push(entry);
    });
    await cdp.call('Log.enable');
    const evaluate = async expression => {
      const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      assert.ok(!response.result.exceptionDetails, response.result.exceptionDetails?.exception?.description);
      return response.result.result.value;
    };
    const until = async expression => {
      const end = Date.now() + 15000;
      while (!await evaluate(expression)) {
        assert.ok(Date.now() < end, expression);
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    };
    const frame = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const key = async code => {
      await until('!__dafeiyu.transition');
      await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code });
      await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code });
      await frame();
    };
    const render = async () => {
      const before = await evaluate('sceneProbe.stats().sceneSubmissions');
      await until(`sceneProbe.stats().sceneSubmissions > ${before}`);
      await evaluate('sceneProbe.completed()');
    };
    await until('window.__dafeiyu?.current === "coral-bay" && __dafeiyu.bounds.cell > 0');
    await evaluate(`window.sceneProbe = (${installSceneRenderProbe.toString()})()`);
    await render(); await render();
    assert.ok((await evaluate('sceneProbe.stats()')).bundles >= 2, 'cached scene bundles render without re-encoding');
    await evaluate(`(() => {
      const request = window.fetch;
      window.audioFaults = { stage: 1, effects: 0, music: 0 };
      window.fetch = function(input, options) {
        const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname;
        const asset = path.endsWith('/audio/effects.ogg') ? 'effects' : path.endsWith('/audio/coral-bay.ogg') ? 'music' : null;
        if (asset) {
          audioFaults[asset]++;
          if (audioFaults.stage === 1) return Promise.resolve(new Response('', { status: 503 }));
          if (audioFaults.stage === 2 && asset === 'effects') return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
        }
        return request.call(this, input, options);
      };
    })()`);
    await key('Enter');
    await until('__dafeiyu.current === "first-dive" && !__dafeiyu.transition');
    await until('__dafeiyu.audio.assets.effects.status === "failed" && __dafeiyu.audio.assets.music.status === "failed"');
    const first = await evaluate('({ ...audioFaults })');
    await evaluate('audioFaults.stage = 2; new Promise(resolve => setTimeout(resolve, 1100))');
    await key('KeyZ');
    await until('__dafeiyu.audio.assets.effects.status === "failed" && __dafeiyu.audio.assets.music.status === "ready"');
    assert.deepEqual(await evaluate('[audioFaults.effects, audioFaults.music]'), [first.effects + 1, first.music + 1]);
    await until('__dafeiyu.audio.musicStarts === 1');
    await evaluate('audioFaults.stage = 3; new Promise(resolve => setTimeout(resolve, 1100))');
    const hidden = value => evaluate(`(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: ${value} });
      document.dispatchEvent(new Event('visibilitychange'));
    })()`);
    await hidden(true); await until('__dafeiyu.audio.state === "suspended"');
    await hidden(false);
    await until('__dafeiyu.audio.assets.effects.status === "ready" && __dafeiyu.audio.buffers === 8');
    assert.deepEqual(await evaluate('[audioFaults.effects, audioFaults.music]'), [first.effects + 2, first.music + 1]);
    assert.equal(await evaluate('__dafeiyu.audio.musicStarts'), 1, 'effects recovery keeps the existing BGM');
    const initial = await evaluate('JSON.stringify(__dafeiyu.state)');
    await key('ArrowRight'); await until('__dafeiyu.state.turn === 1'); await render();
    const moved = await evaluate('JSON.stringify(__dafeiyu.state)');
    await key('KeyZ'); await render();
    assert.equal(await evaluate('JSON.stringify(__dafeiyu.state)'), initial);
    await key('KeyY'); await render();
    assert.equal(await evaluate('JSON.stringify(__dafeiyu.state)'), moved);
    await key('KeyR'); await render();
    assert.equal(await evaluate('JSON.stringify(__dafeiyu.state)'), initial);
    assert.ok(await evaluate('__dafeiyu.hud.some(node => node.visible && node.id === "tool-pause" && node.icon)'));
    const checks = ['submitted cached bundles and a GPU completion fence', 'HTTP and decode failures recover on gesture/resume without refetching BGM',
      'native HUD, movement, undo, redo and restart'];
    const stats = await evaluate('({ render: sceneProbe.stats(), audio: __dafeiyu.audio })');
    const shot = await cdp.call('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(output, 'board.png'), Buffer.from(shot.result.data, 'base64'));
    await evaluate('sceneProbe.dispose()');
    await evaluate(`window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }))`);
    await until('__dafeiyu.audio.disposed && __dafeiyu.audio.voices === 0');
    const payload = JSON.stringify({ status: 'passed', checks, ...stats });
    await evaluate(`(() => { const node = document.createElement('pre'); node.id = 'result'; node.hidden = true;
      node.dataset.status = 'passed'; node.textContent = ${JSON.stringify(payload)}; document.body.append(node); })()`);
  },
});
assert.equal(result.status, 'passed');
assert.equal(gpuErrors.length + result.browserDiagnostics.unclassifiedFailureCount, 0);
delete result.visualCapture.pngBase64;
writeFileSync(resolve(output, 'result.json'), JSON.stringify({ ...result, gpuErrors }, null, 2));
console.log(result.checks);
