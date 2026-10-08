import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {emptyMap,createObject,parseMap,serializeMap,serializeCompactMap,analyzeStaticPaths} from '../valley-of-light/map/model.ts';
import {compileStaticPaths} from '../valley-of-light/map/staticCompiler.ts';
function box(x=0,y=0,z=0,color='#d9d0b8'){
 const p=[],n=[],indices=[];
 for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const offset=p.length/3,u=(axis+1)%3,v=(axis+2)%3;for(const [a,b] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]){const pos=[0,0,0],normal=[0,0,0];pos[axis]=sign*.5;pos[u]=a;pos[v]=b;normal[axis]=sign;p.push(...pos);n.push(...normal);}indices.push(...(sign>0?[0,1,2,0,2,3]:[0,2,1,0,3,2]).map(i=>offset+i));}
 return {positions:new Float32Array(p),normals:new Float32Array(n),indices:new Uint16Array(indices),matrix:[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1],box:true,color,cullMode:'back',frontFace:'ccw'};
}
function area(result){let area=0;for(const b of result.batches)for(let i=0;i<b.indices.length;i+=3){const [a,c,d]=[0,1,2].map(j=>Array.from(b.positions.slice(b.indices[i+j]*3,b.indices[i+j]*3+3)));const u=c.map((x,k)=>x-a[k]),v=d.map((x,k)=>x-a[k]);area+=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])/2;}return area;}
test('compact export round-trips all supplied maps without rounding or losing hierarchy/references',()=>{
 for(const file of readdirSync(new URL('../valley-of-light/maps/',import.meta.url)).filter(f=>f.endsWith('.json'))){const value=JSON.parse(readFileSync(new URL('../valley-of-light/maps/'+file,import.meta.url)));if(value.format!=='haiyue-valley-map')continue;const map=parseMap(value),compact=serializeCompactMap(map);assert.equal(serializeMap(parseMap(JSON.parse(compact))),serializeMap(map),file);assert.ok(compact.length<JSON.stringify(map).length*.5,file);}
 const map=emptyMap(),o=createObject(3,'wheel',[1/3,0,0]);map.objects.push(o);o.colors.hub='#abcdef';o.motion.axis='x';o.name='自定义名字';o.basis=[1,0,0,0,0,1,0,0,0,0,1,0,.01234567890123,0,0,1];assert.equal(serializeMap(parseMap(JSON.parse(serializeCompactMap(map)))),serializeMap(map));
});
test('static plan follows nested moving groups, attachments and switch targets',()=>{
 const m=emptyMap();m.groups=[{id:'outer',name:'outer',pivot:[0,0,0]},{id:'inner',name:'inner',pivot:[0,0,0],parentId:'outer'},{id:'fixed-group',name:'fixed',pivot:[0,0,0]}];
 for(const id of ['moving','fixed','loose'])m.objects.push(createObject(1,id));m.objects[0].groupId='inner';m.objects[1].groupId='fixed-group';
 const pillar=createObject(12,'pillar');pillar.attachment={pathId:'moving',corner:0};m.objects.push(pillar);
 const wheel=createObject(3,'wheel');wheel.motion.targetGroup='outer';m.objects.push(wheel,createObject(11,'sea'));
 assert.deepEqual(analyzeStaticPaths(m).batches,[[1,2]]);
 const button=createObject(8,'button');button.trigger.actions=[{groupId:'fixed-group',translation:[0,1,0],rotation:[0,0,0],duration:1,easing:'smooth'}];m.objects.push(button);assert.deepEqual(analyzeStaticPaths(m).batches,[[2]]);
 const compact=JSON.parse(serializeCompactMap(m));compact.render.batches=[[0,1,2,3]];assert.throws(()=>parseMap(compact),/静态分析/);delete compact.render;assert.deepEqual(parseMap(compact).renderPlan.batches,[[2]]);
});
test('compact parser rejects malformed sparse fields and keeps defaults catalog-specific',()=>{
 const m=emptyMap();m.objects=[createObject(12,'pillar'),createObject(11,'water'),createObject(4,'slider')];const c=JSON.parse(serializeCompactMap(m));assert.deepEqual(parseMap(c).objects,m.objects);c.render={batches:c.render.batches,version:1};assert.deepEqual(parseMap(c).objects,m.objects);assert.throws(()=>parseMap({...c,groups:null}));
 for(const mutation of [o=>o.colors=null,o=>o.water=[],o=>o.position=[0],o=>o.type=99,o=>o.motion={step:0}]){const broken=structuredClone(c);mutation(broken.objects[0]);assert.throws(()=>parseMap(broken));}
});
test('100 contiguous cubes collapse to one closed cuboid with twelve outward-facing triangles',()=>{
 const r=compileStaticPaths(Array.from({length:100},(_,i)=>box(i)));assert.deepEqual([r.stats.sourceMeshes,r.stats.sourceTriangles,r.stats.meshes,r.stats.triangles],[100,1200,1,12]);assert.equal(area(r),402);
 const b=r.batches[0];for(let i=0;i<b.indices.length;i+=3){const ids=Array.from(b.indices.slice(i,i+3)),[a,c,d]=ids.map(j=>Array.from(b.positions.slice(j*3,j*3+3))),n=Array.from(b.normals.slice(ids[0]*3,ids[0]*3+3)),u=c.map((v,k)=>v-a[k]),v=d.map((v,k)=>v-a[k]);const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];assert.ok(normal.reduce((s,v,k)=>s+v*n[k],0)>0);}
});
test('merging preserves concave corners, holes, color boundaries and depth-separated optical surfaces',()=>{
 const ring=[];for(let x=0;x<3;x++)for(let z=0;z<3;z++)if(x!==1||z!==1)ring.push(box(x,0,z));assert.equal(area(compileStaticPaths(ring)),32);
 const colors=compileStaticPaths([box(),box(1,0,0,'#aabbcc')]);assert.equal(colors.batches.length,2);assert.equal(area(colors),10);
 const separated=compileStaticPaths([box(),box(5,5,5)]);assert.equal(separated.stats.removedFaces,0);assert.equal(area(separated),12);
 const gap=compileStaticPaths([box(),box(1.01)]);assert.equal(gap.stats.triangles,24);assert.equal(gap.stats.removedFaces,0);
});
test('arbitrary rotated geometry retains triangles and inverse-transpose normals; culling splits batches',()=>{
 const a=box();a.box=false;a.matrix=[2,0,0,0,0,3,0,0,0,0,4,0,5,6,7,1];const b=box(10);b.cullMode='none';const r=compileStaticPaths([a,b]);assert.equal(r.stats.triangles,24);assert.equal(r.batches.length,2);assert.equal(area(r),58);
 for(const batch of r.batches)for(let i=0;i<batch.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...batch.normals.slice(i,i+3))-1)<1e-6);
});
