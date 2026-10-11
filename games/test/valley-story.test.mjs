import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {storyGarden,journeyGarden,MapRuntime,parseMap,parseCheckpoint,serializeMap,serializeCompactMap,inspectNavigation,findRoute,worldSamples,removeLogicReferences} from '../valley-of-light/map/model.ts';
const tick=(r,t)=>{for(let i=0;i<Math.ceil(t/.01);i++)r.tick(.01);};
const walk=(r,id)=>{assert.ok(r.walkTo(id),r.message);for(let i=0;i<1500&&r.walking;i++)r.tick(.01);assert.equal(r.at.objectId,id);};
const finish=(r,choice)=>{r.tick(0);let d=r.dialogueSnapshot();assert.ok(d);for(let i=0;i<40&&d.line<d.total-1;i++){assert.ok(r.advanceDialogue());d=r.dialogueSnapshot();}assert.ok(r.advanceDialogue(choice));r.tick(0);};
const blank=()=>{const m=storyGarden();m.logic.rules=[];m.objects.find(o=>o.id==='lamp').type=1;return m;};
const rule=(id,event,actions,condition={kind:'all',conditions:[]})=>({id,name:id,enabled:true,once:false,event,condition,actions});

test('published schemas preserve story configuration and dialogue/goal logic in both formats',()=>{
 const full=JSON.parse(readFileSync(new URL('../valley-of-light/maps/map.schema.json',import.meta.url))),compact=JSON.parse(readFileSync(new URL('../valley-of-light/maps/compact-map.schema.json',import.meta.url)));
 assert.equal(full.properties.story.$ref,'#/$defs/story');assert.equal(compact.properties.story.$ref,'map.schema.json#/$defs/story');
 assert.ok(full.$defs.logicEvent.properties.choiceId);
 for(const kind of ['dialogue','objective']){assert.ok(full.$defs.logicEvent.properties.type.enum.includes(kind));for(const def of ['logicCondition','logicAction'])assert.ok(full.$defs[def].oneOf.some(a=>a.properties.kind.const===kind));}
});

