import test from 'node:test';
import assert from 'node:assert/strict';
import {ValleyAuthoring} from '../../../artifacts/valley-editor/document.mjs';
import {checkpointGarden,parseMap} from '../../../games/valley-of-light/map/model.ts';
const using=async fn=>{const e=new ValleyAuthoring(checkpointGarden());await e.start();try{await fn(e);}finally{await e.dispose();}};
test('checkpoint annotations, reset ownership and actions support undo and both export formats',()=>using(e=>{
 const before=e.exportJSON();e.change('检查点配置',m=>{m.objects.find(o=>o.id==='beacon').checkpoint.name='新灯塔';m.logic.rules[0].actions.push({kind:'checkpoint',name:'阶段一'},{kind:'reset',groupId:'west',returnPlayer:true},{kind:'restore'});});const after=e.exportJSON();e.platform.history.undo();assert.equal(e.exportJSON(),before);e.platform.history.redo();assert.equal(e.exportJSON(),after);e.importJSON(e.exportJSON(true));assert.equal(e.exportJSON(),after);
 assert.throws(()=>e.change('无效归属',m=>m.logic.variables[0].resetGroup='missing'));assert.equal(e.exportJSON(),after);e.select(['beacon']);e.duplicate();assert.equal(e.map.objects.find(o=>o.id===e.selected[0]).checkpoint.name,'新灯塔');
}));
test('deleting a scoped parent cleans variables, rules and transitive references; undo restores the entire region',()=>using(e=>{
 const before=e.exportJSON();e.select(['west']);e.removeSelected();assert.equal(e.map.logic.variables.some(v=>v.resetGroup==='west'),false);assert.equal(e.map.logic.rules.some(r=>r.resetGroup==='west'),false);assert.deepEqual(e.map.logic.rules.map(r=>r.id),['light-east']);assert.doesNotThrow(()=>parseMap(e.map));e.platform.history.undo();assert.equal(e.exportJSON(),before);
}));
