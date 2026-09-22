import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s.startsWith('./')&&!/\.[a-z]+$/i.test(s)?s+'.ts':s,c);}});
const {installWorldMap,loadWorldMap,parseWorldMap}=await import('../boxbound/world-map.ts');
const authored=await loadWorldMap(new URL('../boxbound/levels/index.json',import.meta.url),async u=>JSON.parse(readFileSync(u)));installWorldMap(authored);
const {createGame,upgradeState}=await import('../boxbound/levels.ts');
const {transition,clone,gateCells,gateOpen,gateBlocks,gatePowered,solid,validState}=await import('../boxbound/model.ts');
const dirs={w:[0,0,-1],a:[-1,0,0],s:[0,0,1],d:[1,0,0]};
const walk=(s,path)=>{for(const c of path){const r=transition(s,{type:'move',dir:dirs[c]});assert.ok(r.changed,`blocked ${c} at ${s.player.pos}`);s=r.state;}return s;};
test('new village wall spans the map; the left plate and right crate provide a complete natural route',()=>{
 const s=createGame(),r=s.rooms.world,g=r.gates[0];assert.equal(g.width,3);assert.deepEqual(gateCells(g),[[7,0,12],[8,0,12],[9,0,12]]);
 for(let x=0;x<17;x++){
  assert.ok(solid(s,'world',[x,0,12]));
  const copy=clone(s);copy.player.pos=[x,0,13];
  for(const jump of [false,true])assert.equal(transition(copy,{type:'move',dir:dirs.w,jump}).changed,false,`wall x=${x},jump=${jump}`);
 }
 const pressed=walk(s,'aaaw');assert.deepEqual(pressed.player.pos,r.buttons[0].pos);assert.ok(gatePowered(pressed,'world',g));
 assert.ok(!gateOpen(walk(pressed,'s'),'world',g));
 const weighted=walk(s,'ddddwaaaaaa');assert.deepEqual(weighted.boxes.find(b=>b.id==='island-weight').pos,r.buttons[0].pos);
 const through=walk(weighted,'ddwww');assert.deepEqual(through.player.pos,[8,0,11]);assert.ok(validState(through));
});
test('configurable width covers every cell in either axis; any crate holds the entire gate down',()=>{
 for(const axis of ['x','z'])for(const width of [1,2,3,5]){
  const s=createGame(),r=s.rooms.world,g=r.gates[0];r.walls=[];r.barriers=[];r.decorations=[];g.pos=[3,0,3];g.axis=axis;g.width=width;
  const weight=s.boxes.find(b=>b.id==='island-weight');s.boxes=[weight];s.player.pos=[1,0,1];
  assert.ok(validState(s));const cells=gateCells(g);assert.equal(cells.length,width);
  for(const p of cells)assert.ok(gateBlocks(s,'world',p));
  for(const p of cells){weight.pos=[...p];assert.ok(gateOpen(s,'world',g));for(const cell of cells)assert.ok(!gateBlocks(s,'world',cell));}
 }
});
test('a wide gate recoils at the occupied end cell after the last crate clears, not at its anchor',()=>{
 const s=createGame(),g=s.rooms.world.gates[0],b=s.boxes.find(b=>b.id==='island-weight');b.pos=[9,0,12];s.player.pos=[9,0,13];
 const r=transition(s,{type:'move',dir:dirs.w});assert.ok(r.changed);assert.deepEqual(r.recoil.at,[9,0,12]);assert.deepEqual(r.state.player.pos,[9,0,13]);assert.deepEqual(r.state.boxes.find(v=>v.id===b.id).pos,[9,0,11]);assert.ok(!gateOpen(r.state,'world',g));
});
test('gate widths reject invalid values, off-map ends, wall/plate/decoration overlap and inter-gate overlap',()=>{
 for(const mutate of [g=>g.width=0,g=>g.width=1.5,g=>g.width=Infinity,g=>g.width=20,g=>g.pos=[16,0,12]]){
  const s=createGame();mutate(s.rooms.world.gates[0]);assert.equal(validState(s),false);
 }
 for(const kind of ['wall','plate','decoration','gate']){
  const s=createGame(),r=s.rooms.world,p=[9,0,12];
  if(kind==='wall')r.walls.push(p);if(kind==='plate')r.buttons[0].pos=p;if(kind==='decoration')r.decorations[0].pos=p;if(kind==='gate')r.gates.push({...r.gates[0],id:'other',pos:p,width:1});
  assert.equal(validState(s),false,kind);
 }
 const map=clone(authored),r=map.rooms.find(r=>r.id==='world');r.buttons[0].pos=[10,0,13];assert.throws(()=>parseWorldMap(map),/间隔/);
});
test('revision 15 replaces old wall plugs and preserves a crate already holding the old plate',()=>{
 for(const solved of [false,true]){
  const old=createGame();old.rulesRevision=15;old.completed=[1,11];old.moves=42;
  old.rooms.world.walls=[[6,0,12],[7,0,12],[9,0,12],[10,0,12]];old.rooms.world.barriers=clone(old.rooms.world.walls);
  old.rooms.world.gates[0].pos=[8,0,12];delete old.rooms.world.gates[0].width;old.rooms.world.buttons[0].pos=[8,0,14];
  old.boxes.find(b=>b.id==='island-weight').pos=solved?[8,0,14]:[7,0,14];
  const original=clone(old),next=upgradeState(old);assert.ok(validState(next));assert.equal(next.rulesRevision,16);assert.deepEqual(old,original);
  assert.deepEqual(next.completed,old.completed);assert.equal(next.moves,42);assert.deepEqual(next.rooms.world.walls,createGame().rooms.world.walls);
  assert.deepEqual(next.boxes.find(b=>b.id==='island-weight').pos,solved?[5,0,14]:[11,0,14]);assert.equal(gatePowered(next,'world',next.rooms.world.gates[0]),solved);
  assert.deepEqual(upgradeState(next),next);
 }
});