test('story definitions and references round-trip both formats and malformed choices/IDs are rejected',()=>{
 const m=storyGarden();assert.equal(serializeMap(parseMap(JSON.parse(serializeCompactMap(m)))),serializeMap(m));
 for(const mutate of [m=>m.story.objectives[0].id='start',m=>m.logic.variables[0].id='homecoming',m=>m.story.dialogues[0].lines=[],m=>m.story.dialogues[0].choices[0].condition={kind:'variable',id:'absent',op:'eq',value:0},m=>m.logic.rules[0].actions[0].dialogueId='absent',m=>m.logic.rules[0].event={type:'dialogue',source:'homecoming',choiceId:'absent'},m=>m.story.objectives[0].resetGroup='absent']){const broken=storyGarden();mutate(broken);assert.throws(()=>parseMap(broken));}
});
test('dialogue waits for a safe endpoint, freezes simulation time, blocks walking and choices resume the waiting action',()=>{
 const m=blank();m.logic.rules=[rule('talk',{type:'signal',source:'talk'},[{kind:'dialogue',dialogueId:'fear'},{kind:'variable',id:'keeper-trust',operation:'add',value:2}])];const r=new MapRuntime(m);r.walkTo('beacon');tick(r,.04);r.logic.debugSignal('talk');r.tick(.01);assert.equal(r.dialogueActive,false);tick(r,1);assert.equal(r.dialogueActive,true);const feet=[...r.position],time=r.logic.debugSnapshot().time;tick(r,5);assert.deepEqual(r.position,feet);assert.equal(r.logic.debugSnapshot().time,time);assert.equal(r.walkTo('lamp'),false);finish(r);assert.equal(r.logic.variables['keeper-trust'],2);
});
test('conditional choices cannot be bypassed; closing all-locked options is safe; choice signals and dialogue filters emit once',()=>{
 const m=blank();m.logic.rules=[rule('response',{type:'dialogue',source:'witness',choiceId:'leave'},[{kind:'variable',id:'keeper-trust',operation:'add',value:1}])];const r=new MapRuntime(m);r.queueDialogue('witness');r.tick(0);r.advanceDialogue();assert.equal(r.advanceDialogue('leave'),false);assert.equal(r.dialogueActive,true);assert.ok(r.advanceDialogue());assert.equal(r.logic.variables['keeper-trust'],0);r.setObjective('show-light','done');r.queueDialogue('witness');r.tick(0);finish(r,'leave');assert.equal(r.logic.variables['keeper-trust'],1);assert.equal(r.advanceDialogue('leave'),false);assert.equal(r.poses.story.choices.witness,'leave');
});
test('parallel dialogue requests play FIFO and safe-point checkpoint restores the exact current line and queued continuation',()=>{
 const m=blank();m.logic.rules=[rule('talk',{type:'start',source:null},[{kind:'parallel',actions:[{kind:'dialogue',dialogueId:'homecoming'},{kind:'dialogue',dialogueId:'fear'}]},{kind:'variable',id:'keeper-trust',operation:'add',value:1}])];const r=new MapRuntime(m);r.tick(0);r.advanceDialogue();r.requestCheckpoint('阅读中');r.tick(0);const saved=r.exportCheckpoint();assert.equal(saved.poses.story.queue[0].line,1);assert.equal(saved.poses.story.queue.length,2);assert.doesNotThrow(()=>parseCheckpoint(saved,m));const fresh=new MapRuntime(m);assert.ok(fresh.loadCheckpoint(saved));assert.equal(fresh.dialogueSnapshot().line,1);finish(fresh,'invite');assert.equal(fresh.dialogueSnapshot().id,'fear');finish(fresh);assert.equal(fresh.logic.variables['keeper-trust'],1);assert.deepEqual(fresh.poses.story.seen,['homecoming','fear']);
 const broken=structuredClone(saved);broken.poses.story.queue[0].line=100;assert.equal(fresh.loadCheckpoint(broken),false);
});
test('local reset clears scoped story progress and queued dialogue actions while preserving global choices',()=>{
 const m=blank();m.logic.rules=[rule('talk',{type:'signal',source:'talk'},[{kind:'dialogue',dialogueId:'witness'},{kind:'variable',id:'keeper-trust',operation:'add',value:1}])];const r=new MapRuntime(m);r.queueDialogue('homecoming');finish(r,'invite');r.setObjective('show-light','done');r.logic.debugSignal('talk');r.tick(.01);r.tick(0);assert.equal(r.dialogueActive,true);r.resetGroup('prison');assert.equal(r.dialogueActive,false);assert.equal(r.poses.story.objectives['show-light'],'active');assert.equal(r.poses.story.choices.homecoming,'invite');tick(r,1);assert.equal(r.logic.variables['keeper-trust'],0);
});
test('dialogue on an exit completes before winning, and return to initial fallback replays pending opening dialogue',()=>{
 const m=blank();m.objects.find(o=>o.id==='exit').state={enabled:true};m.logic.rules=[rule('last',{type:'enter',source:'exit'},[{kind:'dialogue',dialogueId:'outro'}])];const r=new MapRuntime(m);walk(r,'exit');assert.equal(r.completed,false);finish(r);r.tick(0);assert.equal(r.completed,true);
 const opening=new MapRuntime(storyGarden());finish(opening,'invite');opening.restoreCheckpoint();opening.tick(0);assert.equal(opening.dialogueSnapshot().id,'homecoming');assert.deepEqual(opening.poses.story.seen,[]);
});
test('full original story can branch, unlock a gate, finish objectives, and recover without editing the source map',()=>{
 const m=storyGarden(),before=serializeMap(m),r=new MapRuntime(m);finish(r,'listen');assert.equal(r.dialogueSnapshot().id,'fear');finish(r);walk(r,'beacon');walk(r,'lamp');finish(r,'leave');assert.equal(r.poses.states.exit.enabled,true);walk(r,'road');finish(r);walk(r,'exit');assert.equal(r.completed,true);assert.equal(r.poses.story.objectives['open-valley'],'done');r.restoreCheckpoint();assert.equal(r.poses.story.objectives['show-light'],'active');assert.equal(r.poses.story.seen.includes('witness'),false);assert.equal(r.logic.variables['keeper-trust'],1);assert.equal(serializeMap(m),before);
});
test('debug pause and fixed step are isolated from map data; variable edits and signals validate and process on the next step',()=>{
 const m=blank();m.logic.rules=[rule('change',{type:'variable',source:'keeper-trust'},[{kind:'message',text:'changed'}])];const r=new MapRuntime(m);r.debugPaused=true;r.logic.debugVariable('keeper-trust',3);tick(r,2);assert.equal(r.logic.counts.change,undefined);assert.equal(r.logic.debugSnapshot().time,0);r.debugStep();assert.equal(r.logic.counts.change,1);assert.equal(r.debugPaused,true);assert.equal(r.logic.debugSnapshot().time,.05);assert.throws(()=>r.logic.debugVariable('keeper-trust',true));assert.throws(()=>r.logic.debugSignal('bad name'));assert.equal(m.logic.variables[0].initial,0);r.requestCheckpoint('debug');r.debugStep();const fresh=new MapRuntime(m);fresh.loadCheckpoint(r.exportCheckpoint());assert.equal(fresh.debugPaused,false);
});
test('diagnostics retain event-time failure values, show pending work, and bound the event log',()=>{
 const m=blank();m.logic.rules=[rule('gate-rule',{type:'signal',source:'test'},[{kind:'wait',duration:1}],{kind:'variable',id:'keeper-trust',op:'gte',value:2})];const r=new MapRuntime(m);r.logic.debugSignal('test');r.tick(.01);r.logic.debugVariable('keeper-trust',3);r.tick(.01);let info=r.logic.debugSnapshot().rules[0];assert.equal(info.condition.passed,true);assert.equal(info.last.passed,false);assert.match(info.last.trace.label,/当前 0/);r.logic.debugSignal('test');r.tick(.01);info=r.logic.debugSnapshot().rules[0];assert.equal(info.status,'正在执行');assert.ok(info.task.children[0].remaining>0);for(let i=0;i<120;i++){r.logic.debugSignal('unused');r.tick(.01);}assert.equal(r.logic.events.length,80);
});
test('connectivity diagnostics agree with actual per-face routing and reflect moving platforms and closed exits',()=>{
 const r=new MapRuntime(blank()),n=inspectNavigation(r.map,r.poses,r.at);for(const s of n.surfaces)assert.equal(s.reachable,findRoute(r.map,r.poses,r.at,s.id,s.index)!==null);assert.ok(n.exits[0].reachable);assert.equal(n.exits[0].enabled,false);
 const lift=new MapRuntime(journeyGarden());lift.platformCommand('lift','go','station-2');tick(lift,.7);const moving=inspectNavigation(lift.map,lift.poses,lift.at);assert.equal(moving.surfaces.find(s=>s.id==='deck'&&s.face===0).reachable,false);assert.equal(moving.exits[0].reachable,false);
});
test('deleting a story dependency removes dependent choices/dialogues and rules transitively',()=>{
 const m=storyGarden();removeLogicReferences(m,new Set(['show-light']));assert.equal(m.story.dialogues.some(d=>d.id==='witness'),false);assert.equal(m.logic.rules.some(r=>r.id==='light'||r.id==='opening-gate'),false);assert.doesNotThrow(()=>parseMap(m));
});
