import assert from 'node:assert/strict';
import test from 'node:test';
import { ValleyAuthoring } from '../../../artifacts/valley-editor/document.mjs';
const make=()=>new ValleyAuthoring({format:'haiyue-valley-map',version:1,catalogVersion:1,id:'placement',name:'悬空路径',objects:[],groups:[],opticalLinks:[]});
const screen=p=>[(p[0]-p[2])/Math.SQRT2,(2*p[1]-p[0]-p[2])/Math.sqrt(6)];
function resolve(editor,point,{hit=null,height=0,heldHeight,type=1}={}){
 const p=screen(point);return editor.placement.resolve(type,p,{screen,ground:y=>[y-p[1]*Math.sqrt(6)/2+p[0]/Math.SQRT2,y,y-p[1]*Math.sqrt(6)/2-p[0]/Math.SQRT2],hit:hit?{id:hit,point}:null,height,step:1,heldHeight});
}
const near=(a,b)=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-7,`${a} != ${b}`);

test('floating road edges inherit exact height and can be continued one tile at a time',async()=>{
 const e=make();await e.start();try{
  const id=e.add(1,[2.25,3.25,4.25]),before=e.exportJSON();
  const inside=resolve(e,[2.65,3.25,4.25],{hit:id}),outside=resolve(e,[3.25,3.25,4.25]);
  assert.deepEqual(inside.position,[3.25,3.25,4.25]);assert.deepEqual(outside.position,inside.position);assert.equal(inside.mode,'edge');assert.equal(e.exportJSON(),before,'hovering is read-only');
  const placed=e.add(1,outside.position,outside.rotation);assert.ok(resolve(e,outside.position,{hit:placed}).blocked,'repeated click cannot add another block');
  near(resolve(e,[4.25,3.25,4.25]).position,[4.25,3.25,4.25]);e.platform.history.undo();assert.equal(e.exportJSON(),before);e.platform.history.redo();assert.equal(e.map.objects.length,2);
 }finally{await e.dispose();}
});

test('hovered center stays occupied; free placement and a held gesture use their own height',async()=>{
 const e=make();await e.start();try{
  const id=e.add(1,[2.25,3.25,4.25]),center=resolve(e,[2.25,3.25,4.25],{hit:id});assert.equal(center.blocked,true);assert.deepEqual(center.position,[2.25,3.25,4.25]);
  assert.equal(resolve(e,[20,0,20],{height:7.25}).position[1],7.25);assert.equal(resolve(e,[20,0,20],{heldHeight:3.25}).position[1],3.25);
  e.add(11,[20,9,20]);assert.equal(resolve(e,[20,0,20],{height:6,type:11}).position[1],4,'sea keeps the work-plane behavior');
 }finally{await e.dispose();}
});

test('wide rotated roads and the upper stair end use their actual ports',async()=>{
 const e=make();await e.start();try{
  const id=e.add(1,[0,4,0]);e.update(id,o=>{o.length=2;o.rotation=[0,45,0];});
  const d=Math.SQRT1_2,edge=resolve(e,[1.4*d,4,-1.4*d],{hit:id});near(edge.position,[1.5*d,4,-1.5*d]);near(edge.rotation,[0,45,0]);
  const stair=e.add(2,[8,3,0]);e.update(stair,o=>{o.length=2;o.rise=2;});const end=resolve(e,[9.5,5,0]);near(end.position,[9.5,5,0]);
  const nextStair=resolve(e,[9.5,5,0],{type:2});near(nextStair.position,[9.5,5,0]);
 }finally{await e.dispose();}
});

test('the directly hovered foreground object wins over another projected depth layer',async()=>{
 const e=make();await e.start();try{
  e.add(1,[0,3,0]);const front=e.add(1,[4,7,4]);const p=resolve(e,[4,7,4],{hit:front});assert.equal(p.sourceId,front);assert.equal(p.blocked,true);assert.equal(p.position[1],7);
 }finally{await e.dispose();}
});
