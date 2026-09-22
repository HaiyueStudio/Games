import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultQuality,parseQuality,resolvePixelRatio} from '../boxbound/quality.ts';
import {labelIsNear} from '../boxbound/label-visibility.ts';
import {createRoundedBox3D} from '@haiyue/engine/geometry';

test('quality defaults to MSAA and native density capped at two; explicit choices round-trip',()=>{
 assert.deepEqual(defaultQuality(),{msaa:true,pixelRatio:'auto'});
 for(const [device,want] of [[1,1],[1.5,1.5],[2,2],[3,2],[NaN,1]])assert.equal(resolvePixelRatio('auto',device),want);
 assert.deepEqual(parseQuality('broken'),defaultQuality());
 assert.deepEqual(parseQuality('{"msaa":"false","pixelRatio":-1}'),defaultQuality());
 for(const pixelRatio of ['auto',1,1.5,2,3])for(const msaa of [true,false])assert.deepEqual(parseQuality(JSON.stringify({msaa,pixelRatio})),{msaa,pixelRatio});
 assert.equal(resolvePixelRatio(3,3),3);
});
test('chapter and exit labels only reveal within 2.5 active-room cells',()=>{
 const near=(room,outer,p)=>labelIsNear(room,'room',outer,[0,0,0],p);
 assert.ok(near('room',false,[2,0,1]));assert.ok(near('room',false,[2.5,1,0]));
 assert.ok(!near('room',false,[2.51,0,0]));assert.ok(!near('parent',false,[0,0,0]));assert.ok(!near('room',true,[0,0,0]));
});
for(const [name,size,radius] of [['crate',.86,.1],['player',.72,.16]])
test(`${name}: each of the six planar centers is exactly two triangles`,()=>{
 const g=createRoundedBox3D({width:size,height:size,depth:size,radius,segments:3}),counts=[];
 for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
  let triangles=0;
  for(let t=0;t<g.indices.length;t+=3){
   const vertices=Array.from(g.indices.slice(t,t+3));
   if(vertices.every(i=>Math.abs(g.normals[i*3+axis]-sign)<1e-6&&[0,1,2].every(k=>k===axis||Math.abs(g.normals[i*3+k])<1e-6)))triangles++;
  }
  counts.push(triangles);
 }
 assert.deepEqual(counts,[2,2,2,2,2,2]);assert.equal(g.indices.length/3,588);
});
