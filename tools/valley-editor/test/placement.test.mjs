import assert from 'node:assert/strict';
import test from 'node:test';
import { ValleyAuthoring } from '../../../artifacts/valley-editor/document.mjs';
import { worldSample,emptyPoses,createObject,walkSurfaces,pathPorts,worldSamples,MapRuntime,connections } from '../../../games/valley-of-light/map/model.ts';
const make=()=>new ValleyAuthoring({format:'haiyue-valley-map',version:1,catalogVersion:1,id:'placement',name:'悬空路径',objects:[],groups:[],opticalLinks:[]});
const screen=p=>[(p[0]-p[2])/Math.SQRT2,(2*p[1]-p[0]-p[2])/Math.sqrt(6)];
function resolve(editor,point,{hit=null,normal=[0,1,0],height=0,heldHeight,type=1,step=1}={}){
 const p=screen(point);return editor.placement.resolve(type,p,{screen,ground:y=>[y-p[1]*Math.sqrt(6)/2+p[0]/Math.SQRT2,y,y-p[1]*Math.sqrt(6)/2-p[0]/Math.SQRT2],hit:hit?{id:hit,point,normal}:null,height,step,heldHeight});
}
const near=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-7,`${a} != ${b}`);
const sample=(e,id,p,up=[0,1,0])=>worldSample(e.map,e.map.objects.find(o=>o.id===id),{point:p,up,roll:0},emptyPoses());
const face=(e,id,p,up)=>{const s=sample(e,id,p,up);return resolve(e,s.point,{hit:id,normal:s.up});};

test('all six cube faces attach outside the selected face at the original fractional height',async()=>{
 const e=make();await e.start();try{
  const id=e.add(1,[2.25,3.25,4.25]),before=e.exportJSON();
  for(const [point,normal,expected] of [
   [[.4,0,.3],[0,1,0],[2.25,4.25,4.25]],
   [[0,-1,0],[0,-1,0],[2.25,2.25,4.25]],
   [[.5,-.5,0],[1,0,0],[3.25,3.25,4.25]],
   [[-.5,-.5,0],[-1,0,0],[1.25,3.25,4.25]],
   [[0,-.5,.5],[0,0,1],[2.25,3.25,5.25]],
   [[0,-.5,-.5],[0,0,-1],[2.25,3.25,3.25]],
  ]){const p=face(e,id,point,normal);near(p.position,expected);assert.equal(p.mode,'surface');assert.equal(p.sourceId,id);assert.equal(p.blocked,false);}
  assert.equal(e.exportJSON(),before,'hovering is read-only');
 }finally{await e.dispose();}
});

test('stacking and descending keep independent Y cells; occupied destinations still reject atomically',async()=>{
 const e=make();await e.start();try{
  const base=e.add(3,[2.25,3.25,4.25]),before=e.exportJSON();
  const top=face(e,base,[0,0,0],[0,1,0]),first=e.add(1,top.position,top.rotation);
  assert.deepEqual(top.position,[2.25,4.25,4.25]);
  assert.equal(e.placementObstacle(1,top.position).id,first);
  const placed=e.exportJSON();assert.throws(()=>e.add(1,top.position),/已有/);assert.equal(e.exportJSON(),placed);
  e.platform.history.undo();assert.equal(e.exportJSON(),before);e.platform.history.redo();assert.equal(e.exportJSON(),placed);
  const next=face(e,first,[0,0,0],[0,1,0]);near(next.position,[2.25,5.25,4.25]);e.add(1,next.position,next.rotation);
  const bottom=face(e,base,[0,-1,0],[0,-1,0]);near(bottom.position,[2.25,2.25,4.25]);e.add(1,bottom.position,bottom.rotation);
  assert.equal(e.map.objects.length,4);
 }finally{await e.dispose();}
});

test('empty-space edges retain horizontal continuation; held previews and free placement retain their height',async()=>{
 const e=make();await e.start();try{
  e.add(1,[2.25,3.25,4.25]);const outside=resolve(e,[3.25,3.25,4.25]);near(outside.position,[3.25,3.25,4.25]);assert.equal(outside.mode,'edge');e.add(1,outside.position,outside.rotation);
  near(resolve(e,[4.25,3.25,4.25]).position,[4.25,3.25,4.25]);
  assert.equal(resolve(e,[20,0,20],{height:7.25}).position[1],7.25);assert.equal(resolve(e,[20,0,20],{heldHeight:4.25}).position[1],4.25);
  assert.equal(resolve(e,[20,0,20],{height:6,type:11}).position[1],4,'sea keeps the work-plane behavior');
 }finally{await e.dispose();}
});

