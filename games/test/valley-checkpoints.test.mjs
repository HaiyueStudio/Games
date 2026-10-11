import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkpointGarden,emptyMap,createObject,MapRuntime,parseMap,parseCheckpoint,serializeMap,serializeCompactMap,splitCube,walkSurfaces,worldSamples,objectState,portalGarden} from '../valley-of-light/map/model.ts';
const rule=(id,event,actions,resetGroup)=>({id,name:id,enabled:true,once:false,event,condition:{kind:'all',conditions:[]},actions,...(resetGroup?{resetGroup}:{})});
const tick=(r,time)=>{for(let i=0;i<Math.ceil(time/.01);i++)r.tick(.01);};
const walk=(r,id)=>{assert.ok(r.walkTo(id),r.message);for(let i=0;i<2000&&(r.walking||r.busy);i++)r.tick(.01);assert.equal(r.at.objectId,id);};
const emit=(r,source)=>{r.logic.emit({type:'signal',source});r.tick(0);};
const base=()=>{const m=emptyMap();m.objects=[createObject(9,'start'),createObject(1,'road',[1,0,0]),createObject(10,'exit',[2,0,0])];m.groups=[{id:'a',name:'A',pivot:[0,0,0]},{id:'b',name:'B',pivot:[0,0,0]}];m.logic={variables:[{id:'n',name:'n',initial:0}],rules:[]};return m;};
const add={kind:'variable',id:'n',operation:'add',value:1};
const move=(groupId,y,duration=1)=>({kind:'move',groupId,translation:[0,y,0],rotation:[0,0,0],duration,easing:'linear'});

