import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? `${specifier}.ts` : specifier, context); } });

const { mugenRenderPixelRatio } = await import('../mugen/viewer/MugenRenderBudget.ts');
const { MugenStageRenderCache } = await import('../mugen/game/MugenStageRenderer.ts');

test('M12 caps high-DPI render work to a 1080p-class pixel budget', () => {
  assert.equal(mugenRenderPixelRatio(1280, 720, 1), 1);
  assert.equal(mugenRenderPixelRatio(1280, 720, 2), 1.5);
  assert.equal(mugenRenderPixelRatio(1920, 1080, 2), 1);
  assert.equal(mugenRenderPixelRatio(3840, 2160, 2), .75);
});

test('M12 reuses immutable stage actors until a visible input changes', () => {
  const stage = { backgrounds: [], localCoord: [320, 240], stageScale: [1, 1] };
  const camera = { position: [0, 0] };
  const cache = new MugenStageRenderCache();
  const first = cache.actors(stage, camera, 1, { width: 1280, height: 720 });
  assert.equal(cache.actors(stage, camera, 99, { width: 1280, height: 720 }), first);
  assert.notEqual(cache.actors(stage, { position: [1, 0] }, 99, { width: 1280, height: 720 }), first);
});

test('M12 loading UI reports parse and GPU upload progress through Haiyue GUI', () => {
  const flow = read('../mugen/game/MugenFlowUi.ts'); const main = read('../mugen/main.ts'); const view = read('../mugen/viewer/MugenWebGpuView.ts');
  assert.match(flow, /new GuiProgress/u); assert.match(flow, /loadingProgress/u); assert.match(main, /正在解析角色/u); assert.match(main, /正在上传精灵到显存/u);
  assert.match(view, /pendingUploadBytes/u); assert.match(view, /showOverlay/u); assert.match(main, /performanceSimulationMs/u);
  assert.match(main, /maxSubSteps: 2, maxBacklogTicks: 4/u); assert.match(main, /performanceBacklogTicks/u);
  const executor = read('../mugen/runtime/state-execution/MugenStateExecutor.ts'); assert.match(executor, /if \(traceEnabled\) trace\.push/u);
});

function read(path) { return readFileSync(new URL(path, import.meta.url), 'utf8'); }
