import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,demo,step,EMPTY_INPUT,tile}=await import('../whale-maker/rules/model.ts');
const {makeItem,makeEnemy}=await import('../whale-maker/rules/expansion.ts');
const {toggleColor}=await import('../whale-maker/rules/advanced.ts');
const {ironGait,drawIronTurtle,drawCannon}=await import('../whale-maker/rendering/advanced.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function flat(){const l=demo();l.cells.fill('.');l.properties={};l.contents={};l.spawn=[2,14.2];for(let y=15;y<l.height;y++)for(let x=0;x<l.width;x++)l.cells[y*l.width+x]='#';l.cells[14*l.width+200]='E';const s=create(l);tick(s);return s;}
const put=(s,x,y,t)=>s.level.cells[y*s.level.width+x]=t;
const mob=(kind,x,y=14.2)=>({...makeEnemy(kind,x-.1,y-.2),x,y,vx:0,cooldown:0});

test('newly solid color blocks defeat overlapping enemies once, but never kill mere edge contact',()=>{
 for(const redOn of [true,false]){
  const s=flat();s.redOn=redOn;put(s,8,14,redOn?'blue-block':'red-block');put(s,12,14,redOn?'red-block':'blue-block');
  const inside=mob('duck',8.1),edge=mob('turtle',7.2),old=mob('duck',12.1);s.enemies=[inside,edge,old];toggleColor(s);
  assert.equal(inside.alive,false);assert.ok(edge.alive);assert.ok(old.alive);assert.equal(s.defeated.length,1);assert.equal(s.defeated[0].cause,'block');assert.equal(s.coins,1);
  toggleColor(s);toggleColor(s);assert.equal(s.defeated.filter(e=>e.x===8.1).length,1);
 }
 const s=flat();put(s,8,14,'blue-block');s.stones=[{x:8,y:13,w:2,h:2,vx:0,vy:0,origin:[8,13],direction:'down',phase:'idle',timer:0}];toggleColor(s);assert.equal(s.stones.length,0);assert.ok(s.effects.some(e=>e.kind==='stone'));
});
test('solidification removes items and emerging rewards, including held and ridden object references',()=>{
 for(const kind of ['pow','basin','spring-v','p-switch','star','coin','key']){
  const s=flat();put(s,8,14,'blue-block');const item=makeItem(kind,8,14);s.items=[item];
  if(kind==='basin')s.riding=item;else{s.held=item;item.held=true;}
  s.rewards=[{kind:'growth',x:8.1,y:14.1,w:.8,h:.8,vx:0,vy:0,age:.4,originY:15},{kind:'fire',x:10,y:14,w:.8,h:.8,vx:0,vy:0,age:.4,originY:15}];
  toggleColor(s);assert.equal(item.alive,false);assert.equal(s.items.length,0);assert.equal(s.held,null);assert.equal(s.riding,null);assert.equal(s.rewards.length,1);assert.equal(s.rewards[0].kind,'fire');assert.equal(s.shake,0);
 }
});
test('fireballs bounce on brick tops and undersides, while side impacts explode',()=>{
 for(const t of ['B','?','U','red-block','blue-block'])for(const face of ['top','bottom','left','right']){
  const s=flat();if(t==='blue-block')s.redOn=false;put(s,8,13,t);
  const shot={x:face==='left'?7.7:face==='right'?9.01:8.3,y:face==='top'?12.7:face==='bottom'?14.01:13.2,w:.28,h:.28,vx:face==='left'?5.5:face==='right'?-5.5:0,vy:face==='top'?4:face==='bottom'?-8:0};s.shots=[shot];tick(s);
  if(face==='top'||face==='bottom'){assert.equal(s.shots.length,1,`${t} ${face}`);assert.ok(face==='top'?shot.vy<0:shot.vy>0);assert.equal(s.effects.filter(e=>e.kind==='fire').length,0);}
  else{assert.equal(s.shots.length,0,`${t} ${face}`);assert.equal(s.effects.filter(e=>e.kind==='fire').length,1);}
  assert.equal(tile(s.level,8,13),t);
 }
});
test('a fireball can melt the actual ice support without melting a merely adjacent tile',()=>{
 const s=flat();put(s,8,13,'B');put(s,9,13,'ice');s.shots=[{x:8.69,y:12.7,w:.28,h:.28,vx:0,vy:4}];tick(s);assert.equal(tile(s.level,9,13),'ice');assert.equal(s.shots.length,1);
 put(s,8,13,'ice');s.shots=[{x:8.3,y:12.7,w:.28,h:.28,vx:0,vy:4}];tick(s);assert.equal(tile(s.level,8,13),'.');assert.equal(s.shots.length,1);assert.ok(s.effects.some(e=>e.kind==='ice'));
});
test('a fast shell from either side activates POW and the visible ground blast',()=>{
 for(const direction of [-1,1]){
  const s=flat(),pow=makeItem('pow',10,14),shell=mob('shell',direction>0?8:12),target=mob('duck',18);shell.h=.45;shell.y=14.55;shell.vx=direction*12;s.items=[pow];s.enemies=[shell,target];tick(s,{},25);
  assert.equal(pow.alive,false);assert.equal(target.alive,false);assert.equal(s.items.length,0);assert.ok(s.shake>0);assert.equal(s.defeated.filter(e=>e.kind==='duck'&&e.cause==='pow').length,1);
 }
 const s=flat(),pow=makeItem('pow',10,14),shell=mob('shell',9.2);shell.h=.45;shell.y=14.55;s.items=[pow];s.enemies=[shell];tick(s,{},30);assert.ok(pow.alive);
});
test('thrown POW explodes on floor or wall impact even without a direct enemy hit',()=>{
 for(const wall of [false,true]){
  const s=flat(),pow=makeItem('pow',8,wall?11:14);Object.assign(pow,{thrown:true,vx:12,vy:wall?-3:2});s.items=[pow];if(wall)put(s,10,11,'B');tick(s,{},wall?15:2);assert.equal(pow.alive,false);assert.ok(s.shake>0);assert.equal(s.items.length,0);
 }
});
test('opposing and overtaking cannonballs pass through without stopping, turning or pushing',()=>{
 for(const reverse of [false,true])for(const same of [false,true]){
  const s=flat(),a=mob('cannonball',8,10),b=mob('cannonball',10,10);a.vx=5;b.vx=same?2:-5;s.enemies=reverse?[b,a]:[a,b];tick(s,{},120);
  assert.ok(a.alive&&b.alive);assert.ok(a.x>b.x);assert.equal(a.vx,5);assert.equal(b.vx,same?2:-5);assert.ok(Math.abs(a.x-13)<.00001);assert.ok(Math.abs(b.x-(same?12:5))<.00001);assert.equal(s.defeated.length,0);
 }
});
test('all four iron turtle legs have the same stride and lift; facing mirrors the complete rig',()=>{
 const phases=Array.from({length:8},(_,n)=>ironGait((n+.001)/12,true));
 const amplitudes=Array.from({length:4},(_,leg)=>{const xs=phases.map(p=>p[leg].x),ys=phases.map(p=>p[leg].y);return [Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];});
 for(const [stride,lift]of amplitudes){assert.ok(stride>0&&lift>0);assert.ok(Math.abs(stride-amplitudes[0][0])<.0001);assert.ok(Math.abs(lift-amplitudes[0][1])<.0001);}
 assert.deepEqual(ironGait(1,false),Array.from({length:4},()=>({x:0,y:0})));
 const record=vx=>{const parts=[];drawIronTurtle({centeredActor(...args){parts.push(args);}}, {vx,age:.12},100,200,58);return parts;},left=record(-1.5),right=record(1.5);
 assert.equal(left.length,6);for(let i=0;i<6;i++){assert.ok(Math.abs(left[i][2]+right[i][2]-200)<.0001);assert.equal(left[i][3],right[i][3]);assert.equal(left[i][8],false);assert.equal(right[i][8],true);}
});
test('the cannon top meets the shaft rather than floating above its collision volume',()=>{
 const calls=[];drawCannon({sprite(){},actor(...args){calls.push(args);}}, {h:3},100,200,48,true);const [, , ,feet,size]=calls[0];assert.ok(feet-size>=199);assert.ok(feet>248);
});
