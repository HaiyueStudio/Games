import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const output = resolve(root, '.artifacts/pacman');
mkdirSync(output, { recursive: true });
for (const [name, width, height] of [['desktop', 1280, 720], ['portrait', 390, 844]]) {
  const result = await runChromeWebGpuFixture({
    root, fixture: 'games/pacman/index.html', timeoutMs: 60000,
    disableDx12InfoCollection: true,
    visualCapture: { viewportWidth: width, viewportHeight: height, sampleWidth: 32, sampleHeight: 24 },
    interact: async cdp => {
      const evaluate = async expression => {
        const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.text);
        return response.result?.result?.value;
      };
      await cdp.call('Page.addScriptToEvaluateOnNewDocument', { source: `
        window.__pacmanFrames = new Map(); window.__pacmanFrameId = 0;
        window.requestAnimationFrame = callback => {
          const id = ++window.__pacmanFrameId; window.__pacmanFrames.set(id, callback); return id;
        };
        window.cancelAnimationFrame = id => window.__pacmanFrames.delete(id);
      ` });
      await cdp.call('Page.reload');
      const deadline = Date.now() + 45000;
      while (!await evaluate('document.body?.classList.contains("ready")')) {
        assert.ok(Date.now() < deadline, 'Pac-Man initialization timed out');
        assert.equal(await evaluate('document.body?.classList.contains("failed")'), false);
        await new Promise(accept => setTimeout(accept, 50));
      }
      // Render a fixed opening frame before movement or animation can vary.
      await evaluate(`(async () => {
        for (let frame = 0; frame < 4; frame += 1) {
          const callbacks = [...window.__pacmanFrames.values()]; window.__pacmanFrames.clear();
          for (const callback of callbacks) callback(frame * 1000 / 60);
          await new Promise(accept => setTimeout(accept, 30));
        }
      })()`);
      const capture = await cdp.call('Page.captureScreenshot', { format: 'png' });
      const gaps = await evaluate(`(async () => {
        const image = new Image(); image.src = 'data:image/png;base64,${capture.result.data}'; await image.decode();
        const pixels = document.createElement('canvas'); pixels.width = image.width; pixels.height = image.height;
        const context = pixels.getContext('2d'); context.drawImage(image, 0, 0);
        const bounds = document.querySelector('#canvas').getBoundingClientRect();
        const gaps = [];
        // Project known vertical stretches through the fixed orthographic camera.
        // Checking every eighth tile catches the former gaps between rows.
        for (const [column, start, end] of [[0, 0, 6], [0, 12, 20], [11, 0, 2], [13, 0, 2]]) {
          for (let row = start; row <= end; row += 0.125) {
            const x = bounds.left + (640 + (column - 12) * 28.8) * bounds.width / 1280;
            const y = bounds.top + (360 + (row - 10) * 28.8 * Math.cos(0.11)
              - 0.495 * 28.8 * Math.sin(0.11)) * bounds.height / 720;
            const [r, g, b] = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
            if (!(b > r * 1.4 && b > g * 1.15)) gaps.push({ row, column, r, g, b });
          }
        }
        return gaps;
      })()`);
      assert.deepEqual(gaps, [], 'Vertical blue caps must remain continuous in the actual rendered image');
      await evaluate(`(() => {
        const result = document.querySelector('#result');
        result.textContent = JSON.stringify({ status: 'passed', checks: ['deterministic opening frame', 'vertical wall pixels continuous'] });
        result.dataset.status = 'passed';
      })()`);
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.browserDiagnostics.unclassifiedFailureCount, 0);
  const png = Buffer.from(result.visualCapture.pngBase64, 'base64');
  assert.ok(png.length > 10000, 'Unexpectedly empty maze screenshot');
  writeFileSync(resolve(output, `${name}.png`), png);
  delete result.visualCapture.pngBase64;
  writeFileSync(resolve(output, `${name}.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(`Pac-Man ${name}: deterministic WebGPU screenshot passed`);
}
