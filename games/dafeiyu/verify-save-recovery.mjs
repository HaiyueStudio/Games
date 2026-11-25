import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, 'artifacts/dafeiyu/save-recovery');
mkdirSync(output, { recursive: true });
const result = await runChromeWebGpuFixture({
  root, fixture: 'games/dafeiyu/index.html', query: { verify: 1, start: 'coral' }, timeoutMs: 90000,
  disableDx12InfoCollection: true, visualCapture: { viewportWidth: 1200, viewportHeight: 800 },
  interact: async cdp => {
    const evalJs = async expression => {
      const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      assert.ok(!response.result.exceptionDetails, response.result.exceptionDetails?.exception?.description);
      return response.result.result.value;
    };
    const ready = async expression => {
      const deadline = Date.now() + 15000;
      while (!await evalJs(expression)) {
        if (Date.now() >= deadline) {
          writeFileSync(resolve(output, 'failure-state.json'), JSON.stringify(await evalJs('({ state: window.__dafeiyu, faults: window.saveFaults })'), null, 2));
          assert.fail(expression);
        }
        await new Promise(resolve => setTimeout(resolve, 40));
      }
    };
    const frame = () => evalJs('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    const key = async code => {
      await ready('!__dafeiyu.transition');
      await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', code, key: code });
      await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code });
      await frame();
    };
    const click = async id => {
      await ready(`!__dafeiyu.transition && __dafeiyu.hud.some(node => node.visible && !node.disabled && (node.text === ${JSON.stringify(id)} || node.id === ${JSON.stringify(id)}))`);
      const rect = await evalJs(`__dafeiyu.hud.find(node => node.visible && (node.text === ${JSON.stringify(id)} || node.id === ${JSON.stringify(id)})).rect`);
      const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
      await frame();
    };
    const home = async () => {
      await click('tool-pause'); await click('返回首页');
      await ready('__dafeiyu.mode === "home"');
    };
    const resume = async (label = '存档 1 · 珊瑚湾') => {
      await click('继续游戏'); await click(label);
    };
    await ready('window.__dafeiyu?.mode === "home"');
    await click('新游戏'); await click('存档 1 · 空存档');
    await ready('__dafeiyu.current === "coral-bay"');
    await key('Enter');
    await ready('__dafeiyu.current === "first-dive" && !__dafeiyu.transition');
    await key('ArrowRight'); await key('ArrowRight');
    await home();
    const slotKey = 'haiyue-games:game-save:dafeiyu-slot-1:autosave';
    const installFaults = `(() => {
      const slotKey = ${JSON.stringify(slotKey)};
      const read = Storage.prototype.getItem, write = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
      window.saveFaults = { read: sessionStorage.getItem('save-read-fault') === '1', write: false, level: false, writes: 0, deletes: 0, levelRequests: 0 };
      window.rawSave = () => read.call(localStorage, slotKey);
      Storage.prototype.getItem = function(key) {
        if (this === localStorage && key === slotKey && saveFaults.read) throw new DOMException('Injected read failure', 'SecurityError');
        return read.call(this, key);
      };
      Storage.prototype.setItem = function(key, value) {
        if (this === localStorage && key === slotKey) {
          saveFaults.writes++;
          if (saveFaults.write) throw new DOMException('Injected quota failure', 'QuotaExceededError');
        }
        return write.call(this, key, value);
      };
      Storage.prototype.removeItem = function(key) {
        if (this === localStorage && key === slotKey) saveFaults.deletes++;
        return remove.call(this, key);
      };
      const request = window.fetch;
      window.fetch = function(input, options) {
        if (saveFaults.level && new URL(input instanceof Request ? input.url : String(input), location.href).pathname.endsWith('/levels/first-dive.l')) {
          saveFaults.levelRequests++;
          return Promise.resolve(new Response('', { status: 503 }));
        }
        return request.call(this, input, options);
      };
    })()`;
    await evalJs(installFaults);
    await cdp.call('Page.addScriptToEvaluateOnNewDocument', { source: installFaults });
    const original = await evalJs('rawSave()');
    assert.equal(JSON.parse(original).data.packs.coral.rooms.at(-1).state.turn, 2);
    await evalJs('saveFaults.level = true');
    await resume();
    await ready('__dafeiyu.mode === "home" && __dafeiyu.message === "关卡读取失败"');
    assert.equal(await evalJs('rawSave()'), original);
    assert.deepEqual(await evalJs('[saveFaults.writes, saveFaults.deletes]'), [0, 0]);
    await evalJs('saveFaults.level = false');
    await resume();
    await ready('__dafeiyu.mode === "play" && __dafeiyu.state.turn === 2');
    assert.equal(await evalJs('__dafeiyu.parents[0].id'), 'coral-bay');
    const checks = ['failed level restoration preserves the complete slot; retry restores turn 2 and its parent map'];

    await evalJs('saveFaults.write = true');
    await key('ArrowRight');
    await ready('__dafeiyu.state.turn === 3 && __dafeiyu.saveErrors.includes(0)');
    assert.equal(await evalJs('__dafeiyu.message'), '进度保存失败，已保留待保存进度');
    const dirty = await evalJs('JSON.stringify(__dafeiyu.state)');
    assert.equal(JSON.parse(await evalJs('rawSave()')).data.packs.coral.rooms.at(-1).state.turn, 2);
    await home();
    await evalJs('saveFaults.write = false');
    await resume();
    await ready('__dafeiyu.mode === "play" && __dafeiyu.state.turn === 3 && !__dafeiyu.saveErrors.length');
    assert.equal(await evalJs('JSON.stringify(__dafeiyu.state)'), dirty);
    checks.push('quota failure is visible; retry persists and restores the dirty snapshot without a new move');

    await home();
    const durable = await evalJs('rawSave()');
    await evalJs('sessionStorage.setItem("save-read-fault", "1"); window.oldSavePage = true');
    await cdp.call('Page.reload');
    await ready('!window.oldSavePage && window.__dafeiyu?.mode === "home" && __dafeiyu.unreadSlots.includes(0)');
    assert.equal(await evalJs('rawSave()'), durable);
    await resume('存档 1 · 读取失败，请重试');
    await ready('__dafeiyu.mode === "home" && __dafeiyu.unreadSlots.includes(0)');
    assert.equal(await evalJs('rawSave()'), durable);
    assert.deepEqual(await evalJs('[saveFaults.writes, saveFaults.deletes]'), [0, 0]);
    await frame();
    const screenshot = await cdp.call('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(output, 'read-failure.png'), Buffer.from(screenshot.result.data, 'base64'));
    await evalJs('saveFaults.read = false; sessionStorage.removeItem("save-read-fault")');
    await resume('存档 1 · 读取失败，请重试');
    await ready('__dafeiyu.mode === "play" && __dafeiyu.state.turn === 3 && !__dafeiyu.unreadSlots.length');
    assert.equal(await evalJs('JSON.stringify(__dafeiyu.state)'), dirty);
    checks.push('initial and repeated storage read failures preserve the slot and keep a usable retry entry');
    const payload = JSON.stringify({ status: 'passed', checks });
    await evalJs(`(() => { const node = document.createElement('pre'); node.id = 'result'; node.hidden = true;
      node.dataset.status = 'passed'; node.textContent = ${JSON.stringify(payload)}; document.body.append(node); })()`);
  },
});
assert.equal(result.status, 'passed');
delete result.visualCapture.pngBase64;
writeFileSync(resolve(output, 'result.json'), JSON.stringify(result, null, 2));
console.log(result.checks);
