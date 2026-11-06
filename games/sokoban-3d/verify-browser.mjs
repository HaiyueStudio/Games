import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GameSaveService, MemorySaveBackend } from '@haiyue/engine/save';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = resolve(import.meta.dirname, '../..'), output = resolve(root, 'artifacts/sokoban'); mkdirSync(output, { recursive: true });
const files = readdirSync(import.meta.dirname, { recursive: true }).filter(file => /\.(?:ts|jpg|json|mjs|txt|md)$/.test(file)).map(file => 'games/sokoban-3d/' + file.replaceAll('\\', '/'));
const provenance = { classification: 'local-diagnostic', generatedAt: new Date().toISOString(), revision: execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  dirtyWorkingTree: !!execFileSync('git', ['-c', 'safe.directory=' + root.replaceAll('\\', '/'), 'status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(),
  fingerprints: Object.fromEntries([...files, 'games/sokoban-3d/bundle.js', 'site/game-host.js'].map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')])) };
const evidence = [], wait = ms => new Promise(done => setTimeout(done, ms));
const levelData = JSON.parse(readFileSync(resolve(import.meta.dirname, 'levels.json')));
const result = await runChromeWebGpuFixture({ root, fixture: 'games/sokoban-3d/index.html', query: { verify: 1 }, timeoutMs: 180000, disableDx12InfoCollection: true,
  visualCapture: { viewportWidth: 1280, viewportHeight: 800 }, interact: async cdp => {
    const evaluate = async expression => {
      const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
      if (response.result?.exceptionDetails) throw Error(response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text);
      return response.result?.result?.value;
    };
    const until = async (expression, label) => { for (let i = 0; i < 300; i++) { if (await evaluate(expression)) return; await wait(50); } throw Error('Timed out: ' + label); };
    const snap = () => evaluate('__sokoban.snapshot()');
    const settle = () => until('!__sokoban.snapshot().animating&&!__sokoban.snapshot().queued', 'actor arrival');
    const capture = async name => { const shot = await cdp.call('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve(output, name + '.png'), Buffer.from(shot.result.data, 'base64')); };
    const checkButtons = hud => assert.ok(hud.nodes.filter(node => node.type === 'GuiButton' && node.visible).every(node =>
      node.rect.x >= 0 && node.rect.y >= 0 && node.rect.x + node.rect.width <= hud.width + 1 && node.rect.y + node.rect.height <= hud.height + 1), 'native GUI controls fit the viewport');
    const playRoute = async route => evaluate(`(()=>{const dirs={U:[0,-1],R:[1,0],D:[0,1],L:[-1,0]};for(const letter of ${JSON.stringify(route)})__sokoban.move(...dirs[letter]);})()`);
    const click = async id => {
      const rect = await evaluate(`__gameHud.nodes.find(node=>node.id===${JSON.stringify(id)}).rect`);
      const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    };
    await until('!!window.__sokoban', 'Sokoban startup'); await evaluate('__sokoban.level(0)'); await wait(150);
    assert.equal((await snap()).materials.images, 3);
    assert.equal((await snap()).levelCount, 66);
    const sourceHash = await evaluate(`fetch('./${levelData.expansion.sourceFile}').then(r=>{if(!r.ok)throw Error('source HTTP '+r.status);return r.arrayBuffer()}).then(async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join(''))`);
    assert.equal(sourceHash, levelData.expansion.sha256, 'the original collection ships as a declared asset');
    const metadata = JSON.parse(readFileSync(resolve(import.meta.dirname, 'assets/textures/generation.json')));
    for (const asset of metadata.assets) {
      const bytes = await evaluate(`fetch('./assets/textures/${asset.file}').then(r=>{if(!r.ok)throw Error('asset HTTP '+r.status);return r.arrayBuffer()}).then(async bytes=>({length:bytes.byteLength,hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('')}))`);
      assert.equal(bytes.length, asset.bytes); assert.equal(bytes.hash, asset.sha256);
    }
    await capture('warehouse-desktop');
    const initial = await snap();
    await evaluate(`window.__crateFrames=[];window.__traceCrates=true;requestAnimationFrame(function trace(){if(!window.__traceCrates)return;__crateFrames.push(__sokoban.snapshot().boxes.map(box=>({materialId:box.materialId,tint:box.tint})));requestAnimationFrame(trace)});`);
    await evaluate('__sokoban.move(0,-1)'); await settle();
    assert.equal((await snap()).moves, 0); assert.equal((await snap()).audio.played.blocked, 1);
    await click('sokoban-move-0'); await wait(45);
    const midway = await snap();
    assert.equal(midway.player.x, 2); assert.equal(midway.animating, true);
    assert.ok(midway.playerPosition[0] < initial.playerPosition[0] && midway.playerPosition[0] > initial.playerPosition[0] - 42);
    evidence.push({ case: 'interpolated-step', midway });
    await evaluate('__sokoban.undo()'); await settle();
    assert.deepEqual((await snap()).player, initial.player); assert.deepEqual((await snap()).playerPosition, initial.playerPosition); assert.equal((await snap()).moves, 0);
    await evaluate('__sokoban.move(-1,0);__sokoban.move(0,-1)'); await settle();
    assert.deepEqual((await snap()).player, { x: 2, y: 3 }); assert.equal((await snap()).moves, 2);
    await evaluate('__sokoban.restart()');
    assert.equal((await snap()).history, 0); assert.equal((await snap()).queued, null);
    for (const [x, y] of [[-1,0],[0,-1],[0,-1]]) { await evaluate(`__sokoban.move(${x},${y})`); await settle(); }
    const beforePush = await snap();
    await evaluate('__sokoban.move(1,0)'); await wait(55);
    const pushing = await snap(); assert.ok(pushing.boxes[0].position[0] > beforePush.boxes[0].position[0] && pushing.boxes[0].position[0] < beforePush.boxes[0].position[0] + 42);
    evidence.push({ case: 'interpolated-push', pushing }); await capture('warehouse-pushing'); await settle();
    for (const [x, y] of [[0,-1],[1,0],[1,0],[0,1],[0,1],[-1,0],[0,-1],[1,0],[0,-1]]) { await evaluate(`__sokoban.move(${x},${y})`); await settle(); }
    await evaluate('__sokoban.move(-1,0);__sokoban.move(0,1)'); await wait(35);
    assert.equal((await snap()).victoryVisible, false, 'victory waits for the last crate to finish sliding');
    await settle();
    const won = await snap(); assert.equal(won.solved, true); assert.equal(won.audio.played.win, 1); assert.ok(won.audio.played.push >= 3); assert.equal(won.audio.error, null);
    assert.equal(won.victoryVisible, true); assert.equal(won.queued, null); assert.equal(won.moves, 14);
    const victoryHud = await evaluate('__gameHud');
    assert.equal(victoryHud.nodes.find(node => node.id === 'sokoban-victory-moves').text, '14');
    assert.equal(victoryHud.nodes.find(node => node.id === 'sokoban-victory-progress').text, '1 / 66');
    assert.ok(won.completedLevels.includes(0));
    assert.equal(won.boxes[0].materialId, initial.boxes[0].materialId, 'first target arrival keeps the existing wood material');
    assert.notDeepEqual(won.boxes[0].tint, initial.boxes[0].tint, 'arrival still applies the completed tint');
    await capture('warehouse-complete');
    await evaluate('__sokoban.move(0,1)'); assert.equal((await snap()).moves, won.moves, 'victory blocks gameplay and clears held input');
    for (const [width, height] of [[390,844],[844,390],[1280,800]]) {
      await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }); await wait(200);
      const hud = await evaluate('__gameHud'); checkButtons(hud);
      const rect = hud.victoryRect;
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height);
      await capture('warehouse-victory-' + width); evidence.push({ case: 'victory-viewport', width, height, hud });
    }
    await click('sokoban-victory-close');
    await evaluate('__sokoban.move(0,1)'); await settle(); assert.equal((await snap()).audio.played.win, 1, 'walking after completion cannot replay the victory phrase');
    await evaluate('__sokoban.undo()'); await settle();
    await evaluate('__sokoban.undo()'); await settle();
    assert.deepEqual((await snap()).boxes[0].tint, initial.boxes[0].tint, 'undoing target arrival restores the original tint');
    await evaluate('__sokoban.move(-1,0)'); await settle();
    assert.equal((await snap()).audio.played.win, 2, 'a new solve after undo can play its victory cue');
    const crateFrames = await evaluate('window.__traceCrates=false;__crateFrames');
    assert.ok(crateFrames.length > 5);
    assert.ok(crateFrames.every(frame => frame[0].materialId === initial.boxes[0].materialId), 'every rendered transition frame retains the crate material');
    evidence.push({ case: 'stable-target-texture-binding', frames: crateFrames });
    await click('sokoban-victory-next');
    assert.equal((await snap()).levelIndex, 1); assert.equal((await snap()).victoryVisible, false); assert.equal((await snap()).moves, 0);
    await cdp.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await evaluate('__sokoban.level(0)'); await playRoute('LUURURRDDLURUL');
    assert.equal((await snap()).victoryVisible, true);
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    assert.equal((await snap()).levelIndex, 1, 'keyboard confirmation advances exactly one level');
    await evaluate('__sokoban.level(0)'); await playRoute('LUURURRDDLURUL');
    await click('sokoban-victory-replay');
    assert.equal((await snap()).levelIndex, 0); assert.equal((await snap()).moves, 0); assert.equal((await snap()).victoryVisible, false);
    await playRoute('LUURURRDDLURUL'); await click('sokoban-victory-levels');
    assert.equal((await snap()).levelsPanelOpen, true); assert.equal((await snap()).victoryVisible, false);
    await click('sokoban-levels-next-page');
    assert.equal((await snap()).levelsPage, 1);
    await click('sokoban-level-slot-7'); assert.equal((await snap()).levelIndex, 16);
    assert.equal((await snap()).levelName, 'Sasquatch III 01');
    await wait(100); await capture('warehouse-sasquatch-01');
    await evaluate('__sokoban.move(1,0)'); assert.equal((await snap()).moves, 1);
    await evaluate('__sokoban.undo()'); assert.equal((await snap()).moves, 0);
    await click('sokoban-levels');
    for (let page = 1; page < 7; page++) await click('sokoban-levels-next-page');
    assert.equal((await snap()).levelsPage, 7);
    assert.equal((await evaluate('__gameHud')).nodes.filter(node => node.id.startsWith('sokoban-level-slot-') && node.visible).length, 3, 'the last page hides unused slots');
    await capture('warehouse-levels-last-page');
    await click('sokoban-level-slot-2'); assert.equal((await snap()).levelIndex, 65);
    await evaluate('__sokoban.move(1,0)'); assert.equal((await snap()).moves, 1);
    const last = await snap();
    await wait(200); await cdp.call('Page.reload', {}); await wait(400);
    await until('!!window.__sokoban&&__sokoban.snapshot().levelIndex===65', 'restore Sasquatch III level fifty');
    assert.deepEqual((await snap()).completedLevels, last.completedLevels, 'old and new completed indices survive a reload');
    assert.equal((await snap()).moves, last.moves);
    assert.deepEqual((await snap()).player, last.player);
    evidence.push({ case: 'victory-actions-and-expansion', last });
    const imported = [];
    for (let index = 16; index < 66; index++) {
      await evaluate(`__sokoban.level(${index});new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))`);
      const state = await snap(), original = levelData.levels[index];
      assert.equal(state.levelName, original.name);
      assert.equal(state.boxes.length, [...original.map.join('')].filter(cell => cell === '$' || cell === '*').length);
      assert.equal(state.board.width, Math.max(...original.map.map(row => row.length)));
      assert.equal(state.board.height, original.map.length);
      imported.push({ index, name: state.levelName, board: state.board, crates: state.boxes.length, entities: state.entities });
      if ([56,64,65].includes(index)) await capture('warehouse-sasquatch-' + String(index - 15).padStart(2, '0'));
    }
    evidence.push({ case: 'all-fifty-original-levels-rendered', imported });
    const fresh = await evaluate('__sokoban.level(16);__sokoban.snapshot()');
    const service = new GameSaveService({ gameId: 'sokoban-3d', dataVersion: 1, backend: new MemorySaveBackend() });
    const legacy = await service.save({ saveId: 'autosave', name: 'Version-two migration fixture', kind: 'autosave', data: {
      levelIndex: 16, levelSetVersion: 2, moves: 999, player: fresh.player, boxes: fresh.boxes.map(box => box.pos), completedLevels: [0,1,15,16,31],
    } });
    await wait(100);
    await evaluate(`localStorage.setItem('haiyue-games:game-save:sokoban-3d:autosave',${JSON.stringify(JSON.stringify(legacy))})`);
    await cdp.call('Page.reload', {}); await wait(400);
    await until('!!window.__sokoban&&__sokoban.snapshot().levelIndex===16', 'migrate the replaced workshop save');
    assert.equal((await snap()).moves, 0, 'a replaced workshop board restarts even if its actor count happens to match');
    assert.deepEqual((await snap()).completedLevels, [0,1,15]);
    evidence.push({ case: 'version-two-progress-migration', state: await snap() });
    await cdp.call('Emulation.setEmulatedMedia', { features: [] });
    await evaluate('__sokoban.level(1)');
    for (const [x, y] of [[-1,0],[0,-1],[0,-1],[1,0],[1,0]]) { await evaluate(`__sokoban.move(${x},${y})`); await settle(); }
    assert.equal((await snap()).solved, false); assert.ok((await snap()).audio.played.target >= 1, 'an individual crate has its own arrival cue before level completion');
    const onTarget = await snap();
    assert.notEqual(onTarget.boxes[0].materialId, onTarget.boxes[1].materialId, 'each crate owns its tint');
    assert.notDeepEqual(onTarget.boxes[0].tint, onTarget.boxes[1].tint, 'only the arrived crate is tinted');
    await capture('warehouse-twin-crates');
    for (const [x, y] of [[0,-1],[1,0],[1,0],[0,1],[-1,0]]) { await evaluate(`__sokoban.move(${x},${y})`); await settle(); }
    const offTarget = await snap();
    assert.equal(offTarget.boxes[0].materialId, onTarget.boxes[0].materialId, 'pushing off a target retains the wood material');
    assert.deepEqual(offTarget.boxes[0].tint, onTarget.boxes[1].tint, 'pushing off a target restores the ordinary tint');
    await evaluate('__sokoban.undo()'); await settle();
    assert.equal((await snap()).boxes[0].materialId, onTarget.boxes[0].materialId);
    assert.deepEqual((await snap()).boxes[0].tint, onTarget.boxes[0].tint, 'undo restores target tint without replacing the material');
    await evaluate('__sokoban.level(0)');
    await click('sokoban-sound'); const muted = await snap(); assert.equal(muted.audio.muted, true);
    await evaluate('__sokoban.restart();__sokoban.move(-1,0)'); await settle(); assert.deepEqual((await snap()).audio.played, muted.audio.played);
    await click('sokoban-sound'); await wait(1200); assert.equal((await snap()).audio.voices, 0);
    await cdp.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await evaluate('__sokoban.restart();__sokoban.move(-1,0)'); assert.equal((await snap()).animating, false); assert.equal((await snap()).playerPosition[0], initial.playerPosition[0] - 42);
    await cdp.call('Emulation.setEmulatedMedia', { features: [] });
    for (const [width, height] of [[390,844],[844,390],[1280,800]]) {
      await cdp.call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }); await wait(250);
      const hud = await evaluate('__gameHud');
      checkButtons(hud);
      await capture('warehouse-' + width); evidence.push({ case: 'viewport', width, height, hud });
      for (const index of [64,65]) {
        await evaluate(`__sokoban.level(${index});new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)))`);
        checkButtons(await evaluate('__gameHud'));
        await capture('warehouse-sasquatch-' + (index - 15) + '-' + width);
      }
      await evaluate('__sokoban.level(0)');
      await click('sokoban-levels');
      for (let page = 0; page < 7; page++) await click('sokoban-levels-next-page');
      checkButtons(await evaluate('__gameHud'));
      await capture('warehouse-levels-' + width); await click('sokoban-levels-close');
    }
    const count = (await snap()).entities, materialCount = (await snap()).materials.materials;
    for (let i = 0; i < 6; i++) await evaluate('__sokoban.restart()');
    assert.equal((await snap()).entities, count); assert.equal((await snap()).materials.images, 3);
    assert.equal((await snap()).materials.materials, materialCount, 'restarts reuse the per-crate materials');
    await evaluate(`(()=>{const result=document.querySelector('#result');result.dataset.status='passed';result.textContent=JSON.stringify({status:'passed',checks:['generated textures','walk and push interpolation','mid-move undo','bounded input queue','victory after arrival','victory actions','66 selectable levels','all 50 Sasquatch III levels rendered','imported save restore','stable target texture binding','independent crate tints','mute and voice cleanup','reduced motion','responsive engine GUI and victory','bounded reset resources']});})()`);
  } });
writeFileSync(resolve(output, 'screen.png'), Buffer.from(result.visualCapture.pngBase64, 'base64')); delete result.visualCapture.pngBase64;
writeFileSync(resolve(output, 'verification.json'), JSON.stringify({ ...result, provenance, evidence }, null, 2));
console.log('Sokoban texture, animation, audio and lifecycle browser checks passed.');
