import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, 'artifacts/dafeiyu/workshop');
mkdirSync(output, { recursive: true });
for (const [name, width, height] of [['desktop', 1200, 800], ['portrait', 390, 844]]) {
  const result = await runChromeWebGpuFixture({
    root, fixture: 'games/dafeiyu/index.html', query: { verify: 1, start: 'coral' }, timeoutMs: 90000,
    disableDx12InfoCollection: true, visualCapture: { viewportWidth: width, viewportHeight: height },
    interact: async cdp => {
      const evalJs = async expression => {
        const { result } = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        assert.ok(!result.exceptionDetails, result.exceptionDetails?.exception?.description);
        return result.result.value;
      };
      const frame = () => evalJs('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      const ready = async expression => {
        const end = Date.now() + 12000;
        while (!await evalJs(expression)) {
          assert.ok(Date.now() < end, expression);
          await new Promise(resolve => setTimeout(resolve, 35));
        }
      };
      const screenshot = async label => {
        await frame();
        const { result } = await cdp.call('Page.captureScreenshot', { format: 'png' });
        writeFileSync(resolve(output, `${name}-${label}.png`), Buffer.from(result.data, 'base64'));
        return result.data;
      };
      const tap = async (x, y) => {
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
        await frame();
      };
      const text = label => `__dafeiyu.hud.find(item => item.visible && (item.text === ${JSON.stringify(label)} || item.id === ${JSON.stringify(label)}))`;
      const click = async label => {
        await ready(`!!${text(label)}?.rect.width`);
        const rect = await evalJs(`${text(label)}.rect`);
        await tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
      };
      const pick = async name => {
        const index = await evalJs(`__dafeiyu.editorPalette.indexOf(${JSON.stringify(name)})`);
        assert.ok(index >= 0, name);
        const id = `editor-palette-${index}`;
        const button = await evalJs(text(id));
        assert.ok(button?.icon && !button.text, `${name} uses a native GUI image button`);
        await click(id);
      };
      const cell = async (col, row) => {
        const { x, y, cell } = await evalJs('__dafeiyu.bounds');
        assert.ok(cell > 8);
        await tap(x + cell * (col + .5), y + cell * (row + .5));
      };
      const key = async code => {
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code });
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code });
        await frame();
      };
      const steps = async (code, count) => { for (let i = 0; i < count; i++) await key(code); };
      const reload = async () => {
        await evalJs('window.workshopOldPage = true');
        await cdp.call('Page.reload');
        await ready('!window.workshopOldPage && window.__dafeiyu?.mode === "home"');
        await frame();
      };
      const gamepad = async () => {
        await cdp.call('Page.bringToFront');
        await evalJs(`(() => {
          document.getElementById('lagoon').focus({ preventScroll: true });
          window.workshopPad = { id: 'Workshop verification', index: 0, connected: true, mapping: 'standard', timestamp: 1,
            axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
          Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [workshopPad] });
        })()`);
        await ready('__dafeiyu.gamepad');
        return async (index, code) => {
          await evalJs(`new Promise((resolve, reject) => {
            const finish = error => {
              clearTimeout(timer);
              window.removeEventListener('keydown', received, true);
              workshopPad.buttons[${index}] = { pressed: false, touched: false, value: 0 }; workshopPad.timestamp++;
              if (error) reject(error); else resolve();
            };
            const received = event => { if (!event.isTrusted && event.code === ${JSON.stringify(code)}) finish(); };
            const timer = setTimeout(() => finish(Error('Missing controller command')), 3000);
            window.addEventListener('keydown', received, true);
            workshopPad.buttons[${index}] = { pressed: true, touched: true, value: 1 }; workshopPad.timestamp++;
          })`);
          await frame();
        };
      };

      await ready('window.__dafeiyu?.mode === "home"');
      await frame();
      for (const label of ['新游戏', '继续游戏', '编辑器']) assert.ok(await evalJs(`!!${text(label)}`));
      const homeArt = process.env.DAFEIYU_LOOSE_ART ? 'home-lagoon.png' : 'home-lagoon.webp';
      assert.deepEqual(await evalJs(`performance.getEntriesByType('resource').map(entry => new URL(entry.name).pathname)
        .filter(path => path.includes('/assets/') && (path.endsWith('.png') || path.endsWith('.webp'))).map(path => path.split('/assets/').at(-1))`), [homeArt]);
      await screenshot('home');
      const checks = ['native title screen and generated background'];
      if (name === 'desktop') {
        for (const i of [1, 2, 3]) {
          await click('新游戏');
          await click(`存档 ${i} · 空存档`);
          await ready(`__dafeiyu.mode === 'play' && __dafeiyu.slot === ${i} && __dafeiyu.current === 'coral-bay'`);
          await key('Enter');
          await ready(`__dafeiyu.current === 'first-dive'`);
          await steps('ArrowRight', i);
          await ready(`__dafeiyu.state.turn === ${i}`);
          await click('tool-pause'); await click('返回首页');
          await ready(`__dafeiyu.mode === 'home' && __dafeiyu.slots.filter(Boolean).length === ${i}`);
        }
        await screenshot('home-with-saves');
        await reload();
        const button = await gamepad();
        await button(13, 'ArrowDown'); await button(0, 'Space');
        await ready(`!!${text('存档 2 · 珊瑚湾')}`);
        await button(13, 'ArrowDown'); await button(0, 'Space');
        await ready(`__dafeiyu.slot === 2 && __dafeiyu.current === 'first-dive' && __dafeiyu.state.turn === 2`);
        await button(9, 'KeyM'); await ready('__dafeiyu.paused');
        await button(13, 'ArrowDown'); await button(13, 'ArrowDown'); await button(0, 'Space');
        await ready(`__dafeiyu.mode === 'home'`);
        await click('新游戏'); await click('存档 1 · 珊瑚湾');
        await ready(`!!${text('覆盖此存档？')}`);
        await click('返回'); await click('返回');
        await click('继续游戏'); await click('存档 1 · 珊瑚湾');
        await ready(`__dafeiyu.slot === 1 && __dafeiyu.state?.turn === 1`);
        await click('tool-pause'); await click('返回首页');
        checks.push('three independent persistent saves, overwrite confirmation and controller menu navigation');
      }
      await click('编辑器');
      await ready(`__dafeiyu.mode === 'editor' && __dafeiyu.editing === 'world' && __dafeiyu.bounds.cell > 8`);
      await ready(`!!${text('editor-select')}?.rect.width`);
      const toolbar = await Promise.all(['home', 'select', 'erase', 'undo', 'run', 'import', 'export', 'width-down', 'width-up',
        'height-down', 'height-up'].map(id => evalJs(text(`editor-${id}`))));
      assert.ok(toolbar.every(button => button?.icon && !button.text && button.rect.y < 100));
      assert.ok(toolbar[0].rect.x < toolbar[1].rect.x && toolbar[1].rect.x < toolbar[2].rect.x && toolbar[2].rect.x < width / 2);
      const [widthLabel, heightLabel] = await Promise.all(['width', 'height'].map(axis => evalJs(text(`editor-${axis}`))));
      assert.ok(Math.abs((widthLabel.rect.x + heightLabel.rect.x + heightLabel.rect.width) / 2 - width / 2) < 3);
      if (name === 'portrait') {
        const { x, y, width, height } = toolbar[1].rect;
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + width / 2, y: y + height / 2 });
        await new Promise(resolve => setTimeout(resolve, 300));
        await screenshot('toolbar-tooltip');
      }
      await click('editor-width-up'); await click('editor-height-up');
      await ready('__dafeiyu.editor.rooms[0].width === 14 && __dafeiyu.editor.rooms[0].height === 10');
      await click('editor-height-down'); await click('editor-width-down');
      await screenshot('world-editor');
      await click('新关卡');
      await ready(`__dafeiyu.editor.rooms.length === 3 && __dafeiyu.brush === '@locked'`);
      await cell(5, 4);
      await pick('@secret'); await cell(3, 4); await cell(4, 4);
      await ready(`__dafeiyu.editor.rooms[0].links.some(link => link.target === 'room-2' && !link.unlocked) && __dafeiyu.editor.rooms[0].paths.length === 2`);
      await screenshot('world-editor-routes');

      if (name === 'desktop') {
        await click('新地图');
        await pick('@link'); await cell(2, 6);
        await pick('@path'); await cell(2, 5);
      }
      await click('›'); await click('›');
      await ready(`__dafeiyu.editing === 'room-2'`);
      await click('物件');
      await pick('baba');
      await ready(`${text('editor-selection')}?.text === '当前素材 · 大肥鱼'`);
      await pick('keke'); await cell(3, 4);
      await pick('flag'); await cell(8, 4);
      await pick('box'); await cell(7, 6);
      await pick('water'); await cell(4, 5); await cell(5, 5); await cell(5, 6);
      await click('editor-select'); await cell(3, 4);
      await ready(`${text('editor-selection')}?.text === '已选 · Luna' &&
        __dafeiyu.editor.rooms[2].tiles.length === 6 && __dafeiyu.editor.rooms[2].tiles.some(tile => tile.name === 'box')`);
      await screenshot('object-palette');
      await click('editor-erase'); await cell(3, 4);
      await ready(`!__dafeiyu.editor.rooms[2].tiles.some(tile => tile.name === 'keke')`);
      await click('editor-undo');
      await ready(`__dafeiyu.editor.rooms[2].tiles.some(tile => tile.name === 'keke')`);
      await pick('wall'); await cell(6, 6);
      await click('editor-undo');
      await ready(`!__dafeiyu.editor.rooms[2].tiles.some(tile => tile.name === 'wall')`);
      await click('规则字块');
      await pick('text_baba');
      for (const [x, name] of [[1, 'text_keke'], [2, 'text_is'], [3, 'text_you'], [8, 'text_flag'], [9, 'text_is'], [10, 'text_win']]) {
        await pick(name); await cell(x, 1);
      }
      await ready(`__dafeiyu.editor.rooms[2].tiles.length === 12`);
      for (const [x, name] of [[2, 'text_baba'], [4, 'text_is'], [6, 'text_push'], [9, 'text_baba']]) {
        await pick(name); await cell(x, 3);
      }
      await click('editor-stack');
      await pick('text_push'); await cell(9, 3);
      await click('editor-stack');
      await ready(`__dafeiyu.editor.rooms[2].tiles.filter(tile => tile.x === 9 && tile.y === 3).length === 2`);
      if (name === 'desktop') {
        await click('命名');
        await ready(`__dafeiyu.hud.some(node => node.visible && node.id === 'draft-name')`);
        await ready(`!!document.activeElement?.dataset.haiyueTextInput && document.activeElement.selectionStart === 0 &&
          document.activeElement.selectionEnd === document.activeElement.value.length`);
        await cdp.call('Input.insertText', { text: '海星工坊' });
        await ready(`__dafeiyu.hud.some(node => node.visible && node.id === 'draft-name' && node.value === '海星工坊')`);
        await click('保存');
        await ready(`__dafeiyu.editor.rooms[2].title === '海星工坊'`);
      }
      await screenshot('room-editor');
      const authoredRoom = await evalJs(`JSON.stringify(__dafeiyu.editor.rooms[2])`);
      await click('editor-run');
      await ready(`__dafeiyu.mode === 'test' && __dafeiyu.current === 'room-2' && __dafeiyu.rules.includes('KEKE IS YOU')`);
      assert.ok(await evalJs(`__dafeiyu.state.units.some(unit => unit.name === 'box' && unit.x === 7 && unit.y === 6)`));
      const image = process.env.DAFEIYU_LOOSE_ART ? 'box.png' : 'atlas.build.png';
      assert.ok(await evalJs(`performance.getEntriesByType('resource').some(entry => new URL(entry.name).pathname.endsWith('/assets/' + ${JSON.stringify(image)}))`));
      const ruleBoxes = await screenshot('rule-boxes');
      const faceBrightness = await evalJs(`(async () => {
        const image = new Image();
        image.src = ${JSON.stringify('data:image/png;base64,' + ruleBoxes)};
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const { x, y, cell } = __dafeiyu.bounds;
        const brightness = (col, row) => {
          const [r, g, b] = pixel(col + .45, row + .24);
          return (r + g + b) / 3;
        };
        const pixel = (col, row) => Array.from(ctx.getImageData(Math.floor((x + col * cell) * image.width / innerWidth),
          Math.floor((y + row * cell) * image.height / innerHeight), 1, 1).data);
        const faces = [1, 2, 3].map((col, i) => brightness(col, 1) - brightness(2 + i * 2, 3));
        const seams = [[4.97, 5.5], [5, 5.5], [5.03, 5.5], [5.5, 5.97], [5.5, 6], [5.5, 6.03]].map(([col, row]) => pixel(col,row));
        return { faces, seams };
      })()`);
      assert.ok(faceBrightness.faces.every(diff => diff > 75), `Expected three distinct active/inactive face pairs: ${faceBrightness.faces}`);
      assert.ok(faceBrightness.seams.every(([, green, blue]) => green > 72 && blue > 110),
        `Horizontal and vertical water seams should show water throughout: ${JSON.stringify(faceBrightness.seams)}`);
      const terrain = await evalJs('__dafeiyu.animation.ambient');
      assert.equal(terrain.water, 3);
      assert.equal(terrain.flags, 1);
      await ready(`__dafeiyu.animation.ambient.frame !== ${terrain.frame}`);
      checks.push('animated flag and square water with continuous horizontal and vertical seams');
      checks.push('illustrated rule blocks distinguish active and inactive rules and support stacked words');
      for (const [code, facing, x, y] of [['ArrowDown', 'down', 3, 5], ['ArrowLeft', 'left', 2, 5],
        ['ArrowUp', 'up', 2, 4], ['ArrowRight', 'right', 3, 4]]) {
        await key(code);
        await ready(`__dafeiyu.animation.lunas.includes('luna/${facing}/1') &&
          __dafeiyu.state.units.some(unit => unit.name === 'keke' && unit.x === ${x} && unit.y === ${y})`);
        if (name === 'desktop') await screenshot(`luna-${facing}`);
      }
      await steps('ArrowRight', 5);
      await ready('__dafeiyu.state.won');
      await screenshot('playtest');
      await ready(`__dafeiyu.mode === 'test' && __dafeiyu.current === 'world'`);
      await click('tool-pause'); await click('退出试玩');
      await ready(`__dafeiyu.mode === 'editor' && __dafeiyu.editing === 'room-2'`);
      assert.equal(await evalJs(`JSON.stringify(__dafeiyu.editor.rooms[2])`), authoredRoom);
      checks.push('sprite palette, icon toolbar, selection, erasure, centered resizing and isolated playtest');

      if (name === 'desktop') {
        await click('›');
        await ready(`__dafeiyu.editing === 'room-3'`);
        await click('新关卡');
        await pick('@link'); await cell(2, 4);
        await click('子地图 3');
        await ready(`__dafeiyu.editing === 'world'`);
        await click('editor-run');
        await ready(`__dafeiyu.current === 'world' && __dafeiyu.selectedLink === 'room-1'`);
        await key('Enter');
        await ready(`__dafeiyu.current === 'room-1'`);
        await cdp.call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        await steps('ArrowRight', 6);
        await ready('__dafeiyu.state.won && __dafeiyu.animation.sparkles === 0');
        await ready(`__dafeiyu.current === 'world' && __dafeiyu.openPaths.some(path => path[0] === 4 && path[1] === 4)`);
        await cdp.call('Emulation.setEmulatedMedia', { features: [] });
        await screenshot('world-playtest-routes');
        await steps('ArrowRight', 3);
        await ready(`__dafeiyu.selectedLink === 'room-2'`);
        await key('Enter');
        await ready(`__dafeiyu.current === 'room-2' && __dafeiyu.state.turn === 0`);
        await key('Enter');
        await ready(`__dafeiyu.current === 'world'`);
        await steps('ArrowLeft', 3); await steps('ArrowDown', 2);
        await ready(`__dafeiyu.selectedLink === 'room-3'`);
        await key('Enter');
        await ready(`__dafeiyu.current === 'room-3' && __dafeiyu.selectedLink === 'room-4'`);
        await key('Enter'); await ready(`__dafeiyu.current === 'room-4'`);
        await click('tool-pause'); await click('返回大世界');
        await ready(`__dafeiyu.mode === 'test' && __dafeiyu.current === 'world' && !__dafeiyu.paused`);
        await click('tool-pause'); await click('退出试玩');
        await reload();
        await click('编辑器');
        await ready(`__dafeiyu.editor?.rooms.length === 5 && __dafeiyu.slots.filter(Boolean).length === 3`);
        assert.equal(await evalJs(`JSON.stringify(__dafeiyu.editor.rooms[2])`), authoredRoom);
        checks.push('automatic world return with reduced motion, world unlock, nested rooms and draft recovery');
        await evalJs(`(() => {
          const click = HTMLAnchorElement.prototype.click;
          HTMLAnchorElement.prototype.click = function () {
            if (this.download === 'dafeiyu-world.json') window.exportedWorld = fetch(this.href).then(response => response.json());
            else click.call(this);
          };
        })()`);
        await click('editor-export');
        const exported = await evalJs('window.exportedWorld');
        assert.equal(exported.rooms.length, 5);
        assert.equal(JSON.stringify(exported.rooms[2]), authoredRoom);
        exported.rooms[0].title = 'Imported Reef';
        exported.rooms[1].tiles.push({ name: 'skull', x: 4, y: 4, dir: 0 }, { name: 'wall', x: 2, y: 4, dir: 0 });
        for (const [row, words] of [[6, ['skull', 'is', 'defeat']], [7, ['wall', 'is', 'stop']]]) {
          exported.rooms[1].tiles.push(...words.map((word, i) => ({ name: 'text_' + word, x: 3 + i, y: row, dir: 0 })));
        }
        const filename = resolve(output, 'roundtrip-world.json');
        writeFileSync(filename, JSON.stringify(exported, null, 2) + '\n');
        const { result: { root: doc } } = await cdp.call('DOM.getDocument');
        const { result: { nodeId } } = await cdp.call('DOM.querySelector', { nodeId: doc.nodeId, selector: '#world-draft' });
        await cdp.call('DOM.setFileInputFiles', { nodeId, files: [filename] });
        await ready(`__dafeiyu.editor.rooms[0].title === 'Imported Reef'`);
        checks.push('native name input and editor JSON export/import');
        await click('editor-run');
        await ready(`__dafeiyu.current === 'world' && __dafeiyu.selectedLink === 'room-1'`);
        await key('Enter');
        await ready(`__dafeiyu.current === 'room-1' && __dafeiyu.rules.includes('SKULL IS DEFEAT') && __dafeiyu.audio.buffers === 7`);
        const moves = await evalJs('__dafeiyu.audio.played.move ?? 0');
        await key('ArrowLeft');
        await ready('__dafeiyu.state.turn === 1');
        assert.equal(await evalJs('__dafeiyu.audio.played.move ?? 0'), moves);
        await key('ArrowRight');
        await ready('__dafeiyu.audio.played.failure === 1 && __dafeiyu.state.turn === 2');
        await key('Space');
        await ready('__dafeiyu.state.turn === 3');
        assert.equal(await evalJs('__dafeiyu.audio.played.failure'), 1);
        await key('KeyZ'); await key('KeyZ');
        await ready('__dafeiyu.state.turn === 1');
        assert.equal(await evalJs('__dafeiyu.audio.played.failure'), 1);
        checks.push('blocked movement is quiet and losing control plays one failure sound with undo recovery');
        const setHidden = hidden => evalJs(`(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, value: ${hidden} });
          document.dispatchEvent(new Event('visibilitychange'));
        })()`);
        await setHidden(true);
        await ready(`__dafeiyu.audio.state === 'suspended'`);
        await setHidden(false);
        await ready(`__dafeiyu.audio.state === 'running' && __dafeiyu.audio.musicStarts === 1`);
        await evalJs(`window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }))`);
        await ready(`__dafeiyu.audio.disposed && __dafeiyu.audio.voices === 0 && __dafeiyu.audio.state === 'closed'`);
        checks.push('audio suspends when hidden, resumes its existing loop and releases all voices on teardown');
      }
      const payload = JSON.stringify({ status: 'passed', checks });
      await evalJs(`(() => {const node=document.createElement('pre');node.id='result';node.hidden=true;node.dataset.status='passed';node.textContent=${JSON.stringify(payload)};document.body.append(node);})()`);
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.browserDiagnostics.unclassifiedFailureCount, 0);
  delete result.visualCapture.pngBase64;
  writeFileSync(resolve(output, `${name}.json`), JSON.stringify(result, null, 2));
  console.log(name, result.checks);
}
