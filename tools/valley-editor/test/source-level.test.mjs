import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ValleyAuthoring,createValleyEditorApi,mixAndJamRecipe,sourcePathId} from '../../../artifacts/valley-editor/document.mjs';
import {MapRuntime,parseMap,serializeMap,centerIndex,connections,emptyPoses} from '../../../games/valley-of-light/map/model.ts';
const source=JSON.parse(readFileSync(new URL('../sources/mixandjam/scene.json',import.meta.url),'utf8'));
test('source-derived recipe commits atomically, roundtrips, and matches the published portable map',async()=>{
 const e=new ValleyAuthoring();await e.start();try{const api=createValleyEditorApi(e),before=api.exportJSON(false),recipe=mixAndJamRecipe(source);assert.deepEqual(api.validate(recipe).playIssues,[]);api.apply(recipe);
 assert.equal(serializeMap(parseMap(JSON.parse(api.exportJSON()))),api.exportJSON(false));assert.equal(api.exportJSON(),readFileSync(new URL('../../../games/valley-of-light/maps/mixandjam-monument.json',import.meta.url),'utf8'));api.undo();assert.equal(api.exportJSON(false),before);
 }finally{await e.dispose();}
});
test('published scene route requires boarding and riding both deck heights, unfolding the bridge, and an optical seam',()=>{
 const m=parseMap(JSON.parse(readFileSync(new URL('../../../games/valley-of-light/maps/mixandjam-monument.json',import.meta.url),'utf8'))),r=new MapRuntime(m);
 const walk=id=>{assert.ok(r.walkTo(id,centerIndex(m.objects.find(o=>o.id===id))),id+': '+r.message);for(let i=0;i<5000&&(r.walking||r.busy);i++)r.tick(.02);assert.equal(r.at.objectId,id);};
 assert.equal(r.walkTo('mv-18final'),false);walk('mv-12');assert.equal(r.walkTo('mv-l_1'),false);
 assert.ok(r.dragTo('source-wheel',90,true));walk('mv-l_1');assert.ok(r.dragTo('source-wheel',-90,true));walk('mv-17button');assert.ok(r.fired.has('mv-17button'));
 walk('mv-l_1');assert.ok(r.dragTo('source-wheel',0,true));walk('mv-15');walk('mv-p3');
 const seams=connections(m,r.poses);assert.ok(seams.some(c=>c.illusion&&[c.a,c.b].includes('mv-p3')&&[c.a,c.b].includes('mv-u_1')));
 walk('mv-u_1');assert.ok(r.dragTo('source-wheel',180,true));walk('mv-18final');assert.ok(r.completed);assert.equal(r.logic.error,null);
});
test('all seven connection conditions from the source scene have corresponding geometric connections',()=>{
 const m=parseMap(JSON.parse(readFileSync(new URL('../../../games/valley-of-light/maps/mixandjam-monument.json',import.meta.url),'utf8')));
 for(const condition of source.conditions){
  const poses=emptyPoses();poses.states={'mv-16':{visible:true,walkable:true,enabled:true}};
  for(const a of condition.angles){const p=source.pivots.find(p=>p.id===a.pivotId);if(p.name==='CenterPivot')poses.mechanisms['source-wheel']=-a.rotation[1];else poses.groups['source-right']={translation:[0,0,0],rotation:a.rotation};}
  const links=connections(m,poses);
  for(const edge of condition.edges){const a=sourcePathId(source.paths.find(p=>p.id===edge.from)),b=sourcePathId(source.paths.find(p=>p.id===edge.to));assert.ok(links.some(c=>c.a===a&&c.b===b||c.a===b&&c.b===a),condition.name+': '+a+' / '+b);}
 }
 const poses=emptyPoses();poses.groups['source-right']={translation:[0,0,0],rotation:[0,0,90]};
 assert.equal(connections(m,poses,p=>[p[0],p[2]]).some(c=>c.illusion&&[c.a,c.b].includes('mv-p3')),false,'illusion disappears when projected from above');
});
