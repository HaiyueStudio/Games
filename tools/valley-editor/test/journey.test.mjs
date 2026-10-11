import test from 'node:test';
import assert from 'node:assert/strict';
import {ValleyAuthoring} from '../../../artifacts/valley-editor/document.mjs';
import {journeyGarden,parseMap,MapRuntime} from '../../../games/valley-of-light/map/model.ts';
const using=async fn=>{const e=new ValleyAuthoring(journeyGarden());await e.start();try{await fn(e);}finally{await e.dispose();}};
test('platform stations and stage camera edits are undoable, validated atomically and round-trip compact exports',()=>using(e=>{
 const before=e.exportJSON();e.change('站点与阶段',m=>{m.groups[0].platform.stations[1].duration=3;m.stages.items[1].camera.yaw=80;});const after=e.exportJSON();e.platform.history.undo();assert.equal(e.exportJSON(),before);e.platform.history.redo();assert.equal(e.exportJSON(),after);e.importJSON(e.exportJSON(true));assert.equal(e.exportJSON(),after);assert.throws(()=>e.change('坏站点',m=>m.groups[0].platform.initialStation='bad'));assert.equal(e.exportJSON(),after);
}));
test('copying a platform copies its local stations; deleting stage groups and entry paths cleans references atomically',()=>using(e=>{
 e.select(['lift']);e.duplicate();const copy=e.map.groups.find(g=>g.id===e.selected[0]);assert.deepEqual(copy.platform,e.map.groups.find(g=>g.id==='lift').platform);assert.doesNotThrow(()=>parseMap(e.map));e.platform.history.undo();
 e.change('入口',m=>m.stages.items[1].entry={objectId:'garden-entry',face:0});const before=e.exportJSON();e.select(['courtyard']);e.removeSelected();assert.deepEqual(e.map.stages.items[1].groups,[]);assert.equal(e.map.stages.items[1].entry,null);assert.doesNotThrow(()=>parseMap(e.map));e.platform.history.undo();assert.equal(e.exportJSON(),before);
}));
test('removing a platform removes dependent rules; runtime trips and phase changes do not mutate authoring',()=>using(e=>{
 const before=e.exportJSON();const runtime=new MapRuntime(e.map);runtime.platformCommand('lift','go','station-2');runtime.queueStage('garden');for(let i=0;i<400;i++)runtime.tick(.01);assert.equal(e.exportJSON(),before);e.select(['lift']);e.removeSelected();assert.equal(e.map.logic.rules.some(r=>r.id==='ride'),false);assert.doesNotThrow(()=>parseMap(e.map));e.platform.history.undo();assert.equal(e.exportJSON(),before);
}));
