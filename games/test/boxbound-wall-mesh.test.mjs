import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s.startsWith('./')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {archedWalls}=await import('../boxbound/wall-mesh.ts');
const room=(walls,extra={})=>({id:'mesh-test',size:7,walls,barriers:walls,doorWidths:[1,1,1,1],...extra});
const worldVertices=(g,s)=>Array.from({length:s.positions.length/3},(_,i)=>s.positions.slice(i*3,i*3+3).map((v,j)=>v+g.center[j]));

test('arched barriers have a 32-triangle crown per cell and outward winding',()=>{
 for(const cells of [[[2,0,2]],[[2,0,2],[3,0,2]],[[2,0,2],[3,0,2],[2,0,3]],[[2,0,2],[1,0,2],[3,0,2],[2,0,3]]]){
  const groups=archedWalls(room(cells));
  assert.equal(groups.reduce((n,g)=>n+g.roof.indices.length/3,0),32*cells.length);
  assert.ok(groups.reduce((n,g)=>n+(g.roof.indices.length+g.body.indices.length)/3,0)<=40*cells.length);
  for(const g of groups)for(const s of [g.roof,g.body]){
   const p=worldVertices(g,s);
   for(let i=0;i<p.length;i++){
    assert.ok(p[i].every((v,j)=>v>=g.min[j]-1e-6&&v<=g.max[j]+1e-6));
    assert.ok(Math.abs(Math.hypot(...s.normals.slice(i*3,i*3+3))-1)<1e-5);
   }
   for(let i=0;i<s.indices.length;i+=3){
    const [a,b,c]=s.indices.slice(i,i+3).map(j=>p[j]),u=b.map((v,j)=>v-a[j]),v=c.map((n,j)=>n-a[j]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const normal=s.normals.slice(s.indices[i]*3,s.indices[i]*3+3);
    assert.ok(cross.reduce((n,v,j)=>n+v*normal[j],0)>0,'front faces follow their outward normals');
   }
  }
 }
});
test('L and T wall joins share identical roof vertices/normals and omit internal side faces',()=>{
 const cells=[[2,0,2],[1,0,2],[3,0,2],[2,0,3]],groups=archedWalls(room(cells)),seen=new Map();let shared=0;
 for(const g of groups){
  const s=g.roof;
  for(const [i,p] of worldVertices(g,s).entries()){
   const key=p.map(v=>v.toFixed(6)).join(','),normal=s.normals.slice(i*3,i*3+3);
   if(seen.has(key)){assert.deepEqual(normal,seen.get(key));shared++;}else seen.set(key,normal);
  }
 }
 assert.ok(shared>=15);
 // Four cells have ten exposed edges, each a quad; shared edges have no faces.
 assert.equal(groups.reduce((n,g)=>n+g.body.indices.length/3,0),20);
});
test('narrow door jambs keep their original aperture and fit conservative mesh bounds',()=>{
 const groups=archedWalls(room([[2,0,0],[4,0,0]],{doorWidths:[.7,.7,.7,.7]}));
 const left=groups.find(g=>g.center[0]<3),right=groups.find(g=>g.center[0]>3);
 assert.ok(Math.abs(right.min[0]-left.max[0]-.7)<1e-8);
 assert.ok(Math.abs(Math.max(...worldVertices(left,left.roof).map(p=>p[0]))-left.max[0])<1e-8);
});
test('stacked barriers remove hidden roofs; adding a walkable cover invalidates geometry identity',()=>{
 const base=room([[2,0,2]]),stack=room([[2,0,2],[2,1,2]]);
 assert.equal(archedWalls(stack).reduce((n,g)=>n+g.roof.indices.length/3,0),32);
 const covered={...base,walls:[[2,0,2],[2,1,2]]};
 assert.notEqual(archedWalls(base)[0].roof.key,archedWalls(covered)[0].roof.key);
 assert.equal(archedWalls(covered)[0].roof.indices.length,0);
});

test('translated and reordered copies of the same wall share canonical geometry identities',()=>{
 const a=archedWalls(room([[1,0,1],[2,0,1],[3,0,1]]));
 const b=archedWalls(room([[4,0,4],[2,0,4],[3,0,4]]));
 assert.deepEqual(a.map(g=>[g.body.key,g.roof.key]),b.map(g=>[g.body.key,g.roof.key]));
});
