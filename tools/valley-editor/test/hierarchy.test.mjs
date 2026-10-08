import assert from 'node:assert/strict';
import test from 'node:test';
import { ValleyAuthoring } from '../../../artifacts/valley-editor/document.mjs';
import { emptyMap,createObject,parseMap,worldSamples,worldSample,emptyPoses,groupPoint,connections,MapRuntime,wheelFrame,groupMatrix,matrixPoint } from '../../../games/valley-of-light/map/model.ts';
const near=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-7,`${a} != ${b}`);
const geometry=map=>Object.fromEntries(map.objects.map(o=>[o.id,worldSamples(map,o,emptyPoses())]));
function unchanged(before,map){for(const o of map.objects)if(before[o.id])worldSamples(map,o,emptyPoses()).forEach((s,i)=>{near(s.point,before[o.id][i].point);near(s.up,before[o.id][i].up);});}
async function using(map,fn){const e=new ValleyAuthoring(map);await e.start();try{await fn(e);}finally{await e.dispose();}}
const group=(id,parentId=null,position=[0,0,0],rotation=[0,0,0],scale=[1,1,1])=>({id,name:id,pivot:[0,0,0],parentId,position,rotation,scale});

test('group selection creates a parent, preserves world geometry, and undo restores selection',()=>using(undefined,e=>{
  e.select(['moving-a','moving-b']);const before=geometry(e.map),json=e.exportJSON(),id=e.groupSelected();assert.deepEqual(e.selected,[id]);unchanged(before,e.map);assert.equal(e.map.groups.find(g=>g.id===id).parentId,'sliding');
  e.updateGroup(id,g=>g.position[1]+=3);for(const key of ['moving-a','moving-b'])near(worldSamples(e.map,e.map.objects.find(o=>o.id===key),emptyPoses())[1].point,before[key][1].point.map((v,i)=>v+(i===1?3:0)));
  e.platform.history.undo();e.platform.history.undo();assert.equal(e.exportJSON(),json);assert.deepEqual(e.selected,['moving-a','moving-b']);e.platform.history.redo();assert.deepEqual(e.selected,[id]);
}));

test('nested nonuniform transforms preserve geometry and normals during reparent, drag, JSON and undo',()=>{
  const map=emptyMap();map.groups=[group('a',null,[3,4,-2],[20,35,10],[2,1,3]),group('b',null,[-3,2,5],[-40,5,70],[1,.5,2]),group('child','a',[1,0,2],[15,-20,38])];const o=createObject(5,'prism',[1,0,0]);o.rotation=[90,0,-90];o.groupId='child';map.objects=[o];
  return using(map,e=>{const before=geometry(e.map);e.reparent(['child'],'b');unchanged(before,e.map);const saved=e.exportJSON();e.importJSON(saved);unchanged(before,e.map);assert.equal(e.exportJSON(),saved);e.select(['child']);const moved=e.movePreview(e.map,'prism',[2,0,0],.1);const shift=worldSamples(moved,moved.objects[0],emptyPoses())[1].point.map((v,i)=>v-before.prism[1].point[i]);near([shift[1]],[0]);assert.ok(shift[0]>1.9&&shift[0]<2.1);e.reparent(['child'],null);unchanged(before,e.map);assert.throws(()=>e.reparent(['child'],'child'),/自身|子节点/);const normal=worldSamples(e.map,e.map.objects[0],emptyPoses())[1].up;near([Math.hypot(...normal)],[1]);});
});

test('copy/paste recursively remaps groups, wheel targets, buttons, optical links and attached pillars',()=>{
  const map=emptyMap();map.groups=[group('root'),group('bridge','root',[2,0,0])];const a=createObject(1,'a'),b=createObject(1,'b',[1,0,0]),wheel=createObject(3,'wheel'),plate=createObject(8,'plate'),pillar=createObject(12,'pillar');a.groupId=b.groupId='bridge';wheel.groupId=plate.groupId='root';wheel.motion.targetGroup='bridge';plate.trigger.actions=[{groupId:'bridge',translation:[0,2,0],rotation:[0,90,0],duration:1,easing:'smooth'}];pillar.attachment={pathId:'a',corner:0};map.objects=[a,b,wheel,plate,pillar];map.opticalLinks=[{a:'a',aEnd:0,b:'b',bEnd:1}];
  return using(map,e=>{e.select(['root','a']);e.copy();const target=e.createEmpty(null);e.updateGroup(target,g=>{g.rotation=[20,35,0];g.scale=[2,1,3];});const before=e.exportJSON();e.paste(target);const root=e.selected[0],objects=e.map.objects.filter(o=>!map.objects.some(p=>p.id===o.id)),copiedWheel=objects.find(o=>o.type===3),copiedPlate=objects.find(o=>o.type===8),copiedPillar=objects.find(o=>o.type===12),bridge=e.map.groups.find(g=>g.parentId===root);assert.equal(copiedWheel.motion.targetGroup,bridge.id);assert.equal(copiedPlate.trigger.actions[0].groupId,bridge.id);assert.ok(objects.some(o=>o.id===copiedPillar.attachment.pathId));assert.ok(e.map.opticalLinks.some(l=>objects.some(o=>o.id===l.a)&&objects.some(o=>o.id===l.b)));for(const o of objects){const original=map.objects.find(p=>p.type===o.type&&(p.type!==1||p.position[0]===o.position[0]));if(original)near(worldSamples(e.map,o,emptyPoses())[0].point,worldSamples(map,original,emptyPoses())[0].point);}const pasted=e.exportJSON();e.platform.history.undo();assert.equal(e.exportJSON(),before);e.platform.history.redo();assert.equal(e.exportJSON(),pasted);e.removeSelected();assert.equal(e.exportJSON(),before);e.select(['pillar']);e.copy();e.paste(null);assert.equal(e.map.objects.at(-1).attachment,null);});
});

