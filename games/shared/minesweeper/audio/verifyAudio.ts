import type { MinesAudio } from './MinesAudio';
import type { MinesHud } from '../MinesHud';

type Counts = ReturnType<MinesAudio['snapshot']>['played'];
type Check = (ok: unknown, message: string) => void;
export const audioCounts = (audio: MinesAudio): Counts => audio.snapshot().played;
export const cueDelta = (audio: MinesAudio, before: Counts, expected: Partial<Counts>): boolean =>
  (Object.keys(before) as Array<keyof Counts>).every(id => audioCounts(audio)[id] - before[id] === (expected[id] ?? 0));

export function verifyAudioReady(audio: MinesAudio, check: Check): void {
  const state = audio.snapshot(), backend = state.backend as { buffers: number; error: string | null; disposed: boolean };
  check(backend.buffers === 4 && backend.error === null && !backend.disposed
    && Object.values(state.played).every(value => value === 0), 'Four real WAV buffers decode without autoplaying on startup');
}

/** Uses the same native GUI pointer route as gameplay; no direct audio calls. */
export async function verifyAudioControls(audio: MinesAudio, hud: MinesHud, canvas: HTMLCanvasElement,
  check: Check, settle: () => Promise<void>, mutedAction: () => Promise<void>): Promise<void> {
  const button = async (text: string) => {
    const node = hud.snapshot().nodes.find(node => node.text === text);
    if (!node) throw new Error(`Missing audio GUI fixture button: ${text}`);
    const rect = canvas.getBoundingClientRect();
    for (const type of ['pointerdown', 'pointerup']) canvas.dispatchEvent(new PointerEvent(type, {
      clientX: rect.left + node.rect.x + node.rect.width / 2, clientY: rect.top + node.rect.y + node.rect.height / 2,
      button: 0, buttons: type === 'pointerdown' ? 1 : 0, pointerId: 10001, pointerType: 'mouse', bubbles: true,
    }));
    await settle();
  };
  let before = audioCounts(audio);
  await button('?');
  check(cueDelta(audio, before, { button: 1 }), 'Controls GUI button emits exactly one UI cue');
  before = audioCounts(audio);
  await button('Restart');
  check(cueDelta(audio, before, { button: 1 }), 'Restart preserves its one UI cue while stopping previous gameplay effects');
  before = audioCounts(audio);
  await button('SFX'); await button('Restart'); await mutedAction();
  check(audio.muted && cueDelta(audio, before, {}) && audio.snapshot().pending === 0, 'Mute silences GUI and gameplay and survives restart without queued sounds');
  await button('OFF');
  check(!audio.muted && cueDelta(audio, before, { button: 1 }), 'Unmute emits one confirmation and never replays muted actions');
  before = audioCounts(audio);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true })); await settle();
  check(cueDelta(audio, before, { button: 1 }), 'Keyboard restart emits one UI cue');
  const state = audio.snapshot(), backend = state.backend as { state: string; voices: number; buffers: number; error: string | null };
  check(backend.state === 'running' && backend.buffers === 4 && backend.voices <= 4 && !backend.error && state.pending === 0,
    'Real WebAudio mixer runs with bounded voices and no pending or failed effects');
}
