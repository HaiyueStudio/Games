import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { MemorySaveBackend } from '@haiyue/engine/save';
import { emptyMap, createObject, MapRuntime } from '../valley-of-light/map/model.ts';
const hook = registerHooks({ resolve(specifier, context, next) {
  return next(/^\.{1,2}\//.test(specifier) && !/\.[a-z0-9]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { CheckpointSave } = await import('../valley-of-light/map/save/CheckpointSave.ts');
hook.deregister();

function fixture(id='map-a') {
  const map=emptyMap();map.id=id;map.objects=[createObject(9,'start'),createObject(1,'road',[1,0,0]),createObject(10,'exit',[2,0,0])];
  const runtime=new MapRuntime(map);runtime.requestCheckpoint('灯塔');runtime.tick(0);
  const data=runtime.exportCheckpoint();assert.ok(data);
  const items=new Map([[`haiyue-valley-checkpoint:${id}`,JSON.stringify(data)]]);
  const legacy={getItem:key=>items.get(key)??null,removeItem:key=>items.delete(key)};
  return {map,data,legacy,items};
}

test('legacy checkpoint migrates into an integrity checked Engine envelope before removal',async()=>{
  const f=fixture(),backend=new MemorySaveBackend(),save=new CheckpointSave(f.map,{backend,legacy:f.legacy});
  assert.deepEqual(await save.load(),f.data);assert.equal(f.items.size,0);
  const envelope=await backend.read(`valley-of-light-map:${f.map.id}`,'checkpoint');
  assert.equal(envelope.kind,'checkpoint');assert.ok(envelope.integrity.checksum);
  assert.deepEqual(await new CheckpointSave(f.map,{backend,legacy:null}).load(),f.data);
  await save.dispose();
});

test('unavailable storage preserves legacy data and still restores the in-memory checkpoint',async()=>{
  const f=fixture(),backend=new MemorySaveBackend();backend.write=async()=>{throw new Error('quota');};
  const save=new CheckpointSave(f.map,{backend,legacy:f.legacy});
  assert.deepEqual(await save.load(),f.data);assert.equal(f.items.size,1);
  await assert.rejects(save.save(f.data),/quota/);await save.dispose();
});

test('clear and later writes stay ordered; disposing waits for the final checkpoint',async()=>{
  const f=fixture(),backend=new MemorySaveBackend(),save=new CheckpointSave(f.map,{backend,legacy:null});
  const first=save.save(f.data),clear=save.clear(),last=save.save({...f.data,name:'新灯塔'});
  await save.dispose();await Promise.all([first,clear,last]);
  const restored=await new CheckpointSave(f.map,{backend,legacy:null}).load();assert.equal(restored.name,'新灯塔');
});

test('map slots are isolated and changed content cannot load an incompatible checkpoint',async()=>{
  const a=fixture(),b=fixture('map-b'),backend=new MemorySaveBackend();
  const first=new CheckpointSave(a.map,{backend,legacy:null}),second=new CheckpointSave(b.map,{backend,legacy:null});
  await first.save(a.data);await second.save(b.data);await first.clear();assert.deepEqual(await second.load(),b.data);
  const changed=structuredClone(b.map);changed.name+=' changed';
  assert.equal(await new CheckpointSave(changed,{backend,legacy:null}).load(),null);
  const invalid=fixture('invalid');invalid.items.set('haiyue-valley-checkpoint:invalid','{bad json');
  assert.equal(await new CheckpointSave(invalid.map,{backend,legacy:invalid.legacy}).load(),null);
});
