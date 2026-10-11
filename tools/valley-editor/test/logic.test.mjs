import test from 'node:test';
import assert from 'node:assert/strict';
import {ValleyAuthoring} from '../../../artifacts/valley-editor/document.mjs';
import {logicGarden,parseMap,serializeMap,MapRuntime,removeLogicReferences} from '../../../games/valley-of-light/map/model.ts';
const using=async fn=>{const e=new ValleyAuthoring(logicGarden());await e.start();try{await fn(e);}finally{await e.dispose();}};
test('logic edits are undoable, invalid references are atomic, compact import keeps rules',()=>using(e=>{
 const original=e.exportJSON();e.change('编辑规则',m=>{m.logic.rules[0].actions[0].text='新的约定';m.objects.find(o=>o.id==='gate-a').state.enabled=true;});const changed=e.exportJSON();assert.notEqual(changed,original);e.platform.history.undo();assert.equal(e.exportJSON(),original);e.platform.history.redo();assert.equal(e.exportJSON(),changed);
 assert.throws(()=>e.change('无效动作',m=>m.logic.rules[0].actions.push({kind:'state',targetId:'missing',property:'visible',value:false})));assert.equal(e.exportJSON(),changed);
 e.importJSON(e.exportJSON(true));assert.equal(e.exportJSON(),changed);assert.doesNotThrow(()=>new MapRuntime(e.map));
}));
test('deleting a referenced node removes dependent rules and undo restores the whole puzzle',()=>using(e=>{
 const original=e.exportJSON();e.select(['first']);e.removeSelected();assert.ok(!e.map.logic.rules.some(r=>['first-light','second-light'].includes(r.id)));assert.doesNotThrow(()=>parseMap(e.map));e.platform.history.undo();assert.equal(e.exportJSON(),original);
 e.select(['lanterns']);e.removeSelected();assert.ok(!e.map.logic.rules.some(r=>r.id==='open-gate'));e.platform.history.undo();assert.equal(e.exportJSON(),original);
}));
test('variable deletion removes nested dependencies and dependent rule-control actions transitively',()=>using(e=>{
 e.change('关联规则',m=>{m.logic.rules[0].actions.push({kind:'rule',ruleId:'first-light',enabled:false});});e.change('删除变量',m=>{m.logic.variables=m.logic.variables.filter(v=>v.id!=='progress');removeLogicReferences(m,new Set(['progress']));});assert.deepEqual(e.map.logic.rules.map(r=>r.id),['arrived']);assert.doesNotThrow(()=>parseMap(e.map));e.platform.history.undo();assert.equal(e.map.logic.variables.length,2);
}));
test('restart and runtime rule effects never modify the editable document or exported initial states',()=>using(e=>{
 const before=e.exportJSON();const game=new MapRuntime(parseMap(e.map));game.setState('gate-a','enabled',true);game.logic.variables.progress=2;assert.equal(e.exportJSON(),before);assert.equal(serializeMap(parseMap(JSON.parse(e.exportJSON(true)))),before);
}));
test('automatic node IDs skip names already reserved by map variables or rules',()=>using(e=>{
 e.change('保留节点名称',m=>m.logic.variables.push({id:'object-1',name:'计数',initial:0}));assert.equal(e.add(1,[10,0,0]),'object-2');e.select(['middle']);e.duplicate();assert.ok(!e.selected.includes('object-1'));assert.doesNotThrow(()=>parseMap(e.map));
}));
