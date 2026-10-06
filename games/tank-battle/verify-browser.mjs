import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'artifacts/tank-battle'); mkdirSync(output, { recursive: true });
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (!existsSync(chrome)) throw new Error('Set CHROME_PATH to an installed Chrome executable.');
const profile = mkdtempSync(resolve(output, 'chrome-profile-'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
  if (!path.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  try { const data = readFileSync(path); res.writeHead(200, { 'Content-Type': mime[extname(path)] ?? 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(resolveReady => server.listen(0, '127.0.0.1', resolveReady));
const base = `http://127.0.0.1:${server.address().port}`;
const child = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-crash-reporter', '--mute-audio', '--remote-debugging-port=0', '--window-size=1440,1100', '--force-device-scale-factor=1', `--user-data-dir=${profile}`, `--crash-dumps-dir=${output}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.resume(); let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
const delay = ms => new Promise(accept => setTimeout(accept, ms));
async function until(check, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await check(); if (value) return value; await delay(50); }
  throw new Error(`Timed out: ${label}`);
}
let cdp;
try {
  const endpoint = await until(() => /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr)?.[1], 'Chrome startup');
  const pages = await fetch(`http://${new URL(endpoint).host}/json/list`).then(r => r.json());
  const socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((accept, reject) => { socket.addEventListener('open', accept, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  const pending = new Map(); const errors = []; let nextId = 1;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const p = pending.get(message.id); if (!p) return; pending.delete(message.id); clearTimeout(p.timer);
      if (message.error) p.reject(new Error(JSON.stringify(message.error))); else p.accept(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(a => a.value ?? a.description).join(' '));
  });
  cdp = (method, params = {}) => new Promise((accept, reject) => {
    const id = nextId++; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { accept, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result?.value;
  };
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const snapshot = () => evaluate('window.__tankBattle.snapshot()');
  const key = (type, keyValue, code, keyCode) => cdp('Input.dispatchKeyEvent', { type, key: keyValue, code, windowsVirtualKeyCode: keyCode });
  const capture = async (name, extra = {}) => {
    const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...extra });
    writeFileSync(resolve(output, name), Buffer.from(result.data, 'base64'));
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  const navigate = async path => {
    await cdp('Page.navigate', { url: `${base}${path}` });
    await until(() => evaluate('document.body?.dataset.renderStatus === "passed"'), 'game ready');
  };
  await navigate('/games/tank-battle/index.html?verify=1');
  await until(() => evaluate('[...document.images].every(i => i.complete && i.naturalWidth > 0)'), 'all game assets decoded');
  await capture('title.png');
  await click('#solo'); let state = await snapshot(); assert.equal(state.mode, 1); assert.equal(state.phase, 'playing');
  await key('keyDown', 'w', 'KeyW', 87); await key('keyDown', 'j', 'KeyJ', 74); await delay(400);
  await key('keyUp', 'w', 'KeyW', 87); await key('keyUp', 'j', 'KeyJ', 74);
  state = await snapshot(); assert.ok(state.tanks.find(t => t.player === 1).y < 385); assert.ok(state.bullets.some(b => b.player === 1));
  await click('#pause'); const frozen = await snapshot(); await delay(200); assert.deepEqual(await snapshot(), frozen);
  await click('#resume'); assert.equal((await snapshot()).phase, 'playing');
  await click('#menu'); await click('#duo');
  await key('keyDown', 'w', 'KeyW', 87); await key('keyDown', 'j', 'KeyJ', 74);
  await key('keyDown', 'ArrowUp', 'ArrowUp', 38); await key('keyDown', 'Enter', 'Enter', 13); await delay(400);
  await key('keyUp', 'w', 'KeyW', 87); await key('keyUp', 'j', 'KeyJ', 74);
  await key('keyUp', 'ArrowUp', 'ArrowUp', 38); await key('keyUp', 'Enter', 'Enter', 13);
  state = await snapshot(); assert.equal(state.mode, 2);
  for (const p of [1, 2]) { assert.ok(state.tanks.find(t => t.player === p).y < 385); assert.ok(state.bullets.some(b => b.player === p)); }
  await delay(4000); await capture('gameplay.png');
  const rectangle = await evaluate('(() => { const r=document.querySelector(".battle-frame").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()');
  await capture('thumbnail.png', { clip: rectangle });
  if (process.argv.includes('--update-thumbnail')) writeFileSync(resolve(root, 'site/screenshots/tank-battle.png'), readFileSync(resolve(output, 'thumbnail.png')));
  await click('#sound'); assert.equal(await evaluate('document.querySelector("#sound").getAttribute("aria-pressed")'), 'true');
  await click('#pause'); const saved = await snapshot();
  await until(() => evaluate('document.querySelector("#save-status").textContent === "进度已保存"'), 'autosave');
  await navigate('/games/tank-battle/index.html?verify=1');
  const restored = await snapshot(); assert.equal(restored.mode, 2); assert.equal(restored.tick, saved.tick);
  assert.deepEqual(restored.tanks, saved.tanks); assert.deepEqual(restored.players, saved.players);
  assert.equal(await evaluate('document.querySelector("#sound").getAttribute("aria-pressed")'), 'true');
  await click('#resume'); await delay(100); assert.ok((await snapshot()).tick > restored.tick);
  await evaluate('window.dispatchEvent(new Event("blur"))'); assert.equal((await snapshot()).phase, 'paused');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  assert.ok(await evaluate('(() => {const r=document.querySelector("#battlefield").getBoundingClientRect();return Math.abs(r.width-r.height)<1;})()'), 'compact desktop battlefield must remain square');
  await capture('compact-desktop.png');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await capture('mobile.png');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, 'mobile page must not overflow horizontally');
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".touch-controls")).display'), 'flex');
  await click('#solo');
  // Native pointer capture is verified with CDP touch input.
  await evaluate('document.querySelector(".touch-controls").scrollIntoView({block:"nearest"})');
  const touch = await evaluate('(() => {const r=document.querySelector("[data-key=KeyW]").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...touch, id: 1 }] }); await delay(250);
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  assert.ok((await snapshot()).tanks.find(t => t.player === 1).y < 395);
  assert.deepEqual(errors, [], 'browser errors');
  writeFileSync(resolve(output, 'browser.json'), `${JSON.stringify({ result: 'pass', checks: ['assets', 'single-player movement/fire', 'simultaneous co-op controls', 'pause/resume', 'mute', 'exact autosave restore', 'blur pause', 'responsive square battlefield', 'touch movement'], browserErrors: errors, screenshots: ['title.png', 'gameplay.png', 'compact-desktop.png', 'mobile.png'] }, null, 2)}\n`);
  console.log('Tank Battle browser checks passed. Screenshots: artifacts/tank-battle/');
  socket.close();
} finally {
  child.kill(); await delay(500); server.closeAllConnections(); await new Promise(accept => server.close(accept));
  // Only delete the unique temporary profile created by this verifier inside its output directory.
  if (resolve(profile).startsWith(output + sep) && profile.includes('chrome-profile-')) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { /* Chrome may still hold a file; never delete outside our own profile. */ }
  }
}
