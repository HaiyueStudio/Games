import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&context.parentURL?.includes('/whale-maker/'))return next(specifier+'.ts',context);throw error;}}});
const {create,demo,validate,step,EMPTY_INPUT,tile,respawn}=await import('../whale-maker/rules/model.ts');
const {makeEnemy,makeItem}=await import('../whale-maker/rules/expansion.ts');
const {placeStone,collectKey}=await import('../whale-maker/rules/adventure.ts');
const {objectCells,moveSelection,stampSelection,pasteStamp,clearCells}=await import('../whale-maker/editor/selection.ts');
const tick=(s,input={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...input});};
function level(){const l=demo();l.cells.fill('.');l.properties={};l.contents={};for(let x=0;x<l.width;x++)for(let y=15;y<l.height;y++)l.cells[y*l.width+x]='#';l.cells[14*l.width+200]='E';l.spawn=[2,14.2];return l;}
function flat(){const s=create(level());tick(s,{},2);return s;}
const put=(l,x,y,t)=>l.cells[y*l.width+x]=t;
const jumpUnder=(s,x=8.15)=>{Object.assign(s.player,{x,y:13.05,h:.8,vy:-8});s.grounded=false;s.coyote=0;tick(s,{jump:true},4);};

test('small helmet breaks ordinary bricks, including both actual seam contacts, without changing size or consuming helmet',()=>{
 for(const seam of [false,true]){const s=flat();s.helmet=true;put(s.level,8,12,'B');if(seam)put(s.level,9,12,'B');jumpUnder(s,seam?8.7:8.15);assert.equal(tile(s.level,8,12),'.');assert.equal(s.fragments.length,seam?8:4);assert.equal(s.player.h,.8);assert.equal(s.power,0);assert.equal(s.helmet,true);if(seam)assert.equal(tile(s.level,9,12),'.');}
 const normal=flat();put(normal.level,8,12,'B');jumpUnder(normal);assert.equal(tile(normal.level,8,12),'B');assert.equal(normal.fragments.length,0);assert.equal(normal.bumps.length,1);
});
test('hidden bricks pass side and top movement, reveal once only from below, and use configurable rewards',()=>{
 for(const content of ['coin','fire','key','duck','spiky','empty']){
  const l=level();put(l,8,12,'hidden-block');l.contents[12*l.width+8]=content;assert.deepEqual(validate(l),l);const s=create(l);jumpUnder(s);assert.equal(tile(s.level,8,12),'U');assert.equal(s.rewards.length,content==='empty'?0:1);if(content!=='empty')assert.equal(s.rewards[0].kind,content);const count=s.rewards.length;jumpUnder(s);assert.equal(s.rewards.length,count);assert.equal(s.level.contents[12*l.width+8],undefined);
 }
 const side=flat();put(side.level,8,14,'hidden-block');Object.assign(side.player,{x:7,y:14.2});tick(side,{axis:1},65);assert.ok(side.player.x>9);assert.equal(tile(side.level,8,14),'hidden-block');
 const top=flat();put(top.level,8,12,'hidden-block');Object.assign(top.player,{x:8.1,y:10.8,vy:4});top.grounded=false;tick(top,{},80);assert.equal(top.player.y,14.2);assert.equal(tile(top.level,8,12),'hidden-block');
});
test('hidden block content survives editor move/copy/undo data and retry restores unrevealed blueprint',()=>{
 const l=level(),id=12*l.width+8;put(l,8,12,'hidden-block');l.contents[id]='key';const s=create(l);jumpUnder(s);respawn(s);assert.equal(tile(s.level,8,12),'hidden-block');assert.equal(s.level.contents[id],'key');
 const moved=moveSelection(l,new Set([id]),2,0),stamp=stampSelection(l,moved);pasteStamp(l,stamp,14,12);assert.equal(l.contents[12*l.width+14],'key');assert.deepEqual(validate(l),l);
});
test('keys collect once, trail behind through turns, and clear on retry',()=>{
 const l=level();put(l,4,14,'key');const s=create(l);s.player.x=4;tick(s);assert.equal(s.keys.length,1);assert.equal(s.items.length,0);tick(s,{axis:1},120);assert.ok(s.keys[0].x<s.player.x);tick(s,{axis:-1},120);assert.ok(s.keys[0].x>s.player.x);assert.ok(s.keyTrail.length<=160);respawn(s);assert.equal(s.keys.length,0);assert.equal(s.keyTrail.length,0);assert.equal(s.items.length,1);
});
test('locked doors consume exactly one key only on a paired successful entry and retain unlock for that life',()=>{
 const s=flat(),w=s.level.width;put(s.level,3,14,'locked-door');put(s.level,12,14,'door');s.player.x=3;tick(s,{interact:true});assert.equal(s.door,null);collectKey(s,2,14);collectKey(s,2,14);tick(s);tick(s,{interact:true});assert.ok(s.door);assert.equal(s.keys.length,1);tick(s,{interact:true},90);assert.equal(s.keys.length,1);assert.equal(s.unlockedDoors[14*w+3],true);s.player.x=3;s.doorWait=0;tick(s);tick(s,{interact:true});assert.ok(s.door);assert.equal(s.keys.length,1);
 const bad=flat();put(bad.level,3,14,'locked-door');bad.player.x=3;collectKey(bad,2,14);tick(bad,{interact:true});assert.equal(bad.door,null);assert.equal(bad.keys.length,1);assert.deepEqual(bad.unlockedDoors,{});
});
test('upward spikes block harmless sides and underside but hurt on their top; four-sided spikes hurt every side',()=>{
 for(const t of ['^','spike-all'])for(const side of ['left','right','bottom','top']){
  const s=flat();put(s.level,8,12,t);s.grounded=false;s.coyote=0;
  if(side==='left')Object.assign(s.player,{x:7.3,y:12.1,vx:5.5});
  if(side==='right')Object.assign(s.player,{x:9.05,y:12.1,vx:-5.5});
  if(side==='bottom')Object.assign(s.player,{x:8.1,y:13.05,vy:-8});
  if(side==='top')Object.assign(s.player,{x:8.1,y:11.15,vy:6});
  tick(s,side==='left'?{axis:1}:side==='right'?{axis:-1}:{},5);assert.equal(s.phase,t==='spike-all'||side==='top'?'dead':'playing',t+' '+side);if(t==='^'&&side==='bottom')assert.ok(s.player.y>=13);
 }
});
test('vines catch on up, stop when idle, climb both ways, animate only while moving, and allow jump release',()=>{
 const s=flat();for(let y=7;y<15;y++)put(s.level,5,y,'vine');s.player.x=5.15;tick(s,{interact:true},30);assert.equal(s.climbing,true);const high=s.player.y,age=s.climbAge;assert.ok(high<14);tick(s,{},30);assert.equal(s.player.y,high);assert.equal(s.climbAge,age);tick(s,{down:true},12);assert.ok(s.player.y>high);assert.equal(s.crouching,false);tick(s,{jump:true});assert.equal(s.climbing,false);assert.ok(s.player.vy<0);assert.ok(s.climbWait>0);tick(s,{interact:true},5);assert.equal(s.climbing,false);respawn(s);assert.equal(s.climbing,false);
});
test('a 2x2 stone is one editable object with persistent direction and rejects incomplete JSON',()=>{
 const l=level();assert.equal(placeStone(l,8,8),true);l.properties[8*l.width+8].direction='left';assert.equal(objectCells(l,9,9).length,4);assert.deepEqual(validate(l),l);const moved=moveSelection(l,new Set(objectCells(l,9,9)),4,1);assert.equal(moved.size,4);assert.equal(l.properties[9*l.width+12].direction,'left');const stamp=stampSelection(l,moved);pasteStamp(l,stamp,20,8);assert.equal(l.properties[8*l.width+20].direction,'left');assert.deepEqual(validate(l),l);const bad=structuredClone(l);bad.cells[8*l.width+21]='.';assert.throws(()=>validate(bad));clearCells(l,objectCells(l,21,9));assert.equal(tile(l,20,8),'.');assert.deepEqual(validate(l),l);
});
function stoneState(direction){const l=level();placeStone(l,10,direction==='down'?8:13);l.properties[(direction==='down'?8:13)*l.width+10].direction=direction;return create(l);}
test('stones detect perpendicular distance, alert at 3 and attack within 2 even far along the attack axis',()=>{
 for(const direction of ['left','right','down']){
  const s=stoneState(direction),stone=s.stones[0];Object.assign(s.player,direction==='down'?{x:20,y:14.2}:{x:direction==='left'?2:30,y:9.2});tick(s);assert.equal(stone.phase,'idle');
  Object.assign(s.player,direction==='down'?{x:13.25,y:14.2}:{x:direction==='left'?2:30,y:10.9});tick(s);assert.equal(stone.phase,'alert');
  Object.assign(s.player,direction==='down'?{x:12.5,y:14.2}:{x:direction==='left'?2:30,y:12});tick(s);assert.equal(stone.phase,'charge');
  put(s.level,30,10,'#');put(s.level,31,10,'#');Object.assign(s.player,{x:30,y:9.2,vy:0});
  if(direction!=='down')for(let y=10;y<15;y++)put(s.level,direction==='left'?6:16,y,'#');
  for(let n=0;n<120&&stone.phase==='charge';n++)tick(s);assert.equal(stone.phase,'pause');const stopped=[stone.x,stone.y];tick(s,{},60);assert.equal(stone.phase,'return');assert.ok(Math.hypot(stone.x-stopped[0],stone.y-stopped[1])<.2);tick(s,{},1200);assert.deepEqual([stone.x,stone.y],stone.origin);assert.equal(stone.phase,'idle');
 }
});
test('players land and walk on stones; basin helmet blocks stone attacks and head-bumps push the stone up',()=>{
 const s=stoneState('down'),stone=s.stones[0];Object.assign(s.player,{x:10.5,y:6.9,vy:5});s.grounded=false;tick(s,{},15);assert.equal(s.phase,'playing');assert.equal(s.player.y+s.player.h,stone.y);assert.equal(s.grounded,true);tick(s,{axis:1},12);assert.equal(s.player.y+s.player.h,stone.y);
 const helmet=stoneState('down'),rock=helmet.stones[0];helmet.helmet=true;Object.assign(helmet.player,{x:10.5,y:10.05,vy:-7});helmet.grounded=false;tick(helmet);assert.equal(helmet.phase,'playing');assert.equal(helmet.helmet,true);assert.equal(rock.phase,'knocked');tick(helmet,{},12);assert.ok(rock.y<8);assert.equal(helmet.power,0);
 const bare=stoneState('down');Object.assign(bare.player,{x:10.5,y:11,vy:0});bare.grounded=false;tick(bare,{},20);assert.equal(bare.phase,'dead');
});
test('retry restores stone positions, keys, locks, vines and hidden bricks deterministically',()=>{
 const l=level();placeStone(l,10,8);put(l,4,14,'key');put(l,8,12,'hidden-block');const s=create(l);s.stones[0].y=12;s.stones[0].phase='return';collectKey(s,3,14);s.unlockedDoors[42]=true;s.climbing=true;respawn(s);const fresh=create(l);for(const k of ['stones','keys','keyTrail','unlockedDoors','climbing','climbAge'])assert.deepEqual(s[k],fresh[k]);assert.deepEqual(s.level,fresh.level);
});
test('horizontal springs rebound walking monsters from both sides, retain the new direction and independently affect crowds',()=>{
 for(const kind of ['duck','turtle','spiky','fish','squid','shell'])for(const direction of [-1,1]){
  const s=flat();put(s.level,10,14,'spring-h');const e=makeEnemy(kind,10,14);Object.assign(e,{x:direction===-1?9.6:10.75,y:14.2,h:.8,vx:direction===-1?1.5:-1.5,vy:0});if(kind==='shell'){e.h=.5;e.y=14.5;e.vx=direction===-1?12:-12;}if(kind==='fish'||kind==='squid')for(let y=10;y<15;y++)for(let x=4;x<18;x++)if(tile(s.level,x,y)==='.')put(s.level,x,y,'water');s.enemies=[e];tick(s);assert.equal(Math.sign(e.vx),direction,kind);assert.equal(Math.abs(e.vx),9.6,kind);assert.equal(e.alive,true);assert.ok(e.springWait>0);assert.ok(s.springEffects.length);tick(s,{},32);assert.equal(Math.sign(e.vx),direction,kind+' retained direction');assert.ok(Math.abs(e.vx)<=12);
 }
 const s=flat();put(s.level,10,14,'spring-h');s.player.x=9.5;s.enemies=[{...makeEnemy('duck',10,14),x:10.7,vx:-1.5}];tick(s);assert.ok(s.player.vx<0);assert.ok(s.enemies[0].vx>0);assert.equal(s.phase,'playing');
});
test('a flat horizontal rebound travels 40 percent less than the former neutral-input distance',()=>{
 const s=flat();put(s.level,10,14,'spring-h');s.player.x=9.5;tick(s);const start=s.player.x;tick(s,{},120);const distance=start-s.player.x,oldDistance=16*.35+16*16/(2*90);assert.ok(Math.abs(distance/oldDistance-.6)<.025,[distance,oldDistance]);assert.equal(s.player.vx,0);
});
