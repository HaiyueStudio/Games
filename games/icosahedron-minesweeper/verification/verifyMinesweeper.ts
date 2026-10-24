import type { Geometry3D, Mesh3D } from '@haiyue/engine';
import { dot, TILE_HEIGHT, type Vec3, type CellFlag, type CellMaterials, type CellSurface } from '../rendering/CellVisuals';
import type { MinesHud } from '../ui/MinesHud';
import type { MinesAudio } from '../../shared/minesweeper/audio/MinesAudio';
import { audioCounts, cueDelta, verifyAudioReady, verifyAudioControls } from '../../shared/minesweeper/audio/verifyAudio';

interface State {
  phase: 'playing' | 'won' | 'lost'; opened: number; flags: number;
  cells: Array<{ mine: boolean; count: number; state: 'hidden' | 'revealed' | 'flagged' }>;
}
type CellState = State['cells'][number];
interface Cell extends CellState {
  id: number; center: Vec3; normal: Vec3; geometry: Geometry3D; mesh: Mesh3D | null; neighbors: number[];
  flag: CellFlag | null; surface: CellSurface;
}
interface Host {
  canvas: HTMLCanvasElement; cells: Cell[]; materials: CellMaterials; hud: MinesHud; audio: MinesAudio;
  reset(): void; pick(x: number, y: number): number | null;
  project(cell: Cell): { x: number; y: number }; orbit(): void;
  snapshot(): State; restore(state: State): void;
}

