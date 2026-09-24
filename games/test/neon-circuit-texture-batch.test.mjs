import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import ts from 'typescript';
import {createAuditGpuDevice,getAuditGpuDeviceState,ensureRealRendererGpuConstants} from '../../../Engine/scripts/benchmark/real-renderer-audit-device.mjs';
ensureRealRendererGpuConstants();
const modules=new Map();
function load(file) {
  if(modules.has(file))return modules.get(file).exports;
  const module={exports:{}};modules.set(file,module);
  const code=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  new Function('require','module','exports',code)(name=>load(resolve(dirname(file),name+'.ts')),module,module.exports);
  return module.exports;
}
const loadGame=name=>load(fileURLToPath(new URL(`../neon-circuit/${name}.ts`,import.meta.url)));
function exercise(batched) {
  const device=createAuditGpuDevice(),audit=getAuditGpuDeviceState(device);
  const source=device.createTexture({size:[32,32],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING});
  const flame=new (loadGame('ThrusterFlameTexture').ThrusterFlameTexture)(device);
  const fire=new (loadGame('HullFireTexture').HullFireTexture)(device);
  const strip=new (loadGame('BoostStripTexture').BoostStripTexture)(device,source);
  const road=new (loadGame('RainbowRoadTexture').RainbowRoadTexture)(device);
  const dial=new (loadGame('HudDialTexture').HudDialTexture)(device);
  const sprite=new (loadGame('HudSpriteTexture').HudSpriteTexture)(device);
  const {CIRCUITS,circuitTrack,racePose,createInitialRaceState}=loadGame('RaceRules');
  const track=circuitTrack(CIRCUITS[0]);
  const map=new (loadGame('HudMapTexture').HudMapTexture)(device,track,'#55eaff');
  const pose=racePose(track,createInitialRaceState());
  audit.reset();
  let encoder;
  const commands=batched?()=>encoder??=device.createCommandEncoder():undefined;
  const update=commands=>{
    flame.update(1,.8,.2,1,commands);fire.update(1,.4,commands);strip.update(1,commands);
    road.update(1,commands);dial.update(40,commands);sprite.render(source,{rotation:.2},commands);map.update(pose,undefined,commands);
  };
  update(commands);
  if(batched){assert.equal(audit.getCallCount('queue.submit'),0,'producers must not submit a borrowed encoder');device.queue.submit([encoder.finish()]);}
  const result=audit.snapshot();
  update(()=>{throw new Error('unchanged textures must not request an encoder');});
  assert.equal(audit.getCallCount('queue.writeBuffer'),result.callCounts['queue.writeBuffer']);
  for(const effect of [flame,fire,strip,road,dial,sprite,map])effect.destroy();source.destroy();
  const resources=audit.snapshot().resources;
  assert.equal(resources.buffer.live,0);assert.equal(resources.texture.live,0);
  return result;
}
test('seven dynamic textures share one encoder/submission with unchanged draws, passes and uniform uploads',()=>{
  const before=exercise(false),after=exercise(true);
  assert.equal(before.callCounts['queue.submit'],7);assert.equal(after.callCounts['queue.submit'],1);
  assert.equal(after.callCounts['device.createCommandEncoder'],1);
  const uniformWrites=after.calls.filter(call=>call.method==='queue.writeBuffer');
  assert.equal(new Set(uniformWrites.map(call=>call.resourceId)).size,uniformWrites.length,
    'each producer owns distinct uniforms; later writes cannot overwrite an earlier pass');
  for(const operation of ['commandEncoder.beginRenderPass','renderPass.draw','queue.writeBuffer'])assert.equal(after.callCounts[operation],before.callCounts[operation],operation);
  assert.equal(after.uploads.bytes,before.uploads.bytes);
});
