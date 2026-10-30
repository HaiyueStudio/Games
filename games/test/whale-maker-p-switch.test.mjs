import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&context.parentURL?.includes('/whale-maker/'))return next(specifier+'.ts',context);throw error;}}});
const {create,demo,step,EMPTY_INPUT}=await import('../whale-maker/rules/model.ts');
const {makeItem}=await import('../whale-maker/rules/expansion.ts');
const {switchObstacles}=await import('../whale-maker/rules/switches.ts');
const tick=(s,input={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...input});};
function flat(){const l=demo();l.cells.fill('.');delete l.contents;l.properties={};for(let y=15;y<l.height;y++)for(let x=0;x<l.width;x++)l.cells[y*l.width+x]='#';l.cells[14*l.width+95]='E';const s=create(l);Object.assign(s.player,{x:2,y:14.2});s.grounded=true;return s;}
const mob=(kind,x,vx=0,y=kind==='shell'?14.5:14.2)=>({kind,x,y,w:.8,h:kind==='shell'?.5:.8,vx,vy:0,alive:true,held:false,cooldown:0});
const addSwitch=(s,x=10,y=14)=>{const item=makeItem('p-switch',x,y);item.cooldown=0;s.items.push(item);return item;};

test('local obstacle queries observe pickup, release grace, activation, removal and movement immediately',()=>{
 const s=flat(),near=addSwitch(s,10),far=addSwitch(s,80),query=()=>switchObstacles(s,s.player,true,9,12);
 assert.deepEqual(query(),[near]);near.held=true;assert.deepEqual(query(),[]);
 near.held=false;near.thrown=true;near.cooldown=.2;assert.deepEqual(query(),[]);near.cooldown=0;assert.deepEqual(query(),[near]);
 near.spent=true;assert.deepEqual(query(),[]);near.spent=false;near.alive=false;assert.deepEqual(query(),[]);
 far.x=10.5;assert.deepEqual(query(),[far]);s.items=[];assert.deepEqual(query(),[]);
 const a=makeItem('pow',10,14),b=makeItem('basin',10,14);s.items=[a,b];assert.deepEqual(query(),[a,b]);
 assert.deepEqual(switchObstacles(s,a,false,9,12),[b]);b.held=true;assert.deepEqual(switchObstacles(s,a,false,9,12),[]);
});

test('thrown P switches rapidly lose speed and come to exact rest in front of both body sizes',()=>{
 for(const direction of [-1,1])for(const power of [0,1]){
  const s=flat(),item=addSwitch(s,10);s.power=power;s.facing=direction;Object.assign(s.player,{x:10,y:15-(power?1.4:.8),h:power?1.4:.8});tick(s,{grab:true});assert.equal(s.held,item);tick(s,{grab:true});tick(s,{fire:true});assert.equal(s.held,null);assert.equal(item.thrown,true);const x=item.x;let speed=Math.abs(item.vx),frames=0;
  assert.ok(speed>8&&speed<=12);while(item.thrown&&frames++<90){tick(s);assert.ok(Math.abs(item.vx)<=speed+1e-8);speed=Math.abs(item.vx);}assert.ok(frames<60);assert.equal(item.vx,0);assert.equal(item.vy,0);assert.equal(item.thrown,false);assert.ok(direction*(item.x-x)>0&&direction*(item.x-x)<3);assert.ok(Math.abs(item.y+item.h-15)<1e-8);const stopped=item.x;tick(s,{},180);assert.equal(item.x,stopped);assert.equal(s.pTime,0);assert.equal(item.spent,false);
 }
});

test('solid P switches block walking and running players from both sides without sliding away',()=>{
 for(const direction of [-1,1])for(const run of [false,true]){
  const s=flat(),item=addSwitch(s);Object.assign(s.player,{x:direction>0?8:12,y:14.2});if(run){const held=makeItem('pow',2,14);held.held=true;s.items.push(held);s.held=held;}tick(s,{axis:direction,grab:run},60);
  if(run)assert.equal(s.held.kind,'pow');
  assert.equal(s.player.vx,0);assert.ok(direction>0?s.player.x+s.player.w<=item.x+1e-7:s.player.x>=item.x+item.w-1e-7);assert.equal(item.x,10.1);assert.equal(item.vx,0);assert.equal(item.held,false);assert.equal(s.pTime,0);
 }
});

