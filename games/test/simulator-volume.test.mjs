import assert from 'node:assert/strict';
import test from 'node:test';
import { DeviceVolume, DEVICE_VOLUME_KEY, readDeviceVolume } from '../simulator/DeviceVolume.ts';
import { deviceViewport, volumeRectangle } from '../simulator/layout.ts';
import { GameAudio } from '../host/GameAudio.ts';

class AudioContextFixture extends EventTarget {
  currentTime = 3;
  state = 'running';
  nodes = [];
  createGain() {
    const calls = [], parameter = { value: 1, cancelScheduledValues(time) { calls.push(['cancel', time]); }, setValueAtTime(value, time) { calls.push(['set', value, time]); }, linearRampToValueAtTime(value, time) { this.value = value; calls.push(['ramp', value, time]); } };
    const node = { gain: parameter, calls, connected: null, disconnected: false, connect(destination) { this.connected = destination; }, disconnect() { this.disconnected = true; } };
    this.nodes.push(node); return node;
  }
  close() { this.state = 'closed'; this.dispatchEvent(new Event('statechange')); }
}

test('physical volume changes use exact ten-percent steps, clamp, mute and notify until unsubscribed', () => {
  const volume = new DeviceVolume(), levels = [], remove = volume.subscribe(level => levels.push(level));
  assert.equal(volume.snapshot().visible, false);
  volume.adjust(-1); assert.equal(volume.level, .9); assert.equal(volume.snapshot().percent, 90);
  for (let press = 0; press < 15; press++) volume.adjust(-1);
  assert.equal(volume.level, 0); assert.equal(volume.snapshot().muted, true);
  volume.adjust(1); assert.equal(volume.level, .1); assert.equal(volume.snapshot().muted, false);
  for (let press = 0; press < 15; press++) volume.adjust(1);
  assert.equal(volume.level, 1); assert.equal(levels.length, 32);
  remove(); volume.adjust(-1); assert.equal(levels.length, 32);
  volume.subscribe(level => levels.push(level)); volume.destroy(); volume.adjust(-1); assert.equal(levels.length, 32);
});

test('the volume HUD fades after two seconds and repeated taps restart its lifetime', () => {
  const volume = new DeviceVolume(.5); volume.adjust(1);
  assert.equal(volume.snapshot().visible, true); assert.equal(volume.snapshot().opacity, 1);
  volume.update(1.9); assert.ok(Math.abs(volume.snapshot().opacity - .5) < 1e-10);
  volume.adjust(-1); assert.equal(volume.snapshot().opacity, 1);
  volume.update(-1); assert.equal(volume.snapshot().visible, true);
  volume.update(2.1); assert.equal(volume.snapshot().visible, false); assert.equal(volume.snapshot().opacity, 0);
  for (const mode of ['pad', 'phone']) for (const orientation of ['portrait', 'landscape']) {
    const size = deviceViewport(mode, orientation), panel = volumeRectangle(size.width, size.height);
    assert.ok(panel.x >= 24 && panel.x + panel.width <= size.width - 24 && panel.y >= 24 && panel.y + panel.height < size.height / 3);
  }
});

test('volume preferences retain zero and tolerate unavailable, malformed or out-of-range storage', () => {
  for (const [saved, expected] of [[null, 1], ['0', 0], ['0.4', .4], ['1', 1], ['', 1], [' ', 1], ['oops', 1], ['NaN', 1], ['Infinity', 1], ['-1', 1], ['2', 1]]) {
    assert.equal(readDeviceVolume({ getItem(key) { assert.equal(key, DEVICE_VOLUME_KEY); return saved; } }), expected);
  }
  assert.equal(readDeviceVolume({ getItem() { throw new Error('Storage unavailable'); } }), 1);
});

test('game audio multiplies only its scoped master output, including lazy and multiple contexts', () => {
  const audio = new GameAudio(), other = new GameAudio(), first = new AudioContextFixture(), second = new AudioContextFixture(), destination = {};
  audio.setVolume(.4);
  const output = audio.attach(first, destination), independent = other.attach(second, destination);
  assert.equal(output.connected, destination); assert.equal(output.gain.value, .4);
  const gameGain = first.createGain(); gameGain.gain.value = .38; gameGain.connect(output);
  audio.setVolume(0);
  assert.equal(output.gain.value, 0); assert.equal(gameGain.gain.value, .38); assert.equal(independent.gain.value, 1);
  assert.deepEqual(output.calls, [['cancel', 3], ['set', .4, 3], ['ramp', 0, 3.025]]);
  const late = new AudioContextFixture(), lateOutput = audio.attach(late, destination);
  assert.equal(lateOutput.gain.value, 0); audio.setVolume(.7);
  assert.deepEqual(audio.snapshot(), { level: .7, contexts: 2, gains: [.7, .7] });
  for (const invalid of [NaN, Infinity, -Infinity]) assert.throws(() => audio.setVolume(invalid), RangeError);
  audio.setVolume(-1); assert.equal(audio.snapshot().level, 0);
  audio.setVolume(2); assert.equal(audio.snapshot().level, 1);
  first.close(); assert.equal(audio.snapshot().contexts, 1); assert.equal(output.disconnected, true);
  audio.destroy(); audio.destroy(); assert.equal(lateOutput.disconnected, true); assert.equal(audio.snapshot().contexts, 0);
  audio.setVolume(.3); assert.throws(() => audio.attach(new AudioContextFixture(), destination), /disposed/);
  other.destroy();
});
