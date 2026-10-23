import { GamepadConnections, type ConnectionNotice } from './connections';

export const gamepadConnections = new GamepadConnections();

/** Native events give immediate feedback; polling also finds controllers connected before startup. */
export function monitorGamepadConnections(state: GamepadConnections, notify: (notice: ConnectionNotice) => void = () => {}, ready: () => boolean = () => true) {
  const lifetime = new AbortController();
  const poll = () => {
    if (document.hidden || !ready()) return;
    for (const notice of state.update(Array.from(navigator.getGamepads?.() ?? []), performance.now())) notify(notice);
  };
  for (const type of ['gamepadconnected', 'gamepaddisconnected'] as const) {
    window.addEventListener(type, event => {
      if (!ready()) return;
      const pad = event.gamepad;
      const notice = state.set(pad.index, pad.id, type === 'gamepadconnected', performance.now());
      if (notice) notify(notice);
    }, { signal: lifetime.signal });
  }
  poll();
  return { poll, dispose: () => { lifetime.abort(); state.clear(); } };
}
