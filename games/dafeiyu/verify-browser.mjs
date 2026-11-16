import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, 'artifacts/dafeiyu');
mkdirSync(output, { recursive: true });
const layouts = [['desktop', 1200, 800], ['portrait', 390, 844]];
for (const [name, width, height] of layouts) {
  const result = await runChromeWebGpuFixture({
    root, fixture: 'games/dafeiyu/index.html', query: { verify: 1 }, timeoutMs: 45000,
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
      const save = async suffix => {
        await frame();
        const { result } = await cdp.call('Page.captureScreenshot', { format: 'png' });
        writeFileSync(resolve(output, name + '-' + suffix + '.png'), Buffer.from(result.data, 'base64'));
      };
      const key = async code => {
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: code, code });
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: code, code });
        await frame();
      };
      const click = async text => {
        const x = await evalJs(`__dafeiyu.hud.find(n => n.visible && n.text === ${JSON.stringify(text)})?.rect`);
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
      assert.equal(await evalJs('document.querySelectorAll("body > :not(canvas):not(input[hidden]):not(script)").length'), 0);
      assert.ok(await evalJs(`__dafeiyu.hud.filter(n => n.visible).every(n => n.rect.x >= 0 && n.rect.y >= 0 && n.rect.x + n.rect.width <= ${width + 1} && n.rect.y + n.rect.height <= ${height + 1})`));
      checks.push('native GUI and responsive layout');
      await save('initial');
      await key('ArrowRight');
      assert.equal(await evalJs('__dafeiyu.selectedLink'), 'first-dive');
      await click('关卡');
      await ready('__dafeiyu.library');
      await save('library');
      await key('ArrowUp'); await key('Enter');
      assert.ok(await evalJs('__dafeiyu.library && __dafeiyu.message === "未解锁"'));
      await key('KeyL');
      await key('Enter');
      await ready('__dafeiyu.current === "first-dive"');
      assert.deepEqual(await evalJs('__dafeiyu.rules.slice().sort()'), ['BABA IS YOU', 'FLAG IS WIN', 'ROCK IS PUSH']);
      assert.ok(await evalJs(`performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/assets/whale-walk/atlas.png')) &&
        !performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/assets/whale.png'))`));
      for (const facing of ['right', 'down', 'left', 'up']) {
        const code = 'Arrow' + facing[0].toUpperCase() + facing.slice(1);
        const frames = await evalJs(`(async () => {
          const drawn = new Set(), start = performance.now();
          document.getElementById('lagoon').dispatchEvent(new KeyboardEvent('keydown', { code: ${JSON.stringify(code)}, bubbles: true }));
          while (performance.now() - start < 225) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            for (const sprite of __dafeiyu.animation.whales) if (sprite.startsWith('whale/${facing}/')) drawn.add(sprite);
          }
          return [...drawn];
        })()`);
        assert.ok(frames.length >= 2, `The ${facing} walk showed ${frames.join(', ')}`);
        await ready(`__dafeiyu.animation.whales.includes('whale/${facing}/1')`);
      }
      checks.push('four distinct atlas directions and animated walk frames');
      await save('character');
      for (let i = 0; i < 7; i++) await key('ArrowRight');
      await ready('__dafeiyu.state.won && __dafeiyu.animation.celebrating && __dafeiyu.animation.sparkles > 0');
      await save('clear');
      await key('KeyZ');
      assert.equal(await evalJs('__dafeiyu.state.won'), false);
      await ready('!__dafeiyu.animation.celebrating && __dafeiyu.animation.sparkles === 0');
      await click('重开');
      assert.equal(await evalJs('__dafeiyu.state.turn'), 0);
      for (let i = 0; i < 7; i++) await key('ArrowRight');
      await ready('__dafeiyu.state.won && __dafeiyu.animation.sparkles > 0');
      await ready('!__dafeiyu.animation.celebrating && __dafeiyu.animation.sparkles === 0');
      await click('返回地图');
      await ready('__dafeiyu.current === "coral-bay"');
      assert.deepEqual(await evalJs('__dafeiyu.openPaths'), [[3, 6], [4, 6]]);
      assert.ok(await evalJs('__dafeiyu.hud.some(n => n.visible && n.text === "1 / 5")'));
      await save('map-unlocked');
      for (let i = 0; i < 3; i++) await key('ArrowRight');
      await ready('__dafeiyu.selectedLink === "breakwater"');
      await cdp.call('Page.reload');
      await ready('window.__dafeiyu?.current === "coral-bay" && __dafeiyu.selectedLink === "breakwater"');
      await key('Enter');
      await ready('__dafeiyu.current === "breakwater"');
      checks.push('win particles, undo and restart, locked map routes, and return to the next native level');
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
        const code = { 0: 'Space', 1: 'KeyZ', 3: 'KeyL', 12: 'ArrowUp', 15: 'ArrowRight' }[index];
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
      await button(3);
      await ready('__dafeiyu.library');
      await button(3);
      await ready('!__dafeiyu.library');
      const arrows = {r:'ArrowRight', d:'ArrowDown', u:'ArrowUp'};
      for (const direction of 'rrdddrrrrruuu') await key(arrows[direction]);
      await ready('__dafeiyu.state.won');
      await button(0);
      await ready('__dafeiyu.current === "coral-bay" && __dafeiyu.selectedLink === "breakwater"');
      for (let i = 0; i < 3; i++) await button(12);
      await ready('__dafeiyu.selectedLink === "change-course"');
      await button(0);
      await ready('__dafeiyu.current === "change-course"');
      checks.push('simulated standard gamepad');
      if (process.env.DAFEIYU_BABA_WORLD && name === 'desktop') {
        const { result: { root: doc } } = await cdp.call('DOM.getDocument');
        const { result: { nodeId } } = await cdp.call('DOM.querySelector', { nodeId: doc.nodeId, selector: '#level-pair' });
        await cdp.call('DOM.setFileInputFiles', { nodeId, files: ['0level.l','0level.ld','106level.l','106level.ld'].map(file => resolve(process.env.DAFEIYU_BABA_WORLD, file)) });
        await ready('__dafeiyu.current === "0level"');
        assert.ok(await evalJs('__dafeiyu.rules.includes("BABA IS YOU") && __dafeiyu.rules.includes("FLAG IS WIN")'));
        await save('imported');
        for (let i = 0; i < 8; i++) await key('ArrowRight');
        await ready('__dafeiyu.state.won === true');
        await key('KeyL'); await key('ArrowDown'); await key('Enter');
        await ready('__dafeiyu.current === "106level"');
        await key('Enter');
        await ready('__dafeiyu.current === "0level"');
        checks.push('real Steam .l/.ld file import and map navigation');
        const { result: { nodeId: folderId } } = await cdp.call('DOM.querySelector', { nodeId: doc.nodeId, selector: '#level-pack' });
        await cdp.call('DOM.setFileInputFiles', { nodeId: folderId, files: [resolve(process.env.DAFEIYU_BABA_WORLD)] });
        await ready('__dafeiyu.pack === "Baba Is You" && __dafeiyu.current === "0level"');
        for (let i = 0; i < 8; i++) await key('ArrowRight');
        await ready('__dafeiyu.state.won === true');
        await key('Enter');
        await ready('__dafeiyu.current === "106level" && __dafeiyu.selectedLink === "0level"');
        checks.push('real Steam directory import with world_data.txt');
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
