import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,EMPTY_INPUT}=await import('../whale-maker/rules/model.ts');
const {makeEnemy,makeItem}=await import('../whale-maker/rules/expansion.ts');
const {grantPower}=await import('../whale-maker/rules/power.ts');
const {freezeEnemy}=await import('../whale-maker/rules/frost.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function flat(){const width=60,height=24,cells=Array(width*height).fill('.');for(let y=20;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[19*width+58]='E';return create({version:1,name:'横弹簧与铁盆',width,height,cells,spawn:[2,19.2]});}

test('small, tall and giant players land, rest, walk and jump on horizontal springs without a sideways launch',()=>{
 for(const power of [0,1,3])for(const direction of [-1,1]){
  const s=flat(),spring=makeItem('spring-h',10,19);s.items=[spring];grantPower(s,power);
  Object.assign(s.player,{x:spring.x+(spring.w-s.player.w)/2,y:spring.y-s.player.h-1,vy:6});
  tick(s,{},90);assert.equal(s.grounded,true);assert.ok(Math.abs(s.player.y+s.player.h-spring.y)<1e-8);assert.equal(s.player.vx,0);assert.equal(s.wallKick,0);assert.equal(s.springEffects.length,0);
  tick(s,{axis:direction},10);assert.equal(s.grounded,true);assert.ok(s.player.vx*direction>0);assert.equal(s.wallKick,0);assert.equal(spring.compression??0,0);
  tick(s,{jump:true});assert.ok(s.player.vy< -10);assert.equal(s.grounded,false);assert.equal(s.wallKick,0);assert.equal(s.springEffects.length,0);
 }
});

test('falling enemies and stationary shells are supported on the spring top without rebounding sideways',()=>{
 for(const kind of ['duck','turtle','shell','spiky','iron-turtle','bomb','hammer-otter']){
  const s=flat(),spring=makeItem('spring-h',10,19),e=makeEnemy(kind,10,17);s.items=[spring];s.enemies=[e];
  Object.assign(e,{x:spring.x,y:spring.y-e.h-.8,vx:0,vy:12});if(kind==='shell')e.h=.5;
  tick(s,{},90);assert.ok(e.alive,kind);assert.ok(e.grounded,kind);assert.equal(e.vx,0,kind);assert.equal(e.vy,0,kind);assert.ok(Math.abs(e.y+e.h-spring.y)<1e-8,kind);assert.equal(s.springEffects.length,0,kind);
 }
});

test('walking enemies cross the top without turning or receiving a launch impulse',()=>{
 for(const direction of [-1,1]){
  const s=flat(),spring=makeItem('spring-h',10,19),e=makeEnemy('duck',10,18);s.items=[spring];s.enemies=[e];
  Object.assign(e,{x:spring.x,y:spring.y-e.h,vx:direction*1.5,vy:0,grounded:true});tick(s,{},24);
  assert.equal(e.vx,direction*1.5);assert.ok(e.grounded);assert.equal(s.springEffects.length,0);
 }
});

test('side faces still rebound players and enemies in both directions',()=>{
 for(const direction of [-1,1])for(const actor of ['player','enemy']){
  const s=flat(),spring=makeItem('spring-h',10,19);s.items=[spring];const b=actor==='player'?s.player:makeEnemy('duck',10,19);if(actor==='enemy')s.enemies=[b];
  Object.assign(b,{x:direction>0?spring.x+spring.w-.01:spring.x-b.w+.01,y:20-b.h,vx:-direction*1.5,vy:0});tick(s);
  assert.equal(b.vx,direction*9.6);assert.ok(spring.compression>0);if(actor==='player')assert.ok(s.wallKick>0);else assert.ok(b.springLaunch>0);
 }
});

test('legacy tile springs also support top landings, while held springs provide no support',()=>{
 const s=flat();s.level.cells[19*60+10]='spring-h';Object.assign(s.player,{x:10.1,y:17,vy:10});tick(s,{},90);assert.ok(s.grounded);assert.ok(Math.abs(s.player.y+s.player.h-19.6)<1e-8);assert.equal(s.wallKick,0);
 const held=flat(),spring=makeItem('spring-h',10,19);spring.held=true;held.items=[spring];Object.assign(held.player,{x:10.1,y:17,vy:10});tick(held,{},90);assert.ok(Math.abs(held.player.y+held.player.h-20)<1e-8);
});

function underneath(power=0,kind='duck'){
 const s=flat(),e=makeEnemy(kind,10,14);s.enemies=[e];grantPower(s,power);s.helmet=true;
 Object.assign(e,{y:14,vx:0,vy:0});Object.assign(s.player,{x:10,y:e.y+e.h+.07,vy:-9});s.grounded=false;return {s,e};
}

test('an ascending helmet defeats enemies from below in every player form and keeps the helmet',()=>{
 for(const power of [0,1,2,3,4])for(const kind of ['duck','turtle','shell','spiky','iron-turtle','bomb','hammer-otter','cactus']){
  const {s,e}=underneath(power,kind);tick(s,{},2);assert.equal(e.alive,false,`${power} ${kind}`);assert.equal(s.helmet,true);assert.equal(s.power,power);assert.equal(s.phase,'playing');assert.equal(s.defeated.length,1);assert.equal(s.defeated[0].cause,'block');assert.ok(s.defeated[0].vy<0);assert.ok(s.player.vy<0);assert.equal(s.effects.some(f=>f.kind==='helmet'),false);
  tick(s,{},10);assert.equal(s.defeated.length,1);assert.ok(s.defeated[0].age>0);assert.ok(s.defeated[0].y<14);
 }
});

test('a frozen enemy can be head-bonked at its solid underside without requiring penetration',()=>{
 const {s,e}=underneath(1);freezeEnemy(s,e);s.player.y=e.y+e.h+.01;tick(s);
 assert.equal(e.alive,false);assert.equal(s.helmet,true);assert.equal(s.power,1);assert.equal(s.phase,'playing');assert.equal(s.defeated[0].cause,'block');
});

test('side contact and falling head contact consume the helmet before body power; a bare head cannot attack',()=>{
 const side=underneath(1);side.s.player.y=side.e.y+.3;tick(side.s);assert.ok(side.e.alive);assert.equal(side.s.helmet,false);assert.equal(side.s.power,1);
 const falling=underneath(1);Object.assign(falling.s.player,{y:falling.e.y+falling.e.h-.01,vy:1});tick(falling.s);assert.ok(falling.e.alive);assert.equal(falling.s.helmet,false);assert.equal(falling.s.power,1);
 const bare=underneath();bare.s.helmet=false;tick(bare.s,{},2);assert.ok(bare.e.alive);assert.equal(bare.s.phase,'dead');
});
