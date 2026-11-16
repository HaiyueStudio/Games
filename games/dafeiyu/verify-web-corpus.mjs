import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const worldsPath = process.argv[2];
if (!worldsPath) throw new Error('Usage: node games/dafeiyu/verify-web-corpus.mjs <Baba Is You/Data/Worlds>');
const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, 'artifacts/dafeiyu/web-corpus');
const collator = new Intl.Collator('en', { numeric: true });
const packs = readdirSync(worldsPath, { withFileTypes: true }).filter(entry => entry.isDirectory()).flatMap(entry => {
  const path = resolve(worldsPath, entry.name);
  const names = new Set(readdirSync(path).map(name => name.toLowerCase()));
  const maps = [...names].filter(name => name.endsWith('.l')).sort(collator.compare);
  for (const file of maps) assert.ok(names.has(file + 'd'), `Missing .ld sidecar for ${entry.name}/${file}`);
  return maps.length ? [{ id: entry.name, path, levels: maps.map(name => name.slice(0, -2)) }] : [];
});
assert.ok(packs.length, 'No original levels were found');
const expected = packs.reduce((total, pack) => total + pack.levels.length, 0);
mkdirSync(output, { recursive: true });

// Evaluated in the real game page. Use the same keyboard routes as a player.
function installProbes() {
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const state = () => window.__dafeiyu;
  const key = code => document.querySelector('#lagoon').dispatchEvent(
    new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, composed: true })
  );
  const until = async (predicate, label) => {
    const deadline = performance.now() + 10000;
    do {
      await frame();
      const success = predicate();
      if (success) return success;
    } while (performance.now() < deadline);
    const { current, library, active, message } = state();
    throw Error(`${label} timed out at ${current} (list ${library}, row ${active}, ${message})`);
  };
  const passes = new WeakSet();
  const proto = GPURenderPassEncoder.prototype;
  const setPipeline = proto.setPipeline;
  const draw = proto.draw;
  let sceneDraws = 0;
  let submissions = 0;
  const submit = GPUQueue.prototype.submit;
  proto.setPipeline = function (pipeline) {
    if (pipeline.label.startsWith('Dafeiyu 2D puzzle.pipeline.')) passes.add(this);
    else passes.delete(this);
    return setPipeline.call(this, pipeline);
  };
  proto.draw = function (vertices, ...args) {
    if (passes.has(this) && vertices > 0) sceneDraws++;
    return draw.call(this, vertices, ...args);
  };
  GPUQueue.prototype.submit = function (commandBuffers) {
    submissions++;
    return submit.call(this, commandBuffers);
  };
  const waitRender = async () => {
    const drawCount = sceneDraws, submitCount = submissions;
    await until(() => sceneDraws > drawCount && submissions > submitCount, 'WebGPU draw and submit');
  };
  const require = (condition, message) => { if (!condition) throw Error(message); };

  window.webCorpus = {
    async check(id, index, route) {
      const started = performance.now();
      if (!state().library) {
        key('KeyL');
        await until(() => state().library, 'open level menu');
      }
      while (state().active !== index) {
        const active = state().active;
        const diff = index - active;
        key(diff >= 6 ? 'ArrowRight' : diff <= -6 ? 'ArrowLeft' : diff > 0 ? 'ArrowDown' : 'ArrowUp');
        await until(() => state().active !== active, 'select level row');
      }
      key('Enter');
      await until(() => !state().library && state().current === id, 'open selected level');
      const openMs = performance.now() - started;
      await waitRender();
      const initial = state();
      const serialized = JSON.stringify(initial.state);
      require(initial.state.turn === 0 && !initial.state.won, 'opened in wrong state');
      require(!initial.message, 'unexpected status message ' + initial.message);
      require(initial.bounds.cell > 0 && initial.hud.some(node => node.visible && node.text === '大肥鱼'), 'board or HUD is missing');
      require(initial.state.units.every(unit => !/^tile_[0-9a-f]+$/i.test(unit.name)), 'unresolved object code');
      const fps = performance.now();
      const direction = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'][index % 4];
      key(direction);
      await until(() => state().state.turn === 1, 'first turn');
      await waitRender();
      const moveMs = performance.now() - fps;
      key('KeyZ');
      require(JSON.stringify(state().state) === serialized, 'undo changed the initial state');
      key(direction);
      await until(() => state().state.turn === 1, 'second turn');
      key('KeyR');
      require(JSON.stringify(state().state) === serialized, 'restart changed the initial state');
      await waitRender();
      if (route) {
        for (const move of route) {
          const turn = state().state.turn;
          key({ r: 'ArrowRight', l: 'ArrowLeft', u: 'ArrowUp', d: 'ArrowDown' }[move]);
          await until(() => state().state.turn === turn + 1, 'replay turn');
        }
        require(state().state.won, 'the known solution did not win');
        key('KeyR');
        await waitRender();
      }
      return { id, title: initial.title, units: initial.state.units.length, rules: initial.rules.length,
        openMs: Math.round(openMs), moveMs: Math.round(moveMs), replayed: !!route };
    },
  };
}

