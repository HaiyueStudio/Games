import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
import { rotateSimulatorCamera } from './simulator-camera.mjs';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, 'artifacts/simulator-volume');
mkdirSync(output, { recursive: true });
const sources = ['site/app.js', 'site/game-host.js', 'site/simulator.js', 'scripts/verify-simulator-volume.mjs', 'scripts/simulator-camera.mjs',
  ...['host', 'simulator'].flatMap(directory => readdirSync(resolve(root, 'games', directory)).filter(file => file.endsWith('.ts')).map(file => `games/${directory}/${file}`)),
  ...readdirSync(resolve(root, 'site/core')).filter(file => file.endsWith('.js')).map(file => 'site/core/' + file), 'games/2048/bundle.js'];
const provenance = { schemaVersion: 1, generatedAt: new Date().toISOString(), cases: ['pad', 'phone'], orientations: ['portrait', 'landscape'],
  revision: execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirtyWorkingTree: !!execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  fingerprints: Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')])) };
const checks = [], delay = milliseconds => new Promise(done => setTimeout(done, milliseconds));
const result = await runChromeWebGpuFixture({ root, fixture: 'site/index.html', query: { verify: 1, device: 'pad' }, timeoutMs: 240000,
  disableDx12InfoCollection: true, visualCapture: { viewportWidth: 1440, viewportHeight: 1000 }, interact: async cdp => {
    const evaluate = async expression => {
      const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text);
      return response.result?.result?.value;
    };
    const until = async (expression, label) => {
      for (let attempt = 0; attempt < 450; attempt++) { if (await evaluate(expression)) return; await delay(100); }
      throw new Error('Timed out: ' + label + '\n' + await evaluate('JSON.stringify({volume:window.__gameHost?.simulator?.volume,audio:window.haiyueGameOS?.game?.audio})'));
    };
    const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };
    const tap = async (point, touch = false) => {
      if (touch) { await cdp.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 0 }] }); await cdp.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); return; }
      for (const type of ['mousePressed', 'mouseReleased']) await cdp.call('Input.dispatchMouseEvent', { type, ...point, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    };
    const click = async (id, touch = false) => {
      const node = await evaluate(`__gameHost.simulator.nodes.find(node=>node.id===${JSON.stringify(id)})`); assert.ok(node, id);
      await tap({ x: node.rect.x + node.rect.width / 2, y: node.rect.y + node.rect.height / 2 }, touch);
    };
    const gameButton = async name => {
      const point = await evaluate(`(()=>{const game=haiyueGameOS.game,snapshot=game.debug.__forge2048.snapshot(),button=snapshot.buttons[${JSON.stringify(name)}];return haiyueGameOS.simulator.projectGame((button.x+button.width/2)/snapshot.viewport.width,(button.y+button.height/2)/snapshot.viewport.height);})()`);
      await tap(point);
    };
    const screenshot = async name => { const capture = await cdp.call('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve(output, name + '.png'), Buffer.from(capture.result.data, 'base64')); };
    await until('window.__gameHost?.simulator?.status==="home"&&__gameHost.simulator.frames>4', 'device home');
    let paused;
    cdp.on('Fetch.requestPaused', event => { paused = event; });
    await cdp.call('Fetch.enable', { patterns: [{ urlPattern: '*/games/2048/bundle.js*', requestStage: 'Request' }] });
    await click('sim-icon-2048');
    for (let attempt = 0; !paused && attempt < 100; attempt++) await delay(50);
    assert.ok(paused, 'game import held for loading volume test');
    await until('__gameHost.simulator.status==="loading"', 'in-device loading');
    await click('sim-volume-down');
    check(await evaluate('__gameHost.simulator.volume.percent===90&&__gameHost.simulator.volume.visible&&__gameHost.simulator.status==="loading"'), 'physical volume button works during deferred loading and displays a screen-local HUD');
    await screenshot('loading-volume');
    await evaluate(`(()=>{const Native=window.AudioContext;window.__volumeContexts=[];window.AudioContext=class extends Native{constructor(...args){super(...args);__volumeContexts.push(this);}};return true;})()`);
    await cdp.call('Fetch.continueRequest', { requestId: paused.requestId }); await cdp.call('Fetch.disable');
    await until('__gameHost.id==="2048"&&__gameHost.simulator.status==="playing"', '2048 after deferred import');
    check(await evaluate('haiyueGameOS.game.audio.level===.9'), 'volume selected while loading reaches the future game before its first audio context');

    for (const mode of ['pad', 'phone']) {
      if (mode === 'phone') { await click('sim-phone'); await until('__gameHost.simulator?.mode==="phone"&&__gameHost.simulator.status==="playing"', 'phone game'); }
      await evaluate('window.__volumeGame=haiyueGameOS.game;window.__volumeBoard=JSON.stringify(haiyueGameOS.game.debug.__forge2048.snapshot().board);window.__volumeCamera=JSON.stringify(__gameHost.simulator.camera);true');
      const previous = await evaluate('__gameHost.simulator.volume.percent');
      await click('sim-volume-down', true);
      check(await evaluate(`__gameHost.simulator.volume.percent===${previous - 10}&&__gameHost.simulator.volume.visible`), `${mode} side key responds to actual touch with a ten-percent step`);
      check(await evaluate('JSON.stringify(haiyueGameOS.game.debug.__forge2048.snapshot().board)===__volumeBoard&&JSON.stringify(__gameHost.simulator.camera)===__volumeCamera'), `${mode} side key neither drags the camera nor sends gameplay input`);
      if (await evaluate('haiyueGameOS.game.debug.__forge2048.snapshot().muted')) await gameButton('sound');
      await gameButton('restart');
      await until('haiyueGameOS.game.audio.contexts>0&&haiyueGameOS.game.debug.__forge2048.snapshot().audio.state==="running"&&haiyueGameOS.game.debug.__forge2048.snapshot().audio.decoded>0', mode + ' real game audio unlocked');
      await evaluate(`(()=>{const context=__volumeContexts.findLast(context=>context.state!=='closed'&&context.destination instanceof GainNode),source=context.createOscillator(),gain=context.createGain(),analyser=context.createAnalyser();gain.gain.value=.025;source.frequency.value=440;source.connect(gain).connect(context.destination);context.destination.connect(analyser);source.start();window.__volumeProbe={context,source,analyser,rms(){const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((sum,sample)=>sum+sample*sample,0)/samples.length);}};return true;})()`);
      await until('__volumeProbe.rms()>.002', mode + ' measured non-silent output');
      check(await evaluate('haiyueGameOS.game.audio.gains.every(gain=>Math.abs(gain-__gameHost.simulator.volume.level)<.001)'), `${mode} real Web Audio output uses device gain without replacing the game mixer`);
      await screenshot(mode + '-portrait-volume');
      await rotateSimulatorCamera({ evaluate, cdp, until }, 'landscape');
      await click('sim-volume-up'); await delay(60);
      check(await evaluate('haiyueGameOS.game===__volumeGame&&__gameHost.simulator.volume.visible&&__gameHost.simulator.volume.rect.y<__gameHost.simulator.screen.y+__gameHost.simulator.screen.height/3'), `${mode} volume HUD reflows to the top of the landscape screen without remounting`);
      await screenshot(mode + '-landscape-volume');
      for (let press = 0; press < 11; press++) await click('sim-volume-down');
      await until('haiyueGameOS.game.audio.gains.every(gain=>gain===0)', mode + ' output silence');
      await until('__volumeProbe.rms()<.00001', mode + ' measured output silence');
      check(await evaluate('__volumeProbe.rms()<.00001'), `${mode} post-master audio samples are actually silent at zero volume`);
      check(await evaluate('__gameHost.simulator.volume.muted&&__gameHost.simulator.nodes.some(node=>node.id==="volume-label"&&node.text==="已静音 0%")&&!haiyueGameOS.game.debug.__forge2048.snapshot().muted'), `${mode} zero volume silences the real output while preserving the game mute preference`);
      await screenshot(mode + '-muted');
      await click('sim-volume-up'); await delay(60);
      await until('__volumeProbe.rms()>.0005', mode + ' measured audible output restored');
      check(await evaluate('__gameHost.simulator.volume.percent===10&&haiyueGameOS.game.audio.gains.every(gain=>Math.abs(gain-.1)<.001)'), `${mode} volume up restores sound from zero`);
      for (let press = 0; press < 11; press++) await click('sim-volume-up');
      check(await evaluate('__gameHost.simulator.volume.percent===100'), `${mode} repeated volume up stays clamped to 100 percent`);
      await delay(2200);
      check(await evaluate('!__gameHost.simulator.volume.visible&&!__gameHost.simulator.nodes.some(node=>node.id==="volume-background")'), `${mode} transient volume overlay disappears automatically`);
      await click('sim-volume-down'); await click('sim-volume-down');
      await evaluate('window.__volumeSource=haiyueGameOS.game;true');
      await click('sim-home'); await until('__gameHost.simulator.status==="home"', mode + ' Home');
      check(await evaluate('__volumeSource.audio.contexts===0&&__volumeSource.disposed&&__gameHost.simulator.volume.percent===80'), `${mode} Home disposes audio outputs but retains device volume`);
      await rotateSimulatorCamera({ evaluate, cdp, until }, 'portrait');
      await click('sim-icon-2048'); await until('__gameHost.id==="2048"&&__gameHost.simulator.status==="playing"', mode + ' relaunch');
      check(await evaluate('haiyueGameOS.game.audio.level===.8'), `${mode} newly launched games inherit device volume`);
    }
    await click('sim-desktop'); await until('__gameOS.running&&!__gameHost.simulator', 'device disposal');
    await evaluate(`(()=>{const result=document.createElement('pre');result.id='result';result.hidden=true;result.dataset.status='passed';result.textContent=JSON.stringify({status:'passed'});document.body.append(result);})()`);
  } });
writeFileSync(resolve(output, 'final.png'), Buffer.from(result.visualCapture.pngBase64, 'base64')); delete result.visualCapture.pngBase64;
writeFileSync(resolve(output, 'verification.json'), JSON.stringify({ ...result, provenance, checks }, null, 2));
console.log(`${checks.length} simulator volume checks passed`);
