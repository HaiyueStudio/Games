import test from 'node:test';
import assert from 'node:assert/strict';
import { GamepadConnections } from '../gamepad/connections.ts';

const pad = (index, id = 'Controller') => ({ index, id, connected: true });

test('already-connected pads notify once, independently of buttons and input readiness', () => {
  const state = new GamepadConnections();
  assert.equal(state.update([pad(0), null, pad(2)], 100).length, 2);
  assert.equal(state.connected, true);
  assert.deepEqual(state.visible(100).map(n => n.message), ['手柄 1 已连接', '手柄 3 已连接']);
  assert.deepEqual(state.update([pad(0), null, pad(2)], 200), []);
  assert.equal(state.visible(5099).length, 2);
  assert.equal(state.visible(5100).length, 0);
});

test('disconnect and rapid reconnect replace the same slot and restart its five seconds', () => {
  const state = new GamepadConnections();
  state.update([pad(0)], 0);
  const lost = state.update([], 1000)[0];
  assert.equal(lost.message, '手柄 1 已断开');
  assert.equal(state.connected, false);
  assert.equal(state.set(0, 'Controller', false, 1100), undefined);
  state.set(0, 'Controller', true, 2000);
  assert.equal(state.visible(6000).length, 1);
  assert.equal(state.visible(6000)[0].message, '手柄 1 已连接');
  assert.equal(state.visible(7000).length, 0);
});

test('native events and polling deduplicate while other controllers remain connected', () => {
  const state = new GamepadConnections();
  state.set(0, 'A', true, 0);
  assert.deepEqual(state.update([pad(0, 'A')], 1), []);
  state.update([pad(0, 'A'), pad(1, 'B')], 100);
  assert.equal(state.update([null, pad(1, 'B')], 200)[0].connected, false);
  assert.equal(state.connected, true);
  assert.equal(state.visible(5050).length, 2);
  assert.equal(state.visible(5100).length, 1);
  assert.equal(state.visible(5200).length, 0);
  state.clear();
  assert.equal(state.connected, false);
  assert.equal(state.update([pad(1, 'B')], 6000).length, 1);
});

test('notification storage is bounded and notices expire by wall time even with no game ticks', () => {
  const state = new GamepadConnections();
  state.update(Array.from({ length: 8 }, (_, i) => pad(i)), 0);
  assert.equal(state.visible(0).length, 4);
  assert.equal(state.visible(5000).length, 0);
});
