import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s.startsWith('./')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {loadWorldMap,installWorldMap}=await import('../boxbound/world-map.ts');
installWorldMap(await loadWorldMap(new URL('../boxbound/levels/index.json',import.meta.url),async u=>JSON.parse(readFileSync(u))));
const {createGame,advanceGame,resetLevel,resetInterior,upgradeState}=await import('../boxbound/levels.ts');
const {transition,validState,copyState}=await import('../boxbound/model.ts');
const fresh=createGame(),dirs={w:[0,0,-1],a:[-1,0,0],s:[0,0,1],d:[1,0,0]};
const enter=n=>{let s=copyState(fresh);const b=s.boxes.find(b=>b.id===`pp-gateway-${n}`);s.player={room:b.room,pos:[b.pos[0],1,b.pos[2]],facing:dirs.w,route:[]};const r=advanceGame(s,{type:'dive'});assert.ok(r.changed,`${n} entry`);return r.state;};
test('all 49 new puzzles have valid spawn, reset only their interior, and return to the chapter',()=>{
 for(let n=107;n<=155;n++){
  const entered=enter(n);assert.ok(validState(entered),`${n} spawn`);assert.equal(entered.rooms[entered.player.room].level,n+10);
  let s=entered;for(const dir of Object.values(dirs))s=transition(s,{type:'move',dir}).state;
  const reset=resetLevel(s);assert.deepEqual(reset.player,entered.player,`${n} reset`);
  const left=advanceGame(reset,{type:'exit-level'});assert.ok(left.changed);assert.equal(left.state.player.room,fresh.boxes.find(b=>b.id===`pp-gateway-${n}`).room);
 }
});
const paths=JSON.parse(readFileSync(new URL('../boxbound/parabox-transfer-solutions.json',import.meta.url)));
for(const [id,path] of Object.entries(paths))test(`new chapter solution ${id} replays to completion`,()=>{
 let s=enter(Number(id));const level=Number(id)+10;
 // Rules depend on the current puzzle and its gateway, not unrelated museum rooms.
 const gate=s.boxes.find(b=>b.id===`pp-gateway-${id}`);
 s.boxes=s.boxes.filter(b=>s.rooms[b.room].level===level||b.id===gate.id);
 s.rooms=Object.fromEntries(Object.entries(s.rooms).filter(([key,r])=>r.level===level||key===gate.room));
 for(const c of path){const r=transition(s,{type:'move',dir:dirs[c]});assert.ok(r.changed,`${id} blocked ${c}`);s=r.state;}
 assert.ok(s.completed.includes(level));
});
test('revision 13 saves add the three chapters and new name without resetting progress',()=>{
 const old=copyState(fresh);old.rooms={...old.rooms,world:{...old.rooms.world,name:'口袋群岛'}};old.rulesRevision=13;old.completed=[1,11,116];
 for(const [id,r] of Object.entries(old.rooms))if(r.level>116||['pp-transfer','pp-open','pp-flip'].includes(id))delete old.rooms[id];
 old.boxes=old.boxes.filter(b=>old.rooms[b.room]&&(!b.inside||old.rooms[b.inside]));
 const next=upgradeState(old);assert.ok(validState(next));assert.equal(next.rooms.world.name,'新手村');assert.deepEqual(next.completed,old.completed);
 for(const b of old.boxes)assert.deepEqual(next.boxes.find(v=>v.id===b.id),b);
 assert.equal(next.boxes.length,fresh.boxes.length);
});

test('entry reset clones only local contents while retaining exported and imported boxes',()=>{
 const state=createGame(),gate=state.boxes.find(b=>b.id==='pp-gateway-1');
 state.completed=[11];
 const exported=state.boxes.find(b=>b.id==='pp-intro1-lr-1');exported.room=gate.room;exported.pos=[14,0,14];
 const foreign=state.boxes.find(b=>b.id==='island-weight');foreign.room=gate.inside;foreign.pos=[1,0,2];
 const before=structuredClone(state),calls=[],nativeClone=globalThis.structuredClone;
 try {
  globalThis.structuredClone=value=>{calls.push(value);return nativeClone(value);};
  const next=resetInterior(state,gate);
  assert.equal(next.rooms,state.rooms);assert.deepEqual(state,before);assert.deepEqual(next.completed,[11]);
  assert.deepEqual(next.boxes.filter(b=>b.room!==gate.inside),before.boxes.filter(b=>b.room!==gate.inside));
  assert.ok(next.boxes.some(b=>b.id===foreign.id));assert.equal(next.boxes.filter(b=>b.id===exported.id).length,1);
  assert.ok(calls.every(v=>Array.isArray(v)&&v.length<20),'no world-sized clone on entry');
 } finally {globalThis.structuredClone=nativeClone;}
 const first=resetInterior(createGame(),gate),crate=first.boxes.find(b=>b.room===gate.inside);
 const original=structuredClone(crate);crate.pos[0]+=1;
 assert.deepEqual(resetInterior(createGame(),gate).boxes.find(b=>b.id===crate.id),original);
});
