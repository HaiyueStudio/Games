import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ValleyAuthoring,createValleyEditorApi,chapterTwoRecipe} from '../../../artifacts/valley-editor/document.mjs';
import {MapRuntime,centerIndex,parseMap,serializeMap} from '../../../games/valley-of-light/map/model.ts';
const using=async fn=>{const e=new ValleyAuthoring();await e.start();try{await fn(e);}finally{await e.dispose();}};
const batch=(commands,extra={})=>({apiVersion:1,label:'API 测试',commands,...extra});
test('API batches validate without mutations, commit one undoable document change and export editable compact data',()=>using(e=>{
 const api=createValleyEditorApi(e),before=api.exportJSON(false),revision=api.status().revision,recipe=chapterTwoRecipe();assert.deepEqual(api.validate(recipe).playIssues,[]);assert.equal(api.status().revision,revision);
 api.apply({...recipe,expectedRevision:revision});const after=api.exportJSON(false);assert.equal(api.status().revision,revision+1);assert.equal(serializeMap(parseMap(JSON.parse(api.exportJSON()))),after);api.undo();assert.equal(api.exportJSON(false),before);api.redo();assert.equal(api.exportJSON(false),after);
 const copy=api.read();copy.objects[0].name='外部修改';assert.notEqual(api.read().objects[0].name,copy.objects[0].name);assert.deepEqual(api.read().appearance,{background:'#fae7a0',ambientIntensity:1.8});
 assert.deepEqual(JSON.parse(readFileSync(new URL('../recipes/chapter-two.commands.json',import.meta.url),'utf8')),recipe);
 assert.equal(serializeMap(parseMap(JSON.parse(readFileSync(new URL('../../../games/valley-of-light/maps/chapter-two-garden.json',import.meta.url),'utf8')))),after);
}));
test('invalid batches, duplicate IDs, misspelled patches and stale revisions fail atomically; play guards every mutation',()=>using(e=>{
 let editing=true;const api=createValleyEditorApi(e,{editable:()=>editing}),before=api.exportJSON(false);
 for(const commands of [
  [{op:'object.create',object:{id:'api-first',type:1}},{op:'object.update',id:'absent',patch:{position:[0,2,0]}}],
  [{op:'object.create',object:{id:'api-first',type:1}},{op:'object.create',object:{id:'api-first',type:1}}],
  [{op:'object.create',object:{id:'api-first',type:1,postion:[0,2,0]}}],
  [{op:'object.create',object:{id:'api-first',type:1,colors:{surfac:'#ffffff'}}}],
  [{op:'map.configure',settings:{appearance:{background:'red'}}}],
  [{op:'map.configure',settings:{appearance:{background:'#ffffff',ambientIntensity:5}}}],
  [{op:'constructor'}]
 ]){assert.throws(()=>api.apply(batch(commands)));assert.equal(api.exportJSON(false),before);}
 assert.throws(()=>api.apply(batch([{op:'map.create',id:'new',name:'新地图'}],{expectedRevision:999})),/版本/);
 editing=false;for(const change of [()=>api.apply(chapterTwoRecipe()),()=>api.undo(),()=>api.redo(),()=>api.select([]),()=>api.fit()])assert.throws(change,/停止试玩/);assert.equal(api.exportJSON(false),before);
}));
test('API reparent keeps selected descendants in their subtree and rejects cyclic intermediate hierarchies',()=>using(e=>{
 const api=createValleyEditorApi(e);api.apply(batch([{op:'map.create',id:'tree',name:'层级测试'},{op:'group.create',group:{id:'parent',name:'父节点',position:[0,2,0]}},{op:'group.create',group:{id:'destination',name:'目标',position:[3,0,0]}},{op:'object.create',object:{id:'child',type:1,groupId:'parent'}},{op:'nodes.reparent',ids:['parent','child'],parentId:'destination'}]));
 assert.equal(api.read().objects[0].groupId,'parent');assert.equal(api.read().groups[0].parentId,'destination');assert.deepEqual(api.read().groups[0].position,[-3,2,0]);
 const before=api.exportJSON(false);assert.throws(()=>api.apply(batch([{op:'group.update',id:'destination',patch:{parentId:'parent'}},{op:'nodes.reparent',ids:['child'],parentId:null}])),/循环引用/);assert.equal(api.exportJSON(false),before);
}));
test('API partial parameter patches, transform groups, portal binding and removal preserve history and references',()=>using(e=>{
 const api=createValleyEditorApi(e);api.apply(batch([{op:'map.create',id:'api-map',name:'接口地图'},{op:'group.create',group:{id:'g',name:'父节点',position:[0,2,0]}},{op:'object.create',object:{id:'a',type:1,position:[0,2,0]}},{op:'object.create',object:{id:'b',type:1,position:[4,2,0]}},{op:'object.create',object:{id:'gate',type:20}},{op:'portal.bind',id:'gate',pathId:'a'},{op:'nodes.reparent',ids:['a'],parentId:'g'},{op:'marker.set',id:'a',kind:'spawn'},{op:'marker.set',id:'b',kind:'exit'}]));
 api.apply(batch([{op:'object.update',id:'a',patch:{colors:{surface:'#123456'}}},{op:'group.update',id:'g',patch:{rotation:[0,90,0]}}]));assert.equal(api.read().objects[0].colors.hub,'#ed7657');assert.equal(api.read().objects[0].position[1],0);
 const before=api.exportJSON(false);api.apply(batch([{op:'nodes.remove',ids:['g']}]));assert.deepEqual(api.read().objects.map(o=>o.id),['b']);api.undo();assert.equal(api.exportJSON(false),before);
}));
test('API-built chapter two needs two bridge poses, both ladders, a switch and the upper route to finish',()=>using(e=>{
 const api=createValleyEditorApi(e);api.apply(chapterTwoRecipe());const m=api.read(),before=api.exportJSON(false),r=new MapRuntime(m);
 const walk=id=>{assert.ok(r.walkTo(id,centerIndex(m.objects.find(o=>o.id===id))),id+': '+r.message);let climbed=false;for(let i=0;i<6000&&r.walking;i++){r.tick(.02);climbed ||=!!r.ladderFrame;}assert.equal(r.at.objectId,id);return climbed;};
 assert.ok(walk('entry'));assert.equal(r.walkTo('garden-switch'),false);assert.ok(r.dragTo('wheel',90,true));walk('garden-switch');assert.ok(r.fired.has('garden-switch'));assert.ok(walk('west-pavilion'));assert.equal(r.walkTo('exit'),false);assert.ok(r.dragTo('wheel',0,true));walk('exit');assert.ok(r.completed);r.restoreCheckpoint();assert.equal(r.at.objectId,'west-pavilion');assert.equal(r.completed,false);assert.equal(api.exportJSON(false),before);
}));
