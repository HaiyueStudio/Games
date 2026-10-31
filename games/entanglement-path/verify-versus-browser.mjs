import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const output = resolve(root, 'artifacts/entanglement-path'); mkdirSync(output, { recursive: true });
for (const [name, width, height] of [['desktop', 1200, 760], ['portrait', 390, 844]]) {
  const result = await runChromeWebGpuFixture({ root, fixture: 'games/entanglement-path/index.html', query: { verify: 1 },
    timeoutMs: 90000, disableDx12InfoCollection: true, visualCapture: { viewportWidth: width, viewportHeight: height },
    interact: async cdp => {
      const evaluate = async expression => {
        const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text);
        return response.result?.result?.value;
      };
      const wait = async (expression, label) => {
        const deadline = Date.now() + 25000;
        while (!await evaluate(expression)) { assert.ok(Date.now() < deadline, label); await new Promise(resolve => setTimeout(resolve, 40)); }
      };
      const ready = () => wait('!!window.__entanglementPath?.versus && !__entanglementPath.introActive && !__entanglementPath.versus.loading && !__entanglementPath.versus.toolbar.hidden', 'ready');
      const capture = async suffix => {
        await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
        const response = await cdp.call('Page.captureScreenshot', { format: 'png' });
        writeFileSync(resolve(output, `${name}-versus-${suffix}.png`), Buffer.from(response.result.data, 'base64'));
      };
      const clickSelector = async selector => {
        const point = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      };
      const key = async value => {
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyDown', key: value });
        await cdp.call('Input.dispatchKeyEvent', { type: 'keyUp', key: value });
      };
      await ready();
      await clickSelector('[data-mode="shared"]'); await ready();
      await evaluate('(async () => { await __entanglementPath.versus.newMatch(177); })()');
      assert.equal(await evaluate('__entanglementPath.versus.mode'), 'shared');
      assert.ok(await evaluate('__entanglementPath.versus.match.human === __entanglementPath.versus.match.machine'));
      const before = await evaluate('JSON.stringify(__entanglementPath.versus.match.record())');
      await key('ArrowLeft'); await key('b');
      assert.deepEqual(await evaluate('({ swap: __entanglementPath.versus.selection.swap, rotation: __entanglementPath.versus.rotations[0] })'), { swap: true, rotation: 5 });
      assert.equal(await evaluate('JSON.stringify(__entanglementPath.versus.match.record())'), before, 'selection does not prematurely commit a tile');
      await key('b'); await key('ArrowRight');
      await key('Enter');
      const locked = await evaluate(`(() => { const v = __entanglementPath.versus, m = v.match; v.rotate(1); v.swap(); v.place(); return { count: m.moves.length, turn: m.turn, choice: v.selection }; })()`);
      if (await evaluate('!__entanglementPath.versus.match.winner')) {
        assert.equal(locked.count, 1); assert.equal(locked.turn, 'machine');
        await wait('__entanglementPath.versus.match.moves.length === 2 || !!__entanglementPath.versus.match.winner', 'AI replies automatically once');
      }
      await capture('shared');
      // Save while an AI reply is pending; reload must replay it once, never skip the turn.
      await evaluate(`(async () => {
        const v = __entanglementPath.versus; await v.newMatch(419); v.place(); v.machineAt = Infinity;
        await v.saves.flush(); window.__savedVsRecord = JSON.stringify(v.match.record());
      })()`);
      const saved = await evaluate('__savedVsRecord');
      await evaluate('window.__entanglementPath = undefined'); await cdp.call('Page.reload'); await ready();
      await wait('!!__entanglementPath.versus.match', 'saved match restored');
      const restored = await evaluate('JSON.stringify(__entanglementPath.versus.match.record())');
      assert.deepEqual(JSON.parse(restored).moves.slice(0, JSON.parse(saved).moves.length), JSON.parse(saved).moves);
      await wait('__entanglementPath.versus.match.turn === "human" || !!__entanglementPath.versus.match.winner', 'pending AI reply restored');
      assert.ok(await evaluate('__entanglementPath.versus.match.moves.length <= 2'), 'one pending move produces at most one AI move');
      await clickSelector('[data-mode="race"]'); await ready();
      await evaluate('(async () => { await __entanglementPath.versus.newMatch(177); })()');
      const pair = await evaluate(`(() => { const m = __entanglementPath.versus.match; return {
        equal: JSON.stringify(m.human.next) === JSON.stringify(m.machine.next), source: m.human.sourceExit === m.machine.sourceExit,
        independent: m.human !== m.machine && m.human.placed !== m.machine.placed,
        outside: [...__entanglementPath.versus.view.world.nodes.values()].filter(n => n.kind === 'sea').length,
      }; })()`);
      assert.deepEqual(pair, { equal: true, source: true, independent: true, outside: 66 });
      await capture('race-start');
      // Exercise an actual canvas button (including small touch-screen geometry).
      const point = await evaluate(`(() => { const v = __entanglementPath.versus, b = v.view.hits.get('cw'), r = v.canvas.getBoundingClientRect(); return { x: r.x + b.x + b.w / 2, y: r.y + b.y + b.h / 2 }; })()`);
      await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
      assert.equal(await evaluate('__entanglementPath.versus.selection.rotation'), 1);
      await key('Enter');
      await wait('__entanglementPath.versus.match.turn === "human" || !!__entanglementPath.versus.match.winner', 'race AI replies');
      assert.equal(await evaluate('__entanglementPath.versus.match.machine.placed.size'), 1);
      await capture('race-playing');
      const final = await evaluate(`(() => {
        const v = __entanglementPath.versus, m = v.match;
        // Use the real frame-driven turn adapter; accelerate only its clock deadline.
        for (let i = 0; !m.winner && i < 200; i++) { if (m.turn === 'human') v.place(); else { v.machineAt = -1; v.update(); } }
        return { winner: m.winner, human: m.human.score, machine: m.machine.score, ends: m.human.ended && m.machine.ended, moves: m.moves.length };
      })()`);
      assert.ok(final.ends && final.moves > 2); assert.equal(final.winner, final.human === final.machine ? 'draw' : final.human > final.machine ? 'human' : 'machine');
      await capture('race-result');
      await key('Enter'); await ready();
      assert.equal(await evaluate('__entanglementPath.versus.match.moves.length'), 0);
      assert.equal(await evaluate('__entanglementPath.versus.seed'), 177, 'rematch keeps the same seed');
      for (const index of [1, 2, 3, 4, 0]) {
        await evaluate(`(async () => { await __entanglementPath.versus.newMatch(177, ${index}); })()`);
        assert.ok(await evaluate('__entanglementPath.versus.match.human.next.id === 1 && __entanglementPath.versus.match.machine.next.id === 1'));
        if (index >= 3) await capture(index === 3 ? 'trident-race' : 'blossom-race');
      }
      // Hide the DOM controls, then click their engine-rendered copies through the original canvas.
      await evaluate('__entanglementPath.versus.toolbar.style.visibility = "hidden"');
      await clickSelector('[data-mode="shared"]'); await ready();
      assert.equal(await evaluate('__entanglementPath.versus.mode'), 'shared', 'embedded canvas forwards toolbar hits');
      await clickSelector('[data-mode="race"]'); await ready();
      await evaluate('__entanglementPath.versus.toolbar.style.visibility = ""');
      await evaluate(`(async () => { const v = __entanglementPath.versus; await Promise.all([v.newMatch(1), v.newMatch(2), v.newMatch(3)]); })()`);
      assert.equal(await evaluate('__entanglementPath.versus.match.seed'), 3, 'latest async terrain job wins');
      await key('m'); assert.equal(await evaluate('__entanglementPath.versus.mode'), 'solo');
      await evaluate(`(() => { const s = __entanglementPath.versus.levelSelect; s.focus(); s.value = '3'; s.dispatchEvent(new Event('change')); })()`); await ready();
      await wait('__entanglementPath.levelIndex === 3 && __entanglementPath.phase === "playing"', 'solo selector loads the reference board');
      assert.ok(await evaluate('document.activeElement === __entanglementPath.engine.canvas'), 'selection returns focus to gameplay');
      await evaluate(`(() => { const s = __entanglementPath.versus.levelSelect; s.value = '0'; s.dispatchEvent(new Event('change')); })()`); await ready();
      await wait('__entanglementPath.levelIndex === 0 && __entanglementPath.phase === "playing"', 'solo selector returns to classic');
      assert.ok(await evaluate('!__entanglementPath.versus.active && document.querySelector("#canvas").style.visibility !== "hidden"'));
      const solo = await evaluate('__entanglementPath.rotation'); await key('ArrowLeft');
      assert.equal(await evaluate('__entanglementPath.rotation'), (solo + 5) % 6);
      await capture('return-solo');
      await evaluate(`(() => {
        window.__vsPad = { index: 0, connected: true, mapping: 'standard', id: 'Versus test pad', axes: [0,0,0,0], buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false, touched: false })) };
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [__vsPad] });
      })()`);
      const pad = async button => {
        await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))');
        await evaluate(`Object.assign(__vsPad.buttons[${button}], { value: 1, pressed: true })`);
        await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))');
        await evaluate(`Object.assign(__vsPad.buttons[${button}], { value: 0, pressed: false })`);
        await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))))');
      };
      await pad(9); await ready(); assert.equal(await evaluate('__entanglementPath.versus.mode'), 'shared', 'Start switches game mode');
      await pad(1); assert.ok(await evaluate('__entanglementPath.versus.selection.swap'), 'B selects reserve');
      await pad(4); assert.equal(await evaluate('__entanglementPath.versus.selection.rotation'), 5, 'LB rotates the selected reserve');
      await pad(9); await ready(); assert.equal(await evaluate('__entanglementPath.versus.mode'), 'race');
      await pad(9); await ready(); assert.equal(await evaluate('__entanglementPath.versus.mode'), 'solo');
      await evaluate('__vsPad.connected = false');
      const payload = { status: 'passed', checks: ['real-mode-buttons', 'shared-board', 'rotation-and-reserve', 'machine-turn-input-lock', 'automatic-greedy-reply',
        'pending-turn-save-restore', 'seeded-independent-race', 'canvas-controls', 'two-board-results', 'seeded-rematch', 'five-board-shapes', 'engine-toolbar-hit-forwarding',
        'cancelled-map-jobs', 'return-to-solo', 'gamepad-mode-reserve-rotation'], final };
      await evaluate(`(() => { const node = document.createElement('pre'); node.id = 'result'; node.hidden = true; node.dataset.status = 'passed'; node.textContent = ${JSON.stringify(JSON.stringify(payload))}; document.body.append(node); })()`);
    },
  });
  assert.equal(result.status, 'passed', `${name} versus browser regression`);
  assert.equal(result.browserDiagnostics.unclassifiedFailureCount, 0);
  delete result.visualCapture.pngBase64;
  writeFileSync(resolve(output, `${name}-versus.json`), JSON.stringify(result, null, 2));
  console.log(`${name}: versus checks passed`);
}
