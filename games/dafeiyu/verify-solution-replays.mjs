import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const [worldPath, casePath, outputPath] = process.argv.slice(2);
if (!worldPath) throw Error('Usage: node games/dafeiyu/verify-solution-replays.mjs <Data/Worlds/baba> [cases.json] [output-directory]');
const { source, cases, checkControls } = JSON.parse(readFileSync(casePath ?? new URL('./solution-cases.json', import.meta.url), 'utf8'));
const world = resolve(worldPath);
const root = resolve(import.meta.dirname, '../..');
const output = outputPath ? resolve(outputPath) : resolve(root, 'artifacts/dafeiyu/solution-audit');
const collator = new Intl.Collator('en', { numeric: true });
const files = new Set(readdirSync(world).map(file => file.toLowerCase()));
const ids = [...files].filter(file => file.endsWith('.l') && files.has(file + 'd')).sort(collator.compare).map(file => file.slice(0, -2));
assert.ok(cases.length && cases.every(test => ids.includes(test.id) && /^[rudlw]+$/.test(test.route)));
mkdirSync(output, { recursive: true });

function probes() {
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const state = () => window.__dafeiyu;
  const press = code => document.getElementById('lagoon').dispatchEvent(new KeyboardEvent('keydown', {
    code, bubbles: true, cancelable: true, composed: true,
  }));
  const until = async (condition, label) => {
    const end = performance.now() + 8000;
    do {
      await frame();
      if (condition()) return;
    } while (performance.now() < end);
    throw Error(`${label} timed out in ${state().current}, turn ${state().state.turn}`);
  };
  const cursor = () => {
    const unit = state().state.units.find(unit => unit.name === 'cursor');
    return unit ? [unit.x, unit.y] : null;
  };
  const pressAndRender = async code => { press(code); await frame(); await frame(); };
  const moves = { r: 'ArrowRight', u: 'ArrowUp', l: 'ArrowLeft', d: 'ArrowDown', w: 'Space' };
  const serialize = () => JSON.stringify({ state: state().state, rules: state().rules });
  window.solutionProbes = {
    async open(id, index) {
      if (!state().library) { press('KeyL'); await until(() => state().library, 'open library'); }
      while (state().active !== index) {
        const active = state().active;
        const difference = index - active;
        press(difference >= 6 ? 'ArrowRight' : difference <= -6 ? 'ArrowLeft' : difference > 0 ? 'ArrowDown' : 'ArrowUp');
        await until(() => state().active !== active, 'select row');
      }
      press('Enter');
      await until(() => state().current === id && !state().library, 'load room ' + id);
      await frame();
    },
    async checkMap(mapIndex) {
      if (state().current !== '0level' || state().state.turn !== 0) throw Error('import skipped world_data.txt firstlevel');
      await this.open('106level', mapIndex);
      const map = state();
      const initialCursor = cursor();
      const markers = map.state.units.filter(unit => unit.marker);
      const marker = markers.find(unit => unit.link === '1level');
      if (markers.length !== 26 || marker?.state !== 0 || markers.some(unit => unit.link === '70level')) throw Error('incorrect map metadata');
      await pressAndRender('ArrowRight');
      if (cursor().join() !== initialCursor.join() || state().selectedLink !== '0level') throw Error('cursor advanced onto hidden path');
      await pressAndRender('KeyZ');
      press('Enter');
      await until(() => state().current === '0level', 'enter original first level');
      for (let i = 0; i < 8; i++) {
        press('ArrowRight');
        await until(() => state().state.turn === i + 1, 'replay original first level');
      }
      if (!state().state.won) throw Error('original first level did not win');
      press('Enter');
      await until(() => state().current === '106level', 'return from winning child');
      const unlocked = state().state.units.find(unit => unit.link === marker.link);
      const cursorAfterWin = cursor();
      if (unlocked?.state !== 2 || !state().openPaths.some(([x, y]) => x === 11 && y === 16)) throw Error('winning did not unlock the next path');
      for (const code of ['ArrowRight', 'ArrowUp', 'ArrowUp']) await pressAndRender(code);
      if (state().selectedLink !== '1level') throw Error('the next room is unreachable');
      press('Enter');
      await until(() => state().current === '1level', 'enter newly unlocked room');
      return { map: map.current, initialCursor, cursorAfterWin, importedMarkers: markers.length,
        marker: { id: marker.link, originalState: marker.state, unlockedState: unlocked.state } };
    },
    async checkControls(firstInput) {
      const initial = serialize();
      press(moves[firstInput]);
      await until(() => state().state.turn === 1, 'first gameplay turn');
      const afterFirstTurn = serialize();
      await pressAndRender('KeyZ');
      const undo = serialize() === initial;
      if (!undo) await pressAndRender('KeyR');
      press(moves[firstInput]);
      await until(() => state().state.turn === 1, 'repeat first gameplay turn');
      const deterministic = serialize() === afterFirstTurn;
      await pressAndRender('KeyR');
      return { undo, deterministic, restart: serialize() === initial };
    },
    async replay(route, expected, id, requiredRules = [], tracked = []) {
      const initial = state();
      const ruleTrace = [{ turn: 0, rules: initial.rules, objects: initial.state.units.length }];
      const ruleWitnesses = new Map();
      const objectTrace = [];
      let previousObjects = '';
      const observe = snapshot => {
        for (const rule of requiredRules) {
          if (!ruleWitnesses.has(rule) && snapshot.rules.includes(rule)) ruleWitnesses.set(rule, snapshot.state.turn);
        }
        if (!tracked.length) return;
        const units = snapshot.state.units.filter(unit => tracked.includes(unit.name)).map(unit =>
          [unit.id, unit.name, unit.x, unit.y, unit.dir]);
        const key = JSON.stringify(units);
        if (key !== previousObjects) {
          objectTrace.push({ turn: snapshot.state.turn, units });
          previousObjects = key;
        }
      };
      observe(initial);
      let firstNoControl = null;
      let regainedControl = null;
      let firstMapRule = null;
      let commands = 0;
      for (const input of route) {
        if (state().state.won || state().current !== id) break;
        const turn = state().state.turn;
        press(moves[input]);
        await until(() => state().state.turn > turn || state().current !== id, 'replay input ' + input);
        commands++;
        const next = state();
        if (next.current !== id) break;
        observe(next);
        const unavailable = next.hud.some(node => node.visible && node.text === '没有可以控制的角色');
        if (unavailable && firstNoControl === null) firstNoControl = { turn: next.state.turn, rules: next.rules };
        if (!unavailable && firstNoControl !== null && regainedControl === null) regainedControl = next.state.turn;
        if (next.rules.includes('LEVEL IS BABA') && firstMapRule === null) firstMapRule = next.state.turn;
        const previous = ruleTrace.at(-1);
        if (next.rules.join(' / ') !== previous.rules.join(' / ') || next.state.units.length !== previous.objects) {
          ruleTrace.push({ turn: next.state.turn, input, rules: next.rules, objects: next.state.units.length });
        }
      }
      if (expected === 'map-transform' && (firstMapRule !== null || state().state.conversion)) {
        await until(() => state().current !== id, 'apply room conversion');
      }
      const final = state();
      const convertedMarker = snapshot => snapshot.state.units.some(unit =>
        unit.name === 'baba' && unit.link === id && unit.x === 16 && unit.y === 9);
      const replaced = final.current === '283level' && convertedMarker(final);
      if (replaced) {
        await pressAndRender('KeyR');
        if (!convertedMarker(state())) throw Error('the converted marker disappeared on map restart');
      }
      const missingRules = requiredRules.filter(rule => !ruleWitnesses.has(rule));
      return { commands, won: final.state.won, current: final.current, firstNoControl, regainedControl, firstMapRule,
        finalRules: final.rules, ruleTrace, objectTrace, ruleWitnesses: Object.fromEntries(ruleWitnesses), missingRules,
        passed: (expected === 'win' ? final.state.won : replaced) && !missingRules.length };
    },
  };
}