/** Deterministic browser fixture using the real ray picker, pointer adapter and renderer. Never writes player saves. */
export async function verifyMinesweeper(host: Host) {
  const checks: string[] = [];
  const check: (ok: unknown, message: string) => asserts ok = (ok, message) => {
    if (!ok) throw new Error(message);
    checks.push(message);
  };
  const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(requestAnimationFrame); };
  const visible = (cell: Cell) => {
    const { x, y } = host.project(cell), r = host.canvas.getBoundingClientRect();
    return x > r.left + 20 && x < r.right - 20 && y > r.top + 90 && y < r.bottom - 70 && host.pick(x, y) === cell.id;
  };
  const find = (predicate: (cell: Cell) => boolean) => {
    const cell = host.cells.find(c => visible(c) && predicate(c));
    if (!cell) throw new Error('No visible fixture cell');
    return cell;
  };
  const click = async (cell: Cell, button: number) => {
    const { x, y } = host.project(cell);
    for (const type of ['pointerdown', 'pointerup']) host.canvas.dispatchEvent(new PointerEvent(type, {
      clientX: x, clientY: y, button, buttons: type === 'pointerdown' ? button === 2 ? 2 : 1 : 0,
      pointerType: 'mouse', pointerId: 10001, bubbles: true,
    }));
    await settle();
  };
  const capture = host.canvas.setPointerCapture.bind(host.canvas), release = host.canvas.releasePointerCapture.bind(host.canvas);
  host.canvas.setPointerCapture = id => { if (id !== 10001) capture(id); };
  host.canvas.releasePointerCapture = id => { if (id !== 10001) release(id); };
  try {
    await settle();
    verifyAudioReady(host.audio, check);
    check(host.cells.length === 162, '162 connected polygon cells');
    check(host.cells.every(c => c.geometry.positions.every(Number.isFinite)), 'Finite tile geometry');
    check([...Object.values(host.materials.surfaces), ...host.materials.numbers].every(material => {
      const source = material.baseColorTexture;
      return source && typeof source === 'object' && 'texture' in source && source.texture;
    }), 'All cell albedos are resident GPU textures before the first frame');
    const number = find(c => !c.mine && c.count > 0);
    await click(number, 0);
    check(cueDelta(host.audio,{click:0,flag:0,explosion:0,button:0},{click:1}),'Revealing a tile emits one click cue');
    check(number.state === 'revealed' && number.mesh?.material === host.materials.numbers[number.count], 'Pointer reveal uses numbered albedo on the cell mesh');
    const flagCell = find(c => c.state === 'hidden' && c.mine);
    let beforeAudio=audioCounts(host.audio);
    await click(flagCell, 2);
    const flag = flagCell.flag;
    check(flag && !flag.root.disabled, 'Right click plants pole and pennant geometry');
    const polePositions = flag.pole.geometry.positions;
    const heights: number[] = [];
    for (let i = 0; i < polePositions.length; i += 3) heights.push(dot([polePositions[i]!, polePositions[i + 1]!, polePositions[i + 2]!], flagCell.normal));
    check(Math.min(...heights) < TILE_HEIGHT && Math.max(...heights) > TILE_HEIGHT + 0.29, 'Pole penetrates the tile and extends along its normal');
    for (let i = 0; i < 4; i++) { await click(flagCell, 2); await click(flagCell, 2); }
    check(cueDelta(host.audio,beforeAudio,{flag:9}),'Flag placement and eight toggles emit one flag cue each');
    check(flagCell.flag === flag && !flag.root.disabled, 'Repeated flag toggles reuse the same mesh pair');
    const saved = host.snapshot();
    beforeAudio=audioCounts(host.audio);
    host.reset(); await settle();
    check(host.cells.every(c => !c.flag || c.flag.root.disabled), 'Restart hides every planted flag');
    host.restore(saved); await settle();
    check(cueDelta(host.audio,beforeAudio,{}),'Reset and save restoration never replay gameplay audio');
    check(number.mesh?.material === host.materials.numbers[number.count] && flagCell.flag === flag && !flag.root.disabled, 'Save restore reconstructs number textures and flag meshes');
    host.orbit(); await settle();
    const rotated = find(c => c.state === 'hidden' && !c.mine && c.count > 0);
    await click(rotated, 0);
    check(rotated.mesh?.material === host.materials.numbers[rotated.count], 'Ray picking and attached glyphs survive orbit and zoom');
    const wrong = find(c => c.state === 'hidden' && !c.mine);
    await click(wrong, 2);
    beforeAudio=audioCounts(host.audio);
    await click(find(c => c.state === 'hidden' && c.mine), 0);
    check(cueDelta(host.audio,beforeAudio,{explosion:1}),'One mine hit emits one explosion without a tile cue or per-mine replay');
    check(host.snapshot().phase === 'lost' && host.cells.filter(c => c.mine).every(c => c.surface === 'mine' && (!c.flag || c.flag.root.disabled)), 'Loss exposes textured mines and removes their flags');
    check(wrong.surface === 'wrong-flag' && wrong.flag?.cloth.material === host.materials.wrongCloth, 'Wrong flags retain their mesh with a crossed-out face');
    const lost = host.snapshot(); host.reset(); host.restore(lost); await settle();
    check(wrong.surface === 'wrong-flag' && wrong.flag?.cloth.material === host.materials.wrongCloth, 'Lost save preserves the wrong-flag appearance');
    for (const first of [0, 2]) for (const remaining of [1, 2]) {
      host.reset(); await settle();
      const target = find(c => !c.mine && c.count > 0);
      await click(target, 0);
      const state = host.snapshot();
      const safe = target.neighbors.filter(id => !host.cells[id]!.mine);
      for (const id of target.neighbors) if (host.cells[id]!.mine) state.cells[id]!.state = 'flagged';
      state.flags = state.cells.filter(c => c.state === 'flagged').length;
      host.restore(state); await settle();
      const beforeChord=audioCounts(host.audio);
      const { x, y } = host.project(target);
      const emit = (type: string, button: number, buttons: number) => {
        const init = { clientX: x, clientY: y, button, buttons, pointerId: 10001, pointerType: 'mouse', bubbles: true };
        host.canvas.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, init) : new MouseEvent(type, init));
      };
      emit('pointerdown', first, first === 0 ? 1 : 2); emit('mousedown', first, first === 0 ? 1 : 2);
      emit('pointermove', first === 0 ? 2 : 0, 3); emit('mousedown', first === 0 ? 2 : 0, 3);
      // The first release is a mouseup only. The final release produces pointerup + mouseup.
      emit('mouseup', remaining === 1 ? 2 : 0, remaining);
      await settle();
      const once = JSON.stringify(host.snapshot());
      emit('pointerup', remaining === 1 ? 0 : 2, 0); emit('mouseup', remaining === 1 ? 0 : 2, 0);
      await settle();
      check(safe.every(id => host.cells[id]!.state === 'revealed') && host.snapshot().phase === 'playing'
        && once === JSON.stringify(host.snapshot()), `Native chord: first button ${first}, remaining mask ${remaining}, one reveal`);
      check(cueDelta(host.audio,beforeChord,{click:1}),`Native chord emits one cue across both releases: ${first}/${remaining}`);
    }
    host.reset(); await settle();
    const dragTarget = find(c => c.state === 'hidden');
    const start = host.project(dragTarget), beforeDrag = JSON.stringify(host.snapshot());
    for (const [type, x, buttons] of [['pointermove', start.x, 0], ['pointerdown', start.x, 1],
      ['pointermove', start.x + 24, 1], ['pointermove', start.x + 48, 1], ['pointerup', start.x + 48, 0]] as const) {
      host.canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: start.y, button: 0, buttons, pointerId: 10001, pointerType: 'mouse', bubbles: true }));
      await settle();
      if (buttons) check(host.cells.every(c => c.surface !== 'hover'), `Orbit packet ${type}/${x - start.x} does not flash hover materials`);
    }
    check(JSON.stringify(host.snapshot()) === beforeDrag, 'Orbit drag never reveals or flags a cell');
    host.restore(saved); await settle();
    check(host.hud.noticeSnapshot().visible && host.hud.noticeSnapshot().text === 'Saved game restored.', 'Restored game notification appears briefly');
    host.hud.update(4000);
    check(!host.hud.noticeSnapshot().visible, 'Restored game notification hides automatically');
    await verifyAudioControls(host.audio,host.hud,host.canvas,check,settle,async()=>{
      await click(find(c=>!c.mine&&c.count>0),0);await click(find(c=>c.mine&&c.state==='hidden'),2);
    });
    host.reset(); await settle();
    // Readable screenshot arrangement, produced by the normal input path.
    for (const cell of host.cells.filter(c => visible(c) && !c.mine).slice(0, 15)) await click(cell, 0);
    for (const cell of host.cells.filter(c => visible(c) && c.mine).slice(0, 4)) await click(cell, 2);
    check(host.snapshot().phase === 'playing' && host.snapshot().opened > 0 && host.snapshot().flags === 4
      && host.cells.every(c => Boolean(c.flag && !c.flag.root.disabled) === (c.state === 'flagged')),
    'Final deterministic gameplay frame contains revealed digits and exactly four active flag assemblies');
    host.hud.update(6000);
    await settle();
    return { schemaVersion: 1, suite: 'icosahedron-minesweeper-visuals', status: 'passed', checks, audio:host.audio.snapshot(), final: { opened: host.snapshot().opened, flags: host.snapshot().flags } };
  } finally {
    host.canvas.setPointerCapture = capture; host.canvas.releasePointerCapture = release;
  }
}
