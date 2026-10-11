import test from 'node:test';
import assert from 'node:assert/strict';
import {ValleyAuthoring} from '../../../artifacts/valley-editor/document.mjs';
import {storyGarden,parseMap,MapRuntime,removeLogicReferences} from '../../../games/valley-of-light/map/model.ts';
const using=async fn=>{const e=new ValleyAuthoring(storyGarden());await e.start();try{await fn(e);}finally{await e.dispose();}};
test('story editing/import are undoable, atomic and preserve conditions and scoped goals',()=>using(e=>{
 const before=e.exportJSON();e.change('对话',m=>{m.story.dialogues[0].speaker='旅人微';m.story.dialogues[0].lines.push('新的问题。');});const after=e.exportJSON();e.platform.history.undo();assert.equal(e.exportJSON(),before);e.platform.history.redo();assert.equal(e.exportJSON(),after);e.importJSON(e.exportJSON(true));assert.equal(e.exportJSON(),after);assert.throws(()=>e.change('坏引用',m=>m.story.dialogues[0].choices[0].condition={kind:'objective',objectiveId:'absent',status:'done'}));assert.equal(e.exportJSON(),after);
}));
test('deleting a region cleans scoped story/conditions/rules and undo restores the whole story',()=>using(e=>{
 const before=e.exportJSON();e.select(['prison']);e.removeSelected();assert.equal(e.map.story.objectives.some(o=>o.id==='show-light'),false);assert.equal(e.map.story.dialogues.some(d=>d.id==='witness'),false);assert.equal(e.map.logic.rules.some(r=>r.id==='light'||r.id==='opening-gate'),false);assert.doesNotThrow(()=>parseMap(e.map));e.platform.history.undo();assert.equal(e.exportJSON(),before);
}));
test('node IDs reserve story IDs and debug/runtime progress never changes exported map data',()=>using(e=>{
 e.change('保留ID',m=>m.story.objectives.push({id:'object-1',name:'保留',description:'',initial:'hidden'}));const before=e.exportJSON();const r=new MapRuntime(e.map);r.debugPaused=true;r.logic.debugVariable('keeper-trust',10);r.debugStep();r.setObjective('show-light','done');assert.equal(e.exportJSON(),before);assert.notEqual(e.add(1,[4,0,0]),'object-1');
}));

test('removing a dialogue choice removes filtered and dependent rules atomically and undo restores them',()=>using(e=>{
 e.change('选项事件',m=>m.logic.rules.push({id:'choice-result',name:'选择结果',enabled:true,once:true,event:{type:'dialogue',source:'homecoming',choiceId:'invite'},condition:{kind:'all',conditions:[]},actions:[{kind:'message',text:'邀请已送达。'}]},{id:'choice-controller',name:'选择控制',enabled:true,once:true,event:{type:'signal',source:'enable-choice'},condition:{kind:'all',conditions:[]},actions:[{kind:'rule',ruleId:'choice-result',enabled:true}]}));
 const before=e.exportJSON();e.change('删除选项',m=>{m.story.dialogues[0].choices.shift();removeLogicReferences(m,new Set());});assert.equal(e.map.story.dialogues[0].choices.length,1);assert.equal(e.map.logic.rules.some(r=>r.id==='choice-result'||r.id==='choice-controller'),false);assert.doesNotThrow(()=>parseMap(e.map));e.platform.history.undo();assert.equal(e.exportJSON(),before);
}));
