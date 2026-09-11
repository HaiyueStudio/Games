import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const entries=JSON.parse(readFileSync(new URL('../sky-strike/assets/sprites.json',import.meta.url),'utf8'));
const pixels=readFileSync(new URL('../sky-strike/assets/sprites.rgba',import.meta.url));
test('all fifteen hull parts are declared, transparent and bounded; retired overlays stay out of runtime',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url))).entries.find(e=>e.id==='sky-strike');
 const parts=entries.filter(e=>e.id.startsWith('assets/part-'));assert.equal(parts.length,15);
 for(const e of parts){assert.ok(manifest.assets.includes('sky-strike/'+e.id));assert.ok(Math.max(e.width,e.height)<=192);
  let clear=false,opaque=false;for(let i=e.offset+3;i<e.offset+e.length;i+=4){clear ||=pixels[i]===0;opaque ||=pixels[i]===255;}assert.ok(clear&&opaque,e.id);}
 for(const id of ['fx-turret','fx-rotor','fx-hatch'])assert.ok(!entries.some(e=>e.id===`assets/${id}.png`));
});
test('runtime image pack stays under 28 MiB with complete, contiguous RGBA slices',()=>{
 assert.ok(pixels.byteLength<28*1024*1024);let offset=0;
 for(const e of entries){assert.equal(e.offset,offset);assert.equal(e.length,e.width*e.height*4);offset+=e.length;}
 assert.equal(offset,pixels.byteLength);assert.equal(new Set(entries.map(e=>e.id)).size,entries.length);
});
test('small HUD art uses small alpha textures while Boss art retains preview resolution',()=>{
 for(const [id,limit] of [['gui-life',48],['gui-shield',96],['gui-bomb',160],['gui-pause',160],['part-dread-gun',128],['part-dread-rotor',96],['part-ion-impeller',128],['part-serpent-body',192],['part-serpent-joint',96],['fx-quantum-turret',128],['fx-quantum-preview',256],['boss-quantum-dreadnought',512],['boss-inferno',384],['elite-cinder',192],['fx-inferno',128]]) {
  const e=entries.find(e=>e.id===`assets/${id}.png`);assert.ok(e);assert.ok(Math.max(e.width,e.height)<=limit);
  let clear=false,visible=false;for(let p=e.offset+3;p<e.offset+e.length;p+=4){clear ||=pixels[p]===0;visible ||=pixels[p]>0;}
  assert.ok(clear&&visible,`${id} preserves transparency`);
 }
 for(const e of entries.filter(e=>e.id.startsWith('assets/boss-')))assert.equal(Math.max(e.width,e.height),(e.id.includes('boss-twin-')||e.id.includes('boss-inferno'))?384:(e.id.includes('boss-miner')||e.id.includes('boss-quantum-dreadnought'))?512:640);
});


test('eight themed background tiles and two planet layers have bounded runtime sizes',()=>{
 const backgrounds=entries.filter(e=>e.id.startsWith('assets/bg-'));
 assert.equal(backgrounds.length,8);
 for(const e of backgrounds)assert.equal(Math.max(e.width,e.height),512);
 const planets=entries.filter(e=>e.id.startsWith('assets/planet-'));
 assert.equal(planets.length,2);
 for(const e of planets){assert.ok(Math.max(e.width,e.height)<=384);let clear=false,visible=false;
  for(let p=e.offset+3;p<e.offset+e.length;p+=4){clear ||=pixels[p]===0;visible ||=pixels[p]>0;}
  assert.ok(clear&&visible,'planet remains an independent transparent layer');
 }
});

 test('asteroid variants preserve alpha and use only 192px runtime textures',()=>{
 const rocks=entries.filter(e=>e.id.includes('asteroid-')); assert.equal(rocks.length,3);
 for(const e of rocks){assert.equal(Math.max(e.width,e.height),192);let clear=false,visible=false;
 for(let i=e.offset+3;i<e.offset+e.length;i+=4){clear ||=pixels[i]===0;visible ||=pixels[i]>0;}assert.ok(clear&&visible);}
 });