test('a player can pick up a P switch at its solid side boundary and throw it again',()=>{
 for(const direction of [-1,1]){
  const s=flat(),item=addSwitch(s);s.facing=direction;Object.assign(s.player,{x:direction>0?8:12,y:14.2});tick(s,{axis:direction},60);assert.equal(s.player.vx,0);tick(s,{grab:true});assert.equal(s.held,item);assert.equal(item.held,true);tick(s,{axis:direction,grab:true},12);assert.equal(s.held,item);tick(s,{fire:true});assert.equal(s.held,null);assert.equal(item.held,false);assert.equal(item.thrown,true);assert.equal(Math.sign(item.vx),direction);tick(s,{},100);assert.equal(item.thrown,false);assert.equal(item.vx,0);
 }
});

test('landing on the solid top triggers P, while underside and side contacts do not',()=>{
 const s=flat(),item=addSwitch(s);Object.assign(s.player,{x:10.2,y:13.3,vy:5});s.grounded=false;tick(s,{},10);assert.equal(item.spent,true);assert.ok(s.pTime>9.9);assert.equal(item.h,.18);assert.ok(s.player.vy<0);
 const under=flat(),ceiling=addSwitch(under);ceiling.y=11.2;Object.assign(under.player,{x:10.2,y:11.75,vy:-8});under.grounded=false;tick(under,{},3);assert.ok(under.player.y>=ceiling.y+ceiling.h-1e-7);assert.equal(under.pTime,0);assert.equal(ceiling.spent,false);
});

test('monsters and fast shells rebound from a P switch without pressing or destroying it',()=>{
 for(const direction of [-1,1])for(const kind of ['duck','turtle','spiky','shell']){
  const s=flat(),item=addSwitch(s),e=mob(kind,direction>0?9.1:11.1,direction*(kind==='shell'?12:1.5));s.enemies=[e];tick(s,{},35);assert.ok(e.vx*direction<0);assert.ok(e.alive&&item.alive);assert.equal(item.x,10.1);assert.equal(item.vx,0);assert.equal(item.spent,false);assert.equal(s.pTime,0);assert.equal(s.coins,0);assert.equal(s.defeated.length,0);
 }
});

test('monsters and shells landing on a P switch press it, then settle on the floor after it disappears',()=>{
 for(const kind of ['duck','turtle','spiky','shell']){const s=flat(),item=addSwitch(s),e=mob(kind,10.1,0,11.5);e.vy=4;s.enemies=[e];tick(s,{},120);assert.ok(Math.abs(e.y+e.h-15)<1e-7);assert.equal(e.vy,0);assert.equal(e.grounded,true);assert.equal(item.spent,true);assert.equal(item.alive,false);assert.ok(s.pTime>9);}
});

test('a thrown P switch stops against other bodies instead of passing through them',()=>{
 for(const direction of [-1,1])for(const kind of ['duck','shell','player']){
  const s=flat(),item=addSwitch(s);Object.assign(item,{x:direction>0?8.8:11.2,y:14.5,vx:direction*12,thrown:true});
  const target=kind==='player'?s.player:mob(kind,10);if(kind==='player')Object.assign(s.player,{x:10,y:14.2});else s.enemies=[target];tick(s,{},60);
  assert.equal(item.vx,0);assert.equal(item.thrown,false);assert.ok(direction>0?item.x+item.w<=target.x+1e-7:item.x>=target.x+target.w-1e-7);assert.equal(s.pTime,0);assert.equal(item.spent,false);assert.equal(s.phase,'playing');
 }
});

test('a P switch ceiling prevents standing, and pressed or held switches leave no solid obstacle',()=>{
 const s=flat(),ceiling=addSwitch(s);ceiling.y=13.5;s.power=1;Object.assign(s.player,{x:10.2,y:14.2,h:.8});s.crouching=true;tick(s);assert.equal(s.crouching,true);assert.equal(s.player.h,.8);
 for(const status of ['spent','held']){const pass=flat(),item=addSwitch(pass);item[status]=true;Object.assign(pass.player,{x:8,y:14.2});tick(pass,{axis:1},90);assert.ok(pass.player.x>item.x+item.w);assert.equal(pass.player.vx,5.5);}
});

test('P switch braking and collisions are deterministic across identical throw inputs',()=>{
 const runs=[];for(let n=0;n<2;n++){const s=flat(),item=addSwitch(s,4);Object.assign(s.player,{x:4,y:14.2});tick(s,{grab:true},2);tick(s,{fire:true});tick(s,{},120);runs.push(s);}assert.deepEqual(runs[0],runs[1]);
});
