import test from 'node:test';
import assert from 'node:assert/strict';
import {ValleyAuthoring} from '../../../artifacts/valley-editor/document.mjs';
import {portalGarden,parseMap,worldSample,emptyPoses,portalAnchor} from '../../../games/valley-of-light/map/model.ts';
const using=async fn=>{const e=new ValleyAuthoring(portalGarden());await e.start();try{await fn(e);}finally{await e.dispose();}};
test('portal binding/pairing is undoable, and removing a host removes its door and clears incoming references',()=>using(e=>{
 const original=e.exportJSON();e.bindPortal('portal-a','start',5);assert.equal(portalAnchor(e.map,e.map.objects.find(o=>o.id==='portal-a')).objectId,'start');e.platform.history.undo();assert.equal(e.exportJSON(),original);
 e.pairPortal('portal-a',null);e.pairPortal('portal-a','portal-b',true);assert.equal(e.exportJSON(),original);
 e.select(['door-road-b']);e.removeSelected();assert.ok(!e.map.objects.some(o=>o.id==='portal-b'));assert.equal(e.map.objects.find(o=>o.id==='portal-a').portal.targetId,null);e.platform.history.undo();assert.equal(e.exportJSON(),original);
}));
test('copying a pair remaps both hosts and door targets; copying one door keeps its pose but asks for a fresh binding',()=>using(e=>{
 e.select(['door-road-a','door-road-b']);e.duplicate();const portals=e.map.objects.filter(o=>o.type===20&&!['portal-a','portal-b'].includes(o.id));assert.equal(portals.length,2);for(const gate of portals){assert.ok(!['door-road-a','door-road-b'].includes(gate.portal.pathId));assert.ok(portals.some(p=>p.id===gate.portal.targetId));}assert.doesNotThrow(()=>parseMap(e.map));
 e.select(['portal-a']);const original=e.map.objects.find(o=>o.id==='portal-a'),position=worldSample(e.map,original,{point:[0,0,0],up:[0,1,0],roll:0},emptyPoses()).point;e.copy();e.paste(null);const gate=e.map.objects.find(o=>o.id===e.selected[0]);assert.equal(gate.portal.pathId,null);assert.deepEqual(worldSample(e.map,gate,{point:[0,0,0],up:[0,1,0],roll:0},emptyPoses()).point,position);assert.doesNotThrow(()=>parseMap(e.map));
}));
test('reusing an occupied portal face selects the existing door and attachment rejects unrelated reparenting',()=>using(e=>{
 const n=e.map.objects.length;assert.equal(e.addPortal('door-road-a',0),'portal-a');assert.equal(e.map.objects.length,n);const group=e.createEmpty(null);assert.throws(()=>e.reparent(['portal-a'],group),/路径/);e.bindPortal('portal-a','start',0);assert.ok(e.map.objects.find(o=>o.id==='portal-a').portal.pathId==='start');
}));
