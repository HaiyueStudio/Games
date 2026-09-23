import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s.startsWith('./')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {roomFloor}=await import('../boxbound/floor-mesh.ts');

test('checkerboard tiles form two bounded meshes, retaining coverage, color and outward winding',()=>{
 for(const room of [{size:6},{size:5,floorTiles:[[0,0,0],[4,1,3],[2,2,2]]}]){
  const patches=roomFloor(room),tiles=room.floorTiles??Array.from({length:room.size**2},(_,i)=>[Math.floor(i/room.size),0,i%room.size]);
  assert.equal(patches.length,2);
  assert.equal(patches.reduce((n,p)=>n+p.surface.indices.length/3,0),tiles.length*2);
  const actual=[];
  for(const p of patches){
   const s=p.surface;
   for(let i=0;i<s.positions.length;i+=12){
    const x=s.positions[i]+p.center[0]+.5,y=s.positions[i+1]+p.center[1]-.004,z=s.positions[i+2]+p.center[2]+.5;
    actual.push([x,Math.round(y*1e9)/1e9,z]);assert.equal(p.alternate,!!((x+z)%2));
   }
   for(let i=0;i<s.positions.length;i++)assert.ok(Math.abs(s.positions[i])<=p.size[i%3]/2+1e-9);
   for(let i=0;i<s.indices.length;i+=3){
    const [a,b,c]=s.indices.slice(i,i+3).map(j=>s.positions.slice(j*3,j*3+3));
    assert.ok((b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])>0);
   }
  }
  assert.deepEqual(actual.sort(),tiles.slice().sort());assert.equal(roomFloor(room),patches);
 }
});
test('authored holes and edits invalidate the cache, independent rooms share geometry keys',()=>{
 const room={size:5,floorTiles:[[1,0,1]]},a=roomFloor(room);
 assert.equal(a.length,1);assert.deepEqual(roomFloor(structuredClone(room))[0].surface,a[0].surface);
 room.floorTiles.push([2,1,1]);assert.notEqual(roomFloor(room),a);assert.equal(roomFloor(room).length,2);
 assert.deepEqual(roomFloor({size:5,floorTiles:[]}),[]);
});
