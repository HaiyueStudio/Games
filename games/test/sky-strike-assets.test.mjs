import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const entries=JSON.parse(readFileSync(new URL('../sky-strike/assets/sprites.json',import.meta.url),'utf8'));
const pixels=readFileSync(new URL('../sky-strike/assets/sprites.rgba',import.meta.url));
test('runtime image pack stays under 16 MiB with complete, contiguous RGBA slices',()=>{
 assert.ok(pixels.byteLength<16*1024*1024);let offset=0;
 for(const e of entries){assert.equal(e.offset,offset);assert.equal(e.length,e.width*e.height*4);offset+=e.length;}
 assert.equal(offset,pixels.byteLength);assert.equal(new Set(entries.map(e=>e.id)).size,entries.length);
});
test('small HUD art uses small alpha textures while Boss art retains preview resolution',()=>{
 for(const [id,limit] of [['gui-life',48],['gui-shield',96],['gui-bomb',160],['gui-pause',160],['fx-rotor',128]]) {
  const e=entries.find(e=>e.id===`assets/${id}.png`);assert.ok(e);assert.ok(Math.max(e.width,e.height)<=limit);
  let clear=false,visible=false;for(let p=e.offset+3;p<e.offset+e.length;p+=4){clear ||=pixels[p]===0;visible ||=pixels[p]>0;}
  assert.ok(clear&&visible,`${id} preserves transparency`);
 }
 for(const e of entries.filter(e=>e.id.startsWith('assets/boss-')))assert.equal(Math.max(e.width,e.height),e.id.includes('boss-twin-')?384:640);
});