test('wide rotated faces snap along the face and stair ends still connect to actual ports',async()=>{
 const e=make();await e.start();try{
  const id=e.add(1,[0,4,0]);e.update(id,o=>{o.length=3;o.rotation=[0,45,0];});
  const side=face(e,id,[1.5,-.5,0],[1,0,0]),d=Math.SQRT1_2;near(side.position,[2*d,4,-2*d]);near(side.rotation,[0,45,0]);
  const top=face(e,id,[.9,0,0],[0,1,0]);near(top.position,[d,5,-d]);near(top.rotation,[0,45,0]);
  const stair=e.add(2,[8,3,0]);e.update(stair,o=>{o.length=2;o.rise=2;});near(resolve(e,[9.5,5,0]).position,[9.5,5,0]);near(resolve(e,[9.5,5,0],{type:2}).position,[9.5,5,0]);
 }finally{await e.dispose();}
});

test('stairs and curved paths placed against a side keep their entrance flush with the road top',async()=>{
 const e=make();await e.start();try{
  const id=e.add(1,[0,4.25,0]);
  for(const type of [2,6,7]){
   const p=resolve(e,[.5,3.75,0],{hit:id,normal:[1,0,0],type}),o=createObject(type,'preview',p.position);o.rotation=p.rotation;
   near(worldSamples(e.map,o,emptyPoses())[pathPorts(o)[0].index].point,[.5,4.25,0]);
  }
 }finally{await e.dispose();}
});

test('tilted and scaled parent faces place a world-unit cube flush, including after reparenting',async()=>{
 const e=make();await e.start();try{
  const id=e.add(1,[0,0,0]);e.select([id]);const group=e.groupSelected();e.updateGroup(group,g=>{g.position=[3,6,-2];g.rotation=[25,35,15];g.scale=[2,1.5,3];});
  for(const [point,normal] of [[[0,0,0],[0,1,0]],[[.5,-.5,0],[1,0,0]],[[0,-1,0],[0,-1,0]]]){
   const hit=sample(e,id,point,normal),p=face(e,id,point,normal),newId=e.add(1,p.position,p.rotation),o=e.map.objects.find(o=>o.id===newId);
   assert.equal(o.groupId,group);
   const corners=walkSurfaces(o).flatMap(f=>f.corners).map(c=>sample(e,newId,c).point),distances=corners.map(c=>c.reduce((n,v,i)=>n+(v-hit.point[i])*hit.up[i],0));
   assert.ok(Math.abs(Math.min(...distances))<1e-7,'new cube touches the picked plane without penetrating it');assert.ok(Math.abs(Math.max(...distances)-1)<1e-7,'new cube remains one world unit thick');
   e.platform.history.undo();e.select([id]);
  }
 }finally{await e.dispose();}
});

test('rotated half-cubes attach at their actual cap plane without the old half-cell drift',async()=>{
 const e=make();await e.start();try{
  const id=e.add(5,[2,4,3]);e.update(id,o=>o.rotation=[90,0,-90]);
  const hit=sample(e,id,[-1/6,0,1/6],[0,1,0]),p=face(e,id,[-1/6,0,1/6],[0,1,0]);
  const o=createObject(1,'preview',p.position);o.rotation=p.rotation;
  const corners=walkSurfaces(o).flatMap(f=>f.corners).map(point=>worldSample(e.map,o,{point,up:[0,1,0],roll:0},emptyPoses()).point);
  assert.ok(Math.abs(Math.min(...corners.map(c=>c.reduce((n,v,i)=>n+(v-hit.point[i])*hit.up[i],0))))<1e-7);
 }finally{await e.dispose();}
});

test('the directly hovered foreground object wins over another projected depth layer',async()=>{
 const e=make();await e.start();try{
  e.add(1,[0,3,0]);const front=e.add(1,[4,7,4]);const p=resolve(e,[4,7,4],{hit:front});assert.equal(p.sourceId,front);assert.equal(p.blocked,false);near(p.position,[4,8,4]);
 }finally{await e.dispose();}
});


test('decorations sit on floating and rotated road faces instead of stacking another cube',async()=>{
 const e=make();await e.start();try{
  const id=e.add(1,[2,4.25,3]);
  for(const type of [13,14,15,16]){
   const p=resolve(e,[2.2,4.25,3.1],{hit:id,type});near(p.position,[2,4.25,3]);assert.equal(p.mode,'surface');
   const added=e.add(type,p.position,p.rotation);near(sample(e,added,[0,0,0]).point,[2,4.25,3]);e.platform.history.undo();
   assert.equal(resolve(e,[20,0,20],{height:7.25,type}).position[1],7.25);
  }
  e.update(id,o=>o.rotation=[25,35,15]);
  for(const [point,normal] of [[[0,0,0],[0,1,0]],[[.5,-.5,0],[1,0,0]],[[0,-1,0],[0,-1,0]],[[0,-.5,.5],[0,0,1]]]){
   const hit=sample(e,id,point,normal),p=resolve(e,hit.point,{hit:id,normal:hit.up,type:15});
   const added=e.add(15,p.position,p.rotation);near(sample(e,added,[0,0,0]).point,hit.point);near(sample(e,added,[0,1,0]).up,hit.up);e.platform.history.undo();
  }
 }finally{await e.dispose();}
});