test('cut/paste preserves IDs and pose; deleting parents clears external references; empty nodes round-trip',()=>using(undefined,e=>{
  e.select(['sliding']);e.copy(true);const target=e.createEmpty(null);e.updateGroup(target,g=>{g.position=[5,2,8];g.rotation=[0,60,0];});const before=geometry(e.map),json=e.exportJSON();e.paste(target);assert.equal(e.map.groups.find(g=>g.id==='sliding').parentId,target);unchanged(before,e.map);assert.equal(e.canPaste,false);e.platform.history.undo();assert.equal(e.exportJSON(),json);e.select(['sliding']);e.removeSelected();assert.ok(!e.map.objects.some(o=>o.groupId==='sliding'));assert.ok(e.map.objects.every(o=>o.trigger.actions.every(a=>a.groupId!=='sliding')));assert.deepEqual(parseMap(JSON.parse(e.exportJSON())),e.map);e.platform.history.undo();assert.equal(e.exportJSON(),json);
}));

test('parent transforms apply to six-face routes and nested occupied wheel groups',()=>{
 const map=emptyMap();map.groups=[group('root',null,[3,4,5],[0,0,90],[2,1,3]),group('child','root')];map.objects=[createObject(9,'start'),createObject(1,'road',[1,0,0]),createObject(10,'exit',[2,0,0]),createObject(3,'wheel',[4,0,0])];for(const o of map.objects)o.groupId='child';map.objects[3].motion.axis='y';map.objects[3].motion.targetGroup='root';const parsed=parseMap(map);assert.ok(connections(parsed,emptyPoses()).some(c=>c.a==='start'&&c.b==='road'));const r=new MapRuntime(parsed);assert.equal(r.canDrag('wheel'),false);assert.equal(r.walkTo('exit'),true);for(let i=0;i<400;i++)r.tick(.05);assert.equal(r.completed,true);
 const poses=emptyPoses();poses.mechanisms.wheel=90;const center=worldSample(map,map.objects[3],{point:[0,-.5,0],up:[0,1,0],roll:0},emptyPoses()).point;near(worldSample(map,map.objects[3],{point:[0,-.5,0],up:[0,1,0],roll:0},poses).point,center);assert.ok(wheelFrame(map,map.objects[3],poses).axis.every(Number.isFinite));
});

test('invalid parent cycles, unknown parents, collisions and singular scales fail atomically',()=>using(undefined,e=>{
 const before=e.exportJSON();for(const mutate of [m=>{m.groups[0].parentId=m.groups[0].id;},m=>{m.groups[0].parentId='missing';},m=>{m.groups[0].scale=[1,0,1];},m=>{m.groups[0].basis=new Array(16).fill(0);},m=>{m.groups[0].id=m.objects[0].id;}]){const map=JSON.parse(before);mutate(map);assert.throws(()=>e.importJSON(JSON.stringify(map)));assert.equal(e.exportJSON(),before);}
}));


test('scaled parents affect the handwheel assembly and very small nested transforms remain valid',()=>{
 const map=emptyMap();map.groups=[group('parent',null,[1,2,3],[0,0,0],[2,3,4])];const wheel=createObject(3,'wheel');wheel.groupId='parent';map.objects=[wheel];let f=wheelFrame(map,wheel,emptyPoses());near([Math.hypot(...f.right),Math.hypot(...f.up),Math.hypot(...f.shaft)],[2,3,4]);near(f.center,[1,.5,7.6]);const poses=emptyPoses();poses.mechanisms.wheel=90;f=wheelFrame(map,wheel,poses);near(f.right,[2,0,0]);near(f.up,[0,3,0]);
 map.groups=[group('parent',null,[0,0,0],[0,0,0],[.01,.01,.01]),group('child','parent',[0,0,0],[0,0,0],[.01,.01,.01])];wheel.groupId='child';assert.ok(worldSamples(parseMap(map),wheel,emptyPoses()).every(s=>s.up.every(Number.isFinite)));
});
