import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&context.parentURL?.includes('/whale-maker/'))return next(specifier+'.ts',context);throw error;}}});
const {create,demo,step,EMPTY_INPUT}=await import('../whale-maker/rules/model.ts');
const tick=(s,input={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...input});};
function flat(){const l=demo();l.cells.fill('.');delete l.contents;l.properties={};for(let y=15;y<l.height;y++)for(let x=0;x<l.width;x++)l.cells[y*l.width+x]='#';l.cells[14*l.width+95]='E';const s=create(l);Object.assign(s.player,{x:2,y:14.2});s.grounded=true;s.invincible=10000;return s;}
const mob=(kind,x,vx=0,y=kind==='shell'?14.5:14.2)=>({kind,x,y,w:.8,h:kind==='shell'?.5:.8,vx,vy:0,alive:true,held:false,cooldown:0});
const penetration=(a,b)=>Math.min(a.x+a.w-b.x,b.x+b.w-a.x);

test('ordinary monsters meet solid bodies and turn away in either array order',()=>{
 for(const kindA of ['duck','turtle','spiky'])for(const kindB of ['duck','turtle','spiky'])for(const reverse of [false,true]){
  const s=flat(),left=mob(kindA,8,1.5),right=mob(kindB,9.1,-1.5);s.enemies=reverse?[right,left]:[left,right];tick(s,{},30);
  assert.ok(left.vx<0&&right.vx>0);assert.ok(left.x+left.w<=right.x+1e-7);assert.ok(left.alive&&right.alive);assert.equal(s.defeated.length,0);assert.equal(s.coins,0);
 }
});

test('a stationary shell blocks an approaching monster from either side without being pushed or kicked',()=>{
 for(const direction of [-1,1])for(const kind of ['duck','turtle','spiky']){
  const s=flat(),shell=mob('shell',10),walker=mob(kind,direction>0?8.9:11.1,direction*1.5);s.enemies=[walker,shell];tick(s,{},60);
  assert.equal(shell.x,10);assert.equal(shell.vx,0);assert.equal(shell.y,14.5);assert.ok(direction*walker.vx<0);assert.ok(penetration(walker,shell)<=1e-7);assert.ok(shell.alive&&walker.alive);assert.equal(s.coins,0);
 }
});

test('a faster follower turns around while the leading monster keeps walking away',()=>{
 const s=flat(),follower=mob('duck',8,2.4),leader=mob('turtle',9.05,.8);s.enemies=[leader,follower];tick(s,{},60);assert.ok(follower.vx<0);assert.equal(leader.vx,.8);assert.ok(follower.x+follower.w<leader.x);assert.equal(s.defeated.length,0);
});

test('monsters landing on another body or a stationary shell stay above its solid volume',()=>{
 for(const kind of ['shell','turtle']){const s=flat(),base=mob(kind,10),falling=mob('duck',10,0,11.5);falling.vy=4;s.enemies=[falling,base];tick(s,{},120);assert.ok(Math.abs(falling.y+falling.h-base.y)<1e-7);assert.equal(falling.vy,0);assert.equal(falling.grounded,true);assert.ok(base.alive&&falling.alive);assert.equal(base.x,10);assert.equal(s.defeated.length,0);}
});

test('exposed plants block other monsters while retracted, defeated and held bodies do not',()=>{
 const blocked=flat(),plant={...mob('plant',10,0,14),h:1,mode:'fixed',origin:[10,15]},walker=mob('duck',8.9,1.5);blocked.enemies=[plant,walker];tick(blocked,{},60);assert.ok(walker.vx<0);assert.equal(plant.x,10);
 for(const state of ['hidden','defeated','held']){
  const s=flat(),obstacle=state==='hidden'?{...mob('plant',10,0,14.985),h:.015,mode:'pipe',origin:[10,15],age:0}:mob('shell',10),walker=mob('duck',8.5,3);
  if(state==='defeated')obstacle.alive=false;if(state==='held')obstacle.held=true;s.enemies=[walker,obstacle];tick(s,{},100);assert.ok(walker.x>=11-1e-7);assert.equal(walker.vx,3);assert.equal(s.defeated.length,0);
 }
});

test('flying shells still defeat monsters and stationary shells once instead of bouncing off them',()=>{
 for(const direction of [-1,1])for(const kind of ['duck','turtle','spiky','shell'])for(const reverse of [false,true]){
  const s=flat(),projectile=mob('shell',direction>0?8.9:11.1,direction*12),target=mob(kind,10);s.enemies=reverse?[target,projectile]:[projectile,target];tick(s,{},6);assert.equal(target.alive,false);assert.equal(projectile.alive,true);assert.equal(projectile.vx,direction*12);assert.equal(s.defeated.length,1);assert.equal(s.defeated[0].cause,'shell');assert.equal(s.coins,2);tick(s,{},12);assert.equal(s.coins,2);
 }
});

test('two flying shells collide mutually, independent of storage order',()=>{
 for(const reverse of [false,true]){const s=flat(),left=mob('shell',10,12),right=mob('shell',11.1,-12);s.enemies=reverse?[right,left]:[left,right];tick(s,{},4);assert.equal(left.alive,false);assert.equal(right.alive,false);assert.equal(s.defeated.length,2);assert.equal(s.coins,4);}
});

test('a shell hitting an enemy this frame resolves before that enemy can hurt the player',()=>{
 for(const reverse of [false,true]){const s=flat();s.invincible=0;s.player.x=10.4;const shell=mob('shell',9.15,12),target=mob('duck',10);s.enemies=reverse?[target,shell]:[shell,target];tick(s);assert.equal(target.alive,false);assert.equal(shell.alive,true);assert.equal(s.phase,'playing');assert.equal(s.deaths,0);}
});

test('aquatic monsters turn on contact, and enemies at different heights keep their routes',()=>{
 const s=flat(),w=s.level.width;for(let y=9;y<15;y++)for(let x=0;x<30;x++)s.level.cells[y*w+x]='water';const left={...mob('fish',9,1.8,12),age:0,origin:[9,12]},right={...mob('fish',10.1,-1.8,12),age:0,origin:[10.1,12]};s.enemies=[right,left];tick(s,{},30);assert.ok(left.vx<0&&right.vx>0);assert.ok(left.x+left.w<=right.x+1e-7);
 const air=flat(),low=mob('turtle',10),high=mob('duck',9.5,3,11);air.enemies=[low,high];tick(air,{},12);assert.equal(high.vx,3);assert.equal(low.vx,0);assert.ok(high.y+high.h<low.y);assert.equal(air.defeated.length,0);
});

test('crowded monsters keep their order and cannot be pushed into walls or through each other',()=>{
 const results=[];
 for(const reverse of [false,true]){
  const s=flat();for(const x of [8,13])for(let y=10;y<15;y++)s.level.cells[y*s.level.width+x]='#';
  const enemies=[mob('duck',9,1.5),mob('turtle',9.85,-1.5),mob('spiky',10.7,1.5),mob('duck',11.55,-1.5)];s.enemies=reverse?[...enemies].reverse():enemies;
  for(let n=0;n<600;n++){tick(s);for(const e of enemies){assert.ok(e.x>=9-1e-7&&e.x+e.w<=13+1e-7);assert.ok(e.alive);}for(let i=1;i<enemies.length;i++){assert.ok(enemies[i-1].x<enemies[i].x);assert.ok(penetration(enemies[i-1],enemies[i])<.001);}}
  results.push(enemies.map(e=>[e.x,e.y,e.vx,e.vy]));
 }
 assert.deepEqual(results[0],results[1]);
});
