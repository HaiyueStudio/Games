import type { CubeGame } from './CubeGame';
import { KINDS, type Kind } from './model';
import { cubeLayout } from './layout';
/** Opt-in deterministic browser fixture; exercises real Engine GUI and pointer adapters. */
export async function verifyCube(game: CubeGame, canvas: HTMLCanvasElement, kind: Kind): Promise<unknown> {
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
  };
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const settle = async () => {
    let frames = 0;
    do {
      await frame();
      if (++frames > 1800) throw new Error('Cube animation timeout');
    } while (game.session.busy);
    await frame();
  };
  const click = async (x: number, y: number) => {
    const rect = canvas.getBoundingClientRect();
    for (const type of ['pointerdown', 'pointerup'])
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 10001,
          pointerType: 'mouse',
          button: 0,
          clientX: rect.left + x,
          clientY: rect.top + y,
          bubbles: true,
        }),
      );
    await frame();
    await frame();
  };
  // Synthetic test events have no browser-owned pointer to capture. Real pointers retain native capture.
  const capture = canvas.setPointerCapture.bind(canvas),
    release = canvas.releasePointerCapture.bind(canvas);
  canvas.setPointerCapture = (id) => {
    if (id !== 10001) capture(id);
  };
  canvas.releasePointerCapture = (id) => {
    if (id !== 10001) release(id);
  };
  try {
    const cases: unknown[] = [];
    for (const entry of KINDS) {
      game.start(entry);
      await frame();
      await frame();
      const initial = game.session.model.snapshot();
      game.session.shuffle(20260910);
      await settle();
      const count = game.session.model.history.length;
      assert(count > 0 && !game.session.model.solved, `${entry}: scramble did not change cube`);
      const r = canvas.getBoundingClientRect(),
        panel = cubeLayout(r.width, r.height).panel;
      // Select second layer and turn it using actual GuiSystem queued pointer events.
      await click(panel.x + 8 + (panel.width - 12) / 4 + 20, panel.y + 82);
      await click(panel.x + panel.width * 0.75, panel.y + 130);
      await settle();
      assert(game.session.model.history.length === count + 1, `${entry}: GUI turn failed`);
      assert(game.session.model.history.at(-1)?.layer === 1, `${entry}: inner layer selector failed`);
      await click(panel.x + 35, panel.y + 180);
      await settle();
      assert(game.session.model.history.length === count, `${entry}: undo failed`);
      await click(panel.x + panel.width / 2, panel.y + 180);
      await settle();
      assert(
        game.session.model.snapshot() === initial && game.session.model.solved,
        `${entry}: history restore failed`,
      );
      // Exercise screen-space ray picking after the perspective projection change.
      const stage = cubeLayout(r.width, r.height).stage;
      const x = r.left + stage.x + stage.width / 2 + 15;
      const y = r.top + stage.y + stage.height / 2 + 10;
      for (const [type, clientX] of [
        ['pointerdown', x],
        ['pointermove', x + 60],
        ['pointerup', x + 60],
      ] as const) {
        canvas.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 10001,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            clientX,
            clientY: y,
            bubbles: true,
          }),
        );
      }
      await settle();
      assert(game.session.model.history.length === 1, `${entry}: perspective face drag missed`);
      game.session.restore();
      await settle();
      assert(game.session.model.snapshot() === initial, `${entry}: drag restore failed`);
      assert(game.snapshot().projection === 'perspective', 'Expected perspective camera');
      assert(
        game.snapshot().roundedGeometryCount > 0 && game.snapshot().roundedGeometryCount <= 128,
        'Rounded geometry cache must stay bounded',
      );
      cases.push({
        kind: entry,
        scrambleMoves: count,
        guiTurn: true,
        faceDrag: true,
        undo: true,
        exactRestore: true,
      });
    }
    game.start(kind);
    game.session.shuffle(20260910);
    await settle();
    return {
      schemaVersion: 1,
      suite: 'rubiks-cube-browser',
      status: 'passed',
      cases,
      final: game.snapshot(),
    };
  } finally {
    canvas.setPointerCapture = capture;
    canvas.releasePointerCapture = release;
  }
}
