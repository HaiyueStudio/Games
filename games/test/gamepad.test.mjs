import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GamepadSampler, NeutralGate } from '../gamepad/sampler.ts';
import { GAMEPAD_PROFILES } from '../gamepad/profiles.ts';

function device(index) {
  const values = new Array(17).fill(0);
  // Real browser GamepadButton properties are prototype getters, not own fields.
  class Button { constructor(index) { this.index = index; } get value() { return values[this.index]; } get pressed() { return this.value > .5; } }
  return { index, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: values.map((_, i) => new Button(i)), values };
}

test('Engine sampler reads native button getters, edges, signed axes and independent slots', () => {
  const a = device(0), b = device(2), devices = [a, null, b];
  const input = new GamepadSampler(() => devices, new EventTarget(), new EventTarget());
  try {
    input.sample(); a.values[0] = 1; a.axes[0] = -.8; b.values[1] = 1; b.axes[0] = .8;
    let frames = input.sample();
    assert.ok(frames[0].pressed.has('b0')); assert.ok(frames[2].pressed.has('b1'));
    assert.ok(frames[0].values.x < -.5); assert.ok(frames[2].values.x > .5);
    assert.equal(frames[1].held.size, 0);
    frames = input.sample(); assert.ok(frames[0].held.has('b0')); assert.ok(!frames[0].pressed.has('b0'));
    a.values[0] = 0; a.axes[0] = .1; frames = input.sample();
    assert.ok(!frames[0].held.has('b0')); assert.equal(frames[0].values.x, 0);
    devices[2] = null; assert.equal(input.sample()[2].held.size, 0);
  } finally { input.dispose(); }
});

test('neutral gate prevents held input leaking across game changes, reconnects and focus', () => {
  const gate = new NeutralGate();
  const frame = (index, value) => ({ index, values: { x: value }, held: new Set(), pressed: new Set() });
  assert.deepEqual(gate.filter([frame(0, -1)]), []);
  assert.equal(gate.filter([frame(0, 0)]).length, 1);
  assert.equal(gate.filter([frame(0, -1), frame(2, 1)]).length, 1);
  gate.filter([]); assert.deepEqual(gate.filter([frame(0, -1)]), []);
  gate.filter([frame(0, 0)]); gate.reset(); assert.deepEqual(gate.filter([frame(0, 1)]), []);
});

test('every playable manifest entry has an explicit controller profile and bootstrap', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
  assert.deepEqual(Object.keys(GAMEPAD_PROFILES).sort(), manifest.entries.map(g => g.id).sort());
  for (const game of manifest.entries) {
    assert.ok(game.capabilities.includes('gamepad'), game.id);
    assert.ok(readFileSync(new URL('../' + game.entry, import.meta.url), 'utf8').includes(`installGamepad('${game.id}')`), game.id);
  }
});
