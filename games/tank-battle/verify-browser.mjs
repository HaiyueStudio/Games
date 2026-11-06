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
const child = spawn(chrome, ['--headless=new', '--enable-unsafe-webgpu', '--disable-gpu-process-for-dx12-info-collection', '--use-angle=d3d11', '--no-sandbox', '--disable-gpu-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-crash-reporter', '--mute-audio', '--remote-debugging-port=0', '--window-size=1440,1100', '--force-device-scale-factor=1', `--user-data-dir=${profile}`, `--crash-dumps-dir=${output}`, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
    if (message.method === 'Runtime.exceptionThrown') { const error = message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text; errors.push(error); console.error(error); }
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') { const error = message.params.args.map(a => a.value ?? a.description).join(' '); errors.push(error); console.error(error); }
  });
  cdp = (method, params = {}) => new Promise((accept, reject) => {
    const id = nextId++; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 60000);
    pending.set(id, { accept, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result?.value;
  };
  const click = async selector => {
    const b = await evaluate(`window.__tankBattle.hud().buttons[${JSON.stringify(selector.slice(1))}]`);
    assert.ok(b?.visible && !b.disabled, `GUI button ${selector} is available`);
    const point = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await delay(65);
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    await delay(150);
  };
  const snapshot = () => evaluate('window.__tankBattle.snapshot()');
  const key = (type, keyValue, code, keyCode) => cdp('Input.dispatchKeyEvent', { type, key: keyValue, code, windowsVirtualKeyCode: keyCode });
  const capture = async (name, extra = {}) => {
    assert.deepEqual(await evaluate('window.__tankBattle.hud().missingGlyphs'), [], 'all HUD text has font atlas glyphs');
    const viewport = await evaluate('window.__tankBattle.hud().viewport');
    assert.ok(Math.abs(viewport.width - viewport.cssWidth) < 1 && Math.abs(viewport.height - viewport.cssHeight) < 1, 'GUI viewport must match its displayed canvas');
    const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...extra });
    writeFileSync(resolve(output, name), Buffer.from(result.data, 'base64'));
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  console.log('Browser connected; loading Engine GUI.');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  const navigate = async path => {
    await cdp('Page.navigate', { url: `${base}${path}` });
    await until(() => evaluate('document.body?.dataset.renderStatus === "failed" ? Promise.reject(new Error(document.querySelector("#fatal").textContent)) : document.body?.dataset.renderStatus === "passed"'), 'game ready', 90000);
    await delay(500);
  };
  await navigate('/games/tank-battle/index.html?verify=1');
  console.log('Engine GUI ready; checking pointer and keyboard input.');
  assert.equal(await evaluate('window.__tankBattle.hud().renderer'), 'engine-gui');
  assert.equal(await evaluate('document.querySelectorAll("button,aside,img").length'), 0, 'HUD must not use DOM widgets');
  assert.equal(await evaluate('document.querySelectorAll("canvas").length'), 1, 'battlefield and HUD share one canvas');
  assert.equal(await evaluate('window.__tankBattle.hud().battlefieldRenderer'), 'engine-gui');
  await capture('title.png');
  await click('#solo'); let state = await snapshot(); assert.equal(state.mode, 1); assert.equal(state.phase, 'playing');
  for (let row = 16; row <= 19; row++) for (let col = 10; col <= 15; col++) {
    assert.equal(state.tiles[row * 26 + col], 'brick', 'stage one central barricade is four cells deep');
  }
  for (const row of [22, 23]) for (let col = 11; col <= 14; col++) {
    assert.equal(state.tiles[row * 26 + col], 'brick', 'base roof has two layers');
  }
  await capture('first-stage-defenses.png');
  await key('keyDown', 'w', 'KeyW', 87); await key('keyDown', 'j', 'KeyJ', 74); await delay(400);
  await key('keyUp', 'w', 'KeyW', 87); await key('keyUp', 'j', 'KeyJ', 74);
  state = await snapshot(); assert.ok(state.tanks.find(t => t.player === 1).y < 385); assert.ok(state.bullets.some(b => b.player === 1));
  await click('#pause'); const frozen = await snapshot(); await delay(200); assert.deepEqual(await snapshot(), frozen);
  await click('#resume'); assert.equal((await snapshot()).phase, 'playing');
  await click('#menu'); await click('#duo');
  await key('keyDown', 'w', 'KeyW', 87); await key('keyDown', 'j', 'KeyJ', 74);
  await key('keyDown', 'ArrowUp', 'ArrowUp', 38); await key('keyDown', 'Enter', 'Enter', 13);
  try { await until(async () => {
    const current = await snapshot();
    assert.equal(current.phase, 'playing', 'P2 arrows/Enter must not activate HUD buttons');
    return [1, 2].every(p => current.tanks.find(t => t.player === p)?.y < 385 && current.bullets.some(b => b.player === p));
  }, 'simultaneous co-op movement and fire'); } catch (error) {
    const { tick, phase, tanks, bullets } = await snapshot();
    console.error('Co-op diagnostic:', JSON.stringify({ tick, phase, tanks, bullets }));
    await capture('co-op-failure.png'); throw error;
  }
  await key('keyUp', 'w', 'KeyW', 87); await key('keyUp', 'j', 'KeyJ', 74);
  await key('keyUp', 'ArrowUp', 'ArrowUp', 38); await key('keyUp', 'Enter', 'Enter', 13);
  state = await snapshot(); assert.equal(state.mode, 2);
  for (const p of [1, 2]) { assert.ok(state.tanks.find(t => t.player === p).y < 385); assert.ok(state.bullets.some(b => b.player === p)); }
  await delay(4000); await capture('gameplay.png');
  const rectangle = await evaluate('(() => { const r=window.__tankBattle.hud().board;return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()');
  await capture('thumbnail.png', { clip: rectangle });
  if (process.argv.includes('--update-thumbnail')) writeFileSync(resolve(root, 'site/screenshots/tank-battle.png'), readFileSync(resolve(output, 'thumbnail.png')));
  await click('#sound'); assert.equal(await evaluate('window.__tankBattle.hud().muted'), true);
  await click('#pause'); const saved = await snapshot();
  await until(() => evaluate('window.__tankBattle.hud().saveStatus === "进度已保存"'), 'autosave');
  await navigate('/games/tank-battle/index.html?verify=1');
  const restored = await snapshot(); assert.equal(restored.mode, 2); assert.equal(restored.tick, saved.tick);
  assert.deepEqual(restored.tanks, saved.tanks); assert.deepEqual(restored.players, saved.players);
  assert.equal(await evaluate('window.__tankBattle.hud().muted'), true);
  await click('#resume'); await delay(100); assert.ok((await snapshot()).tick > restored.tick);
  await evaluate('window.dispatchEvent(new Event("blur"))'); assert.equal((await snapshot()).phase, 'paused');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 2, mobile: false });
  await delay(300);
  assert.ok(await evaluate('(() => {const r=window.__tankBattle.hud().board;return Math.abs(r.width-r.height)<1;})()'), 'compact desktop battlefield must remain square');
  await capture('compact-desktop.png');
  await click('#resume'); assert.equal((await snapshot()).phase, 'playing');
  await click('#pause'); assert.equal((await snapshot()).phase, 'paused');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await delay(300);
  await navigate('/games/tank-battle/index.html?verify=1&mobile=1');
  assert.equal(await evaluate('window.__tankBattle.hud().buttons.duo'), undefined, 'mobile offers only 1P');
  assert.equal(await evaluate('document.querySelectorAll("canvas").length'), 1, 'mobile also uses one canvas');
  await capture('mobile-title.png');
  await click('#solo');
  assert.equal((await snapshot()).mode, 1);
  const pad = await evaluate('window.__tankBattle.hud().stick');
  const fire = await evaluate('window.__tankBattle.hud().fire');
  await cdp('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:pad.x,y:pad.y,id:1},{x:fire.x,y:fire.y,id:2}]});
  await cdp('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:pad.x,y:pad.y-pad.radius*.65,id:1},{x:fire.x,y:fire.y,id:2}]});
  await delay(350);
  assert.equal(await evaluate('window.__tankBattle.hud().controls.direction'),0);
  assert.ok((await snapshot()).bullets.some(b=>b.player===1),'second finger fires while joystick moves');
  assert.ok((await snapshot()).tanks.find(t=>t.player===1).y<395);
  await capture('mobile.png');
  await cdp('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await delay(100);
  assert.deepEqual(await evaluate('window.__tankBattle.hud().controls'),{direction:null,fire:false});
  await click('#pause');const mobileSaved=await snapshot();await delay(500);
  await navigate('/games/tank-battle/index.html?verify=1&mobile=1');
  assert.equal((await snapshot()).tick,mobileSaved.tick,'mobile 1P save restores independently');
  assert.equal((await snapshot()).mode,1);
  await click('#resume');assert.equal((await snapshot()).phase,'playing');
  await cdp('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
  await delay(400);await capture('mobile-landscape.png');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth && document.documentElement.scrollHeight<=innerHeight'),true,'mobile controls fit viewport');
  await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:2,mobile:true});
  await delay(300);await capture('mobile-small.png');
  assert.equal(await evaluate('window.__tankBattle.hud().portraitPaused'),true,'portrait pauses and asks to rotate');
  await cdp('Emulation.setDeviceMetricsOverride',{width:568,height:320,deviceScaleFactor:2,mobile:true});await delay(300);
  assert.ok(await evaluate('(() => { const h=window.__tankBattle.hud();return [h.stick,h.fire].every(p=>p.x-p.radius>=0 && p.x+p.radius<=innerWidth && p.y+p.radius<=innerHeight); })()'),'small phone controls remain within the screen');
  await evaluate('window.dispatchEvent(new Event("blur"))');
  assert.equal((await snapshot()).phase,'paused','mobile pauses when backgrounded');
  assert.deepEqual(errors, [], 'browser errors');
  writeFileSync(resolve(output, 'browser.json'), `${JSON.stringify({ result: 'pass', checks: ['single shared Engine GUI canvas', 'assets', 'single-player movement/fire', 'simultaneous co-op controls', 'pause/resume', 'mute', 'exact autosave restore', 'blur pause', 'responsive square battlefield', '1P-only mobile menu', 'joystick and simultaneous fire', 'touch cancellation', 'independent mobile autosave', '320px and landscape layout', 'mobile background pause'], browserErrors: errors, screenshots: ['title.png', 'gameplay.png', 'compact-desktop.png', 'mobile.png', 'mobile-title.png', 'mobile-landscape.png', 'mobile-small.png'] }, null, 2)}\n`);
  console.log('Tank Battle browser checks passed. Screenshots: artifacts/tank-battle/');
  socket.close();
} catch (error) {
  console.error(stderr.slice(-5000));
  throw error;
} finally {
  child.kill(); await delay(500); server.closeAllConnections(); await new Promise(accept => server.close(accept));
  // Only delete the unique temporary profile created by this verifier inside its output directory.
  if (resolve(profile).startsWith(output + sep) && profile.includes('chrome-profile-')) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { /* Chrome may still hold a file; never delete outside our own profile. */ }
  }
}
