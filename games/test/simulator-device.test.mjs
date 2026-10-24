import assert from 'node:assert/strict';
import test from 'node:test';
import { deviceDimensions, deviceGeometry, screenUv } from '../simulator/deviceGeometry.ts';
import { presentGameFrame } from '../host/presentation.ts';
import { preserveGamePass } from '../session/gamePass.ts';
import { deviceIconGrid, deviceViewport, iconRectangle } from '../simulator/layout.ts';
import { resizeGameViewport } from '../host/viewport.ts';
import { cameraQuarter, quarterOrientation, screenFit, screenPoint, ScreenOrientation } from '../simulator/orientation.ts';
import { rotateSimulatorCamera } from '../../scripts/simulator-camera.mjs';

test('browser orientation coverage performs real bounded camera drags instead of calling orientation setters', async () => {
  for (const orientation of ['portrait', 'landscape']) {
    const calls = [], viewport = { width: 1440, height: 1000 }, camera = { theta: orientation === 'portrait' ? Math.PI / 2 : Math.PI, rotateSpeed: .65 };
    let settled = '';
    await rotateSimulatorCamera({ evaluate: async expression => expression.includes('.camera') ? camera : viewport, cdp: { call: async (method, value) => { calls.push({ method, value }); } }, until: async expression => { settled = expression; } }, orientation);
    assert.equal(calls.length, 4); assert.ok(calls.every(call => call.method === 'Input.dispatchMouseEvent'));
    assert.ok(calls.every(call => call.value.x >= 0 && call.value.x <= viewport.width));
    assert.equal(calls[1].value.type, 'mousePressed'); assert.equal(calls[3].value.type, 'mouseReleased');
    assert.ok(settled.includes(JSON.stringify(orientation)) && settled.includes('!__gameHost.simulator.rotation.active'));
  }
});

test('camera headings use four stable quadrants with hysteresis and no feedback from screen orientation', () => {
  for (const [heading, expected] of [[0, 0], [Math.PI / 2, 1], [-Math.PI / 2, -1], [Math.PI, 2]]) assert.equal(cameraQuarter(heading, 0), expected);
  for (const heading of [.7, .8, .88, .91]) assert.equal(cameraQuarter(heading, 0), 0);
  assert.equal(cameraQuarter(.9, 1), 1); assert.equal(cameraQuarter(.6, 1), 0);
  assert.equal(cameraQuarter(-Math.PI + .02, 2), 2);
  assert.equal(quarterOrientation(-1), 'landscape'); assert.equal(quarterOrientation(2), 'portrait');
});

test('automatic rotation debounces, animates continuously, reverses smoothly and respects reduced motion', () => {
  const rotation = new ScreenOrientation(); rotation.update(Math.PI / 2, .02); assert.equal(rotation.quarter, 0);
  rotation.update(Math.PI / 2, .09); assert.equal(rotation.quarter, 1); assert.equal(rotation.rotating, true);
  assert.ok(rotation.angle > 0 && rotation.angle < Math.PI / 2);
  const before = rotation.angle; rotation.update(0, .02); assert.ok(rotation.angle >= before);
  rotation.update(0, .1); assert.equal(rotation.quarter, 0); assert.equal(rotation.rotating, true);
  rotation.update(0, 1); assert.equal(rotation.angle, 0); assert.equal(rotation.rotating, false);
  rotation.update(-Math.PI / 2, .11, true); assert.equal(rotation.angle, -Math.PI / 2); assert.equal(rotation.rotating, false);
  for (let frame = 0; frame < 100; frame++) rotation.update(-Math.PI / 2, .016);
  assert.equal(rotation.quarter, -1);
});

