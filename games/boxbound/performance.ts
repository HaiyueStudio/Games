import type { HaiyueEngine } from '@haiyue/engine';
import { getEngineGPUResourceTracker } from '@haiyue/engine/experimental';
import { BoxboundScene } from './scene';
import { createGame, advanceGame } from './levels';
import { clone, transition, type State } from './model';

/** Local diagnostic workload: real rendering, fixed logical time, no player saves. */
export async function profileBoxbound(
  engine: HaiyueEngine,
  scene: BoxboundScene,
  advance: (ms: number) => Promise<void>,
  clock: () => number,
) {
  const samples: { name: string; resources: ReturnType<BoxboundScene['resourceSnapshot']>; heapBytes: number | null }[] = [];
  const timings: Record<string, number[]> = {};
  const heap = () => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null;
  const sample = (name: string) => samples.push({ name, resources: scene.resourceSnapshot(), heapBytes: heap() });
  const draw = async (state: State, previous?: State, transfers = [] as Parameters<BoxboundScene['show']>[3]) => {
    scene.show(state, previous, false, transfers);
    await advance(1700);
  };
  const run = async (name: string, count: number, action: (i: number) => void) => {
    const values: number[] = [];
    for (let i = 0; i < count; i++) {
      const start = performance.now();
      action(i);
      values.push(performance.now() - start);
      await advance(1700);
    }
    timings[name] = values;
    await engine.device.queue.onSubmittedWorkDone();
    sample(name);
  };
  scene.home = false;
  let state = createGame();
  await draw(state);
  sample('start');
  for (const batch of ['walk-warm', 'walk-repeat'])
    await run(batch, 48, (i) => {
      const previous = state;
      state = transition(state, { type: 'move', dir: i % 2 ? [0, 0, 1] : [0, 0, -1] }).state;
      scene.show(state, previous);
    });
  for (const batch of ['rooms-warm', 'rooms-repeat'])
    await run(batch, 22, (i) => {
      state = createGame();
      const level = i % 11;
      if (level) state.player = { room: `level-${level}`, pos: [3, 0, 5], facing: [0, 0, -1], route: [{ box: `gate-${level}`, from: 'world', entry: [0, 0, 0] }] };
      scene.show(state);
    });
  for (const batch of ['transfer-warm', 'transfer-repeat']) {
    await run(batch, 24, (i) => {
      if (i % 2 === 0) {
        state = createGame();
        state.player = { room: 'level-8', pos: [1, 0, 3], facing: [1, 0, 0], route: [{ box: 'gate-8', from: 'world', entry: [0, 0, 0] }] };
        scene.show(state);
      } else {
        const before = clone(state);
        const result = transition(state, { type: 'move', dir: [1, 0, 0] });
        state = result.state;
        scene.show(state, before, false, result.transfers);
      }
    });
  }
  state = createGame();
  state.player = { room: 'pp-intro', pos: [2, 0, 3], facing: [0, 0, -1], route: [
    { box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
    { box: 'pp-chapter-intro', from: 'pp-hub', entry: [3, 0, 6] },
  ] };
  await draw(state);
  for (const batch of ['nested-warm', 'nested-repeat'])
    await run(batch, 16, (i) => {
      const before = state;
      state = advanceGame(state, i % 2 ? { type: 'leave' } : { type: 'move', dir: [0, 0, -1] }).state;
      scene.show(state, before);
    });
  state = createGame();
  state.player = { room: 'pp-enter12-la', pos: [2, 0, 3], facing: [0, 0, 1], route: [
    { box: 'pp-museum', from: 'world', entry: [8, 0, 3] },
    { box: 'pp-chapter-enter', from: 'pp-hub', entry: [6, 0, 6] },
    { box: 'pp-gateway-21', from: 'pp-enter', entry: [0, 0, 0] },
  ] };
  await draw(state);
  for (const batch of ['recursive-warm', 'recursive-repeat'])
    await run(batch, 16, (i) => {
      const previous = state;
      state = transition(state, { type: 'move', dir: i % 2 ? [0, 0, -1] : [0, 0, 1] }).state;
      scene.show(state, previous);
    });
  await draw(createGame());
  sample('idle-start');
  const frames: number[] = [];
  for (let i = 0; i < 30; i++) {
    const start = performance.now();
    await advance(34);
    frames.push(performance.now() - start);
  }
  timings.idleTwoFrames = frames;
  sample('idle-end');
  const idleExtractions = scene.resourceSnapshot().sceneExtractions;
  scene.jumpInPlace();
  await advance(160);
  const jumpWoke = scene.diagnostics.jumping && scene.resourceSnapshot().sceneExtractions > idleExtractions;
  await advance(800);
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  const previousWidth = canvas.style.width;
  const beforeResize = scene.resourceSnapshot().sceneExtractions;
  canvas.style.width = '80%';
  engine.resizeToDisplaySize(true);
  await advance(34);
  const resizeWoke = scene.resourceSnapshot().sceneExtractions > beforeResize;
  canvas.style.width = previousWidth;
  engine.resizeToDisplaySize(true);
  await advance(34);
  // Dispose actual ECS/render resources, then recreate on the same GPU device.
  const teardown = [];
  scene.dispose();
  await engine.device.queue.onSubmittedWorkDone();
  teardown.push(scene.resourceSnapshot());
  for (let i = 0; i < 3; i++) {
    const next = new BoxboundScene(engine, document.getElementById('canvas') as HTMLCanvasElement, document.getElementById('labels')!, clock);
    next.home = false;
    next.show(createGame());
    await advance(1700);
    next.dispose();
    await engine.device.queue.onSubmittedWorkDone();
    teardown.push(next.resourceSnapshot());
  }
  // Restore the final visible view for screenshot review.
  const finalScene = new BoxboundScene(engine, document.getElementById('canvas') as HTMLCanvasElement, document.getElementById('labels')!, clock);
  finalScene.home = false;
  finalScene.show(createGame());
  await advance(1700);
  engine.stop();
  const summary = Object.fromEntries(Object.entries(timings).map(([key, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return [key, { samples: values.length, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * .95)] }];
  }));
  return { samples, summary, teardown, wake: { jumpWoke, resizeWoke }, finalGpu: getEngineGPUResourceTracker(engine)?.getUsage(), finalScene };
}
