import { SpiderSolitaire } from '../../../spider-solitaire/SpiderSolitaireGame';
import { LocalStorageSaveBackend } from '@haiyue/engine/save';
const canvas = document.querySelector('canvas')!;
const result = document.querySelector<HTMLElement>('#result')!;
let seed = 16092026;
Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
async function run() {
  const backend = new LocalStorageSaveBackend({ namespace: 'haiyue-spider-autosave-fixture' });
  await backend.delete('spider-solitaire', 'autosave');
  const createGame = () => new SpiderSolitaire({ saveBackend: backend, guiFont: {
    canvasFactory(width, height) { const atlas = document.createElement('canvas'); atlas.width = width; atlas.height = height; return atlas; },
    readAtlasPixels(atlas) { return new Uint8Array(atlas.getContext('2d')!.getImageData(0, 0, atlas.width, atlas.height).data); },
  } });
  const game = createGame();
  await game.init(canvas);
  await wait(500);
  const initial = game.snapshot();
  check(initial.stock === 50 && initial.moves === 0, 'initial deterministic board');
  const click = async (index: number) => {
    const rect = canvas.getBoundingClientRect();
    const total = Math.min(740, rect.width - 28), step = (total - 40) / 6 + 8;
    const x = rect.left + (rect.width - total) / 2 + index * step + 30;
    for (const type of ['pointerdown', 'pointerup']) canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: rect.top + 30, pointerId: 1, pointerType: 'mouse', button: 0 }));
    await wait(200);
    for (let i = 0; i < 100 && game.snapshot().animating; i++) await wait(100);
    await wait(100);
  };
  // Synthetic canvas events exercise GuiSystem hit testing and button dispatch.
  // Pointer capture requires a real active pointer, so this fixture supplies the no-op port.
  canvas.setPointerCapture = () => {};
  canvas.releasePointerCapture = () => {};
  await click(3);
  check(game.snapshot().stock === 40, 'GUI Deal button must deal one row');
  await click(4);
  check(game.snapshot().stock === 50 && game.snapshot().moves === 0, 'GUI Undo button must restore the board');
  await click(1);
  check(game.snapshot().difficulty === 'normal', 'GUI difficulty button');
  await click(0);
  check(game.snapshot().difficulty === 'easy', 'GUI easy button');
  await click(3);
  await game.flushSave();
  const saved = game.snapshot();
  check(saved.autoSaveStatus === 'saved', 'last move must be durably saved');
  game.dispose();
  const reopened = createGame();
  await reopened.init(canvas);
  await wait(300);
  const restored = reopened.snapshot();
  check(JSON.stringify(restored.columns) === JSON.stringify(saved.columns), 'restart must restore all cards and their order');
  check(restored.stock === saved.stock && restored.moves === saved.moves && restored.difficulty === saved.difficulty, 'restart must restore counters and difficulty');
  check(restored.autoSaveStatus === 'saved', 'restored game indicates saved status');
  result.textContent = JSON.stringify({ status: 'passed', seed: 16092026, state: reopened.snapshot(), checks: ['rgba-gui-atlas', 'gui-deal', 'gui-undo', 'gui-difficulty', 'autosave-restart'] });
  result.dataset.status = 'passed';
}
run().catch(error => { result.textContent = JSON.stringify({ status: 'failed', message: String(error) }); result.dataset.status = 'failed'; });
