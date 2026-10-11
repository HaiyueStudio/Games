import test from 'node:test';
import assert from 'node:assert/strict';
import {logicGarden,emptyMap,createObject,MapRuntime,parseMap,serializeMap,serializeCompactMap,analyzeStaticPaths,objectState,centerIndex,findRoute,playIssues} from '../valley-of-light/map/model.ts';
const rule=(id,event,actions,condition={kind:'all',conditions:[]},once=true)=>({id,name:id,enabled:true,once,event,condition,actions});
const base=()=>{const m=emptyMap();m.objects=[createObject(9,'start'),createObject(1,'road',[1,0,0]),createObject(10,'exit',[2,0,0])];m.logic={variables:[{id:'count',name:'计数',initial:0},{id:'flag',name:'标志',initial:false}],rules:[]};return m;};
const count={kind:'variable',id:'count',operation:'add',value:1};
const tick=(r,seconds)=>{for(let i=0;i<Math.ceil(seconds/.01);i++)r.tick(.01);};
const walk=(r,id)=>{assert.ok(r.walkTo(id),`walk ${id}: ${r.message}`);for(let i=0;i<4000&&(r.walking||r.busy);i++)r.tick(.01);assert.equal(r.walking,false);};

test('full and compact maps preserve typed nested logic and initial states',()=>{
 const m=logicGarden();assert.deepEqual(playIssues(parseMap(m)),[]);assert.equal(serializeMap(parseMap(JSON.parse(serializeCompactMap(m)))),serializeMap(m));
 const without=base();delete without.logic;assert.equal('logic' in JSON.parse(serializeMap(without)),false);
});
test('logic validation rejects dangling references, mixed types, excessive trees, and invalid state values',()=>{
 const cases=[m=>m.logic.rules[0].event={type:'switch',source:'missing'},m=>m.logic.rules[0].actions=[{...count,id:'missing'}],m=>m.logic.rules[0].condition={kind:'variable',id:'count',op:'eq',value:false},m=>m.logic.rules[0].actions=[{kind:'variable',id:'flag',operation:'add',value:true}],m=>m.logic.rules[0].actions=[{kind:'move',groupId:'missing',translation:[0,0,0],rotation:[0,0,0],duration:1,easing:'smooth'}],m=>m.logic.rules[0].actions=[{kind:'rule',ruleId:'missing',enabled:false}],m=>m.logic.variables[0].id='__proto__',m=>m.logic.variables[0].id='start',m=>m.objects[0].state={visible:'yes'},m=>{for(let i=0;i<8;i++)m.logic.rules[0].condition={kind:'not',condition:m.logic.rules[0].condition};}];
 for(const change of cases){const m=base();m.logic.rules=[rule('test',{type:'start',source:null},[count])];change(m);assert.throws(()=>parseMap(m));}
});
test('start, all/any/not, boolean toggle and variable-change cascades have deterministic order',()=>{
 const m=base();m.logic.rules=[rule('start-rule',{type:'start',source:null},[{kind:'variable',id:'flag',operation:'toggle',value:false},count]),rule('changed',{type:'variable',source:'count'},[{kind:'message',text:'条件满足'}],{kind:'all',conditions:[{kind:'variable',id:'count',op:'gte',value:1},{kind:'any',conditions:[{kind:'variable',id:'flag',op:'eq',value:true},{kind:'not',condition:{kind:'variable',id:'count',op:'eq',value:1}}]}]})];
 const r=new MapRuntime(parseMap(m));assert.equal(r.logic.variables.flag,true);assert.equal(r.logic.variables.count,1);assert.equal(r.message,'条件满足');assert.equal(r.logic.counts.changed,1);
 const fresh=new MapRuntime(m);assert.deepEqual(fresh.logic.variables,r.logic.variables);assert.equal(m.logic.variables[0].initial,0);
});
test('all conditions for one event see state before that event actions, once is consumed only on success',()=>{
 const m=base();m.logic.rules=[rule('increment',{type:'signal',source:'step'},[count],{kind:'all',conditions:[]},false),rule('after-one',{type:'signal',source:'step'},[{kind:'message',text:'第二次事件'}],{kind:'variable',id:'count',op:'eq',value:1})];const r=new MapRuntime(m);
 r.logic.emit({type:'signal',source:'step'});r.tick(0);assert.equal(r.logic.counts['after-one'],undefined);r.logic.emit({type:'signal',source:'step'});r.tick(0);assert.equal(r.logic.counts['after-one'],1);assert.equal(r.logic.variables.count,2);assert.equal(r.message,'第二次事件');
});
test('enter and leave fire once per path surface, independent of multiple internal waypoints',()=>{
 const m=base();m.logic.rules=[rule('enter-road',{type:'enter',source:'road',face:0},[count],undefined,false),rule('leave-road',{type:'leave',source:'road',face:0},[count],undefined,false),rule('wrong-face',{type:'enter',source:'road',face:1},[count])];const r=new MapRuntime(m);walk(r,'exit');assert.equal(r.logic.variables.count,2);assert.equal(r.logic.counts['wrong-face'],undefined);
});
test('queued events run in order, with earlier event actions visible to later conditions',()=>{
 const m=base();m.logic.rules=[rule('leaving',{type:'leave',source:'start'},[count]),rule('arriving',{type:'enter',source:'road'},[{kind:'message',text:'已离开出生点'}],{kind:'variable',id:'count',op:'eq',value:1})];const r=new MapRuntime(m);walk(r,'road');assert.equal(r.logic.counts.arriving,1);assert.equal(r.message,'已离开出生点');
});
test('switches can act as condition-only inputs without legacy actions',()=>{
 const m=base();m.objects[1]=createObject(8,'road',[1,0,0]);m.logic.rules=[rule('check',{type:'enter',source:'exit'},[count],{kind:'switch',objectId:'road',value:true})];assert.deepEqual(playIssues(m),[]);const r=new MapRuntime(m);walk(r,'exit');assert.equal(r.logic.variables.count,1);
});
test('sequence waits; parallel waits for every branch; disabling a rule does not cancel its already running sequence',()=>{
 const m=base();m.logic.rules=[rule('delayed',{type:'start',source:null},[{kind:'parallel',actions:[{kind:'sequence',actions:[{kind:'wait',duration:.2},count]},{kind:'wait',duration:.4}]},{kind:'rule',ruleId:'delayed',enabled:false},count])];const r=new MapRuntime(m);tick(r,.19);assert.equal(r.logic.variables.count,0);tick(r,.02);assert.equal(r.logic.variables.count,1);tick(r,.2);assert.equal(r.logic.variables.count,2);assert.equal(r.logic.enabled.delayed,false);assert.equal(r.logic.error,null);
});
test('group animations queue per group, finish events run, and movement carries the traveler',()=>{
 const m=base();m.groups=[{id:'lift',name:'lift',pivot:[0,0,0]}];m.objects[0].groupId='lift';const move=(y,duration)=>({kind:'move',groupId:'lift',translation:[0,y,0],rotation:[0,0,0],duration,easing:'linear'});
 m.logic.rules=[rule('moving',{type:'start',source:null},[{kind:'parallel',actions:[move(1,.2),move(2,.2)]},count]),rule('arrive',{type:'group',source:'lift'},[count],undefined,false)];const r=new MapRuntime(m);tick(r,.2);assert.ok(Math.abs(r.position[1]-1)<1e-6);assert.equal(r.logic.variables.count,1);tick(r,.21);assert.ok(Math.abs(r.position[1]-2)<1e-6);assert.equal(r.logic.variables.count,3);
});
test('a delayed animation waits for the occupied edge endpoint instead of snapping the traveler backward',()=>{
 const m=base();m.groups=[{id:'g',name:'g',pivot:[0,0,0]}];m.objects[1].groupId='g';m.logic.rules=[rule('delayed',{type:'start',source:null},[{kind:'wait',duration:.07},{kind:'move',groupId:'g',translation:[0,1,0],rotation:[0,0,0],duration:.3,easing:'linear'}])];const r=new MapRuntime(m);r.walkTo('exit');tick(r,.08);assert.ok(r.position[0]>.15);let before=r.position[0];for(let i=0;i<100;i++){r.tick(.01);assert.ok(r.position[0]>=before-1e-8);before=r.position[0];}assert.equal(r.walking,false);
});
test('closing the occupied path is deferred, closes after leaving, and blocks return routes',()=>{
 const m=base();m.logic.rules=[rule('close',{type:'enter',source:'road'},[{kind:'state',targetId:'road',property:'walkable',value:false}])];const r=new MapRuntime(m);walk(r,'road');assert.equal(objectState(m,m.objects[1],r.poses).walkable,true);assert.equal(r.logicSnapshot().deferred.length,1);walk(r,'exit');assert.equal(objectState(m,m.objects[1],r.poses).walkable,false);assert.equal(findRoute(m,r.poses,r.at,'start'),null);
});
test('closing a future path cancels stale routes at a safe node; group state affects descendants and attached gates',()=>{
 const m=base();m.groups=[{id:'g',name:'g',pivot:[0,0,0]}];m.objects[2].groupId='g';m.logic.rules=[rule('close',{type:'enter',source:'road'},[{kind:'state',targetId:'g',property:'visible',value:false}])];const r=new MapRuntime(m);walk(r,'exit');assert.equal(r.completed,false);assert.equal(r.at.objectId,'road');assert.equal(objectState(m,m.objects[2],r.poses).visible,false);assert.equal(r.walkTo('exit'),false);
 const garden=logicGarden(),game=new MapRuntime(garden);game.setState('gate-road','visible',false);assert.equal(objectState(garden,garden.objects.find(o=>o.id==='gate-a'),game.poses).visible,false);
});
test('handwheel is gated by enabled state and emits only after a snapped release',()=>{
 const m=base(),wheel=createObject(3,'wheel',[0,0,2]);wheel.state={enabled:false};m.objects.push(wheel);m.logic.rules=[rule('turned',{type:'mechanism',source:'wheel'},[count],{kind:'mechanism',objectId:'wheel',op:'gte',value:90},false)];const r=new MapRuntime(m);assert.equal(r.dragTo('wheel',90,true),false);r.setState('wheel','enabled',true);assert.ok(r.dragTo('wheel',100));assert.equal(r.logic.variables.count,0);assert.ok(r.dragTo('wheel',100,true));assert.equal(r.poses.mechanisms.wheel,90);assert.equal(r.logic.variables.count,1);
});
test('two switches in order unlock the portal after the animation, portal completion unlocks exit, restart resets all state',()=>{
 const m=parseMap(logicGarden()),original=serializeMap(m),r=new MapRuntime(m);assert.equal(r.walkTo('exit'),false);assert.equal(r.canDrag('wheel'),false);walk(r,'first');assert.equal(r.logic.variables.progress,1);walk(r,'second');tick(r,1.5);assert.equal(r.logic.variables.progress,2);assert.equal(r.canDrag('wheel'),true);assert.equal(objectState(m,m.objects.find(o=>o.id==='gate-a'),r.poses).enabled,true);walk(r,'exit');assert.equal(r.logic.variables.visits,1);assert.equal(r.completed,true);assert.equal(serializeMap(m),original);const restarted=new MapRuntime(m);assert.equal(restarted.walkTo('exit'),false);assert.equal(restarted.logic.variables.progress,0);assert.equal(restarted.logic.variables.visits,0);
});
test('a disabled portal already in a route is checked again before entry',()=>{
 const m=logicGarden(),r=new MapRuntime(m);r.setState('gate-a','enabled',true);assert.ok(r.walkTo('gate-a'));r.setState('gate-a','enabled',false);tick(r,5);assert.equal(r.at.objectId,'gate-road');assert.equal(r.portalState,null);assert.equal(r.walking,false);
});
test('unlocking an exit while the traveler is already standing on its marker completes without another click',()=>{
 const m=base();m.objects[2].state={enabled:false};m.logic.rules=[rule('unlock',{type:'start',source:null},[{kind:'wait',duration:1.5},{kind:'state',targetId:'exit',property:'enabled',value:true}])];const r=new MapRuntime(m);walk(r,'exit');assert.equal(r.completed,false);assert.match(r.message,/出口尚未开启/);tick(r,1);assert.equal(r.completed,true);
});
test('hiding portal hosts during transfer keeps both landings until the traveler safely leaves',()=>{
 const m=logicGarden(),r=new MapRuntime(m);walk(r,'first');walk(r,'second');tick(r,1.5);assert.ok(r.walkTo('gate-a'));for(let i=0;i<500&&!r.portalState;i++)r.tick(.01);assert.ok(r.portalState);r.setState('gate-road','visible',false);r.setState('arrival','visible',false);assert.equal(r.logicSnapshot().deferred.length,2);tick(r,.85);assert.equal(r.at.objectId,'arrival');assert.equal(objectState(m,m.objects.find(o=>o.id==='arrival'),r.poses).visible,true);assert.equal(objectState(m,m.objects.find(o=>o.id==='gate-road'),r.poses).visible,false);walk(r,'exit');assert.equal(objectState(m,m.objects.find(o=>o.id==='arrival'),r.poses).visible,false);
});
test('runaway signal cycles stop with diagnostics rather than blocking a frame',()=>{
 const m=base();m.logic.rules=[rule('ignite',{type:'start',source:null},[{kind:'signal',name:'loop'}]),rule('looping',{type:'signal',source:'loop'},[{kind:'signal',name:'loop'}],undefined,false)];const r=new MapRuntime(m);assert.match(r.logic.error,/循环/);assert.equal(r.logic.snapshot().active.length,0);assert.ok(r.walkTo('road'));tick(r,1);assert.equal(r.at.objectId,'road');
});
test('static merging excludes hidden targets, descendants of moved groups, and their attached pillars',()=>{
 const m=base();m.groups=[{id:'g',name:'g',pivot:[0,0,0]}];m.objects[1].groupId='g';const pillar=createObject(12,'pillar');pillar.attachment={pathId:'road',corner:0};m.objects.push(pillar,createObject(1,'hidden',[4,0,0]),createObject(1,'static',[5,0,0]));m.logic.rules=[rule('motion',{type:'start',source:null},[{kind:'parallel',actions:[{kind:'move',groupId:'g',translation:[0,1,0],rotation:[0,0,0],duration:1,easing:'smooth'},{kind:'state',targetId:'hidden',property:'visible',value:false}]}])];
 assert.deepEqual(analyzeStaticPaths(m).batches.flat().map(i=>m.objects[i].id),['static']);assert.doesNotThrow(()=>parseMap(JSON.parse(serializeCompactMap(m))));
});