const report = { source, map: null, cases: [] };
const write = () => writeFileSync(resolve(output, 'replays.json'), JSON.stringify(report, null, 2) + '\n');
const browser = await runChromeWebGpuFixture({
  root, fixture: 'games/dafeiyu/index.html', query: { verify: 1 }, timeoutMs: 120000,
  disableDx12InfoCollection: true, visualCapture: { viewportWidth: 1200, viewportHeight: 800 },
  interact: async cdp => {
    const evaluate = async expression => {
      const { result } = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    const ready = async (expression, label) => {
      const deadline = Date.now() + 20000;
      while (!await evaluate(expression)) {
        assert.ok(Date.now() < deadline, label);
        await new Promise(resolve => setTimeout(resolve, 35));
      }
    };
    const screenshot = async filename => {
      const { result: image } = await cdp.call('Page.captureScreenshot', { format: 'png' });
      writeFileSync(resolve(output, filename), Buffer.from(image.data, 'base64'));
    };
    await ready('window.__dafeiyu?.bounds.cell > 0', 'boot browser');
    const { result: { root: doc } } = await cdp.call('DOM.getDocument');
    const { result: { nodeId } } = await cdp.call('DOM.querySelector', { nodeId: doc.nodeId, selector: '#level-pack' });
    await cdp.call('DOM.setFileInputFiles', { nodeId, files: [world] });
    await ready('window.__dafeiyu?.pack === "Baba Is You" && window.__dafeiyu?.current === "0level"', 'open original first level');
    await evaluate(`(${probes.toString()})()`);
    report.map = await evaluate(`solutionProbes.checkMap(${ids.indexOf('106level')})`);
    await evaluate(`solutionProbes.open("106level",${ids.indexOf('106level')})`);
    await screenshot('overworld.png');
    write();
    for (const test of cases) {
      const record = { id: test.id, label: test.label, focus: test.focus, expected: test.expected };
      const open = () => evaluate(`solutionProbes.open(${JSON.stringify(test.id)},${ids.indexOf(test.id)})`);
      const replay = route => evaluate(`solutionProbes.replay(...${JSON.stringify([route, test.expected, test.id, test.requiredRules ?? [], test.tracked ?? []])})`);
      try {
        await open();
        if (checkControls) record.controls = await evaluate(`solutionProbes.checkControls(${JSON.stringify(test.route[0])})`);
        record.primary = await replay(test.route);
        await screenshot(test.id + '.png');
        if (!record.primary.passed && test.alternate && /^[rudlw]+$/.test(test.alternate)) {
          await open();
          record.alternate = await replay(test.alternate);
          if (test.alternateSource) record.alternateSource = test.alternateSource;
          await screenshot(test.id + '-alternate.png');
        }
        console.log(test.label, record.primary.passed ? 'PASS' : 'FAIL', record.primary.commands,
          record.alternate ? (record.alternate.passed ? 'alternate PASS' : 'alternate FAIL') : '');
      } catch (error) {
        record.error = error instanceof Error ? error.message : String(error);
        console.log(test.label, 'ERROR', record.error);
      }
      report.cases.push(record);
      write();
    }
    await evaluate(`(() => {const node=document.createElement('pre');node.id='result';node.hidden=true;node.dataset.status='passed';node.textContent='{"status":"passed"}';document.body.append(node);})()`);
  },
});
report.browser = browser.browserEvidence;
report.browserDiagnostics = browser.browserDiagnostics;
report.summary = {
  checked: report.cases.length,
  primaryWon: report.cases.filter(entry => entry.primary?.won).length,
  won: report.cases.filter(entry => entry.primary?.won || entry.alternate?.won).length,
  ...(checkControls ? { controlsPassed: report.cases.filter(entry => entry.controls && Object.values(entry.controls).every(Boolean)).length } : {}),
  passed: report.cases.filter(entry => !entry.error && (entry.primary?.passed || entry.alternate?.passed) &&
    (!checkControls || entry.controls && Object.values(entry.controls).every(Boolean))).length,
};
write();
assert.equal(report.summary.passed, cases.length, `Original solution replay failed. See ${resolve(output, 'replays.json')}`);