test('checkpoint annotations and scoped rules round-trip in full/compact exports; splits keep one glyph',()=>{
 const m=checkpointGarden();assert.equal(serializeMap(parseMap(JSON.parse(serializeCompactMap(m)))),serializeMap(m));
 const cube=m.objects.find(o=>o.id==='beacon');cube.checkpoint.face=3;splitCube(m,cube.id,'other');assert.equal(m.objects.filter(o=>o.checkpoint).length,1);assert.doesNotThrow(()=>parseMap(m));
 for(const change of [m=>m.objects[1].checkpoint.face=9,m=>m.objects[1].checkpoint.name='',m=>m.logic.variables[0].resetGroup='missing',m=>m.logic.rules[0].resetGroup='missing',m=>m.logic.rules[0].actions=[{kind:'reset',groupId:'missing',returnPlayer:true}]]){const x=checkpointGarden();change(x);assert.throws(()=>parseMap(x));}
});
test('automatic checkpoints restore character, variables, switch and rule state without changing the map',()=>{
 const m=checkpointGarden(),original=serializeMap(m),r=new MapRuntime(m);walk(r,'west-switch');assert.equal(r.checkpointInfo.name,'归途灯塔');const saved=r.exportCheckpoint();assert.equal(saved.at.objectId,'beacon');assert.equal(r.logic.variables['west-lit'],true);
 walk(r,'east-switch');r.restoreCheckpoint();assert.equal(r.walking,false);assert.equal(r.at.objectId,'beacon');assert.deepEqual(r.logic.variables,{'west-lit':false,'east-lit':false});assert.equal(r.fired.size,0);assert.equal(r.checkpointRevision,1);tick(r,.1);assert.equal(r.checkpointRevision,1,'return does not replay checkpoint enter');walk(r,'west-switch');assert.equal(r.logic.variables['west-lit'],true);assert.equal(serializeMap(m),original);
 const fresh=new MapRuntime(m);assert.ok(fresh.loadCheckpoint(JSON.parse(JSON.stringify(saved))));assert.equal(fresh.at.objectId,'beacon');
});
test('local reset preserves the other region, resets once switches and explicit variable/rule ownership',()=>{
 const r=new MapRuntime(checkpointGarden());walk(r,'west-switch');walk(r,'east-switch');assert.equal(objectState(r.map,r.map.objects.find(o=>o.id==='exit'),r.poses).enabled,true);r.resetGroup('west',true);r.tick(0);
 assert.equal(r.at.objectId,'beacon');assert.deepEqual(r.logic.variables,{'west-lit':false,'east-lit':true});assert.equal(r.fired.has('west-switch'),false);assert.equal(r.fired.has('east-switch'),true);assert.equal(r.logic.counts['light-west'],undefined);assert.equal(r.logic.counts['light-east'],1);assert.equal(objectState(r.map,r.map.objects.find(o=>o.id==='exit'),r.poses).enabled,false);walk(r,'west-switch');assert.equal(r.logic.variables['west-lit'],true);
});
test('checkpoint restores parallel waits, queued motions and remaining elapsed time, including after reload',()=>{
 const m=base();m.objects[0].groupId='a';m.logic.rules=[rule('work',{type:'signal',source:'work'},[{kind:'parallel',actions:[{kind:'sequence',actions:[move('a',2),add,move('a',3)]},{kind:'sequence',actions:[{kind:'wait',duration:.7},add]}]},add])];
 const r=new MapRuntime(m);emit(r,'work');tick(r,.3);r.requestCheckpoint('移动中的灯塔');r.tick(0);const saved=r.exportCheckpoint();assert.doesNotThrow(()=>parseCheckpoint(saved,m));const originalPosition=[...r.position];tick(r,3);assert.equal(r.logic.variables.n,3);
 for(const restored of [r,new MapRuntime(m)]){assert.ok(restored.loadCheckpoint(saved));assert.deepEqual(restored.position,originalPosition);assert.equal(restored.logic.variables.n,0);tick(restored,.39);assert.equal(restored.logic.variables.n,0);tick(restored,.02);assert.equal(restored.logic.variables.n,1);tick(restored,2);assert.equal(restored.logic.variables.n,3);assert.equal(restored.position[1],3);assert.equal(restored.busy,false);}
});
test('local reset cancels scoped delayed actions and motions, while independent jobs continue',()=>{
 const m=base();m.logic.variables.push({id:'a-value',name:'A',initial:0,resetGroup:'a'});m.logic.rules=[rule('a-job',{type:'start',source:null},[{kind:'wait',duration:.4},{kind:'variable',id:'a-value',operation:'add',value:1},move('a',2)],'a'),rule('b-job',{type:'start',source:null},[move('b',3,.8),add],'b'),rule('unscoped-dependency',{type:'start',source:null},[{kind:'wait',duration:.6},move('a',1),add])];
 const r=new MapRuntime(m);tick(r,.2);r.resetGroup('a');tick(r,2);assert.equal(r.logic.variables['a-value'],0);assert.equal(r.poses.groups.a,undefined);assert.equal(r.poses.groups.b.translation[1],3);assert.equal(r.logic.variables.n,1);assert.deepEqual(r.logic.snapshot().active,[]);
});
test('nested groups, attached decoration states and external wheel controllers reset together',()=>{
 const m=base();m.groups.push({id:'child',name:'child',parentId:'a',pivot:[0,0,0]});m.objects[1].groupId='child';const wheel=createObject(3,'wheel',[0,0,3]);wheel.motion.targetGroup='child';const pillar=createObject(12,'pillar');pillar.attachment={pathId:'road',corner:0};m.objects.push(wheel,pillar);const r=new MapRuntime(m);r.dragTo('wheel',450,true);r.setState('pillar','visible',false);r.queueMotion(move('child',3,.1));tick(r,.2);r.resetGroup('a');assert.equal(r.poses.mechanisms.wheel,undefined);assert.equal(r.poses.groups.child,undefined);assert.equal(objectState(m,pillar,r.poses).visible,true);
});
test('mid-edge saves wait for a safe anchor; mid-edge local reset stops at an endpoint; full restore interrupts immediately',()=>{
 const r=new MapRuntime(base());r.requestCheckpoint('起点灯');r.tick(0);r.walkTo('road');tick(r,.05);const before=[...r.position];r.requestCheckpoint('路上灯');r.tick(.01);assert.equal(r.checkpointInfo.name,'起点灯');assert.ok(r.position[0]>before[0]);tick(r,.3);assert.equal(r.checkpointInfo.name,'路上灯');const saved=r.exportCheckpoint();assert.deepEqual(worldSamples(r.map,r.map.objects.find(o=>o.id===saved.at.objectId),saved.poses)[saved.at.index].point,[.5,0,0]);
 r.restoreCheckpoint();r.walkTo('exit');tick(r,.03);const x=r.position[0];r.resetGroup('a',true);r.tick(.01);assert.ok(r.position[0]>=x);tick(r,.3);assert.deepEqual(r.at,saved.at);assert.equal(r.walking,false);r.walkTo('exit');tick(r,.05);r.restoreCheckpoint();assert.deepEqual(r.at,saved.at);assert.equal(r.walking,false);
});
test('restore and reset actions are barriers; dedicated events fire once; automatic recovery loops are bounded',()=>{
 const m=base();m.logic.rules=[rule('save',{type:'start',source:null},[{kind:'checkpoint',name:'灯塔'}]),rule('bad',{type:'signal',source:'bad'},[{kind:'restore'},add]),rule('returned',{type:'restore',source:null},[add])];const r=new MapRuntime(m);emit(r,'bad');r.tick(0);assert.equal(r.logic.variables.n,1);assert.equal(r.logic.counts.bad,0);assert.equal(r.logic.counts.returned,1);
 m.logic.rules=[rule('loop',{type:'restore',source:null},[{kind:'restore'}])];const loop=new MapRuntime(m);loop.restoreCheckpoint();tick(loop,.2);assert.match(loop.logic.error,/连续重置/);
 m.logic.rules=[rule('local',{type:'signal',source:'reset'},[{kind:'reset',groupId:'a',returnPlayer:true},add])];const local=new MapRuntime(m);emit(local,'reset');tick(local,.1);assert.equal(local.logic.variables.n,0);assert.deepEqual(local.logic.snapshot().active,[]);
});
test('checkpoint data rejects changed maps and corrupted or injected continuations atomically',()=>{
 const m=base();m.logic.rules=[rule('waiting',{type:'start',source:null},[{kind:'wait',duration:1},add])];const r=new MapRuntime(m);r.requestCheckpoint('灯');r.tick(0);const saved=r.exportCheckpoint();
 for(const change of [s=>s.mapKey+='x',s=>s.at.index=10000,s=>s.poses.states.start={visible:false},s=>s.logic.variables.n=true,s=>s.logic.jobs[0].progress.children[0].action={kind:'message',text:'injected'},s=>s.logic.jobs[0].progress.children[0].until=Infinity,s=>s.animations.push({token:0}),s=>s.direction=[0,0,0]]){const s=structuredClone(saved);change(s);assert.equal(r.loadCheckpoint(s),false);assert.deepEqual(r.exportCheckpoint(),saved);}
 const changed=structuredClone(m);changed.objects[1].position[1]=1;assert.equal(new MapRuntime(changed).loadCheckpoint(saved),false);
});
test('full restore clears an active portal transition; spawn checkpoint and fallback origin both work',()=>{
 const m=portalGarden(),r=new MapRuntime(m);r.requestCheckpoint('岸边');r.tick(0);r.walkTo('portal-a');for(let i=0;i<400&&!r.portalState;i++)r.tick(.01);assert.ok(r.portalState);r.restoreCheckpoint();assert.equal(r.portalState,null);assert.equal(r.at.objectId,'start');assert.equal(r.walking,false);
 const fresh=new MapRuntime(base());walk(fresh,'road');fresh.restoreCheckpoint();assert.equal(fresh.at.objectId,'start');const spawn=base();spawn.objects[0].checkpoint={name:'出发地',face:0};assert.equal(new MapRuntime(spawn).checkpointInfo.name,'出发地');
});
test('local reset refuses an unsafe landing atomically; full restore still recovers the saved surface',()=>{
 const m=base();m.objects[1].state={walkable:false};m.objects[1].groupId='a';const r=new MapRuntime(m);r.setState('road','walkable',true);walk(r,'road');r.requestCheckpoint('临时平台');r.tick(0);r.setState('start','walkable',false);const before=structuredClone(r.poses),position=[...r.position];assert.equal(r.resetGroup('a',true),false);assert.deepEqual(r.poses,before);assert.deepEqual(r.position,position);assert.match(r.message,/安全落点/);assert.ok(r.restoreCheckpoint());assert.equal(r.at.objectId,'road');assert.equal(objectState(m,m.objects[0],r.poses).walkable,true);
});
test('deferred road closures survive a checkpoint and remain deferred until departure',()=>{
 const m=base(),r=new MapRuntime(m);r.setState('start','walkable',false);r.requestCheckpoint('待关闭的路');r.tick(0);const saved=r.exportCheckpoint();walk(r,'road');assert.equal(objectState(m,m.objects[0],r.poses).walkable,false);assert.ok(r.loadCheckpoint(saved));assert.equal(objectState(m,m.objects[0],r.poses).walkable,true);assert.equal(r.logicSnapshot().deferred.length,1);walk(r,'road');assert.equal(objectState(m,m.objects[0],r.poses).walkable,false);
});
test('local reset during a portal waits until arrival, then clears the pending onward route',()=>{
 const m=portalGarden();m.groups=[{id:'area',name:'area',pivot:[0,0,0]}];const r=new MapRuntime(m);r.requestCheckpoint('出发地');r.tick(0);r.walkTo('portal-a');for(let i=0;i<400&&!r.portalState;i++)r.tick(.01);r.resetGroup('area',true);r.walkTo('exit');assert.ok(r.portalState);tick(r,1);assert.equal(r.portalState,null);assert.equal(r.at.objectId,'start');assert.equal(r.walking,false);assert.equal(r.completed,false);
});
test('published schemas describe checkpoint fields, scope ownership and all recovery actions/events',()=>{
 const full=JSON.parse(readFileSync(new URL('../valley-of-light/maps/map.schema.json',import.meta.url))),compact=JSON.parse(readFileSync(new URL('../valley-of-light/maps/compact-map.schema.json',import.meta.url)));
 assert.equal(full.$defs.object.properties.checkpoint.$ref,'#/$defs/checkpoint');assert.equal(compact.$defs.object.properties.checkpoint.$ref,'map.schema.json#/$defs/checkpoint');
 for(const type of ['checkpoint','restore','reset']){assert.ok(full.$defs.logicEvent.properties.type.enum.includes(type));assert.ok(full.$defs.logicAction.oneOf.some(a=>a.properties.kind.const===type));}
 for(const kind of ['variables','rules'])assert.ok(full.$defs.logic.properties[kind].items.properties.resetGroup);
});