test('screen rotation shader coordinates and perspective input remain inverse throughout the tween', () => {
  for (const mode of ['pad', 'phone']) for (const angle of [0, .35, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    const physical = deviceViewport(mode), logical = deviceViewport(mode, Math.abs(angle) > .1 && Math.abs(angle) < Math.PI ? 'landscape' : 'portrait');
    assert.ok(screenFit(angle, physical, logical) >= 1 - 1e-12);
    for (const [horizontal, vertical] of [[0, 0], [1, 1], [.23, .67], [.5, .5]]) {
      const projected = screenPoint(horizontal, vertical, angle, physical, logical, true), pointer = screenPoint(projected.x, projected.y, angle, physical, logical);
      assert.ok(projected.x >= -1e-10 && projected.x <= 1 + 1e-10 && projected.y >= -1e-10 && projected.y <= 1 + 1e-10);
      assert.ok(Math.abs(pointer.x - horizontal) < 1e-10 && Math.abs(pointer.y - vertical) < 1e-10);
    }
  }
});

test('rotating either device swaps real screen dimensions and keeps all icons and Home inside its chassis', () => {
  for (const mode of ['pad', 'phone']) {
    const portrait = deviceDimensions(mode), landscape = deviceDimensions(mode, 'landscape');
    assert.equal(landscape.width, portrait.height); assert.equal(landscape.height, portrait.width);
    assert.equal(landscape.screenWidth, portrait.screenHeight); assert.equal(landscape.screenHeight, portrait.screenWidth);
    assert.equal(landscape.homeX, portrait.homeZ); assert.equal(landscape.homeZ, 0);
    assert.ok(landscape.homeX < -landscape.screenWidth / 2);
    for (const orientation of ['portrait', 'landscape']) {
      const viewport = deviceViewport(mode, orientation), dimensions = deviceDimensions(mode, orientation), grid = deviceIconGrid(mode, viewport.width, viewport.height);
      assert.ok(Math.abs(viewport.width / viewport.height - dimensions.screenWidth / dimensions.screenHeight) < 1e-10);
      assert.equal(grid.columns * grid.rows, 12);
      for (let index = 0; index < 12; index++) {
        const icon = iconRectangle(index, viewport, grid.columns, grid.rows);
        assert.ok(icon.x >= 0 && icon.x + icon.width <= viewport.width && icon.y + icon.height + 28 <= viewport.height);
      }
    }
  }
});

test('host resizing validates dimensions and updates its scoped viewport idempotently', () => {
  const options = { width: 820, height: 1080, root: { style: {} } };
  assert.equal(resizeGameViewport(options, 1080, 820), true);
  assert.equal(options.width, 1080); assert.equal(options.height, 820);
  assert.deepEqual(options.root.style, { width: '1080px', height: '820px' });
  assert.equal(resizeGameViewport(options, 1080, 820), false);
  assert.equal(resizeGameViewport(options, 820, 1080), true);
  for (const [width, height] of [[0, 1], [1, NaN], [Infinity, 1], [-1, 100]]) assert.throws(() => resizeGameViewport(options, width, height), RangeError);
});

test('hosted multi-pass MSAA retains scene samples for later HUD and effect load passes', () => {
  const color = { view: {}, resolveTarget: {}, loadOp: 'clear', storeOp: 'discard' }, plain = { view: {}, loadOp: 'load', storeOp: 'discard' };
  const descriptor = { colorAttachments: [color, null, plain], depthStencilAttachment: { depthLoadOp: 'load', depthStoreOp: 'store' } };
  assert.equal(preserveGamePass(descriptor), descriptor);
  assert.equal(color.storeOp, 'store');
  assert.equal(plain.storeOp, 'discard');
  assert.equal(descriptor.depthStencilAttachment.depthLoadOp, 'load');
});

test('3D phone and pad screen meshes preserve their RTT aspect and front-facing UVs', () => {
  for (const mode of ['phone', 'pad']) {
    const size = deviceDimensions(mode), aspect = mode === 'phone' ? 390 / 760 : 820 / 1080;
    assert.ok(Math.abs(size.screenWidth / size.screenHeight - aspect) < 1e-10);
    assert.ok(size.screenWidth < size.width && size.screenHeight < size.height);
    assert.ok(size.homeZ < -size.screenHeight / 2 && size.screenY > size.thickness / 2);
    assert.deepEqual(screenUv(size.screenWidth / 2, size.screenHeight / 2, size.screenWidth, size.screenHeight), { x: 0, y: 0 });
    assert.deepEqual(screenUv(-size.screenWidth / 2, -size.screenHeight / 2, size.screenWidth, size.screenHeight), { x: 1, y: 1 });
    const screen = deviceGeometry(size.screenWidth, size.screenHeight, .16, 0, true);
    assert.equal(screen.normals.length, screen.positions.length);
    assert.equal(screen.textureCoordinates[0].data.length, screen.positions.length / 3 * 2);
    for (let index = 0; index < screen.positions.length / 3; index++) {
      const uv = screenUv(screen.positions[index * 3], screen.positions[index * 3 + 2], size.screenWidth, size.screenHeight);
      assert.ok(Math.abs(screen.textureCoordinates[0].data[index * 2] - uv.x) < 1e-6);
      assert.ok(Math.abs(screen.textureCoordinates[0].data[index * 2 + 1] - uv.y) < 1e-6);
    }
    for (let index = 0; index < screen.indices.length; index += 3) {
      const [first, second, third] = [...screen.indices.slice(index, index + 3)].map(vertex => [screen.positions[vertex * 3], screen.positions[vertex * 3 + 2]]);
      assert.ok((second[1] - first[1]) * (third[0] - first[0]) - (second[0] - first[0]) * (third[1] - first[1]) > 0);
    }
    const body = deviceGeometry(size.width, size.height, size.radius, size.thickness);
    assert.ok(Math.max(...body.positions.filter((_, index) => index % 3 === 1)) > 0);
    assert.ok(Math.min(...body.positions.filter((_, index) => index % 3 === 1)) < 0);
    assert.ok(Math.max(...body.indices) < body.positions.length / 3);
  }
});

test('game RTT presentation configures a copy destination once and submits actual frame pixels', () => {
  const original = globalThis.GPUTextureUsage;
  globalThis.GPUTextureUsage = { COPY_SRC: 1, COPY_DST: 2, RENDER_ATTACHMENT: 16 };
  try {
    const calls = [], source = { width: 820, height: 1080, format: 'bgra8unorm' };
    let target = { width: 800, height: 1000, usage: 16 };
    const context = { getCurrentTexture: () => target, configure(configuration) { calls.push(configuration); target = { ...target, usage: configuration.usage }; } };
    const canvas = { getContext: kind => kind === 'webgpu' ? context : null };
    const engine = { canvas, device: { createCommandEncoder: () => ({ copyTextureToTexture(...arguments_) { calls.push(arguments_); }, finish: () => 'frame' }), queue: { submit(commands) { calls.push(commands); } } } };
    assert.equal(presentGameFrame(engine, source), canvas);
    assert.equal(calls[0].format, source.format);
    assert.equal(calls[0].usage, 19);
    assert.deepEqual(calls[1], [{ texture: source }, { texture: target }, [800, 1000]]);
    assert.deepEqual(calls[2], ['frame']);
    presentGameFrame(engine, source);
    assert.equal(calls.filter(call => call.format).length, 1);
    assert.throws(() => presentGameFrame({ canvas: null }, source), /no presentation canvas/);
  } finally { globalThis.GPUTextureUsage = original; }
});
