import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,EMPTY_INPUT,respawn}=await import('../whale-maker/rules/model.ts');
const {makeEnemy,makeItem}=await import('../whale-maker/rules/expansion.ts');
const {grantPower}=await import('../whale-maker/rules/power.ts');
const {writePipe}=await import('../whale-maker/rules/pipes.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function course(){const width=60,height=24,cells=Array(width*height).fill('.');for(let y=20;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[19*width+58]='E';return {version:1,name:'轻放铁盆与食人花重力',width,height,cells,spawn:[10,19.2]};}

test('releasing Shift places a basin outside every player form, and it stays put after cooldown expires',()=>{
 for(const power of [0,1,2,3,4])for(const direction of [-1,1]){
  const s=create(course()),pan=makeItem('basin',10,19);grantPower(s,power);s.grounded=true;s.facing=direction;pan.held=true;s.held=pan;s.items=[pan];s.previous.grab=true;
  tick(s);assert.equal(s.held,null);assert.equal(pan.held,false);assert.equal(pan.vx,0);assert.ok(direction>0?pan.x>=s.player.x+s.player.w+.025:pan.x+pan.w<=s.player.x-.025);
  const x=pan.x,playerX=s.player.x;tick(s,{},600);assert.equal(s.player.x,playerX);assert.equal(pan.x,x);assert.equal(pan.vx,0);assert.equal(pan.vy,0);assert.ok(Math.abs(pan.y+pan.h-20)<1e-8);assert.equal(s.phase,'playing');
 }
});

test('resting against a basin does not kick it, while walking toward it deliberately kicks it away',()=>{
 for(const direction of [-1,1]){
  const s=create(course()),pan=makeItem('basin',10,19);pan.cooldown=0;s.items=[pan];Object.assign(s.player,{x:direction>0?pan.x-s.player.w:pan.x+pan.w,y:19.2,vx:0,vy:0});s.grounded=true;s.facing=direction;
  tick(s,{},120);assert.equal(pan.vx,0);const x=pan.x;tick(s,{axis:direction},8);assert.equal(pan.vx,direction*12);assert.ok((pan.x-x)*direction>0);
 }
});

test('Shift cannot catch a rolling or thrown basin from either side, even after its release cooldown',()=>{
 for(const direction of [-1,1])for(const thrown of [false,true]){
  const s=create(course()),pan=makeItem('basin',10,19);pan.cooldown=0;pan.thrown=thrown;pan.vx=direction*12;pan.x=direction>0?s.player.x-pan.w-.015:s.player.x+s.player.w+.015;s.items=[pan];s.invincible=100;
  tick(s,{grab:true},2);assert.equal(s.held,null);assert.equal(pan.held,false);assert.equal(pan.vx,direction*12);
 }
});

test('a falling basin cannot be grabbed in midair; holding Shift picks it up only after it lands',()=>{
 const s=create(course()),pan=makeItem('basin',10,19);Object.assign(pan,{x:s.player.x,y:18.9,vy:3,cooldown:0});s.items=[pan];s.invincible=100;
 tick(s,{grab:true},2);assert.equal(s.held,null);assert.ok(pan.vy>0);
 tick(s,{grab:true},90);assert.equal(s.held,pan);assert.equal(pan.held,true);assert.equal(pan.vx,0);assert.equal(pan.vy,0);
});

test('a stopped basin at its solid collision boundary can still be picked up, worn and thrown',()=>{
 for(const action of ['wear','throw']){
  const s=create(course()),pan=makeItem('basin',11,19);pan.cooldown=0;s.items=[pan];s.player.x=pan.x-s.player.w;s.grounded=true;tick(s,{grab:true});assert.equal(s.held,pan);
  if(action==='wear'){tick(s,{grab:true,interact:true});assert.equal(s.helmet,true);assert.equal(pan.alive,false);}
  else{tick(s,{grab:true,fire:true});assert.equal(s.held,null);assert.equal(pan.thrown,true);assert.equal(pan.vx,12);}
 }
});

test('independent plants fall from their editor position, land without drifting and reset to the blueprint',()=>{
 const l=course();l.cells[10*60+20]='plant';const s=create(l),plant=s.enemies[0];assert.equal(plant.y,10);const x=plant.x;
 tick(s,{},30);assert.ok(plant.y>10.7);assert.ok(plant.vy>0);tick(s,{},210);assert.ok(plant.grounded);assert.equal(plant.y+plant.h,20);assert.equal(plant.x,x);assert.equal(plant.vx,0);tick(s,{},120);assert.equal(plant.y+plant.h,20);
 respawn(s);assert.equal(s.enemies[0].y,10);assert.equal(s.enemies[0].vy,0);assert.equal(l.cells[10*60+20],'plant');
});

test('plants land on bricks, one-way platforms and solid items, then fall again when support is removed',()=>{
 for(const support of ['B','=','basin']){
  const l=course();l.cells[10*60+20]='plant';if(support!=='basin')l.cells[15*60+20]=support;else l.cells[19*60+20]='basin';const s=create(l),plant=s.enemies[0];
  tick(s,{},240);const top=support==='basin'?s.items[0].y:15;assert.ok(plant.grounded);assert.ok(Math.abs(plant.y+plant.h-top)<1e-8,support);
  if(support==='basin')s.items[0].alive=false;else s.level.cells[15*60+20]='.';tick(s,{},180);assert.equal(plant.y+plant.h,20,support);assert.equal(plant.x,20.1);
 }
});

test('a falling independent plant rests on another enemy without driving it into the floor',()=>{
 const s=create(course()),plant=makeEnemy('plant',20,10),duck=makeEnemy('duck',20,19);duck.vx=0;s.enemies=[plant,duck];tick(s,{},240);
 assert.ok(plant.alive&&duck.alive);assert.ok(plant.grounded);assert.ok(Math.abs(plant.y+plant.h-duck.y)<1e-7);assert.equal(duck.y+duck.h,20);assert.equal(plant.x,20.1);
});

test('plants attached to pipes stay anchored through their full cycle in all four orientations',()=>{
 for(const rotation of [0,90,180,270]){
  const l=course();l.properties={};writePipe(l,20,10,3,rotation);l.properties[10*60+20].plant=true;const s=create(l),plant=s.enemies[0],mouth=[...plant.plantMouth],normal=[...plant.plantDirection];
  for(let n=0;n<480;n++){tick(s);assert.deepEqual(plant.plantMouth,mouth);assert.equal(plant.vy,0);assert.ok(Math.abs(normal[0]?(normal[0]>0?plant.x-mouth[0]:plant.x+plant.w-mouth[0]):(normal[1]>0?plant.y-mouth[1]:plant.y+plant.h-mouth[1]))<1e-8);}
 }
});
