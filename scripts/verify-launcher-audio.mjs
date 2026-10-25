import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = resolve(import.meta.dirname, '..'), output = resolve(root, 'artifacts/launcher-audio');
mkdirSync(output, { recursive: true });
const sources = ['site/app.js', 'site/gamepad.js', 'site/simulator.js', 'scripts/verify-launcher-audio.mjs', 'games/launcher/LauncherAudio.ts', 'games/launcher/audio/soundscape.ts',
  ...readdirSync(resolve(root, 'site/audio')).map(file => 'site/audio/' + file), ...readdirSync(resolve(root, 'site/core')).map(file => 'site/core/' + file)];
const provenance = { schemaVersion: 1, generatedAt: new Date().toISOString(),
  revision: execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirtyWorkingTree: !!execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  fingerprints: Object.fromEntries(sources.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')])) };
const checks = [], requests = [], delay = milliseconds => new Promise(done => setTimeout(done, milliseconds));
const result = await runChromeWebGpuFixture({ root, fixture: 'site/index.html', query: { verify: 1 }, timeoutMs: 240000,
  disableDx12InfoCollection: true, visualCapture: { viewportWidth: 1440, viewportHeight: 1000 }, interact: async cdp => {
    await cdp.call('Network.enable');
    cdp.on('Network.requestWillBeSent', event => { if (/\/audio\/[^/]+\.wav/.test(event.request.url)) requests.push(event.request.url); });
    const evaluate = async expression => {
      const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text);
      return response.result?.result?.value;
    };
    const until = async (expression, label) => { for (let attempt = 0; attempt < 450; attempt++) { if (await evaluate(expression)) return; await delay(100); } throw new Error('Timed out: ' + label + '\n' + JSON.stringify(await evaluate('haiyueGameOS.audio'))); };
    const check = (condition, label) => { assert.ok(condition, label); checks.push(label); };
    const point = async id => {
      const node = await evaluate(`__gameOS.nodes.find(node=>node.id===${JSON.stringify(id)})`); assert.ok(node, id);
      return { x: node.rect.x + node.rect.width / 2, y: node.rect.y + node.rect.height / 2 };
    };
    const click = async id => { const position = await point(id); for (const type of ['mousePressed', 'mouseReleased']) await cdp.call('Input.dispatchMouseEvent', { type, ...position, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 }); };
    const key = async name => { for (const type of ['keyDown', 'keyUp']) await cdp.call('Input.dispatchKeyEvent', { type, key: name, code: name }); };
    await until('window.__gameOS?.ready&&window.haiyueGameOS?.audio', 'desktop'); await delay(300);
    check(await evaluate('!haiyueGameOS.audio.unlocked&&haiyueGameOS.audio.loaded.length===0&&haiyueGameOS.audio.voices===0') && requests.length === 0, 'page never autoplays or downloads audio before a user gesture');
    await evaluate(`(()=>{const Native=window.AudioContext;window.__pageContexts=[];window.AudioContext=class extends Native{constructor(...args){super(...args);this.outputGains=[];__pageContexts.push(this);}createGain(){const node=super.createGain();this.outputGains.push(node);return node;}};return true;})()`);
    await click('view-all');
    await until('haiyueGameOS.audio.loaded.length===6&&haiyueGameOS.audio.music&&haiyueGameOS.audio.musicGain>.27&&haiyueGameOS.audio.played.click>0', 'gesture unlocks quiet music and click tone');
    check(requests.length === 6 && new Set(requests).size === 6 && requests.every(url => url.includes('/site/audio/')), 'six authored PCM files load once from the correct Live Server asset root');
    await evaluate(`(()=>{const context=__pageContexts[0],analyser=context.createAnalyser();context.outputGains[0].connect(analyser);window.__pageRms=()=>{const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((sum,sample)=>sum+sample*sample,0)/samples.length);};return true;})()`);
    await until('__pageRms()>.0001', 'actual ambient output samples');
    check(await evaluate('haiyueGameOS.audio.state==="running"&&haiyueGameOS.audio.voices<=6'), 'real Engine-owned mixer plays audible ambient samples with bounded voices');
    await click('view-all'); await delay(250);
    const before = await evaluate('haiyueGameOS.audio.played.select');
    await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...await point('game-2048') });
    await until(`haiyueGameOS.audio.played.select>${before}`, 'hover selection tone');
    const selected = await evaluate('haiyueGameOS.audio.played.select');
    for (let move = 0; move < 5; move++) await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...await point('game-2048') });
    check(await evaluate(`haiyueGameOS.audio.played.select===${selected}`), 'remaining over the same card does not retrigger ethereal selection sounds');
    await delay(120); await key('ArrowRight');
    check(await evaluate(`haiyueGameOS.audio.played.select>${selected}`), 'keyboard selection uses the same sound feedback as the mouse');
    await click('settings'); await until('__gameOS.settingsOpen', 'native audio settings');
    await click('settings-effects');
    check(await evaluate('!haiyueGameOS.audio.preferences.effects&&haiyueGameOS.audio.preferences.music&&haiyueGameOS.audio.music&&__pageRms()>.0001'), 'disabling effects preserves real audible background music');
    await click('settings-music'); await until('haiyueGameOS.audio.muted&&!haiyueGameOS.audio.music', 'both independent channels disabled'); await delay(100);
    check(await evaluate('__pageRms()<.00001&&localStorage.getItem("haiyue.game-os.audio-effects")==="false"&&localStorage.getItem("haiyue.game-os.audio-music")==="false"'), 'native settings independently save both switches and actually silence the output');
    await click('settings-close');
    const mutedClicks = await evaluate('haiyueGameOS.audio.played.click'); await click('favorite');
    check(await evaluate(`haiyueGameOS.audio.played.click===${mutedClicks}`), 'muted UI actions do not create silent effect voices');
    await click('settings');await click('settings-effects');
    await until('haiyueGameOS.audio.preferences.effects&&!haiyueGameOS.audio.preferences.music&&!haiyueGameOS.audio.music', 'effects without music');
    const effectsOnly=await evaluate('haiyueGameOS.audio.played.click');
    await click('settings-close');await click('favorite');
    check(await evaluate(`haiyueGameOS.audio.played.click>${effectsOnly}&&!haiyueGameOS.audio.music`), 'real click voices still play when background music is disabled');
    await click('settings');await click('settings-music');await click('settings-close');await until('!haiyueGameOS.audio.muted&&haiyueGameOS.audio.music', 'both channels enabled');
    check(await evaluate('__pageContexts.length===1') && requests.length === 6, 'unmute reuses one audio context and decoded buffers rather than duplicating music');
    await click('game-2048'); await until('__gameHost.id==="2048"&&__gameHost.phase==="playing"', 'game route'); await delay(600);
    check(await evaluate('!haiyueGameOS.audio.active&&!haiyueGameOS.audio.music&&haiyueGameOS.audio.played.launch>0'), 'starting a game plays an airy transition and fades out page music');
    await key('Escape'); await until('__gameOS.running&&haiyueGameOS.audio.music', 'return from game');
    check(await evaluate('haiyueGameOS.audio.played.back>0'), 'returning restores calm music with a soft return tone');
    await click('devices'); await until('__gameHost.simulator?.status==="home"', 'device home');
    await click('sim-volume-down');
    await until('Math.abs(__pageContexts[0].outputGains[0].gain.value-.72)<.001', 'page audio master follows device volume');
    check(await evaluate('haiyueGameOS.audio.level===.9&&haiyueGameOS.audio.played.volume>0&&Math.abs(__pageContexts[0].outputGains[0].gain.value-.72)<.001'), 'device volume controls real page music and the ethereal volume-key tone');
    await click('sim-audio'); await until('haiyueGameOS.audio.muted&&!haiyueGameOS.audio.music', 'device sound toggle');
    await click('sim-phone'); await until('__gameHost.simulator?.mode==="phone"&&__gameHost.simulator.status==="home"', 'phone');
    check(await evaluate('__gameHost.simulator.nodes.find(node=>node.id==="sim-audio").text==="♪ 关"&&haiyueGameOS.audio.level===.9'), 'sound preference and volume survive switching devices');
    await click('sim-audio'); await until('haiyueGameOS.audio.music', 'device unmute');
    await evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"));true');
    await until('haiyueGameOS.audio.state==="suspended"', 'hidden tab suspends audio');
    check(await evaluate('haiyueGameOS.audio.hidden'), 'hidden pages suspend the actual audio context');
    await evaluate('delete document.hidden;document.dispatchEvent(new Event("visibilitychange"));true');
    await until('haiyueGameOS.audio.state==="running"&&haiyueGameOS.audio.music', 'visible tab resumes audio');
    check(await evaluate('__pageContexts.length===1&&haiyueGameOS.audio.voices<=6'), 'visibility resume retains one bounded mixer without duplicate background tracks');
    const capture = await cdp.call('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve(output, 'sound-controls.png'), Buffer.from(capture.result.data, 'base64'));
    await evaluate('window.dispatchEvent(new PageTransitionEvent("pagehide",{persisted:false}));true');
    check(await evaluate('haiyueGameOS.audio.disposed&&haiyueGameOS.audio.voices===0&&haiyueGameOS.audio.audioNodes===0'), 'page teardown releases the soundtrack, effect voices and output nodes');
    await evaluate(`(()=>{const result=document.createElement('pre');result.id='result';result.hidden=true;result.dataset.status='passed';result.textContent=JSON.stringify({status:'passed'});document.body.append(result);})()`);
  } });
writeFileSync(resolve(output, 'final.png'), Buffer.from(result.visualCapture.pngBase64, 'base64')); delete result.visualCapture.pngBase64;
writeFileSync(resolve(output, 'verification.json'), JSON.stringify({ ...result, provenance, checks, requests }, null, 2));
console.log(`${checks.length} launcher audio checks passed`);
