import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(root, 'artifacts/2048'); mkdirSync(output, { recursive: true });
const chrome = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
if (!existsSync(chrome)) throw new Error('Set CHROME_PATH to an installed Chrome executable.');
const profile = mkdtempSync(resolve(output, 'chrome-profile-'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.wav': 'audio/wav' };
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

  const snapshot = () => evaluate('window.__forge2048.snapshot()');
  const capture = async name => {
    const result = await cdp('Page.captureScreenshot', {format:'png'});
    writeFileSync(resolve(output, name), Buffer.from(result.data, 'base64'));
  };
  const click = async name => {
    const rect = (await snapshot()).buttons[name];
    const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    await cdp('Input.dispatchMouseEvent', {type:'mousePressed',button:'left',clickCount:1,...point});
    await cdp('Input.dispatchMouseEvent', {type:'mouseReleased',button:'left',clickCount:1,...point});
    await delay(100);
  };
  const key = async value => {
    await cdp('Input.dispatchKeyEvent', {type:'keyDown',key:value,code:value,windowsVirtualKeyCode:{ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40}[value]});
    await cdp('Input.dispatchKeyEvent', {type:'keyUp',key:value,code:value});
  };
  // Freeze between deterministic animation frames for merge screenshots.
  const frame = async ms => {
    await evaluate(`window.__forgeFrameTime += ${ms}; (() => {const callbacks = window.__forgeFrames.splice(0); for (const cb of callbacks) cb(window.__forgeFrameTime);})()`);
    await delay(20);
  };
  await cdp('Runtime.enable'); await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', {source:`
    window.__gpuErrors = [];
    if (navigator.gpu) { const original = GPUDevice.prototype.addEventListener; const request = GPUAdapter.prototype.requestDevice;
      GPUAdapter.prototype.requestDevice = async function(...args) { const device = await request.apply(this,args); original.call(device,'uncapturederror', e => window.__gpuErrors.push(e.error.message)); return device; };
    }
    window.__forgeFrames = []; window.__forgeFrameTime = performance.now();
    window.requestAnimationFrame = cb => { window.__forgeFrames.push(cb); return window.__forgeFrames.length; };
    window.cancelAnimationFrame = () => {};
  `});
  await cdp('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const navigate = async suffix => {
    await cdp('Page.navigate', {url:`${base}/games/2048/index.html?verify=1${suffix}`});
    await until(() => evaluate('document.body?.dataset.renderStatus === "failed" ? Promise.reject(new Error("Game init failed")) : !!window.__forge2048'), '2048 ready', 90000);
    await evaluate('window.__forgeFrameTime = performance.now()');
    for(let i=0;i<20;i++) await frame(16.67);
  };
  await navigate('');
  const initial = await snapshot();
  assert.equal(initial.tiles, 20);
  assert.equal(await evaluate('document.querySelectorAll("canvas").length'),1);
  await capture('desktop.png');
  assert.equal(initial.tileTextOverlays,0);
  assert.equal(initial.numberedTextures.values.length,11);
  assert.ok(initial.numberedTextures.normalScale>1);
  // Export the actual images bound to the PBR material, rather than a separate mockup.
  for (const slot of ['albedo','normal','roughness']) {
    const data = await evaluate(`(() => {const map=window.__forge2048.texture(128)[${JSON.stringify(slot)}]; const c=document.createElement('canvas');c.width=map.width;c.height=map.height;c.getContext('2d').drawImage(map,0,0);return c.toDataURL('image/png').split(',')[1];})()`);
    writeFileSync(resolve(output,`tile-128-${slot}.png`),Buffer.from(data,'base64'));
  }
  await evaluate('window.__forge2048.radius(6.8)'); await frame(20); await capture('engraved-closeup.png');
  const withNormal = await cdp('Page.captureScreenshot',{format:'png'});
  await evaluate('for(const value of window.__forge2048.snapshot().numberedTextures.values) window.__forge2048.material(value).normalScale=0');
  await frame(20); const withoutNormal = await cdp('Page.captureScreenshot',{format:'png'});
  assert.notEqual(withNormal.data,withoutNormal.data,'glyph normal maps change actual PBR shading');
  writeFileSync(resolve(output,'engraved-no-normal.png'),Buffer.from(withoutNormal.data,'base64'));
  await evaluate('for(const value of window.__forge2048.snapshot().numberedTextures.values) window.__forge2048.material(value).normalScale=1.7; window.__forge2048.radius(11.788)');
  await frame(20);
  await key('ArrowLeft');
  await frame(90);
  assert.ok((await snapshot()).effects > 0);
  await frame(220);
  const mid = await snapshot();
  assert.ok(mid.hiddenTiles > 0);
  assert.ok(mid.trianglesPerMerge >= 96);
  await capture('merge-fragments.png');
  await frame(400);
  const end = await snapshot();
  assert.equal(end.audio.loaded,5); assert.equal(end.audio.decoded,5); assert.ok(end.audio.voices<=8);
  assert.equal(end.effects,0); assert.equal(end.hiddenTiles,0); assert.equal(end.score,4092);
  assert.equal(end.board[0][0],4); assert.equal(end.board[0][1],8);
  assert.ok(end.board.flat().includes(2048));
  await frame(200); await capture('milestone.png'); await click('keep'); await frame(20); await capture('reassembled.png');
  // Reset mid-burst through a real GUI button, then replay to check pool reuse.
  await evaluate('window.__forge2048.fixture()'); await frame(20);
  await key('ArrowLeft'); await frame(240); await click('restart'); await frame(30);
  assert.equal((await snapshot()).effects,0); assert.equal((await snapshot()).tiles,2);
  for (let i=0;i<4;i++) {
    await evaluate('window.__forge2048.fixture()'); await frame(20);
    await key('ArrowLeft'); await frame(700);
    assert.equal((await snapshot()).pool,end.pool,'replay reuses bounded geometry batches');
  }
  await click('keep'); await frame(20);
  await click('sound'); assert.equal((await snapshot()).muted,true); assert.equal((await snapshot()).audio.voices,0);
  await click('sound'); assert.equal((await snapshot()).muted,false);
  // Buffered input executes once after effects settle.
  await evaluate('window.__forge2048.fixture("play")'); await frame(20);
  await key('ArrowRight'); const beforeBuffered = (await snapshot()).board;
  await key('ArrowDown'); await frame(700);
  assert.notDeepEqual((await snapshot()).board,beforeBuffered,'buffered move changes the board after the first animation');
  await frame(700); assert.equal((await snapshot()).effects,0);
  // Maximum workload on a 6x6 board: 18 simultaneous merges, still one reusable batch per pair.
  await evaluate('window.__forge2048.fixture("full")'); await frame(20);
  await key('ArrowLeft'); await frame(240);
  assert.equal((await snapshot()).effects,18); assert.equal((await snapshot()).pool,18);
  await capture('maximum-merges.png');
  await click('restart'); await frame(30);
  assert.equal((await snapshot()).effects,0); assert.equal((await snapshot()).hiddenTiles,0);
  // 320px phone, high DPI, touch input and landscape.
  assert.deepEqual(await evaluate('window.__gpuErrors'),[]);
  await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await evaluate('window.__forge2048.fixture()'); for(let i=0;i<5;i++) await frame(20);
  await capture('mobile.png');
  await cdp('Emulation.setTouchEmulationEnabled',{enabled:true});
  await cdp('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:280,y:440,id:1}]});
  await cdp('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:110,y:440,id:1}]});
  await cdp('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await frame(700); assert.ok((await snapshot()).score>0,'swipe merges');
  await click('keep'); await frame(20);
  await cdp('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true});
  for(let i=0;i<5;i++) await frame(20); await capture('mobile-small.png');
  for(const rect of Object.entries((await snapshot()).buttons).filter(([name])=>name!=='keep').map(([,rect])=>rect)) assert.ok(rect.x>=0 && rect.x+rect.width<=320 && rect.y>=0 && rect.y+rect.height<=568);
  await cdp('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
  for(let i=0;i<5;i++) await frame(20); await capture('landscape.png');
  assert.deepEqual(await evaluate('window.__gpuErrors'),[],'desktop and mobile WebGPU validation');
  await cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await navigate(''); assert.equal((await snapshot()).reducedMotion,true);
  await key('ArrowLeft'); await frame(20); assert.equal((await snapshot()).effects,0);
  await frame(250); assert.equal((await snapshot()).hiddenTiles,0);
  assert.deepEqual(await evaluate('window.__gpuErrors'),[],'WebGPU validation');
  assert.deepEqual(errors,[],'browser errors');
  writeFileSync(resolve(output,'browser.json'),JSON.stringify({result:'pass',initial,mid,end,checks:['baked numeral albedo and normal atlas','zero floating tile labels','normal-map shading comparison','PBR assets','two-source triangle reassembly','score and 2048 milestone','restart during burst','bounded pool reuse','18 simultaneous merges','mute','queued input','DPR2 mobile swipe','320px controls','landscape','reduced motion','WebGPU validation'],errors},null,2));
  console.log('2048 Forge browser checks passed. Screenshots: artifacts/2048/');
  socket.close();
} catch(error) { console.error(stderr.slice(-3000)); throw error; }
finally {
  child.kill(); await delay(500); server.closeAllConnections(); await new Promise(accept=>server.close(accept));
  if(resolve(profile).startsWith(output+sep) && profile.includes('chrome-profile-')) {
    try {rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});} catch { /* Chrome may still hold a profile file. */ }
  }
}