test('ladders attach to four wall directions and top edges, preserving endpoints inside a rotated group',async()=>{
 const e=make();await e.start();try{
  const id=e.add(1,[0,2,0]);e.update(id,o=>o.thickness=3);e.select([id]);const group=e.groupSelected();e.updateGroup(group,g=>{g.rotation=[20,35,10];g.position=[3,1,-2];});
  for(const normal of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]])for(const onTop of [false,true]){
   const local=[normal[0]*.5,onTop?0:-1,normal[2]*.5],hit=sample(e,id,local,onTop?[0,1,0]:normal),p=resolve(e,hit.point,{hit:id,normal:hit.up,type:17});
   const added=e.add(17,p.position,p.rotation),o=e.map.objects.find(o=>o.id===added);assert.equal(o.groupId,group);
   const samples=worldSamples(e.map,o,emptyPoses()),ports=pathPorts(o),upper=samples[ports[1].index].point,lower=samples[ports[0].index].point;
   const top=sample(e,id,[normal[0]*.5,0,normal[2]*.5]).point,out=sample(e,id,[0,0,0],normal).up,up=sample(e,id,[0,0,0]).up;
   near(upper,top.map((v,k)=>v+out[k]*.02));near(lower,upper.map((v,k)=>v-up[k]*2+out[k]*.5));
   e.platform.history.undo();e.select([id]);
  }
 }finally{await e.dispose();}
});


test('the reported five-cell twist snaps off-center cap clicks to both true walking ports',async()=>{
 const e=make();await e.start();try{
  const id=e.add(6,[-3,0,0]);e.update(id,o=>o.length=5);
  for(const [point,normal,type,position] of [
   [[-5.507500172,-.703017592,-.176496446],[-1,0,0],9,[-6,0,0]],
   [[-.492500007,-.5256989,-.000143589],[1,0,0],10,[0,-.5,.5]],
  ]){const p=resolve(e,point,{hit:id,normal,type});near(p.position,position);e.add(type,p.position,p.rotation);}
  const r=new MapRuntime(e.map);assert.equal(r.walkTo(id),true,'spawn reaches the twist without an optical link');for(let i=0;i<3000&&r.walking;i++)r.tick(.01);assert.equal(r.at.objectId,id);
  assert.equal(r.walkTo(e.map.objects.find(o=>o.type===10).id),true);for(let i=0;i<3000&&r.walking;i++)r.tick(.01);assert.equal(r.completed,true);
  assert.ok(connections(e.map,emptyPoses()).every(c=>!c.illusion));
 }finally{await e.dispose();}
});

test('any point on a twist cap produces the same join, inheriting roll and rotated parent frames',async()=>{
 for(const twist of [-180,-90,0,90,180,270,360])for(const grouped of [false,true]){
  const e=make();await e.start();try{
   const id=e.add(6,[0,3.25,0]);e.update(id,o=>{o.length=5;o.twist=twist;o.rotation=[15,35,10];});
   if(grouped){e.select([id]);const g=e.groupSelected();e.updateGroup(g,o=>{o.rotation=[20,15,30];o.position=[4,1,-2];});}
   const o=e.map.objects.find(o=>o.id===id),samples=worldSamples(e.map,o,emptyPoses());
   for(const sign of [-1,1]){
    let reference;
    for(const [y,z] of [[0,0],[-.28,.2],[.23,-.31]]){
     const hit=sample(e,id,[sign*2.5075,-.5+y,z],[sign,0,0]),p=resolve(e,hit.point,{hit:id,normal:hit.up,type:1});
     if(reference){near(p.position,reference.position);near(p.rotation,reference.rotation);}else reference=p;
     const added=e.add(1,p.position,p.rotation),placed=e.map.objects.find(o=>o.id===added),entry=worldSamples(e.map,placed,emptyPoses())[pathPorts(placed)[0].index],end=samples[sign<0?0:samples.length-1];near(entry.point,end.point);near(entry.up,end.up);
     assert.ok(connections(e.map,emptyPoses()).some(c=>c.a===added||c.b===added));e.platform.history.undo();e.select([id]);
    }
   }
  }finally{await e.dispose();}
 }
});

test('empty-space continuation at a twist entrance follows the straight body axis, not its helical surface',async()=>{
 const e=make();await e.start();try{
  const id=e.add(6,[-3,0,0]);e.update(id,o=>{o.length=5;o.twist=360;});
  const a=resolve(e,[-6,0,0]),b=resolve(e,[0,0,0]);near(a.position,[-6,0,0]);near(b.position,[0,0,0]);near(a.rotation,[0,180,0]);near(b.rotation,[0,0,0]);
 }finally{await e.dispose();}
});
