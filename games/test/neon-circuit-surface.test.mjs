import assert from 'node:assert/strict';
import test from 'node:test';
import { roadOverlay } from '../neon-circuit/RoadOverlay.ts';

// A sharply banked, nonplanar road quad, followed by its return segment.
const track = { samples: [{ distance: 0 }, { distance: 100 }], length: 200 };
const top = new Float32Array([-92,0,0, 92,0,0, -92,20,100, 92,-20,100, -92,0,0, 92,0,0]);
const height = (x,z) => {
  const t = z / 100, v = (x + 92) / 184;
  return v >= t ? -20 * t : 20 * t - 40 * v;
};

test('lane and boost overlays stay above both triangles of a twisted road, including their interiors', () => {
  for (const [left,right] of [[-1,1],[-16,16],[-81,81]]) {
    const mesh = roadOverlay(track,top,0,100,left,right,92,0.5,[1/92,1/(right-left)]);
    let area = 0;
    for (let i=0;i<mesh.indices.length;i+=3) {
      const points = [...mesh.indices.slice(i,i+3)].map(index => [...mesh.positions.slice(index*3,index*3+3)]);
      const [a,b,c] = points;
      area += Math.abs((b[0]-a[0])*(c[2]-a[2])-(c[0]-a[0])*(b[2]-a[2]))/2;
      for (const [wa,wb,wc] of [[1,0,0],[0,1,0],[0,0,1],[0.2,0.3,0.5],[1/3,1/3,1/3]]) {
        const [x,y,z] = a.map((v,axis) => v*wa+b[axis]*wb+c[axis]*wc);
        assert.ok(x>=left-1e-5 && x<=right+1e-5 && z>=-1e-5 && z<=100+1e-5);
        assert.ok(Math.abs(y-height(x,z)-0.5)<1e-5, 'overlay must conform to the original triangulation');
      }
    }
    assert.ok(Math.abs(area - (right-left)*100)<1e-3, 'decal covers its full area without gaps or overlaps');
    assert.ok(mesh.normals.every(Number.isFinite));
  }
});

test('start-line overlay wraps the closed track while keeping a continuous texture range', () => {
  const mesh = roadOverlay(track,top,-7,7,-16,16,92,0.5,[1,1/32]);
  const uv = mesh.textureCoordinates[0].data;
  const us = [...uv].filter((_,i)=>i%2===0), vs = [...uv].filter((_,i)=>i%2===1);
  assert.equal(Math.min(...us),0); assert.equal(Math.max(...us),14);
  assert.ok(Math.abs(Math.min(...vs))<1e-6); assert.ok(Math.abs(Math.max(...vs)-1)<1e-6);
  assert.ok(us.some(u=>u<7) && us.some(u=>u>7));
  assert.ok(mesh.positions.every(Number.isFinite));
});
