import { GamepadSampler, NeutralGate } from './sampler';
import { defineNotificationComponents, HYNotification } from '@haiyue/ui/notification';
import { GamepadConnections } from './connections';
import { monitorGamepadConnections } from './connectionMonitor';
export { GameOS } from '../launcher/GameOS';

interface LobbyOptions {
  cards(): HTMLButtonElement[];
  filters(): HTMLButtonElement[];
  views?(): HTMLButtonElement[];
  favorite?(): void;
  connection?(connected: boolean): void;
  playing(): boolean;
  hint: HTMLElement;
}

/** Uses the same Engine sampler as the games; the iframe owns gameplay input. */
export function installLobbyGamepad(options: LobbyOptions): () => void {
  defineNotificationComponents();
  const notifications = document.createElement('hy-notification') as HYNotification;
  notifications.style.zIndex = '2147483647';
  document.body.append(notifications);
  const connectionState = new GamepadConnections();
  const connections = monitorGamepadConnections(connectionState, notice => {
    if (options.playing()) return; // The visible game's own GUI presents its notifications.
    notifications.open({ key: `gamepad-${notice.index}`, message: notice.message,
      type: notice.connected ? 'success' : 'warning', duration: 5, placement: 'topRight', showProgress: true });
  });
  const sampler = new GamepadSampler(() => navigator.getGamepads(), new EventTarget());
  const gate = new NeutralGate();
  let frame = 0, selected = '', direction = '', repeatAt = 0, wasPlaying = false, connected = false, inputReady = false;
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
    connections.poll();
    if (connected !== connectionState.connected) { connected = connectionState.connected; options.connection?.(connected); }
    if (playing || document.hidden) { if (playing && !wasPlaying) notifications.destroy(); gate.reset(); wasPlaying = playing; inputReady = false; return; }
    if (wasPlaying) { gate.reset(); wasPlaying = false; }
    const devices = navigator.getGamepads?.() ?? [];
    const pad = gate.filter(sampler.sample().filter(p => devices[p.index]?.connected))[0];
    options.hint.hidden = !pad;
    const justConnected = !inputReady && Boolean(pad);
    inputReady = Boolean(pad);
    if (!pad) { direction = ''; return; }
    const help = '手柄：左摇杆/方向键选择 · A 进入 · X 收藏 · Y 切换视图 · LB/RB 切换分类 · 游戏内 R3+LB/RB 切游戏 · Back 返回';
    if (options.hint.textContent !== help) options.hint.textContent = help;
    // View/category commands must remain available even when a list is empty.
    if (pad.pressed.has('b4') || pad.pressed.has('b5')) {
      const filters = options.filters(), at = filters.findIndex(item => item.classList.contains('active'));
      filters[(at + (pad.pressed.has('b5') ? 1 : -1) + filters.length) % filters.length]?.click();
      selected = ''; focus(options.cards(), 0);
    }
    if (pad.pressed.has('b3')) {
      const views = options.views?.() ?? [], at = views.findIndex(item => item.classList.contains('active'));
      views[(at + 1) % views.length]?.click();
      selected = ''; focus(options.cards(), 0);
    }
    if (pad.pressed.has('b2')) options.favorite?.();
    const cards = options.cards();
    if (!cards.length) return;
    const current = cards.find(card => card.classList.contains('selected'));
    if (current) selected = current.dataset.gameId!;
    let index = cards.findIndex(card => card.dataset.gameId === selected);
    if (index < 0) index = 0;
    if (justConnected) focus(cards, index);
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
  };
  frame = requestAnimationFrame(loop);
  const dispose = (): void => { cancelAnimationFrame(frame); sampler.dispose(); connections.dispose(); notifications.destroy(); notifications.remove(); window.removeEventListener('pagehide', dispose); };
  window.addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
