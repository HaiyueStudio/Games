import { GamepadSampler, NeutralGate } from './sampler';

interface LobbyOptions {
  cards(): HTMLButtonElement[];
  filters(): HTMLButtonElement[];
  playing(): boolean;
  hint: HTMLElement;
}

/** Uses the same Engine sampler as the games; the iframe owns gameplay input. */
export function installLobbyGamepad(options: LobbyOptions): () => void {
  const sampler = new GamepadSampler(() => navigator.getGamepads(), new EventTarget());
  const gate = new NeutralGate();
  let frame = 0, selected = '', direction = '', repeatAt = 0, wasPlaying = false;
  const focus = (cards: HTMLButtonElement[], index: number): void => {
    const card = cards[Math.max(0, Math.min(cards.length - 1, index))];
    if (!card) return;
    selected = card.dataset.gameId!;
    for (const item of cards) item.classList.toggle('gamepad-selected', item === card);
    card.focus({ preventScroll: true });
    card.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  };
  const loop = (time: number): void => {
    frame = requestAnimationFrame(loop);
    const playing = options.playing();
    if (playing || document.hidden) { gate.reset(); wasPlaying = playing; return; }
    if (wasPlaying) { gate.reset(); wasPlaying = false; }
    const devices = navigator.getGamepads?.() ?? [];
    const pad = gate.filter(sampler.sample().filter(p => devices[p.index]?.connected))[0];
    options.hint.hidden = !pad;
    if (!pad) { direction = ''; return; }
    options.hint.textContent = '手柄：左摇杆/方向键选择 · A 进入 · LB/RB 切换分类 · 游戏内 Back+LB/RB 切游戏 · Back+Start 返回';
    const cards = options.cards();
    if (!cards.length) return;
    let index = cards.findIndex(card => card.dataset.gameId === selected);
    if (index < 0) index = 0;
    if (!cards[index]!.classList.contains('gamepad-selected')) focus(cards, index);
    const x = (pad.values.x ?? 0) + Number(pad.held.has('b15')) - Number(pad.held.has('b14'));
    const y = (pad.values.y ?? 0) + Number(pad.held.has('b13')) - Number(pad.held.has('b12'));
    const next = Math.abs(x) > Math.abs(y) ? (x > .4 ? 'right' : x < -.4 ? 'left' : '') : y > .4 ? 'down' : y < -.4 ? 'up' : '';
    if (next && (next !== direction || time >= repeatAt)) {
      const columns = cards.filter(card => Math.abs(card.getBoundingClientRect().top - cards[0]!.getBoundingClientRect().top) < 4).length || 1;
      index += next === 'right' ? 1 : next === 'left' ? -1 : next === 'down' ? columns : -columns;
      index = Math.max(0, Math.min(cards.length - 1, index));
      focus(cards, index);
      repeatAt = time + (next === direction ? 150 : 400);
    }
    direction = next;
    if (pad.pressed.has('b0')) { cards[index]!.click(); gate.reset(); }
    if (pad.pressed.has('b4') || pad.pressed.has('b5')) {
      const filters = options.filters(), at = filters.findIndex(item => item.classList.contains('active'));
      filters[(at + (pad.pressed.has('b5') ? 1 : -1) + filters.length) % filters.length]?.click();
      selected = ''; focus(options.cards(), 0);
    }
  };
  frame = requestAnimationFrame(loop);
  const dispose = (): void => { cancelAnimationFrame(frame); sampler.dispose(); window.removeEventListener('pagehide', dispose); };
  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
