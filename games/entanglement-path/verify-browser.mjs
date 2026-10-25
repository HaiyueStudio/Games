import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const output = resolve(root, 'artifacts/entanglement-path');
mkdirSync(output, { recursive: true });
for (const [name, width, height] of [['desktop', 1200, 760], ['portrait', 390, 844]]) {
  const result = await runChromeWebGpuFixture({
    root, fixture: 'games/entanglement-path/index.html', query: { verify: 1 }, timeoutMs: 60000,
    disableDx12InfoCollection: true,
    visualCapture: { viewportWidth: width, viewportHeight: height },
    interact: async cdp => {
      const evaluate = async expression => {
        const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text);
        return response.result?.result?.value;
      };
      const untilReady = async (waitForIntro = true) => {
        const deadline = Date.now() + 45000;
        while (!await evaluate(`!!window.__entanglementPath${waitForIntro ? ' && !__entanglementPath.introActive' : ''}`)) {
          assert.ok(Date.now() < deadline, 'game initializes');
          await new Promise(accept => setTimeout(accept, 50));
        }
        await evaluate(`(() => {
          window.__inkWorld = (x, y) => { const g = __entanglementPath, r = document.querySelector('canvas').getBoundingClientRect();
            return { x: r.x + (.5 + (x - g.cameraX) / g.viewWidth) * r.width, y: r.y + (.5 - y / g.viewHeight) * r.height }; };
          window.__inkPoint = (x, y) => __inkWorld((x / 1200 - .5) * 14.2, -(y / 760 - .5) * 760 / 1200 * 14.2);
          const r = document.querySelector('canvas').getBoundingClientRect(), g = __entanglementPath;
          if (Math.abs(r.width - innerWidth) > 1 || Math.abs(r.height - innerHeight) > 1) throw Error('canvas must fill the viewport');
          if (Math.abs(g.viewWidth / g.viewHeight - r.width / r.height) > .001) throw Error('camera must preserve hex proportions');
          if (r.width / r.height < .95) {
            const title = g.uiPlanes.get('Ink Title').transform;
            if (g.viewHeight / 2 - title.position[1] - title.scale[1] / 2 < g.viewHeight * .075) throw Error('portrait title must sit on light scroll paper');
          }
        })()`);
      };
      const frame = () => evaluate(`new Promise(accept => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(accept))))`);
      const capture = async suffix => {
        await frame();
        const response = await cdp.call('Page.captureScreenshot', { format: 'png' });
        writeFileSync(resolve(output, `${name}-${suffix}.png`), Buffer.from(response.result.data, 'base64'));
        return response.result.data;
      };
      const click = async () => {
        const point = await evaluate(`(() => { const p = __entanglementPath.restartText.transform.position; return __inkWorld(p[0], p[1]); })()`);
        await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      };
      const key = async value => {
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code: value === ' ' ? 'Space' : 'Enter' });
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code: value === ' ' ? 'Space' : 'Enter' });
      };
      const finish = () => evaluate(`(() => {
        const game = __entanglementPath;
        for (let n = 0; game.phase === 'playing' && n < 100; n++) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        }
        if (game.phase !== 'ended' || !game.placed.size || game.restartText.material.color.a !== 1) throw new Error('natural route termination shows restart prompt');
        return { best: game.best, level: game.levelIndex };
      })()`);
      const checkRestart = async before => {
        const state = await evaluate(`(() => {
          const g = __entanglementPath;
          return { phase: g.phase, placed: g.placed.size, score: g.score, length: g.pathLength,
            best: g.best, level: g.levelIndex, prompt: g.restartText.material.color.a,
            preview: g.previewTransform.scale[0], popups: g.scorePopups.length, overlays: g.swapOverlays.length };
        })()`);
        assert.deepEqual({ ...state, preview: state.preview > 0 }, {
          phase: 'playing', placed: 0, score: 0, length: 0, best: before.best, level: before.level,
          prompt: 0, preview: true, popups: 0, overlays: 0,
        });
      };
      await untilReady(false);
      for (const [elapsed, label] of [[240, 'scroll-opening'], [1850, 'noise-crossfade']]) {
        await evaluate(`__entanglementPath.introStarted = performance.now() - ${elapsed}`);
        await capture(label);
      }
      const inkState = await evaluate(`(() => {
        const g = __entanglementPath, before = g.rotation;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
        const pixels = g.intro.draw(1850).getContext('2d').getImageData(0, 0, 600, 380).data;
        let transparent = 0, partial = 0;
        for (let i = 3; i < pixels.length; i += 4) { if (!pixels[i]) transparent++; else if (pixels[i] < 255) partial++; }
        return { blocked: g.rotation === before, transparent, partial, bitmapDraws: g.art.bitmapDraws.count };
      })()`);
      assert.ok(inkState.blocked, 'intro blocks premature gameplay');
      assert.ok(inkState.transparent > 1000 && inkState.partial > 1000, 'noise threshold and crossfade both contribute to reveal');
      assert.ok(inkState.bitmapDraws > 3, 'score and source readouts use the ink bitmap font');
      const title = await evaluate(`(() => {
        const g = __entanglementPath, c = g.art.title(232, 100), pixels = c.getContext('2d').getImageData(0, 0, 232, 100).data;
        let ink = 0, clear = 0, runs = 0, last = false;
        for (let x = 0; x < 232; x++) {
          let count = 0;
          for (let y = 0; y < 100; y++) { const alpha = pixels[(y * 232 + x) * 4 + 3]; if (alpha > 50) { count++; ink++; } else if (!alpha) clear++; }
          const active = count > 2; if (active && !last) runs++; last = active;
        }
        return { name: document.title, loaded: g.art.titleImage.complete && g.art.titleImage.naturalWidth > 400, ink, clear, runs };
      })()`);
      assert.equal(title.name, '阡陌交通'); assert.ok(title.loaded && title.ink > 2500 && title.clear > 10000 && title.runs === 4, 'transparent brush title retains four separate seal-script glyphs');
      await untilReady();
      assert.ok(await evaluate('__entanglementPath.introTexture === null && __entanglementPath.introEntity === null'), 'intro GPU texture and overlay are released');
      await cdp.call('Page.addScriptToEvaluateOnNewDocument', { source: `
        window.__testPad = { index: 0, connected: true, mapping: 'standard', id: 'Entanglement test controller',
          axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })) };
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__testPad] });
      ` });
      await evaluate('window.__entanglementPath = undefined');
      await cdp.call('Page.reload');
      await untilReady();
      await frame();
      for (const [button, delta, label] of [[2, -1, 'X'], [3, 1, 'Y'], [4, -1, 'LB'], [5, 1, 'RB']]) {
        const before = await evaluate('({ rotation: __entanglementPath.rotation, level: __entanglementPath.levelIndex })');
        await evaluate(`Object.assign(__testPad.buttons[${button}], { value: 1, pressed: true })` + '; void 0');
        await frame();
        const after = await evaluate('({ rotation: __entanglementPath.rotation, level: __entanglementPath.levelIndex })');
        assert.deepEqual(after, { rotation: (before.rotation + delta + 6) % 6, level: before.level }, `${label} rotates in the requested direction without changing level`);
        await evaluate(`Object.assign(__testPad.buttons[${button}], { value: 0, pressed: false })` + '; void 0');
        await frame();
      }
      await capture('controller-and-swap-title');
      const tilesBefore = await evaluate('({ next: __entanglementPath.nextTile.id, reserve: __entanglementPath.reserveTile.id })');
      const swapPoint = await evaluate(`(() => { const p = __entanglementPath.swapPanelTransform.position; return __inkWorld(p[0], p[1]); })()`);
      await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...swapPoint, button: 'left', clickCount: 1 });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...swapPoint, button: 'left', clickCount: 1 });
      await new Promise(accept => setTimeout(accept, 320));
      assert.deepEqual(await evaluate('({ next: __entanglementPath.nextTile.id, reserve: __entanglementPath.reserveTile.id, overlays: __entanglementPath.swapOverlays.length })'),
        { next: tilesBefore.reserve, reserve: tilesBefore.next, overlays: 0 }, 'scaled ink reserve panel swaps tiles and releases its transition overlays');
      await evaluate('__testPad.connected = false');
      await frame();
      await evaluate(`(() => {
        let seed = 42;
        Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        const g = __entanglementPath; g.loadLevel(0, true);
        for (const [i, color] of ['#16252d', '#d93a2f', '#fff7c2', '#ffffff'].entries()) {
          g.createText('Color Probe ' + i, '', 330 + i * 140, 170, 100, 70, 24, '#fff', 'center', 800, color, 3);
        }
      })()`);
      await evaluate(`(() => {
        const art = __entanglementPath.art;
        const a = art.tile('pigment', 42).getContext('2d').getImageData(0, 0, 256, 256).data;
        const b = art.tile('pigment', 43).getContext('2d').getImageData(0, 0, 256, 256).data;
        const greens = []; let difference = 0;
        for (let y = 60; y < 190; y += 10) for (let x = 60; x < 190; x += 10) {
          const i = (y * 256 + x) * 4;
          greens.push(a[i + 1]); difference = Math.max(difference, Math.abs(a[i + 1] - b[i + 1]));
          if (Math.abs(a[i] / a[i + 1] - 136 / 164) > .015 || Math.abs(a[i + 2] / a[i + 1] - 155 / 164) > .015) throw Error('board hue must remain consistent');
        }
        const range = Math.max(...greens) - Math.min(...greens);
        if (range < 3 || range > 30 || difference < 2 || difference > 30 || a[3] !== 0) throw Error('pigment wash must retain subtle shade variation within/across transparent hexes');
      })()`);
      const png = await capture('colors');
      const colors = await evaluate(`(async () => {
        const image = new Image(); image.src = ${JSON.stringify(`data:image/png;base64,${png}`)}; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        return [0, 1, 2, 3].map(i => { const p = __inkPoint(380 + i * 140, 205); return Array.from(ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data).slice(0, 3); });
      })()`);
      const expected = [[22, 37, 45], [217, 58, 47], [255, 247, 194], [255, 255, 255]];
      colors.forEach((rgb, i) => rgb.forEach((value, c) => assert.ok(Math.abs(value - expected[i][c]) <= 3, `sRGB color ${i}/${c}: expected ${expected[i][c]}, got ${value}`)));
      await evaluate(`(() => { for (let i = 0; i < 4; i++) __entanglementPath.world.removeEntity('Color Probe ' + i); })()`);
      for (let level = 0; level < 3; level++) {
        await evaluate(`__entanglementPath.loadLevel(${level}, true)`);
        let before = await finish();
        if (level === 0) {
          const ended = await capture('ended');
          const textPixels = await evaluate(`(async () => {
            const image = new Image(); image.src = ${JSON.stringify(`data:image/png;base64,${ended}`)}; await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
            const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
            const r = document.querySelector('canvas').getBoundingClientRect(), g = __entanglementPath, p = g.restartText.transform.position;
            const corner = __inkWorld(p[0] - 138 / 1200 * 14.2, p[1] + 28 / 1200 * 14.2);
            const pixels = ctx.getImageData(Math.round(corner.x), Math.round(corner.y), Math.floor(r.width * (280 / 1200 * 14.2) / g.viewWidth), Math.floor(r.height * (65 / 1200 * 14.2) / g.viewHeight)).data;
            let count = 0;
            // Thin brush glyphs blend with the ink plaque at phone resolution.
            // Count warm, light stroke coverage in the two lower instruction lines.
            for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 150 && pixels[i + 1] > 140 && pixels[i + 2] > 110 && pixels[i] - pixels[i + 2] > 8 && pixels[i] - pixels[i + 2] < 65) count++;
            return count;
          })()`);
          assert.ok(textPixels >= (width < 500 ? 3 : 30), `restart instructions are visibly drawn above the board (${textPixels} text pixels)`);
        }
        await click(); await checkRestart(before);
        before = await finish(); await key('Enter'); await checkRestart(before);
        before = await finish(); await key(' '); await checkRestart(before);
      }
      let before = await finish();
      await cdp.call('Emulation.setTouchEmulationEnabled', { enabled: true });
      const point = await evaluate(`(() => { const p = __entanglementPath.restartText.transform.position; return __inkWorld(p[0], p[1]); })()`);
      await cdp.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
      await cdp.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await frame(); await checkRestart(before);
      before = await finish();
      await evaluate('__entanglementPath.saves.flush()');
      await cdp.call('Page.reload');
      await untilReady();
      assert.equal(await evaluate('__entanglementPath.phase'), 'ended', 'ended save restores');
      await click(); await checkRestart(before);
      // A held confirm key must not place a tile immediately after restart.
      await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: true }))`);
      await checkRestart(before);
      await key('Enter');
      assert.equal(await evaluate('__entanglementPath.placed.size'), 1, 'new round accepts exactly one placement');
      await capture('restarted');
      await evaluate(`(() => {
        __testPad.connected = false;
        let seed = 42;
        Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        const g = __entanglementPath; g.loadLevel(0, true);
        const directions = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
        for (let step = 0; step < 9 && g.phase === 'playing'; step++) {
          for (let rotation = 0; rotation < 6; rotation++) {
            const exit = g.findExitSide(g.nextTile, rotation, g.incomingSide), d = directions[Math.floor(exit / 2)];
            const key = (g.current.q + d[0]) + ',' + (g.current.r + d[1]);
            const cell = g.cells.get(key);
            if (cell && !cell.wall && !g.placed.has(key)) { g.rotation = rotation; break; }
          }
          g.placeCurrentTile();
        }
        g.clearScorePopups();
      })()`);
      // Let the shared controller disconnect notice expire before the art capture.
      await new Promise(accept => setTimeout(accept, 5200));
      await capture('ink-playing');
      if (name === 'desktop') {
        await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
        await frame();
        await untilReady();
        const before = await evaluate('__entanglementPath.placed.size');
        const point = await evaluate(`(() => { const g = __entanglementPath, cell = g.cells.get(g.current.q + ',' + g.current.r); return __inkPoint(cell.screenX, cell.screenY); })()`);
        await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
        assert.equal(await evaluate('__entanglementPath.placed.size'), before + 1, 'pointer coordinates remain correct after fullscreen resize');
        await capture('wide-fullscreen');
        await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
        await frame(); await untilReady();
      }
      await evaluate(`(() => { const node = document.createElement('pre'); node.id = 'result'; node.hidden = true;
        node.dataset.status = 'passed'; node.textContent = JSON.stringify({ status: 'passed', checks: ['fullscreen canvas and resize', 'single-hue pigment', 'scroll unrolling', 'noise and crossfade', 'bitmap font', 'seeded pigment hexes', 'intro resource cleanup', 'X/Y and LB/RB rotations', 'reserve swap and cleanup', 'sRGB pixels', 'three levels', 'mouse restart', 'keyboard restart', 'touch restart', 'ended save restart', 'key repeat', 'play after restart'] }); document.body.append(node); })()`);
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.browserDiagnostics.unclassifiedFailureCount, 0);
  for (const path of ['bundle.js', 'assets/ink/scroll-landscape.png', 'assets/ink/ui-atlas.png', 'assets/ink/title-qianmo.png', 'assets/ink/digits.png', 'assets/ink/digits.json', 'levels.json']) {
    const sourcePath = `games/entanglement-path/${path}`;
    assert.equal(result.httpProvenance.files.find(file => file.sourcePath === sourcePath)?.sha256,
      createHash('sha256').update(readFileSync(resolve(root, sourcePath))).digest('hex'));
  }
  delete result.visualCapture.pngBase64;
  writeFileSync(resolve(output, `${name}.json`), JSON.stringify(result, null, 2));
  console.log(`${name}: ${result.checks.join(', ')} passed`);
}
