import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,demo,step,respawn,EMPTY_INPUT,solid,tile}=await import('../whale-maker/rules/model.ts');
const {classicLevel}=await import('../whale-maker/rules/classic.ts');
const {grantPower}=await import('../whale-maker/rules/power.ts');
const {GOAL_HEIGHT}=await import('../whale-maker/rules/goal.ts');
const {releaseBridge}=await import('../whale-maker/rules/fortress.ts');
const {drawCoinPops}=await import('../whale-maker/rendering/brick-reactions.ts');
const tick=(s,n=1,i={})=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function flat(){const l=demo();l.cells.fill('.');l.contents={};l.properties={};l.warps=[];l.spawn=[2,14.2];for(let x=0;x<l.width;x++)for(let y=15;y<18;y++)l.cells[y*l.width+x]='#';l.cells[14*l.width+80]='E';return create(l);}
function head(s,center=10.5){Object.assign(s.player,{x:center-s.player.w/2,y:12.04,vx:0,vy:-8});s.grounded=false;s.coyote=0;s.previous={...EMPTY_INPUT};tick(s,1,{jump:true});}

test('pole is nine tiles and both first courses leave exactly eight empty columns after the last step',()=>{
 assert.equal(GOAL_HEIGHT,9);
 for(const l of [demo(),classicLevel()]){const end=l.cells.indexOf('E')%l.width;let step=-1;for(let x=end-1;x>=0;x--)if(['B','#'].includes(tile(l,x,7))){step=x;break;}assert.equal(end-step-1,8);}
});
test('rolling pearl bounces 1.5 tiles and moves away from the actual left/right impact position',()=>{
 for(const striker of [10.15,10.85]){
  const s=flat();for(let x=6;x<17;x++)s.level.cells[11*s.level.width+x]='B';
  const r={kind:'growth',x:10.1,y:10.2,w:.8,h:.8,vx:2,vy:0,age:1,originY:12};s.rewards.push(r);head(s,striker);
  assert.ok(r.vy< -8);assert.equal(Math.sign(r.vx),striker>10.5?-1:1);let top=r.y;
  for(let n=0;n<80&&r.vy<0;n++){tick(s);top=Math.min(top,r.y);}assert.ok(Math.abs(10.2-top-1.5)<.05,10.2-top);
 }
});
test('a rising brick lifts a nearby pearl when its animated top reaches it, not before',()=>{
 const s=flat();s.level.cells[11*s.level.width+10]='B';const r={kind:'growth',x:10.1,y:10.04,w:.8,h:.8,vx:0,vy:0,age:1,originY:12};s.rewards.push(r);head(s);assert.ok(r.vy>=0);tick(s,12);assert.ok(r.vy<0);assert.ok(r.bumpUntil>0);
});
test('static editor pearl becomes a rolling pearl after a hit; emerging pearls remain protected',()=>{
 const s=flat();s.level.cells[11*s.level.width+10]='B';s.level.cells[10*s.level.width+10]='G';head(s,10.85);assert.equal(tile(s.level,10,10),'.');assert.equal(s.rewards.length,1);assert.ok(s.rewards[0].vy<0);assert.ok(s.rewards[0].vx<0);
 const t=flat();t.level.cells[11*t.level.width+10]='?';t.level.contents[11*t.level.width+10]='growth';head(t);tick(t,10);assert.ok(t.rewards[0].age<.4);assert.equal(t.rewards[0].bumpUntil,undefined);
});
test('coins on hit bricks pop, flash and count once, including both seam blocks',()=>{
 const s=flat();for(const x of [10,11]){s.level.cells[11*s.level.width+x]='B';s.level.cells[10*s.level.width+x]='o';}head(s,11);assert.equal(s.coins,2);assert.equal(s.coinPops.length,2);assert.equal(s.bites.length,0);assert.equal(tile(s.level,10,10),'.');tick(s,12);assert.equal(s.coins,2);
 s.coinPops[0].age=.5;const draws=[],scene={centeredActor(...args){draws.push(['coin',...args]);},dustParticle(...args){draws.push(['glow',...args]);},fill(...args){draws.push(['ray',...args]);}};drawCoinPops(scene,s,0,4,48,{x:24,y:148});assert.ok(draws.some(d=>d[0]==='glow'));assert.ok(draws.filter(d=>d[0]==='ray').length>=8);
 tick(s,90);assert.equal(s.coinPops.length,0);assert.equal(s.coins,2);respawn(s);assert.equal(s.coinPops.length,0);
});
test('firebar has a solid one-tile pivot supporting characters and blocking the route',()=>{
 const s=flat();s.level.cells[12*s.level.width+10]='firebar';s.level.properties[12*s.level.width+10]={length:1,speed:0,phase:Math.PI};assert.ok(solid('firebar'));Object.assign(s.player,{x:10.18,y:9,vy:0});s.invincible=100;tick(s,80);assert.ok(s.grounded);assert.ok(Math.abs(s.player.y+s.player.h-12)<.001);
});
test('bridge release defeats the boss then walks, drops off the ledge, cheers and enters the castle without input',()=>{
 for(const power of [0,1,2,3]){
  const s=create(classicLevel(3));grantPower(s,power);const id=s.level.cells.indexOf('bridge-bell');Object.assign(s.player,{x:id%s.level.width+.5-s.player.w/2,y:11-s.player.h,vx:0,vy:0});s.grounded=true;
  releaseBridge(s,id);tick(s,100);assert.equal(s.phase,'won');assert.equal(s.victory.autoCastle,true);assert.equal(s.victory.stage,'approach');assert.equal(s.score,1100);const start=s.player.x;let fell=false;
  for(let n=0;n<900&&s.victory.stage!=='done';n++){tick(s);if(s.player.y+s.player.h>12)fell=true;}
  assert.equal(s.victory.stage,'done');assert.ok(s.player.x>start+5);assert.ok(fell);assert.equal(s.bosses[0].phase,'gone');assert.ok(Math.abs(s.player.y+s.player.h-15)<.001);assert.equal(s.bridgeDebris.length,0);
 }
});
test('second coin-room approach is clear for every form and its exit can be reached through real jumping',()=>{
 for(const power of [0,1,3]){
  const s=create(classicLevel(1));grantPower(s,power);for(let y=33;y<=35;y++)for(let x=11;x<=14;x++)assert.equal(solid(tile(s.level,x,y)),false);
  Object.assign(s.player,{x:11,y:38-s.player.h,vx:0,vy:0});s.grounded=true;tick(s,40,{axis:1,jump:true});tick(s,20,{axis:-1,jump:true});tick(s,120);assert.equal(s.phase,'playing');assert.ok(s.grounded);assert.ok(Math.abs(s.player.y+s.player.h-36)<.001);
  for(let n=0;n<180&&!s.pipe;n++){const delta=14-s.player.x-s.player.w/2;tick(s,1,{axis:Math.abs(delta)>.4?Math.sign(delta):0,down:Math.abs(delta)<.5});}
  assert.ok(s.pipe,`form ${power} can enter the unobstructed exit`);tick(s,120);assert.ok(s.player.y<15);assert.ok(s.player.x>=112&&s.player.x<114);assert.equal(s.phase,'playing');
 }
});
