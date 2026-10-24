import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, 'artifacts/tetris'); mkdirSync(output, { recursive: true });
const portrait = process.argv.includes('--portrait');
const result = await runChromeWebGpuFixture({
  root, fixture: 'games/tetris/index.html', query: { verify: 1 }, timeoutMs: 60000,
  disableDx12InfoCollection: true,
  visualCapture: { viewportWidth: portrait ? 390 : 1280, viewportHeight: portrait ? 844 : 800 },
  interact: async cdp => {
    const evaluate = async expression => {
      const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.result?.exceptionDetails) throw Error(JSON.stringify(response.result.exceptionDetails));
      return response.result?.result?.value;
    };
    await evaluate(`(async()=>{for(let i=0;i<300&&!window.__tetris;i++) {
      if(document.body.dataset.renderStatus==='failed') throw Error('Tetris initialization failed');
      await new Promise(r=>setTimeout(r,100));
    } if(!window.__tetris) throw Error('Tetris did not start'); })()`);
    const snap = () => evaluate('window.__tetris.snapshot()');
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const capture = async name => {
      const image = await cdp.call('Page.captureScreenshot', { format: 'png' });
      writeFileSync(resolve(output, `${portrait ? 'portrait-' : ''}${name}.png`), Buffer.from(image.result.data, 'base64'));
      return image.result.data;
    };
    const click = async text => {
      const node = (await snap()).hud.nodes.find(n => n.type === 'GuiButton' && n.text === text);
      assert.ok(node, `Button ${text}`);
      const p = { x: node.rect.x + node.rect.width / 2, y: node.rect.y + node.rect.height / 2 };
      await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...p });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...p });
      await wait(80);
    };
    await evaluate('window.__tetris.fixture(1)'); await wait(100);
    const before = await capture('board'); await wait(180); const after = await capture('animated');
    assert.notEqual(before, after, 'Animated surface changes actual rendered pixels');
    await click('暂停');
    const paused = await snap(); await wait(150);
    assert.equal((await snap()).effectTime, paused.effectTime);
    assert.equal(paused.phase, 'paused');
    assert.equal(paused.chrome.boardMeshes, 1, 'The neon board grid is batched into one mesh');
    const rest = paused.hud.nodes.find(n => n.type === 'GuiButton' && n.text === '新局').rect;
    const pausedBeforeHover = await capture('paused');
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rest.x + rest.width / 2, y: rest.y + rest.height / 2 });
    await wait(100);
    assert.equal((await snap()).chrome.buttons.find(b => b.text === '新局').hovered, true);
    assert.equal((await snap()).chrome.buttons.find(b => b.text === '新局').tint, '#ffffff');
    assert.notEqual(await capture('button-hover'), pausedBeforeHover, 'Hover illuminates the shader button while the game clock is frozen');
    await click('继续');
    assert.equal((await snap()).phase, 'playing');
    // Observe real Web Audio nodes to verify that the four cues differ in sound and rhythm.
    await evaluate(`window.__tetrisVoiceTrace=[];window.__tetrisOriginalStart=OscillatorNode.prototype.start;
      OscillatorNode.prototype.start=function(at){window.__tetrisVoiceTrace.push({hz:this.frequency.value,wave:this.type,at});return window.__tetrisOriginalStart.call(this,at);}`);
    const signatures = [];
    const recordPhrase = async () => {
      const voices = await evaluate('window.__tetrisVoiceTrace');
      assert.ok(voices.length > 0);
      signatures.push(JSON.stringify(voices.map(v => [Math.round(v.hz), v.wave, Math.round((v.at - voices[0].at) * 1000)])));
    };
    await evaluate('window.__tetris.clear()');
    await recordPhrase();
    const single = await snap();
    assert.equal(single.score, 1); assert.equal(single.lines, 1); assert.equal(single.fragments, 10); assert.equal(single.triangles, 48);
    assert.ok(single.audio.played.clear > 0); assert.ok(single.audio.played.button >= 2); assert.equal(single.audio.error, null);
    assert.equal(single.audio.clearsByLines[0], 1);
    await wait(160); await capture('fragments');
    await evaluate('window.__tetris.advance(1200)'); assert.equal((await snap()).fragments, 0);
    // Let each phrase finish before the next so voice limits cannot mask a cue.
    await wait(700);
    for (const rows of [2, 3]) {
      await evaluate(`window.__tetrisVoiceTrace=[]; window.__tetris.fixture(${rows}); window.__tetris.clear()`);
      await recordPhrase();
      const variant = await snap();
      assert.equal(variant.lines, rows); assert.equal(variant.audio.clearsByLines[rows - 1], 1);
      assert.ok(variant.audio.voices > 0 && variant.audio.voices <= 16);
      await wait(700); assert.equal((await snap()).audio.voices, 0, 'All scheduled notes release');
    }
    await evaluate('window.__tetrisVoiceTrace=[]; window.__tetris.fixture(4); window.__tetris.clear()');
    await recordPhrase();
    assert.equal(new Set(signatures).size, 4, 'Each line count produces a different oscillator phrase');
    await evaluate('OscillatorNode.prototype.start=window.__tetrisOriginalStart');
    assert.equal((await snap()).fragments, 40); assert.equal((await snap()).score, 32);
    assert.equal((await snap()).audio.clearsByLines[3], 1);
    await evaluate('window.__tetris.fixture(4,true)');
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    const dropped = await snap();
    assert.equal(dropped.score, 32, `Hard drop completes four lines through the gameplay path: ${JSON.stringify({ phase: dropped.phase, current: dropped.current, board: dropped.board.slice(-5), audio: dropped.audio })}`);
    await click('新局'); assert.equal((await snap()).fragments, 0); assert.equal((await snap()).score, 0);
    await click('音效 开'); assert.equal((await snap()).audio.muted, true);
    const clearCount = (await snap()).audio.played.clear;
    await evaluate('window.__tetris.fixture(1); window.__tetris.clear()');
    assert.equal((await snap()).audio.played.clear, clearCount);
    await click('音效 关'); assert.equal((await snap()).audio.muted, false);
    for (let i = 0; i < 8; i++) await evaluate('window.__tetris.fixture(4); window.__tetris.clear(); window.__tetris.advance(1200)');
    assert.equal((await snap()).pool, 40); assert.equal((await snap()).fragments, 0);
    await evaluate('window.__tetris.fixture(1)'); await wait(100);
    const final = await snap();
    assert.deepEqual(final.gpuErrors, [], 'No WebGPU shader or validation errors');
    for (const node of final.hud.nodes.filter(n => n.type === 'GuiButton')) {
      assert.ok(node.rect.x >= 0 && node.rect.y >= 0 && node.rect.x + node.rect.width <= final.hud.width + 1 && node.rect.y + node.rect.height <= final.hud.height + 1, 'Buttons fit viewport');
    }
    await evaluate(`document.querySelector('#result').dataset.status='passed'; document.querySelector('#result').textContent=JSON.stringify({status:'passed',checks:{animatedShader:true,neonBoard:true,shaderPanels:true,buttonHover:true,singleLine:true,fourLines:true,fragments:true,boundedPool:true,pause:true,restart:true,buttonAudio:true,clearAudio:true,distinctClearSounds:true,mute:true},snapshot:window.__tetris.snapshot()})`);
  },
});
const { visualCapture, ...evidence } = result;
assert.deepEqual(result.browserErrors ?? [], []);
writeFileSync(resolve(output, `${portrait ? 'portrait' : 'desktop'}.json`), JSON.stringify(evidence, null, 2));
if (visualCapture?.pngBase64) writeFileSync(resolve(output, `${portrait ? 'portrait' : 'desktop'}.png`), Buffer.from(visualCapture.pngBase64, 'base64'));
console.log(JSON.stringify({ status: result.status, checks: result.checks, browserErrors: result.browserErrors, output }));
