import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import { rotateSimulatorCamera } from './simulator-camera.mjs';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, 'artifacts/simulator');
const catalog = JSON.parse(readFileSync(resolve(root, 'games/manifest.json'), 'utf8')).entries.filter(entry => entry.launcher !== false);
const cases = process.env.SIMULATOR_CASE?.split(',') ?? catalog.map(entry => entry.id);
const modes = process.env.SIMULATOR_MODES?.split(',') ?? ['pad', 'phone'];
assert.ok(cases.every(id => catalog.some(entry => entry.id === id)), 'only manifest games can be selected');
assert.ok(modes.every(mode => ['pad', 'phone'].includes(mode)), 'only phone and pad modes can be selected');
mkdirSync(output, { recursive: true });
const delay = milliseconds => new Promise(done => setTimeout(done, milliseconds));
const checks = [], records = [];
const sources = ['site/app.js', 'site/gamepad.js', 'site/game-host.js', 'site/simulator.js', 'games/manifest.json', 'scripts/verify-simulator.mjs', 'scripts/simulator-camera.mjs', 'games/session/GameEngine.ts',
  ...['host', 'simulator'].flatMap(directory => readdirSync(resolve(root, 'games', directory)).filter(file => file.endsWith('.ts')).map(file => `games/${directory}/${file}`)),
  ...readdirSync(resolve(root, 'site/core')).filter(file => file.endsWith('.js')).map(file => 'site/core/' + file),
  ...cases.flatMap(id => readdirSync(resolve(root, 'games', id), { recursive: true }).filter(file => /\.(?:ts|html|css|js)$/.test(file)).map(file => `games/${id}/${file}`))];