const report = { expected, checked: 0, passed: 0, failed: 0, packs: [], gpuDiagnostics: [], browserDiagnostics: null };
const updateReport = () => writeFileSync(resolve(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
const browser = await runChromeWebGpuFixture({
  root, fixture: 'games/dafeiyu/index.html', query: { verify: 1 }, timeoutMs: 45000,
  disableDx12InfoCollection: true, visualCapture: { viewportWidth: 1000, viewportHeight: 680 },
  interact: async cdp => {
    let active = null;
    cdp.on('Log.entryAdded', ({ entry }) => {
      if (/^(error|warning)$/.test(entry.level) && /webgpu|gpuvalidation|gpudevice|device\s*lost|pipeline.*invalid/i.test(entry.text)) {
        report.gpuDiagnostics.push({ active, ...entry });
      }
    });
    await cdp.call('Log.enable');
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
    await ready('window.__dafeiyu?.bounds.cell > 0', 'booted browser game');
    await evaluate(`(${installProbes.toString()})()`);
    const { result: { root: doc } } = await cdp.call('DOM.getDocument');
    const { result: { nodeId } } = await cdp.call('DOM.querySelector', { nodeId: doc.nodeId, selector: '#level-pack' });
    for (const pack of packs) {
      const previous = await evaluate('window.__dafeiyu.pack');
      active = pack.id;
      await cdp.call('DOM.setFileInputFiles', { nodeId, files: [pack.path] });
      await ready(`window.__dafeiyu.pack !== ${JSON.stringify(previous)} && !window.__dafeiyu.library`, 'import ' + pack.id);
      const result = { id: pack.id, title: await evaluate('window.__dafeiyu.pack'), expected: pack.levels.length, levels: [] };
      report.packs.push(result);
      let captured = false;
      for (const [index, id] of pack.levels.entries()) {
        active = `${pack.id}/${id}`;
        try {
          const args = [id, index, pack.id === 'baba' && id === '0level' ? 'rrrrrrrr' : null];
          const trial = await evaluate(`window.webCorpus.check(...${JSON.stringify(args)})`);
          result.levels.push({ ...trial, status: 'passed' });
          report.passed++;
        } catch (error) {
          result.levels.push({ id, status: 'failed', error: String(error.message) });
          report.failed++;
          console.error(active + ' ' + error.message);
        }
        report.checked++;
        if (!captured && result.levels.at(-1)?.status === 'passed') {
          const { result: image } = await cdp.call('Page.captureScreenshot', { format: 'png' });
          writeFileSync(resolve(output, pack.id + '.png'), Buffer.from(image.data, 'base64'));
          captured = true;
        }
        if (report.checked % 25 === 0 || index === pack.levels.length - 1) {
          updateReport();
          console.log(`${report.checked}/${expected} checked, ${report.passed} passed, ${report.failed} failed (last ${active})`);
        }
      }
    }
    const payload = JSON.stringify({ status: 'passed', checks: ['web corpus complete'] });
    await evaluate(`(() => {const node=document.createElement('pre');node.id='result';node.hidden=true;node.dataset.status='passed';node.textContent=${JSON.stringify(payload)};document.body.append(node);})()`);
  },
}).catch(error => {
  report.runnerError = String(error.message);
  updateReport();
  throw error;
});
report.browserDiagnostics = browser.browserDiagnostics;
report.browser = browser.browserEvidence;
updateReport();
assert.equal(report.checked, expected);
assert.equal(report.failed + report.gpuDiagnostics.length + report.browserDiagnostics.unclassifiedFailureCount, 0, 'See web-corpus/results.json');
