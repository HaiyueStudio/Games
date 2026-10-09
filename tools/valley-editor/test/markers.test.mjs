import test from 'node:test';
import assert from 'node:assert/strict';
import {ValleyAuthoring} from '../../../artifacts/valley-editor/document.mjs';

test('painting markers changes existing roads in one undoable edit; spawn moves and copies remain unmarked',async()=>{
 const e=new ValleyAuthoring();await e.start();try{
  const count=e.map.objects.length,before=e.exportJSON(),road=e.map.objects.find(o=>o.id==='moving-a'),transform=JSON.stringify([road.position,road.rotation,road.colors,road.groupId]);
  e.setMarker('moving-a','spawn',5);assert.equal(e.map.objects.length,count);assert.equal(e.map.objects.find(o=>o.id==='start').type,1);assert.deepEqual(e.map.objects.find(o=>o.id==='moving-a').marker,{kind:'spawn',face:5});assert.equal(JSON.stringify([road.position,road.rotation,road.colors,road.groupId]),transform);
  const marked=e.exportJSON();e.platform.history.undo();assert.equal(e.exportJSON(),before);e.platform.history.redo();assert.equal(e.exportJSON(),marked);
  e.duplicate();const copy=e.map.objects.find(o=>o.id===e.selected[0]);assert.equal(copy.type,1);assert.equal(copy.marker,undefined);e.platform.history.undo();assert.equal(e.exportJSON(),marked);
  e.setMarker('moving-a',null,5);assert.equal(e.map.objects.find(o=>o.id==='moving-a').marker,undefined);e.platform.history.undo();
  e.setMarker('moving-b','exit',0);const json=e.exportJSON(true);e.importJSON(json);assert.deepEqual(e.map.objects.find(o=>o.id==='moving-a').marker,{kind:'spawn',face:5});assert.deepEqual(e.map.objects.find(o=>o.id==='moving-b').marker,{kind:'exit',face:0});
  e.select(['moving-b']);e.copy(true);const group=e.createEmpty(null);e.paste(group);assert.equal(e.map.objects.find(o=>o.id==='moving-b').marker.kind,'exit');assert.equal(e.map.objects.find(o=>o.id==='moving-b').groupId,group);
  assert.throws(()=>e.setMarker('missing','spawn'));assert.throws(()=>e.setMarker('moving-a','spawn',6));
 }finally{await e.dispose();}
});
