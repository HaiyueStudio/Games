import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createObject,decorationGarden,parseMap,serializeMap,serializeCompactMap,MapRuntime,pathPorts,isWalkable,analyzeStaticPaths} from '../valley-of-light/map/model.ts';
import {decorationMeshes,decorationBounds} from '../valley-of-light/map/decorations.ts';

test('architectural and planting decorations produce finite, scaled, flat-shaded color batches',()=>{
 for(const type of [13,14,15,16]){
  const o=createObject(type,'decoration');o.length=1.7;o.width=.6;o.rise=3.4;
  const meshes=decorationMeshes(o);assert.ok(meshes.length>=3&&meshes.length<=5);assert.equal(new Set(meshes.map(m=>m.color)).size,meshes.length,'one mesh per color, not per petal or roof face');
  for(const m of meshes){assert.ok(o.colors[m.color]);assert.equal(m.positions.length,m.normals.length);assert.equal(m.positions.length%9,0);assert.ok(m.positions.every(Number.isFinite));
   for(let i=0;i<m.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...m.normals.slice(i,i+3))-1)<1e-6);
   for(let i=0;i<m.positions.length;i+=9){const a=m.positions.slice(i,i+3),b=m.positions.slice(i+3,i+6),c=m.positions.slice(i+6,i+9),u=b.map((x,j)=>x-a[j]),v=c.map((x,j)=>x-a[j]);assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-10);}
  }
  const bounds=decorationBounds(o);assert.equal(bounds.length,8);assert.ok(Math.abs(Math.min(...bounds.map(p=>p[1])))<1e-8);assert.ok(Math.abs(Math.max(...bounds.map(p=>p[1]))-o.rise)<1e-6);
  assert.equal(isWalkable(o),false);assert.deepEqual(pathPorts(o),[]);
  assert.deepEqual(decorationMeshes(o),meshes,'no random flicker when selecting, rebuilding or importing');
 }
});
test('both map formats and their schemas preserve decoration colors, dimensions and transforms',()=>{
 const map=decorationGarden();map.groups=[{id:'garden',name:'花园',pivot:[0,0,0],rotation:[15,35,0],scale:[1,1.5,2]}];
 for(const o of map.objects.filter(o=>o.type>=13)){o.groupId='garden';o.rotation=[12,35,5];o.length=1.3;o.width=.8;o.rise=2.7;Object.keys(o.colors).forEach((key,i)=>o.colors[key]=['#abcdef','#aabbee','#ddbbff','#ebffee','#ccffdd'][i]);}
 for(const text of [serializeMap(map),serializeCompactMap(map)])assert.equal(serializeMap(parseMap(JSON.parse(text))),serializeMap(map));
 const plan=analyzeStaticPaths(map);assert.ok(plan.batches.flat().every(i=>map.objects[i].type<13),'multi-colored decorations are never recolored as a one-color static road');
 for(const file of ['map.schema.json','compact-map.schema.json']){const schema=JSON.parse(readFileSync(new URL('../valley-of-light/maps/'+file,import.meta.url)));for(const type of [13,14,15,16])assert.ok(schema.$defs.object.properties.type.enum.includes(type));}
 for(const height of [0,-1,21,NaN]){const m=structuredClone(map);m.objects.find(o=>o.type===13).rise=height;assert.throws(()=>parseMap(m));}
});
test('the decorated example exports consistently and the traveler can reach the exit',()=>{
 const map=decorationGarden(),saved=parseMap(JSON.parse(readFileSync(new URL('../valley-of-light/maps/decoration-garden.json',import.meta.url))));assert.deepEqual(saved,map);
 const r=new MapRuntime(map);for(const o of map.objects.filter(o=>o.type>=13))assert.equal(r.walkTo(o.id),false);
 assert.equal(r.walkTo('road-6'),true);for(let i=0;i<3000&&!r.completed;i++)r.tick(.02);assert.equal(r.completed,true);
});
