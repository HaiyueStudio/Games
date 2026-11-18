import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, 'artifacts/dafeiyu');
mkdirSync(output, { recursive: true });
const layouts = [['desktop', 1200, 800], ['portrait', 390, 844]];
for (const [name, width, height] of layouts) {
  const result = await runChromeWebGpuFixture({
    root, fixture: 'games/dafeiyu/index.html', query: { verify: 1, start: 'coral', autoplay: 1 }, timeoutMs: 60000,
    visualCapture: { viewportWidth: width, viewportHeight: height },
    disableDx12InfoCollection: true,
    interact: async cdp => {
      const evalJs = async expression => {
        const { result } = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        assert.ok(!result.exceptionDetails, result.exceptionDetails?.exception?.description);
        return result.result.value;
      };
      const ready = async expression => {
        const end = Date.now() + 20000;
        for (;;) {
          if (await evalJs(expression)) return;
          assert.ok(Date.now() < end, expression);
          await new Promise(resolve => setTimeout(resolve, 45));
        }
      };
      const frame = () => evalJs('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const idle = () => ready('!__dafeiyu.transition');
      const watchPortal = () => evalJs(`(() => {
        window.portalFrames = [];
        const start = performance.now();
        const watch = () => {
          const { current, transition } = __dafeiyu;
          if (transition) portalFrames.push([transition, current]);
          if ((transition || !portalFrames.length) && performance.now() - start < 12000) requestAnimationFrame(watch);
        };
        requestAnimationFrame(watch);
      })()`);
      const save = async (suffix, duringTransition = false) => {
        if (!duringTransition) { await idle(); await frame(); }
        const { result } = await cdp.call('Page.captureScreenshot', { format: 'png' });
        writeFileSync(resolve(output, name + '-' + suffix + '.png'), Buffer.from(result.data, 'base64'));
        return result.data;
      };
      const mapPixels = (screenshot, points) => evalJs(`(async () => {
        const image = new Image();
        image.src = ${JSON.stringify('data:image/png;base64,' + screenshot)};
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        const { x, y, cell } = __dafeiyu.bounds;
        return ${JSON.stringify(points)}.map(([col, row]) => Array.from(ctx.getImageData(
          Math.floor((x + col * cell) * image.width / innerWidth),
          Math.floor((y + row * cell) * image.height / innerHeight), 1, 1).data));
      })()`);
      const isOpenRoute = ([red, green, blue]) => green > 167 && blue > 147 && green > red + 18 && green > blue + 8;
      const assertDashedRoute = async (screenshot, samples) => {
        const [first, gap, second] = await mapPixels(screenshot, samples);
        assert.ok([first, second].every(pixel => !isOpenRoute(pixel) && pixel[2] > gap[2] + 30),
          `Unopened route should show pale dashes separated by a gap: ${[first, gap, second]}`);
      };
      const sendKey = async code => {
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: code, code });
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: code, code });
      };
      const key = async code => {
        await idle();
        await sendKey(code);
        await frame();
      };
      const walkFrames = async (facing, sprites, atlas) => {
        await idle();
        const code = 'Arrow' + facing[0].toUpperCase() + facing.slice(1);
        const prefix = JSON.stringify(`${atlas}/${facing}/`);
        return evalJs(`(async () => {
          const drawn = new Set(), start = performance.now();
          document.getElementById('lagoon').dispatchEvent(new KeyboardEvent('keydown', { code: ${JSON.stringify(code)}, bubbles: true }));
          while (performance.now() - start < 225) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            for (const sprite of __dafeiyu.animation[${JSON.stringify(sprites)}]) if (sprite.startsWith(${prefix})) drawn.add(sprite);
          }
          return [...drawn];
        })()`);
      };
      const click = async label => {
        await idle();
        const value = JSON.stringify(label);
        const x = await evalJs(`__dafeiyu.hud.find(n => n.visible && (n.text === ${value} || n.id === ${value}))?.rect`);
        assert.ok(x && x.width > 0);
        const point = { x: x.x + x.width / 2, y: x.y + x.height / 2 };
        await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
        await frame();
      };
      await ready('window.__dafeiyu?.bounds.cell > 15');
      const checks = ['booted'];
      assert.equal(await evalJs('__dafeiyu.current'), 'coral-bay');
      assert.equal(await evalJs('__dafeiyu.selectedLink'), 'first-dive');
      assert.deepEqual(await evalJs('__dafeiyu.openPaths'), []);
      assert.ok(await evalJs('__dafeiyu.state.island && __dafeiyu.rules.includes("WATER IS STOP") && __dafeiyu.state.units.some(u => u.name === "water" && u.x === 0 && u.y === 6)'));
      assert.equal(await evalJs('document.querySelectorAll("body > :not(canvas):not(input[hidden]):not(script)").length'), 0);
      assert.ok(await evalJs(`__dafeiyu.hud.filter(n => n.visible).every(n => n.rect.x >= 0 && n.rect.y >= 0 && n.rect.x + n.rect.width <= ${width + 1} && n.rect.y + n.rect.height <= ${height + 1})`));
      checks.push('native GUI and responsive layout');
      assert.equal(await evalJs('__dafeiyu.audio.state'), 'locked');
      const mapAnimation = await evalJs('__dafeiyu.animation.ambient');
      assert.ok(mapAnimation.flags > 0 && mapAnimation.sea > 0);
      assert.equal(await evalJs('__dafeiyu.animation.clearedMarkers'), 0);
      await ready(`__dafeiyu.animation.ambient.frame !== ${mapAnimation.frame}`);
      const initialMap = await save('initial');
      const [sea, land] = await mapPixels(initialMap, [[.5, .5], [4.5, 5.5]]);
      assert.ok(sea[2] > sea[0] && land[1] > sea[1] + 45, 'The island has green land surrounded by blue sea');
      const coralSeams = [[3, 6.5], [4, 6.5], [5, 6.5]];
      await assertDashedRoute(initialMap, [[3.75, 6.5], [4, 6.5], [4.25, 6.5]]);
      await key('ArrowRight');
      assert.equal(await evalJs('__dafeiyu.selectedLink'), 'first-dive');
      await click('关卡');
      await ready('__dafeiyu.library');
      await save('library');
      await key('ArrowUp'); await key('Enter');
      assert.ok(await evalJs('__dafeiyu.library && __dafeiyu.message === "未解锁"'));
      await key('KeyL');
      await watchPortal();
      const started = await evalJs(`(() => {
        const send = code => document.getElementById('lagoon').dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
        send('Enter');
        const started = [__dafeiyu.transition, __dafeiyu.current];
        send('ArrowRight');
        return started;
      })()`);
      assert.deepEqual(started, ['closing', 'coral-bay']);
      await ready('portalFrames.some(([phase, room]) => phase === "opening" && room === "first-dive")');
      await save('portal-enter', true);
      await idle();
      await ready('__dafeiyu.current === "first-dive"');
      assert.equal(await evalJs('__dafeiyu.state.turn'), 0, 'movement during the wipe does not affect the arriving room');
      await ready('__dafeiyu.audio.musicStarts === 1 && __dafeiyu.audio.buffers === 8 && __dafeiyu.audio.played.click >= 1 && __dafeiyu.audio.played.enter >= 1');
      await frame();
      assert.deepEqual(await evalJs('__dafeiyu.rules.slice().sort()'), ['BABA IS YOU', 'FLAG IS WIN', 'ROCK IS PUSH']);
      assert.ok(await evalJs(`__dafeiyu.bounds.cell * 13 > ${width * (width > height ? .86 : .95)}`));
      const toolbar = await evalJs(`__dafeiyu.hud.filter(n => n.visible && n.id.startsWith('tool-'))`);
      assert.deepEqual(toolbar.map(node => node.id), ['tool-undo', 'tool-redo', 'tool-restart', 'tool-pause']);
      assert.ok(toolbar.every(node => node.icon && !node.text && node.rect.x > width / 2 - 4 && node.rect.y < 24));
      assert.ok(await evalJs('__dafeiyu.hud.filter(n => n.visible).every(n => n.rect.y < 80)'));
      assert.ok(toolbar[0].disabled && toolbar[1].disabled);
      await save('fullscreen-board');
      const artFiles = await evalJs(`performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname)
        .filter(path => path.includes('/assets/') && (path.endsWith('.png') || path.endsWith('.webp'))).map(path => path.split('/assets/').at(-1)).sort()`);
      assert.deepEqual(artFiles, process.env.DAFEIYU_LOOSE_ART ?
        ['box.png', 'brick.png', 'fungus.png', 'lagoon.png', 'luna-walk/atlas.png', 'pillar.png', 'rule-boxes.png', 'tiles.png', 'whale-walk/atlas.png'] :
        ['atlas.build.png', 'lagoon.webp']);
      checks.push('startup only fetches the expected image sources');
      for (const facing of ['right', 'down', 'left', 'up']) {
        const frames = await walkFrames(facing, 'whales', 'whale');
        assert.ok(frames.length >= 2, `The ${facing} walk showed ${frames.join(', ')}`);
        await ready(`__dafeiyu.animation.whales.includes('whale/${facing}/1')`);
      }
      checks.push('four distinct atlas directions and animated walk frames');
      assert.ok(await evalJs('__dafeiyu.audio.played.move >= 4'));
      await save('character');
      const prior = await evalJs('JSON.stringify(__dafeiyu.state)');
      await click('tool-undo');
      assert.equal(await evalJs('__dafeiyu.state.turn'), 3);
      await click('tool-redo');
      assert.equal(await evalJs('JSON.stringify(__dafeiyu.state)'), prior);
      await click('tool-pause');
      await ready('__dafeiyu.paused');
      const ambientFrame = await evalJs('__dafeiyu.animation.ambient.frame');
      const choices = await evalJs(`__dafeiyu.hud.filter(n => n.visible && /^pause-(resume|world|home)$/.test(n.id)).map(n => n.text)`);
      assert.deepEqual(choices, ['继续游戏', '返回上一级地图', '返回首页']);
      await save('pause-menu');
      await key('ArrowRight');
      assert.equal(await evalJs('__dafeiyu.animation.ambient.frame'), ambientFrame);
      assert.equal(await evalJs('JSON.stringify(__dafeiyu.state)'), prior);
      await click('继续游戏');
      await ready('!__dafeiyu.paused');
      assert.equal(await evalJs('JSON.stringify(__dafeiyu.state)'), prior);
      await key('Escape'); await ready('__dafeiyu.paused');
      await watchPortal();
      await click('返回上一级地图');
      await ready('portalFrames.some(([phase, room]) => phase === "opening" && room === "coral-bay")');
      assert.ok(await evalJs('!__dafeiyu.paused && __dafeiyu.selectedLink === "first-dive"'));
      await save('portal-return', true);
      await click('进入');
      await ready('__dafeiyu.current === "first-dive" && __dafeiyu.state.turn === 0');
      checks.push('full viewport grid, native icons, exact redo, pause isolation and bidirectional portal navigation');
      for (let i = 0; i < 7; i++) await key('ArrowRight');
      await ready('__dafeiyu.state.won && __dafeiyu.animation.celebrating && __dafeiyu.animation.sparkles > 0');
      await save('clear');
      await key('KeyZ');
      assert.equal(await evalJs('__dafeiyu.state.won'), false);
      await ready('!__dafeiyu.animation.celebrating && __dafeiyu.animation.sparkles === 0');
      await new Promise(resolve => setTimeout(resolve, 1150));
      assert.equal(await evalJs('__dafeiyu.current'), 'first-dive');
      await key('KeyY');
      await ready('__dafeiyu.state.won && __dafeiyu.animation.celebrating');
      await click('tool-restart');
      await new Promise(resolve => setTimeout(resolve, 1150));
      assert.equal(await evalJs('__dafeiyu.current'), 'first-dive');
      assert.equal(await evalJs('__dafeiyu.state.turn'), 0);
      for (let i = 0; i < 7; i++) await key('ArrowRight');
      await ready('__dafeiyu.state.won && __dafeiyu.animation.sparkles > 0');
      assert.equal(await evalJs('__dafeiyu.audio.played.victory'), 3);
      const exits = await evalJs('__dafeiyu.audio.played.exit');
      await click('tool-pause');
      await ready('__dafeiyu.paused');
      await new Promise(resolve => setTimeout(resolve, 1150));
      assert.ok(await evalJs('__dafeiyu.current === "first-dive" && __dafeiyu.animation.celebrating'));
      await click('继续游戏');
      await ready('__dafeiyu.current === "coral-bay" && !__dafeiyu.animation.celebrating && __dafeiyu.animation.sparkles === 0');
      assert.equal(await evalJs('__dafeiyu.audio.played.exit'), exits + 1);
      assert.equal(await evalJs('__dafeiyu.audio.musicStarts'), 1);
      checks.push('one BGM loop and action-driven click, movement, victory and room transition sounds');
      assert.deepEqual(await evalJs('__dafeiyu.openPaths'), [[3, 6], [4, 6]]);
      assert.ok(await evalJs('__dafeiyu.state.units.some(unit => unit.link === "first-dive" && unit.state === 3)'));
      await ready('__dafeiyu.animation.clearedMarkers === 1');
      const openedMap = await save('map-unlocked');
      const [cleared, available] = await evalJs(`['first-dive', 'breakwater'].map(id => {
        const { x, y } = __dafeiyu.state.units.find(unit => unit.link === id);
        return [x + .8075, y + .77];
      })`);
      const [check, next] = await mapPixels(openedMap, [cleared, available]);
      assert.ok(check.slice(0, 3).every(value => value > 220) && next.some(value => value < 210),
        `Only the cleared flag should have a bright check mark: ${check} / ${next}`);
      assert.ok((await mapPixels(openedMap, coralSeams)).every(isOpenRoute), 'Coral Bay route crosses all three cell seams');
      await assertDashedRoute(openedMap, [[5.5, 4.75], [5.5, 5], [5.5, 5.25]]);
      for (let i = 0; i < 3; i++) await key('ArrowRight');
      await ready('__dafeiyu.selectedLink === "breakwater"');
      await cdp.call('Page.reload');
      await ready('window.__dafeiyu?.current === "coral-bay" && __dafeiyu.selectedLink === "breakwater"');
      await ready('__dafeiyu.animation.clearedMarkers === 1');
      await key('Enter');
      await ready('__dafeiyu.current === "breakwater"');
      checks.push('win particles, automatic world return, persisted check badge and next native level');
      const screenshot = await save('tile-scale');
      const edgeColors = await evalJs(`(async () => {
        const image = new Image();
        image.src = ${JSON.stringify('data:image/png;base64,' + screenshot)};
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        const { x, y, cell } = __dafeiyu.bounds;
        const pixel = (col, row, u, v) => ctx.getImageData(
          Math.floor((x + (col + u) * cell) * image.width / innerWidth),
          Math.floor((y + (row + v) * cell) * image.height / innerHeight), 1, 1).data;
        return [[8, 3, 6], [3, 7, 1]].map(([col, row, blank]) =>
          [[.07, .5], [.93, .5], [.5, .07], [.5, .93]].map(([u, v]) => {
            const art = pixel(col, row, u, v), floor = pixel(blank, row, u, v);
            return art.slice(0, 3).reduce((distance, channel, i) => distance + Math.abs(channel - floor[i]), 0);
          }));
      })()`);
      for (const [i, edges] of edgeColors.entries()) {
        assert.ok(edges.every(distance => distance > 18), `${['Wall', 'Rule box'][i]} does not reach each edge of its cell: ${edges}`);
      }
      checks.push('wall and rule box art reaches all four edges of its grid cell');
      await key('ArrowRight');
      await frame();
      await cdp.call('Page.reload');
      await ready('window.__dafeiyu?.current === "breakwater" && __dafeiyu.state.turn === 1');
      await key('KeyR');
      await ready('__dafeiyu.state.turn === 0');
      checks.push('single-slot autosave');
      await cdp.call('Page.bringToFront');
      await evalJs(`(() => {
        document.getElementById('lagoon').focus({ preventScroll: true });
        window.testPad = { id: 'Verification Gamepad', index: 0, connected: true, mapping: 'standard',
          timestamp: 1, axes: [0,0,0,0], buttons: Array.from({length:17}, () => ({pressed:false,touched:false,value:0})) };
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [testPad] });
      })()`);
      await ready('__dafeiyu.gamepad');
      const button = async index => {
        await idle();
        const code = { 0: 'Space', 1: 'KeyZ', 3: 'KeyL', 5: 'KeyY', 12: 'ArrowUp', 15: 'ArrowRight' }[index];
        await evalJs(`new Promise((resolve, reject) => {
          const finish = (error) => {
            clearTimeout(timer);
            window.removeEventListener('keydown', received, true);
            testPad.buttons[${index}] = { pressed: false, touched: false, value: 0 }; testPad.timestamp++;
            if (error) reject(error); else resolve();
          };
          const received = event => { if (!event.isTrusted && event.code === ${JSON.stringify(code)}) finish(); };
          const timer = setTimeout(() => finish(Error('Gamepad command ${code} was not emitted')), 3000);
          window.addEventListener('keydown', received, true);
          testPad.buttons[${index}] = { pressed: true, touched: true, value: 1 }; testPad.timestamp++;
        })`);
        await frame();
      };
      const first = await evalJs('__dafeiyu.state.units.find(u => u.name === "baba").x');
      await button(15);
      await ready(`__dafeiyu.state.units.find(u => u.name === 'baba').x === ${first + 1}`);
      await button(1);
      await ready('__dafeiyu.state.turn === 0');
      await button(5);
      await ready('__dafeiyu.state.turn === 1');
      await button(1);
      await ready('__dafeiyu.state.turn === 0');
      await button(3);
      await ready('__dafeiyu.library');
      await button(3);
      await ready('!__dafeiyu.library');
      const arrows = {r:'ArrowRight', d:'ArrowDown', u:'ArrowUp'};
      for (const direction of 'rrdddrrrrruuu') await key(arrows[direction]);
      await ready('__dafeiyu.state.won');
      await ready('__dafeiyu.current === "coral-bay" && __dafeiyu.selectedLink === "breakwater"');
      for (let i = 0; i < 3; i++) await button(12);
      await ready('__dafeiyu.selectedLink === "change-course"');
      await button(0);
      await ready('__dafeiyu.current === "change-course"');
      checks.push('simulated standard gamepad');
      if (process.env.DAFEIYU_BABA_WORLD && name === 'desktop') {
        await idle();
        const { result: { root: doc } } = await cdp.call('DOM.getDocument');
        const { result: { nodeId } } = await cdp.call('DOM.querySelector', { nodeId: doc.nodeId, selector: '#level-pair' });
        await cdp.call('DOM.setFileInputFiles', { nodeId, files: ['0level.l','0level.ld','106level.l','106level.ld'].map(file => resolve(process.env.DAFEIYU_BABA_WORLD, file)) });
        await ready('__dafeiyu.current === "0level"');
        assert.ok(await evalJs('__dafeiyu.rules.includes("BABA IS YOU") && __dafeiyu.rules.includes("FLAG IS WIN")'));
        await save('imported');
        for (let i = 0; i < 8; i++) await key('ArrowRight');
        await ready('__dafeiyu.state.won === true');
        await ready('__dafeiyu.current === "106level"');
        await key('Enter');
        await ready('__dafeiyu.current === "0level"');
        await idle();
        checks.push('real Steam .l/.ld file import and map navigation');
        const { result: { nodeId: folderId } } = await cdp.call('DOM.querySelector', { nodeId: doc.nodeId, selector: '#level-pack' });
        await cdp.call('DOM.setFileInputFiles', { nodeId: folderId, files: [resolve(process.env.DAFEIYU_BABA_WORLD)] });
        await ready('__dafeiyu.pack === "Baba Is You" && __dafeiyu.current === "0level"');
        for (let i = 0; i < 8; i++) await key('ArrowRight');
        await ready('__dafeiyu.state.won === true');
        await ready('__dafeiyu.current === "106level" && __dafeiyu.selectedLink === "0level"');
        await idle();
        checks.push('real Steam directory import with world_data.txt');
        await cdp.call('DOM.setFileInputFiles', { nodeId, files: ['17level.l', '17level.ld'].map(file => resolve(process.env.DAFEIYU_BABA_WORLD, file)) });
        await ready('__dafeiyu.current === "17level" && __dafeiyu.rules.includes("KEKE IS YOU") && __dafeiyu.animation.lunas.length === 1');
        const steamRoom = await save('luna-steam');
        const samples = await evalJs(`['box', 'text_box'].map(name => {
          const { x, y } = __dafeiyu.state.units.find(unit => unit.name === name);
          return [x + .42, y + (name === 'text_box' ? .28 : .63)];
        })`);
        const [[crateRed, crateGreen, crateBlue], [wordRed, wordGreen, wordBlue]] = await mapPixels(steamRoom, samples);
        assert.ok(crateRed > crateGreen + 35 && crateGreen > crateBlue + 25, 'Physical BOX uses the warm wooden sprite');
        assert.ok(wordGreen > 210 && wordBlue > 210 && wordGreen > wordRed + 20 && wordBlue > wordRed + 20,
          'The active BOX rule word uses the pale cyan noun tile');
        for (const [facing, x, y] of [['down', 10, 11], ['left', 9, 11], ['up', 9, 10], ['right', 10, 10]]) {
          const frames = await walkFrames(facing, 'lunas', 'luna');
          assert.ok(frames.length >= 2, `The Luna ${facing} walk showed ${frames.join(', ')}`);
          assert.ok(await evalJs(`__dafeiyu.state.units.some(unit => unit.name === 'keke' && unit.x === ${x} && unit.y === ${y})`));
        }
        checks.push('Luna displays and animates as Keke in a real Steam room');
        await cdp.call('DOM.setFileInputFiles', { nodeId, files: ['4level.l', '4level.ld'].map(file => resolve(process.env.DAFEIYU_BABA_WORLD, file)) });
        await ready('__dafeiyu.current === "4level" && __dafeiyu.rules.includes("WALL IS STOP")');
        const coords = name => evalJs(`__dafeiyu.state.units.filter(unit => unit.name === ${JSON.stringify(name)}).map(({x, y}) => x + "," + y).sort()`);
        const [walls, bricks, pillars] = await Promise.all(['wall', 'brick', 'pillar'].map(coords));
        assert.deepEqual([walls.length, bricks.length, pillars.length], [15, 34, 6]);
        const yard = await save('pillar-yard');
        const floorPoint = [4.56, 6.23];
        const [floor, pebble, wall, pillar] = await mapPixels(yard, [floorPoint, [4.16, 6.16], [7.33, 6.19], [19.48, 2.14]]);
        assert.ok(floor[2] > floor[1] + 10 && floor[1] > floor[0] + 15 && pebble[1] > floor[1] + 20,
          `Expected cool blue ground with lighter pebbles: ${floor} / ${pebble}`);
        assert.ok(wall[1] > wall[0] + 25, `WALL keeps its teal masonry: ${wall}`);
        assert.ok(pillar[0] > 200 && pillar[1] > 185 && pillar[2] > 155, `Expected an ivory pillar capital: ${pillar}`);
        for (const samples of [
          [[4.98, 5.5], [5, 5.5], [5.02, 5.5]],
          [[4.5, 5.98], [4.5, 6], [4.5, 6.02]],
        ]) {
          const greens = (await mapPixels(yard, samples)).map(([, green]) => green);
          assert.ok(Math.min(...greens) > 80 && Math.max(...greens) - Math.min(...greens) < 20,
            `Pebbles should cross the tile seam continuously: ${greens}`);
        }
        await key('ArrowUp'); await key('ArrowUp');
        assert.ok(await evalJs('__dafeiyu.state.units.some(unit => unit.name === "baba" && unit.x === 7 && unit.y === 7)'));
        await key('KeyR');
        const directions = { r: 'ArrowRight', l: 'ArrowLeft', u: 'ArrowUp', d: 'ArrowDown' };
        // Push PILLAR and IS beside the existing WALL word in the original room.
        for (const move of 'rrruuuuuulllldlddrrullluldddrurruuurdurrddllllllulddd') await key(directions[move]);
        await ready('__dafeiyu.rules.includes("WALL IS PILLAR")');
        assert.deepEqual(await coords('wall'), []);
        assert.deepEqual(await coords('rock'), []);
        assert.deepEqual(await coords('brick'), bricks);
        const converted = await coords('pillar');
        assert.equal(converted.length, 21);
        assert.ok(walls.every(cell => converted.includes(cell)));
        const transformed = await save('pillar-yard-transformed');
        const [originalFloor, newPillar] = await mapPixels(transformed, [floorPoint, [7.48, 6.14]]);
        assert.deepEqual(originalFloor, floor);
        assert.ok(newPillar.slice(0, 3).every((value, channel) => Math.abs(value - pillar[channel]) < 12),
          `Transformed walls use the same ivory column as original pillars: ${newPillar} / ${pillar}`);
        await key('ArrowRight'); await key('ArrowRight');
        assert.ok(await evalJs(`['baba', 'brick'].every(name => __dafeiyu.state.units.some(unit =>
          unit.name === name && unit.x === 4 && unit.y === 6))`));
        checks.push('Steam Pillar Yard renders continuous pebble paving separately from WALL and all converted walls as PILLAR');
      }
      if (name === 'desktop') {
        const folder = resolve(output, 'flower-campaign');
        mkdirSync(folder, { recursive: true });
        writeFileSync(resolve(folder, 'world_data.txt'), '[general]\nname=Flower Campaign\nstart=a-world\n');
        const maps = {
          'a-world': '[general]\nname=Flower Bay\nleveltype=1\nselectorx=2\nselectory=6\nlevels=2\npaths=1\n' +
            '[levels]\n0file=b-zone\n0x=2\n0y=6\n0state=2\n1file=d-locked\n1x=4\n1y=6\n1state=1\n' +
            '[paths]\n0x=3\n0y=6\n0style=1\n0gate=2\n0requirement=1\n',
          'b-zone': '[general]\nname=Test Reef\nleveltype=1\nselectorx=2\nselectory=6\nlevels=2\npaths=0\nunlockcount=1\n' +
            '[levels]\n0file=c-dive\n0x=2\n0y=6\n0state=2\n1file=a-world\n1x=3\n1y=6\n1state=2\n',
        };
        for (const [id, sidecar] of Object.entries(maps)) {
          copyFileSync(resolve(root, 'games/dafeiyu/levels/coral-bay.l'), resolve(folder, id + '.l'));
          writeFileSync(resolve(folder, id + '.ld'), sidecar);
        }
        for (const id of ['c-dive', 'd-locked']) for (const suffix of ['l', 'ld']) {
          copyFileSync(resolve(root, 'games/dafeiyu/levels/first-dive.' + suffix), resolve(folder, id + '.' + suffix));
        }
        const { result: { root: doc } } = await cdp.call('DOM.getDocument');
        const { result: { nodeId } } = await cdp.call('DOM.querySelector', { nodeId: doc.nodeId, selector: '#level-pack' });
        await cdp.call('DOM.setFileInputFiles', { nodeId, files: [folder] });
        await ready(`__dafeiyu.current === 'a-world' && __dafeiyu.selectedLink === 'b-zone'`);
        await ready(`__dafeiyu.hud.some(node => node.id === 'map-gate-condition' && node.visible && node.text === '0/1')`);
        await save('flower-gate-locked');
        await key('ArrowRight');
        assert.equal(await evalJs('__dafeiyu.selectedLink'), 'b-zone', 'Cannot cross a flower gate before its requirement');
        await key('Enter');
        await ready(`__dafeiyu.current === 'b-zone' && __dafeiyu.flower.required === 1`);
        await key('Enter');
        await ready(`__dafeiyu.current === 'c-dive'`);
        await click('tool-pause');
        assert.ok(await evalJs(`__dafeiyu.hud.some(node => node.id === 'pause-destination' && node.visible && node.text.includes('Test Reef'))`));
        await click('返回上一级地图');
        await ready(`__dafeiyu.current === 'b-zone' && __dafeiyu.selectedLink === 'c-dive'`);
        await key('Enter');
        await ready(`__dafeiyu.current === 'c-dive'`);
        for (let i = 0; i < 7; i++) await key('ArrowRight');
        await ready(`__dafeiyu.current === 'b-zone' && __dafeiyu.collectingPetal && __dafeiyu.flower.petals === 1 && __dafeiyu.flower.flowers === 1`);
        await ready(`__dafeiyu.hud.some(node => node.id === 'collect-petal' && node.visible)`);
        await save('flower-petal-flight');
        await ready('!__dafeiyu.collectingPetal');
        await save('flower-collected');
        await key('Enter');
        await ready(`__dafeiyu.current === 'c-dive'`);
        for (let i = 0; i < 7; i++) await key('ArrowRight');
        await ready(`__dafeiyu.current === 'b-zone'`);
        assert.equal(await evalJs('__dafeiyu.collectingPetal'), false, 'Repeating a clear does not award another petal');
        await key('ArrowRight');
        await ready(`__dafeiyu.selectedLink === 'a-world'`);
        await key('Enter');
        await ready(`__dafeiyu.current === 'a-world' && __dafeiyu.selectedLink === 'b-zone'`);
        assert.deepEqual(await evalJs('__dafeiyu.parents'), [], 'visiting an ancestor reuses its original map state');
        assert.ok(await evalJs(`__dafeiyu.openPaths.some(([x,y]) => x === 3 && y === 6) &&
          __dafeiyu.state.units.some(unit => unit.link === 'b-zone' && unit.state === 3)`));
        await key('ArrowRight'); await key('ArrowRight');
        await ready(`__dafeiyu.selectedLink === 'd-locked'`);
        checks.push('nested map returns preserve entrance, first clear collects a petal, area bloom opens a native flower gate');
      }
      if (name === 'desktop') {
        await evalJs(`(async () => {
          const root = document.createElement('div');
          root.id = 'host-test';
          root.style.cssText = 'position:fixed;inset:0;z-index:1';
          document.body.append(root);
          const { mountGame } = await import('./bundle.js');
          window.hostedLagoon = await mountGame({root,url:location.href,width:840,height:540,mode:'texture'});
          await hostedLagoon.ready;
        })()`);
        assert.ok(await evalJs('!!hostedLagoon.texture && !!hostedLagoon.engine && !hostedLagoon.disposed'));
        assert.ok(await evalJs('hostedLagoon.debug.__dafeiyu.animation.whales.length > 0'));
        await evalJs('hostedLagoon.dispose();document.querySelector("#host-test").remove()');
        assert.ok(await evalJs('hostedLagoon.disposed && hostedLagoon.engine.state === "destroyed"'));
        checks.push('Game OS texture mount and teardown');
      }
      if (process.env.DAFEIYU_OFFICIAL && name === 'desktop') {
        const url = new URL(await evalJs('location.href'));
        url.searchParams.delete('start');
        url.searchParams.delete('autoplay');
        await cdp.call('Page.navigate', { url: url.href });
        await ready('window.__dafeiyu?.mode === "home"');
        await click('新游戏'); await click('存档 2 · 空存档');
        await ready('window.__dafeiyu?.pack === "Baba Is You" && __dafeiyu.current === "0level" && __dafeiyu.bounds.cell > 0');
        await save('official-first');
        for (let i = 0; i < 8; i++) await key('ArrowRight');
        await ready('__dafeiyu.state.won');
        await evalJs('window.beforeOfficialReload = true');
        await cdp.call('Page.reload');
        await ready('!window.beforeOfficialReload && window.__dafeiyu?.mode === "home"');
        await click('继续游戏'); await click('存档 2 · Baba Is You');
        await ready('__dafeiyu.current === "0level" && __dafeiyu.state.won');
        await ready('__dafeiyu.current === "106level" && __dafeiyu.selectedLink === "0level"');
        assert.ok(await evalJs('__dafeiyu.openPaths.some(([x,y]) => x === 11 && y === 16)'));
        assert.ok(await evalJs('__dafeiyu.state.island && __dafeiyu.rules.includes("WATER IS STOP") && __dafeiyu.state.units.some(u => u.name === "water" && u.x === 0 && u.y === 16)'));
        const officialMap = await save('official-map');
        const turn = [[11, 16.5], [11.5, 16], [11.5, 15]];
        assert.ok((await mapPixels(officialMap, turn)).every(isOpenRoute), 'Steam map route remains continuous through the turn');
        await assertDashedRoute(officialMap, [[13.75, 14.5], [14, 14.5], [14.25, 14.5]]);
        await assertDashedRoute(officialMap, [[12.5, 13.75], [12.5, 14], [12.5, 14.25]]);
        const [[red, green, blue]] = await mapPixels(officialMap, [[16.58, 4.58]]);
        assert.ok(red > 190 && red > green && green > blue, 'Steam map displays its revealed locked gate');
        for (const code of ['ArrowRight', 'ArrowUp', 'ArrowUp']) await key(code);
        await ready('__dafeiyu.selectedLink === "1level"');
        await key('Enter');
        await ready('__dafeiyu.current === "1level"');
        await key('KeyL');
        for (const [pack, level] of [['new adventures', '42level'], ['museum', '101level'], ['珊瑚湾', 'coral-bay'], ['Baba Is You', '1level']]) {
          await click('切换关卡包');
          await ready(`__dafeiyu.pack === ${JSON.stringify(pack)} && __dafeiyu.current === ${JSON.stringify(level)}`);
        }
        checks.push('installed official first room, autosave, world map unlock, and independent pack navigation');
      }
      const payload = JSON.stringify({ status: 'passed', checks });
      await evalJs(`(() => {const node=document.createElement('pre');node.id='result';node.hidden=true;node.dataset.status='passed';node.textContent=${JSON.stringify(payload)};document.body.append(node);})()`);
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.browserDiagnostics.unclassifiedFailureCount, 0);
  delete result.visualCapture.pngBase64;
  writeFileSync(resolve(output, name + '.json'), JSON.stringify(result, null, 2));
  console.log(`${name}: ${result.checks.join(', ')}`);
}
