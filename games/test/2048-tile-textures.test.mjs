import assert from 'node:assert/strict';
import test from 'node:test';
import { createBox3D, createRoundedBox3D } from '@haiyue/engine/geometry';
import { tileAtlasGeometry } from '../2048/rendering/TileGeometry.ts';
import { engravedRelief } from '../2048/rendering/TileTexture.worker.js';

test('numbered tile atlas maps only the top face to numerals and keeps side walls plain', () => {
  for (const geometry of [createBox3D({ width: 1, depth: 1 }), createRoundedBox3D({ width: 1, depth: 1, radius: 0.05, segments: 2 })]) {
    tileAtlasGeometry(geometry, 1, 1);
    const uv = geometry.getTextureCoordinates(0), perFace = geometry.vertexCount / 6;
    for (let vertex = 0; vertex < geometry.vertexCount; vertex++) {
      assert.ok(uv[vertex * 2] >= 0 && uv[vertex * 2] <= 1);
      const v = uv[vertex * 2 + 1];
      if (vertex >= perFace * 2 && vertex < perFace * 3) {
        assert.ok(v >= 0 && v <= 0.5);
        assert.ok(Math.abs(v - (geometry.positions[vertex * 3 + 2] + 0.5) / 2) < 1e-6, 'upright top UVs follow physical position');
      } else assert.ok(v >= 0.5 && v <= 1, 'sides never sample the numeral');
    }
  }
});

test('engraved glyph height has a deep pocket, opposing bevel normals and a flat unmarked surface', () => {
  const width = 64, height = 64, mask = new Uint8Array(width * height);
  for (let y = 12; y < 52; y++) for (let x = 12; x < 52; x++) mask[y * width + x] = 255;
  const { normal, heights } = engravedRelief(mask, width, height);
  const sample = (x,y,c) => normal[(y * width + x) * 4 + c];
  assert.equal(Math.abs(heights[4 * width + 4]),0);
  assert.equal(heights[32 * width + 32],-12);
  assert.ok(sample(16,32,0)>180 && sample(47,32,0)<75, 'opposing cut walls bend normals in opposite directions');
  assert.ok(sample(32,16,1)<75 && sample(32,47,1)>180);
  for (const [x,y] of [[4,4],[32,32]]) assert.deepEqual([sample(x,y,0),sample(x,y,1),sample(x,y,2)],[128,128,255]);
  for(let i=0;i<normal.length;i+=4) {
    const length=Math.hypot(normal[i]/127.5-1,normal[i+1]/127.5-1,normal[i+2]/127.5-1);
    assert.ok(Math.abs(length-1)<0.015,'normals remain unit length after 8-bit encoding');
    assert.equal(normal[i+3],255);
  }
});