const provenance = { generatedAt: new Date().toISOString(), cases, modes,
  revision: execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirtyWorkingTree: !!execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  fingerprints: Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')])) };
const result = await runChromeWebGpuFixture({ root, fixture: 'site/index.html', query: { gamepadVerify: 1, device: 'pad' }, timeoutMs: 600000,
  disableDx12InfoCollection: true, visualCapture: { viewportWidth: 1440, viewportHeight: 1000 }, interact: async cdp => {
    const evaluate = async expression => {
      const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text);
      return response.result?.result?.value;
    };
    const until = async (expression, label) => {
      for (let attempt = 0; attempt < 450; attempt++) { if (await evaluate(expression)) return; await delay(100); }
      throw new Error('Timed out: ' + label);
    };
    const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };
    const click = async id => {
      const node = await evaluate(`__gameHost.simulator.nodes.find(node=>node.id===${JSON.stringify(id)})`);
      assert.ok(node, 'device control ' + id);
      const point = { x: node.rect.x + node.rect.width / 2, y: node.rect.y + node.rect.height / 2 };
      await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    };
    const screenshot = async name => { const capture = await cdp.call('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve(output, name + '.png'), Buffer.from(capture.result.data, 'base64')); };
    const orient = orientation => rotateSimulatorCamera({ evaluate, cdp, until }, orientation);
    await until('window.__gameHost?.simulator?.status==="home"&&__gameHost.simulator.frames>4', '3D home');
    check(await evaluate('__gameHost.simulator.mesh&&!__gameOS.running&&!document.querySelector("iframe")'), 'device home uses an independent 3D mesh and Engine-rendered screen');
    await evaluate('window.__persistentDevice=haiyueGameOS.simulator;true');
    await screenshot('home');
    check(await evaluate('__gameHost.simulator.wallpaper.kind==="liquid-prism"&&!__gameHost.simulator.nodes.some(node=>node.id==="sim-rotate")'), 'device has its own procedural wallpaper and no orientation toggle button');
    const wallpaperBefore = await evaluate('haiyueGameOS.simulator.pixels()'); await delay(700);
    check((await evaluate('haiyueGameOS.simulator.pixels()')).hash !== wallpaperBefore.hash, 'actual physical device screen wallpaper pixels animate over time');
    await cdp.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await delay(600);
    const still = await evaluate('haiyueGameOS.simulator.pixels()'); await delay(300);
    check((await evaluate('haiyueGameOS.simulator.pixels()')).hash === still.hash, 'reduced-motion preference freezes the in-device shader');
    await orient('landscape'); check(await evaluate('__gameHost.simulator.rotation.angle===__gameHost.simulator.rotation.target'), 'reduced motion skips the rotation tween'); await orient('portrait');
    await cdp.call('Emulation.setEmulatedMedia', { features: [] });

    let paused;
    cdp.on('Fetch.requestPaused', event => { paused = event; });
    await cdp.call('Fetch.enable', { patterns: [{ urlPattern: '*/games/2048/bundle.js*', requestStage: 'Request' }] });
    await evaluate('haiyueGameOS.navigate("2048","pad");true');
    for (let attempt = 0; !paused && attempt < 100; attempt++) await delay(50);
    assert.ok(paused, 'deferred game code is intercepted before mounting');
    await until('__gameHost.simulator?.status==="loading"', 'screen-local code loading');
    check(await evaluate('haiyueGameOS.simulator===__persistentDevice&&__gameHost.simulator.loading.phase==="code"&&!__gameOS.running'), 'loading preserves the device mesh and camera without a desktop overlay');
    check((await evaluate('haiyueGameOS.simulator.pixels()')).colors > 20, 'the actual device RTT contains the loading interface');
    await screenshot('loading');
    await rotateSimulatorCamera({ evaluate, cdp, until }, 'landscape', false);
    await until('__gameHost.simulator.rotation.active', 'visible screen rotation tween');
    check(await evaluate('Math.abs(__gameHost.simulator.rotation.angle-__gameHost.simulator.rotation.target)>.01'), 'screen rotation has genuine intermediate frames, not a single-frame swap');
    await screenshot('rotation-midpoint'); await until('!__gameHost.simulator.rotation.active&&__gameHost.simulator.orientation==="landscape"', 'loading rotation settles');
    check(await evaluate('__gameHost.simulator.status==="loading"&&__gameHost.simulator.texture.width===1080&&__gameHost.simulator.texture.height===820'), 'rotation resizes in-screen loading without cancelling the import');
    await screenshot('loading-landscape');
    await click('load-cancel');
    await until('__gameHost.simulator.status==="home"&&!__gameHost.route.game', 'screen-local cancel');
    await cdp.call('Fetch.continueRequest', { requestId: paused.requestId }); await cdp.call('Fetch.disable'); await delay(300);
    check(await evaluate('!__gameHost.mounted&&haiyueGameOS.simulator===__persistentDevice'), 'cancelling a deferred import leaves no late-mounted game or replacement device');
    check(await evaluate('__gameHost.simulator.orientation==="landscape"&&__gameHost.simulator.simulatorHome'), 'Home preserves the selected landscape orientation');
    await screenshot('home-landscape');
    await click('sim-icon-2048'); await until('__gameHost.id==="2048"&&__gameHost.simulator.status==="playing"', 'launch from landscape icon home');
    check(await evaluate('__gameHost.simulator.orientation==="landscape"&&haiyueGameOS.game.canvas.width===1080&&haiyueGameOS.game.canvas.height===820'), 'a game launched from landscape home boots with landscape dimensions');
    await click('sim-home'); await until('__gameHost.simulator.status==="home"', 'landscape launch returns Home');
    await orient('portrait');

    const original = await evaluate('__gameHost.simulator.camera');
    await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 120, y: 450, button: 'left', buttons: 1 });
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 260, y: 510, button: 'left', buttons: 1 });
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 260, y: 510, button: 'left', buttons: 0 });
    await delay(300);
    const rotated = await evaluate('__gameHost.simulator.camera');
    check(Math.abs(rotated.theta - original.theta) > .01 && Math.abs(rotated.phi - original.phi) > .01, 'screen-exterior dragging rotates the real 3D camera');
    await screenshot('orbit');
    await click('sim-icon-2048'); await until('__gameHost.id==="2048"&&__gameHost.simulator.status==="playing"', 'perspective icon hit');
    check(await evaluate('haiyueGameOS.simulator===__persistentDevice'), 'perspective icon input mounts the game without replacing the camera or device');
    await evaluate('window.__erroredSource=haiyueGameOS.game.engine;haiyueGameOS.simulator.showLoading({phase:"error",completed:0,total:1,loaded:0,bytes:0,message:"检查网络连接，请重试"},"2048");true');
    await until('__gameHost.simulator.status==="error"', 'in-screen error interface'); await screenshot('retry');
    check(await evaluate('__gameHost.simulator.nodes.some(node=>node.id==="load-retry")&&!__gameOS.running'), 'retry remains inside the device screen with no desktop loading UI');
    await click('load-retry'); await until('__gameHost.id==="2048"&&__gameHost.simulator.status==="playing"', 'in-screen retry');
    check(await evaluate('__erroredSource.state==="destroyed"&&haiyueGameOS.simulator===__persistentDevice'), 'retry replaces the failed game instance while preserving the chassis and camera');
    await click('sim-home'); await until('__gameHost.simulator.status==="home"', 'rotated physical Home');
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 120, y: 450, deltaX: 0, deltaY: 100 }); await delay(150);
    check(Math.abs((await evaluate('__gameHost.simulator.camera.radius')) - original.radius) > .01, 'screen-exterior wheel adjusts camera distance');
    await click('sim-reset');
    await until(`Math.abs(__gameHost.simulator.camera.theta-${original.theta})<.001`, 'camera reset');

    for (const mode of modes) for (const id of cases) {
      await evaluate(`haiyueGameOS.navigate(${JSON.stringify(id)},${JSON.stringify(mode)});true`);
      await until(`__gameHost.id===${JSON.stringify(id)}&&__gameHost.phase==="playing"&&__gameHost.simulator.status==="playing"`, id + ' in ' + mode);
      await delay(200);
      const pixels = await evaluate('haiyueGameOS.simulator.pixels()');
      check(pixels.colors > 20 && pixels.gameColors > 20, `${id} ${mode} has real game pixels, not only the shader wallpaper`);
      if (id === 'pinball') check(pixels.colors > 500 && pixels.layerColors.some(colors => colors > 500) && await evaluate('__gameHost.simulator.layers>=1'), `pinball ${mode} preserves notebook art and the scene below its transparent HUD`);
      check(await evaluate('!!haiyueGameOS.game.texture&&haiyueGameOS.game.engine.state==="ready"'), `${id} ${mode} owns a live game target`);
      await screenshot(mode + '-' + id); records.push({ id, mode, orientation: 'portrait', pixels });
      await evaluate('window.__rotationGame=haiyueGameOS.game;true');
      await orient('landscape'); await delay(100);
      const landscape = await evaluate('haiyueGameOS.simulator.pixels()');
      check(landscape.width > landscape.height && landscape.colors > 20 && landscape.gameColors > 20, `${id} ${mode} landscape RTT contains actual game pixels`);
      check(await evaluate('haiyueGameOS.game===__rotationGame&&__gameHost.simulator.status==="playing"'), `${id} ${mode} rotation retains the mounted game instead of restarting it`);
      await screenshot(mode + '-landscape-' + id); records.push({ id, mode, orientation: 'landscape', pixels: landscape });
      await evaluate('window.__previousEngine=haiyueGameOS.game.engine;true');
      await click('sim-home'); await until('__gameHost.simulator.status==="home"&&!__gameHost.mounted', 'physical Home key after ' + id);
      check(await evaluate('__previousEngine.state==="destroyed"'), `${id} ${mode} physical Home disposes the source engine`);
      check(await evaluate('__gameHost.simulator.orientation==="landscape"'), `${id} ${mode} physical Home retains the rotated chassis`);
      await orient('portrait');
      console.log(`${id} ${mode}: ${pixels.colors} portrait / ${landscape.colors} landscape colors, physical Home returned`);
    }
    for (const [width, height] of [[390, 844], [844, 390]]) {
      await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await delay(300);
      const corners = await evaluate('__gameHost.simulator.corners');
      check(corners.every(point => point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height), `${width}x${height} resize keeps the perspective screen inside the viewport`);
      await screenshot('viewport-' + width + 'x' + height);
      await orient('landscape');
      const landscapeCorners = await evaluate('__gameHost.simulator.corners');
      check(landscapeCorners.every(point => point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height), `${width}x${height} landscape chassis fits the browser viewport`);
      await screenshot('viewport-landscape-' + width + 'x' + height); await orient('portrait');
    }
    await click('sim-desktop'); await until('__gameOS.running&&!__gameHost.simulator', 'exit device');
    check(await evaluate('!document.querySelector("#device-simulator,#game-host,iframe")'), 'exit releases device and game canvases');
    await evaluate(`(()=>{const result=document.createElement('pre');result.id='result';result.hidden=true;result.dataset.status='passed';result.textContent=JSON.stringify({status:'passed'});document.body.append(result);})()`);
  } });
writeFileSync(resolve(output, 'final.png'), Buffer.from(result.visualCapture.pngBase64, 'base64')); delete result.visualCapture.pngBase64;
writeFileSync(resolve(output, 'verification.json'), JSON.stringify({ ...result, provenance, checks, records }, null, 2));
console.log(`${checks.length} simulator checks passed`);
