import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = resolve(import.meta.dirname, '..'), label = process.env.GAME_OS_PROFILE ?? 'diagnostic';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid diagnostic label');
const output = resolve(root, 'artifacts/game-os-performance', label); mkdirSync(output, { recursive: true });
const files = ['site/app.js', 'site/gamepad.js', 'games/launcher/buttonStyle.ts', 'games/launcher/DesktopGui.ts', 'games/launcher/GameOS.ts', 'scripts/profile-game-os.mjs',
  ...readdirSync(resolve(root, 'site/core')).filter(file => file.endsWith('.js')).map(file => 'site/core/' + file)];
const provenance = { schemaVersion: 1, classification: 'local-diagnostic', label, generatedAt: new Date().toISOString(),
  revision: execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirtyWorkingTree: !!execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  fingerprints: Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')])) };
const records = [], delay = milliseconds => new Promise(done => setTimeout(done, milliseconds));
const result = await runChromeWebGpuFixture({ root, fixture: 'index.html', query: { verify: 1 }, timeoutMs: 240000,
  disableDx12InfoCollection: true, visualCapture: { viewportWidth: 1440, viewportHeight: 1000 }, interact: async cdp => {
    const evaluate = async expression => {
      const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text);
      return response.result?.result?.value;
    };
    for (let attempt = 0; attempt < 600 && !await evaluate('window.__gameOS?.ready&&__gameOS.frames>8'); attempt++) await delay(100);
    if (!await evaluate('window.__gameOS?.ready')) throw new Error('Game OS did not initialize');
    await delay(1000);
    await cdp.call('Profiler.enable'); await cdp.call('Profiler.setSamplingInterval', { interval: 500 });
    const phases = ['idle', 'hover', 'settled'];
    for (const phase of phases) {
      if (phase === 'idle') await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 80, button: 'none', buttons: 0 });
      if (phase === 'hover') {
        const card = await evaluate('__gameOS.nodes.find(node=>node.id==="game-2048")');
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: card.rect.x + card.rect.width / 2, y: card.rect.y + card.rect.height / 2, button: 'none', buttons: 0 });
      }
      await cdp.call('Profiler.start');
      const frames = await evaluate(`new Promise(resolve=>{const intervals=[];let previous=performance.now();const start=previous;function frame(now){intervals.push(now-previous);previous=now;if(now-start<2500)requestAnimationFrame(frame);else resolve(intervals);}requestAnimationFrame(frame);})`);
      const profile = (await cdp.call('Profiler.stop')).result.profile;
      writeFileSync(resolve(output, phase + '.cpuprofile'), JSON.stringify(profile));
      const sorted = frames.slice(1).sort((first, second) => first - second), total = sorted.reduce((sum, value) => sum + value, 0);
      const hot = profile.nodes.filter(node => node.hitCount).sort((first, second) => second.hitCount - first.hitCount).slice(0, 12).map(node => ({ function: node.callFrame.functionName, samples: node.hitCount, url: node.callFrame.url, line: node.callFrame.lineNumber + 1 }));
      const record = { phase, frames: sorted.length, frameMeanMs: total / sorted.length, frameP95Ms: sorted[Math.floor(sorted.length * .95)], fps: sorted.length * 1000 / total, hot };
      records.push(record); console.log(JSON.stringify(record));
    }
    await evaluate(`(()=>{const result=document.createElement('pre');result.id='result';result.hidden=true;result.dataset.status='passed';result.textContent=JSON.stringify({status:'passed'});document.body.append(result);})()`);
  } });
writeFileSync(resolve(output, 'screen.png'), Buffer.from(result.visualCapture.pngBase64, 'base64')); delete result.visualCapture.pngBase64;
writeFileSync(resolve(output, 'diagnostic.json'), JSON.stringify({ ...result, provenance, records }, null, 2));
