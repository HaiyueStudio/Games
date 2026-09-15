// Uses the same audited WebGPU fixture as the Engine renderer tests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createAuditGpuDevice, getAuditGpuDeviceState } from '../../Engine/scripts/benchmark/real-renderer-audit-device.mjs';

async function load(name) {
  const source = readFileSync(new URL(`../games/neon-circuit/${name}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
  return (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`))[name];
}
const HullFireTexture = await load('HullFireTexture');
const ThrusterFlameTexture = await load('ThrusterFlameTexture');
const BoostStripTexture = await load('BoostStripTexture');
const device = createAuditGpuDevice(), audit = getAuditGpuDeviceState(device);
const source = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING });
const fire = new HullFireTexture(device), exhaust = new ThrusterFlameTexture(device), boost = new BoostStripTexture(device, source);
const frames = 120;
audit.reset();
for (let i = 0; i < frames; i++) {
  fire.update(i / 60, 0); exhaust.update(i / 60, 1, 0, 1); boost.update(i / 60);
}
const active = audit.snapshot();
assert.equal(audit.getCallCount('queue.submit'), frames * 2 + 1, 'healthy hull renders transparent only once');
assert.equal(audit.getCallCount('renderPass.draw'), frames * 2 + 1);
audit.reset();
for (let i = 0; i < frames; i++) {
  fire.update((frames - 1) / 60, 0); exhaust.update((frames - 1) / 60, 1, 0, 1); boost.update((frames - 1) / 60);
}
const paused = audit.snapshot();
assert.equal(audit.getCallCount('queue.submit'), 0, 'frozen textures require no GPU submission');
assert.equal(paused.uploads.bytes, 0);
audit.reset();
fire.update(3, 0.2); fire.update(4, 0.2); fire.update(5, 0); fire.update(6, 0);
assert.equal(audit.getCallCount('queue.submit'), 3, 'damage animates and repair clears fire exactly once');
fire.destroy(); exhaust.destroy(); boost.destroy(); source.destroy();
const resources = audit.snapshot().resources;
assert.equal(resources.buffer.live, 0); assert.equal(resources.texture.live, 0);
console.log(JSON.stringify({ frames, active: { passes: active.callCounts['commandEncoder.beginRenderPass'], submits: active.callCounts['queue.submit'], uploads: active.uploads }, paused: { submits: paused.callCounts['queue.submit'] ?? 0, uploads: paused.uploads }, residue: { buffers: resources.buffer.live, textures: resources.texture.live } }, null, 2));
