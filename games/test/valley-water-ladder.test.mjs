import assert from 'node:assert/strict';
import test from 'node:test';
import {createObject,emptyMap,parseMap,serializeMap,serializeCompactMap,waterHeight,waterWeights,ladderGarden,MapRuntime,localSamples,extrusionSamples,worldSamples,emptyPoses,isWalkable,isDecoration,connections,surfaceGarden} from '../valley-of-light/map/model.ts';
import {seaMeshData,seaPalette} from '../valley-of-light/map/water.ts';
const near=(a,b,t=1e-6)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<t,`${a} != ${b}`);
const finish=(r)=>{for(let i=0;i<8000&&r.walking;i++)r.tick(.01);assert.equal(r.walking,false);};

test('sea triangles have independent flat normals, constant color swatches and continuous GPU wave seams',()=>{
 const o=createObject(11,'sea'),data=seaMeshData(o);assert.deepEqual(seaMeshData(o),data);assert.ok(data.positions.length/9<2048);assert.ok(new Set(data.textureCoordinates[0].data).size>10);
 for(const t of [0,.7,3,9]){
  const weights=waterWeights(t,o.water);for(let i=0;i<data.positions.length;i+=9){const points=[];
   for(let vertex=0;vertex<3;vertex++){const at=i+vertex*3,p=Array.from(data.positions.slice(at,at+3)),n=Array.from(data.normals.slice(at,at+3));for(let k=0;k<4;k++)for(let axis=0;axis<3;axis++){p[axis]+=data.morphTargets[k].positions[at+axis]*weights[k];n[axis]+=data.morphTargets[k].normals[at+axis]*weights[k];}
    assert.ok(Math.abs(p[1]-waterHeight(p[0],p[2],t,o.water))<1e-6);points.push(p);if(vertex)near(n,points.normal);else points.normal=n;
    const uvAt=i/3*2+vertex*2;near(Array.from(data.textureCoordinates[0].data.slice(uvAt,uvAt+2)),Array.from(data.textureCoordinates[0].data.slice(i/3*2,i/3*2+2)));
   }
   const [a,b,c]=points,u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];assert.ok(cross[1]>0);near(cross.map(v=>v/cross[1]),points.normal,2e-5);
  }
 }
 o.length=50;o.width=50;o.water.facetSize=.2;assert.ok(seaMeshData(o).positions.length/9<=4608,'large seas retain a bounded triangle budget');
});
test('water color and facet controls preserve legacy maps and round-trip both formats',()=>{
 const map=emptyMap(),o=createObject(11,'sea');map.objects=[o];const old=serializeMap(map);assert.equal(serializeMap(parseMap(JSON.parse(old))),old);o.water={...o.water,facetSize:1.2,contrast:.8,lightColor:'#ffccbb',darkColor:'#194c63'};o.colors.surface='#358d9c';
 for(const text of [serializeMap(map),serializeCompactMap(map)])assert.equal(serializeMap(parseMap(JSON.parse(text))),serializeMap(map));
 const a=seaPalette(o);o.colors.surface='#b891bc';assert.notDeepEqual(seaPalette(o),a);o.water.contrast=0;const palette=seaPalette(o);for(const color of palette)near(color,palette[0]);
 for(const invalid of [{facetSize:0},{facetSize:5},{contrast:2},{lightColor:'red'},{darkColor:null}]){const bad=structuredClone(map);Object.assign(bad.objects[0].water,invalid);assert.throws(()=>parseMap(bad));}
});
test('ladder routes climb both ways, keep facing the wall, hold a rung and reverse without a position jump',()=>{
 const map=ladderGarden(),ladder=map.objects.find(o=>o.type===17),r=new MapRuntime(map);assert.equal(isWalkable(ladder),true);assert.equal(isDecoration(17),false);assert.ok(connections(map,emptyPoses()).some(c=>c.a==='ladder'||c.b==='ladder'));
 assert.equal(r.walkTo('upper-road'),true);for(let i=0;i<2000&&r.position[1]<.7;i++)r.tick(.01);assert.ok(r.ladderFrame);near(r.ladderFrame.forward,[0,0,-1]);const pos=[...r.position];assert.equal(r.walkTo('start'),true);near(r.position,pos);r.tick(.01);assert.equal(r.ladderFrame.descending,true);finish(r);assert.equal(r.at.objectId,'start');
 assert.ok(r.walkTo('ladder',5));finish(r);assert.ok(r.ladderFrame);const held=[...r.position];r.tick(.1);near(r.position,held);
 assert.ok(r.walkTo('upper-road'));finish(r);assert.equal(r.position[1],2);assert.equal(r.ladderFrame,null);assert.ok(r.walkTo('start'));let down=false;for(let i=0;i<4000&&r.walking;i++){r.tick(.01);if(r.ladderFrame){down ||= r.ladderFrame.descending;near(r.ladderFrame.forward,[0,0,-1]);}}assert.ok(down);assert.equal(r.at.objectId,'start');
 assert.ok(r.walkTo('exit'));finish(r);assert.ok(r.completed);assert.equal(serializeMap(parseMap(JSON.parse(serializeCompactMap(map)))),serializeMap(map));
});
test('rotated grouped ladders inherit ports and facing; changing height disconnects the upper landing',()=>{
 const map=ladderGarden();map.groups=[{id:'courtyard',name:'庭院',pivot:[0,0,0],rotation:[0,90,0],position:[3,1,-2]}];for(const o of map.objects)o.groupId='courtyard';const r=new MapRuntime(map);assert.ok(r.walkTo('exit'));let climbed=false;for(let i=0;i<5000&&r.walking;i++){r.tick(.01);if(r.ladderFrame){climbed=true;near(r.ladderFrame.forward,[-1,0,0]);}}assert.ok(climbed&&r.completed);map.objects.find(o=>o.type===17).rise=3;assert.equal(new MapRuntime(map).walkTo('exit'),false);
});
test('twist cross-section centers stay on a straight axis while the walking surface follows the outer face',()=>{
 for(const twist of [-180,-90,0,90,180,270,360]){const o=createObject(6,'twist');o.length=4;o.twist=twist;const samples=localSamples(o),spine=extrusionSamples(o);for(let i=0;i<spine.length;i++){near(spine[i].point,[(i/(spine.length-1)-.5)*4,-.5,0]);near(samples[i].point.map((v,k)=>v-spine[i].point[k]),samples[i].up.map(v=>v*.5));}near(samples[0].point,[-2,0,0]);}
 const map=surfaceGarden(),r=new MapRuntime(map);assert.ok(r.walkTo('exit'));finish(r);assert.ok(r.completed);
});

test('ladder rendering keeps two color batches with outward faces for all rung counts',async()=>{
 const {ladderMeshes}=await import('../valley-of-light/map/ladder.ts');const o=createObject(17,'ladder');
 for(const steps of [1,8,32]){o.steps=steps;const meshes=ladderMeshes(o);assert.deepEqual(meshes.map(m=>m.color),['surface','hub']);
  for(const m of meshes)for(let i=0;i<m.positions.length;i+=9){const [a,b,c]=[0,3,6].map(j=>Array.from(m.positions.slice(i+j,i+j+3))),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],size=Math.hypot(...n);assert.ok(size>0);near(n.map(v=>v/size),Array.from(m.normals.slice(i,i+3)));}
 }
});
