import { GamepadSampler, NeutralGate } from './sampler';
import { GamepadConnections, type ConnectionNotice } from './connections';
import { monitorGamepadConnections } from './connectionMonitor';
export { GameOS } from '../launcher/GameOS';

interface LobbyOptions {
  move(horizontal: number, vertical: number): void;
  launch(): void;
  category(direction: number): void;
  view(): void;
  favorite(): void;
  cancel?(): void;
  playing(): boolean;
  ready(): boolean;
  notices(notices: readonly ConnectionNotice[], connected: boolean): void;
}

export function installLobbyGamepad(options: LobbyOptions): () => void {
  const connectionState = new GamepadConnections();
  const connections = monitorGamepadConnections(connectionState, () => {}, options.ready);
  const sampler = new GamepadSampler(() => navigator.getGamepads(), new EventTarget());
  const gate = new NeutralGate();
  let frame = 0, direction = '', repeatAt = 0, disposed = false;
  const loop = (time: number): void => {
    if (disposed) return;
    frame = requestAnimationFrame(loop); connections.poll();
    if (options.playing() || document.hidden || !options.ready()) { gate.reset(); direction = ''; return; }
    options.notices(connectionState.visible(time), connectionState.connected);
    const devices = navigator.getGamepads?.() ?? [];
    const pad = gate.filter(sampler.sample().filter(sample => devices[sample.index]?.connected))[0];
    if (!pad) { direction = ''; return; }
    if (pad.pressed.has('b4') || pad.pressed.has('b5')) options.category(pad.pressed.has('b5') ? 1 : -1);
    if (pad.pressed.has('b3')) options.view();
    if (pad.pressed.has('b2')) options.favorite();
    if (pad.pressed.has('b1')) options.cancel?.();
    const horizontal = (pad.values.x ?? 0) + Number(pad.held.has('b15')) - Number(pad.held.has('b14'));
    const vertical = (pad.values.y ?? 0) + Number(pad.held.has('b13')) - Number(pad.held.has('b12'));
    const next = Math.abs(horizontal) > Math.abs(vertical) ? horizontal > .4 ? 'right' : horizontal < -.4 ? 'left' : '' : vertical > .4 ? 'down' : vertical < -.4 ? 'up' : '';
    if (next && (next !== direction || time >= repeatAt)) {
      options.move(next === 'right' ? 1 : next === 'left' ? -1 : 0, next === 'down' ? 1 : next === 'up' ? -1 : 0);
      repeatAt = time + (next === direction ? 150 : 400);
    }
    direction = next;
    if (pad.pressed.has('b0')) { options.launch(); gate.reset(); }
  };
  frame = requestAnimationFrame(loop);
  const dispose = (): void => { if (disposed) return; disposed = true; cancelAnimationFrame(frame); sampler.dispose(); connections.dispose(); window.removeEventListener('pagehide', dispose); };
  window.addEventListener('pagehide', dispose, { once: true }); return dispose;
}
