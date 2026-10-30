import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, 'artifacts/workspaces-browser');
mkdirSync(output, { recursive: true });
const ids = ['2048', 'whale-maker'], checks = [], requests = new Map();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['config/workspaces.json', 'nx.json', 'package-lock.json', 'games/manifest.json', 'site/game-host.js', 'site/gamepad.js', ...ids.flatMap(id => [`games/${id}/package.json`, `games/${id}/index.html`, `games/${id}/bundle.js`])];
const fingerprints = Object.fromEntries(files.map(file => [file, { bytes: readFileSync(resolve(root, file)).length, sha256: hash(readFileSync(resolve(root, file))) }]));
const git = args => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, encoding: 'utf8' }).trim();
const provenance = { schemaVersion: 1, generatedAt: new Date().toISOString(), revision: git(['rev-parse', 'HEAD']), dirty: !!git(['status', '--porcelain']), node: process.version, fingerprints };
const delay = ms => new Promise(done => setTimeout(done, ms));
const result = await runChromeWebGpuFixture({ root, fixture: 'index.html', query: { verify: 1 }, timeoutMs: 150_000,
  disableDx12InfoCollection: true, visualCapture: { viewportWidth: 1280, viewportHeight: 860 }, interact: async cdp => {
    const evaluate = async expression => {
      const r = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
      return r.result?.result?.value;
    };
    const until = async (expression, label) => {
      for (let n = 0; n < 300; n++) { if (await evaluate(expression).catch(() => false)) return; await delay(100); }
      writeFileSync(resolve(output, 'timeout.json'), JSON.stringify({ label, state: await evaluate('({lobby:window.__gameOS,host:window.__gameHost})') }, null, 2));
      const shot = await cdp.call('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve(output, 'timeout.png'), Buffer.from(shot.result.data, 'base64'));
      throw Error(`Timed out: ${label}`);
    };
    const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };
    const key = async (type, code, key, keyCode) => cdp.call('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: keyCode });
    const screenshot = async id => { const r = await cdp.call('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve(output, `${id}.png`), Buffer.from(r.result.data, 'base64')); };
    cdp.on('Network.responseReceived', event => requests.set(new URL(event.response.url).pathname, { requestId: event.requestId, status: event.response.status }));
    await cdp.call('Network.enable');
    await until('__gameOS?.running && __gameOS.frames > 2', 'native lobby');
    check(await evaluate(`__gameOS.games.length === ${JSON.parse(readFileSync(resolve(root, 'games/manifest.json'), 'utf8')).entries.filter(e => e.launcher !== false).length}`), 'lobby retains the complete manifest catalog');
    for (const id of ids) {
      await until('!__gameOS.shelf.animating', 'lobby carousel');
      for (let attempt = 0; attempt < 8; attempt++) {
        const view = await evaluate(`({node:__gameOS.nodes.find(n=>n.id==='game-${id}'),shelf:__gameOS.shelf})`); assert.ok(view.node);
        const center = view.node.rect.x + view.node.rect.width / 2;
        if (center > view.shelf.x + 12 && center < view.shelf.x + view.shelf.width - 12) break;
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: view.shelf.x + view.shelf.width / 2, y: view.shelf.y + view.shelf.height / 2, deltaX: center - (view.shelf.x + view.shelf.width / 2), deltaY: 0 });
        await delay(300); await until('!__gameOS.shelf.animating', 'requested card scrolls into view');
      }
      const node = await evaluate(`__gameOS.nodes.find(n => n.id === 'game-${id}')`); assert.ok(node);
      const point = { x: node.rect.x + node.rect.width / 2, y: node.rect.y + node.rect.height / 2 };
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button: 'none', buttons: 0 });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 }); await delay(80);
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
      await until(`__gameOS.selected === '${id}' || __gameHost?.id === '${id}'`, `${id} selected by its card`);
      await delay(150);
      if (await evaluate('__gameHost.phase === "desktop"')) {
        await key('keyDown', 'Enter', 'Enter', 13); await delay(80); await key('keyUp', 'Enter', 'Enter', 13);
      }
      await until(`__gameHost?.id === '${id}' && __gameHost.phase === 'playing'`, `${id} mounted`);
      check(await evaluate('!!haiyueGameOS.game.canvas && document.querySelectorAll("iframe").length === 0'), `${id} mounts a real canvas in the lobby document`);
      for (const file of [`games/${id}/index.html`, `games/${id}/bundle.js`]) {
        const response = requests.get(`/${file}`); assert.ok(response, `requested ${file}`); assert.equal(response.status, 200);
        const body = await cdp.call('Network.getResponseBody', { requestId: response.requestId });
        const bytes = Buffer.from(body.result.body, body.result.base64Encoded ? 'base64' : 'utf8');
        assert.equal(bytes.length, fingerprints[file].bytes); assert.equal(hash(bytes), fingerprints[file].sha256);
        checks.push(`${file} served the exact independent build`);
      }
      if (id === '2048') {
        await until('!!haiyueGameOS.game.debug.__forge2048', '2048 verification');
        await evaluate('haiyueGameOS.game.debug.__forge2048.fixture("play")');
        const board = await evaluate('JSON.stringify(haiyueGameOS.game.debug.__forge2048.snapshot().board)');
        await key('keyDown', 'ArrowLeft', 'ArrowLeft', 37); await delay(100); await key('keyUp', 'ArrowLeft', 'ArrowLeft', 37);
        await until(`JSON.stringify(haiyueGameOS.game.debug.__forge2048.snapshot().board) !== ${JSON.stringify(board)}`, '2048 move');
        checks.push('2048 keyboard move updates the live board');
      } else {
        await until('!!haiyueGameOS.game.debug.__whaleMaker', 'whale-maker verification');
        const x = await evaluate('haiyueGameOS.game.debug.__whaleMaker.state.player.x');
        await key('keyDown', 'ArrowRight', 'ArrowRight', 39); await delay(350); await key('keyUp', 'ArrowRight', 'ArrowRight', 39);
        check(await evaluate('haiyueGameOS.game.debug.__whaleMaker.state.player.x') > x + .3, 'whale-maker native input moves the player');
        await until('haiyueGameOS.game.debug.__whaleMaker.state.grounded', 'whale-maker ground');
        await key('keyDown', 'Space', ' ', 32); await delay(80);
        check(await evaluate('haiyueGameOS.game.debug.__whaleMaker.state.player.vy < 0'), 'whale-maker native input jumps');
        await key('keyUp', 'Space', ' ', 32);
        check(await evaluate('haiyueGameOS.game.debug.__whaleMaker.scene.draws.length > 0'), 'whale-maker uses its live 2D renderer');
      }
      await screenshot(id);
      await key('keyDown', 'Escape', 'Escape', 27); await delay(80); await key('keyUp', 'Escape', 'Escape', 27);
      await until('!__gameHost.mounted && __gameOS.running', `${id} returns to lobby`); checks.push(`${id} disposes and returns to the lobby`);
    }
    await evaluate(`(()=>{const r=document.createElement('pre');r.id='result';r.hidden=true;r.dataset.status='passed';r.textContent=${JSON.stringify(JSON.stringify({ status: 'passed', checks }))};document.body.append(r);})()`);
  } });
writeFileSync(resolve(output, 'lobby.png'), Buffer.from(result.visualCapture.pngBase64, 'base64')); delete result.visualCapture.pngBase64;
writeFileSync(resolve(output, 'result.json'), JSON.stringify({ ...result, provenance }, null, 2));
console.log(`Workspace lobby verification: ${checks.length} checks passed.`);
