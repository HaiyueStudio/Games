import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,EMPTY_INPUT,validate,respawn}=await import('../whale-maker/rules/model.ts');
const {makeEnemy,makeItem}=await import('../whale-maker/rules/expansion.ts');
const {placeCactus,cactusCells}=await import('../whale-maker/rules/desert.ts');
const {desertLevel}=await import('../whale-maker/rules/desert-level.ts');
const {heldAction}=await import('../whale-maker/rules/advanced.ts');
const {objectCells,moveSelection,stampSelection,pasteStamp}=await import('../whale-maker/editor/selection.ts');
const {categoryOf}=await import('../whale-maker/editor/catalog.ts');
const {backdropGround,setCell}=await import('../whale-maker/rules/terrain.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function level(sand=false){const width=100,height=32,cells=Array(width*height).fill('.');for(let y=20;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]=sand&&y<27?'quicksand':'#';cells[19*width+95]='E';return {version:1,name:'desert rules',backdrop:'desert',width,height,cells,properties:{},contents:{},spawn:[30,19.2]};}
function flat(sand=false){const s=create(level(sand));s.invincible=100;tick(s);return s;}

test('desert scene validates, keeps its background, reserves cactus height and restores after retry',()=>{
 const l=desertLevel();assert.deepEqual(validate(l),l);const s=create(l);assert.equal(s.level.backdrop,'desert');assert.equal(s.enemies.filter(e=>e.kind==='cactus').length,3);assert.ok(s.enemies.some(e=>e.h===5));assert.ok(s.items.some(e=>e.kind==='snowball'));respawn(s);assert.equal(s.level.backdrop,'desert');assert.equal(categoryOf('smile-cloud'),3);assert.equal(categoryOf('quicksand'),3);assert.equal(categoryOf('cactus'),0);assert.equal(categoryOf('snowball'),2);
});
test('desert scenery follows the sand surface instead of the hidden bottom, and painted sand refreshes the horizon',()=>{
 const l=level(true);assert.equal(backdropGround(l),20);for(let y=15;y<20;y++)for(let x=0;x<100;x++)setCell(l,y*100+x,'quicksand');assert.equal(backdropGround(l),15);for(let y=15;y<20;y++)for(let x=0;x<100;x++)setCell(l,y*100+x,'.');assert.equal(backdropGround(l),20);
});
test('sand sinks idle players at a quarter tile per second and halves the rate when moving',()=>{
 const a=flat(true),b=flat(true),ay=a.player.y,by=b.player.y;tick(a,{},120);tick(b,{axis:1},120);assert.ok(Math.abs(a.player.y-ay-.25)<1e-7);assert.ok(Math.abs(b.player.y-by-.125)<.003);assert.ok(a.grounded&&b.grounded);assert.equal(a.swimming,false);assert.ok(a.player.sandDepth>.25);
});
test('jump height halves only after sinking more than half a tile, and full burial kills despite invincibility',()=>{
 const jumpHeight=depth=>{const s=flat(true);s.player.y=20-s.player.h+depth;s.player.sandDepth=depth;s.player.sandSurface=20;s.grounded=true;const start=s.player.y;tick(s,{jump:true});let top=s.player.y;for(let n=0;n<180&&s.player.vy<0;n++){tick(s,{jump:true});top=Math.min(top,s.player.y);}return start-top;};
 const full=jumpHeight(.49),half=jumpHeight(.51);assert.ok(Math.abs(half/full-.5)<.025,[full,half]);const s=flat(true);s.starTime=100;tick(s,{},410);assert.equal(s.phase,'dead');assert.equal(s.player.sandDepth>=s.player.h-.01,true);
});
test('walking enemies, stationary items and rolling pearls share sinking and disappear when fully buried',()=>{
 const s=flat(true);s.player.x=40;s.player.y=19.2;for(let y=20;y<27;y++)for(let x=40;x<43;x++)s.level.cells[y*100+x]='#';const e=makeEnemy('duck',25,19),pow=makeItem('pow',16,19),r={kind:'growth',x:20,y:19.2,w:.8,h:.8,vx:2,vy:0,age:.4,originY:19,persistent:true};e.vx=1.5;s.enemies=[e];s.items=[pow];s.rewards=[r];const y=[e.y,pow.y,r.y];tick(s,{},120);assert.ok(Math.abs(e.y-y[0]-.125)<.004);assert.ok(Math.abs(pow.y-y[1]-.25)<.004);assert.ok(Math.abs(r.y-y[2]-.125)<.004);tick(s,{},720);assert.equal(e.alive,false);assert.equal(pow.alive,false);assert.equal(r.w,0);tick(s,{},120);assert.equal(s.defeated.length,0);
});
test('all resting physical items, including stars, keys and both springs, can be swallowed by sand',()=>{
 const s=flat(true);s.player.x=60;for(let y=20;y<27;y++)for(let x=60;x<63;x++)s.level.cells[y*100+x]='#';
 const kinds=['spring-h','spring-v','basin','pow','star','key','coin','giant-pearl','wood-crate','snowball'],items=kinds.map((kind,n)=>{const item=makeItem(kind,8+n*3,19);item.vx=item.vy=0;return item;});s.items=items;tick(s,{},1100);for(const item of items)assert.equal(item.alive,false,item.kind);assert.equal(s.phase,'playing');
});
test('deep sand also halves the jumping height of jumping enemies and launched physical items',()=>{
 function rise(depth,kind){const s=flat(true);s.player.x=60;for(let y=20;y<27;y++)for(let x=60;x<63;x++)s.level.cells[y*100+x]='#';let b;
  if(kind==='enemy'){b=makeEnemy('hammer-otter',30,19);b.vx=0;b.grounded=true;b.hammerJumpWait=0;b.hammerWait=100;s.enemies=[b];}
  else{b=makeItem('snowball',30,19);b.vy=-10;s.items=[b];}
  b.y=20-b.h+depth;b.sandDepth=depth;b.sandSurface=20;b.sandJumping=false;const start=b.y;tick(s);let top=b.y;for(let n=0;n<180&&b.vy<0;n++){tick(s);top=Math.min(top,b.y);}return start-top;
 }
 for(const kind of ['enemy','item']){const full=rise(.49,kind),half=rise(.51,kind);assert.ok(full>.5);assert.ok(Math.abs(half/full-.5)<.035,[kind,full,half]);}
});
test('landing from high above sand is arrested at the surface and solid support still stops sinking',()=>{
 const s=flat(true);s.player.y=10;s.player.vy=18;s.grounded=false;for(let n=0;n<100&&!s.grounded;n++)tick(s);assert.ok(s.player.sandDepth<.01);assert.equal(s.phase,'playing');const l=level(true);for(let x=0;x<100;x++)l.cells[21*100+x]='#';const t=create(l);t.power=1;t.player.h=2;t.player.y=18;tick(t,{},1200);assert.equal(t.phase,'playing');assert.ok(Math.abs(t.player.y+t.player.h-21)<.001);
});
test('cactus editor height, selecting body segments, copy, move and atomic resize preserve the whole stack',()=>{
 const l=level();assert.ok(placeCactus(l,10,19,5));const ids=cactusCells(l,1910);assert.equal(ids.length,5);assert.deepEqual(new Set(objectCells(l,10,16)),new Set(ids));const moved=moveSelection(l,new Set(ids),3,0);assert.ok(moved);const stamp=stampSelection(l,moved);assert.ok(pasteStamp(l,stamp,20,14));assert.deepEqual(validate(l),l);const before=structuredClone(l);l.cells[13*100+13]='B';assert.equal(placeCactus(l,13,19,7),false);l.cells[13*100+13]=before.cells[13*100+13];assert.deepEqual(l,before);const bad=structuredClone(l);bad.cells[17*100+13]='.';assert.throws(()=>validate(bad));
});
test('cactus slowly walks, body shots remove one segment and head shots kill the entire stack',()=>{
 for(const kind of ['fire','ice']){const s=flat(),e=makeEnemy('cactus',40,19,{height:4});s.enemies=[e];const x=e.x;tick(s,{},60);assert.ok(Math.abs(e.x-x+.3)<.02);const feet=e.y+e.h;s.shots=[{kind,x:e.x+.3,y:e.y+1.4,w:.28,h:.28,vx:0,vy:0}];tick(s);assert.equal(e.h,3);assert.equal(e.cactusSegments,3);assert.ok(Math.abs(e.y+e.h-feet)<.001);assert.ok(e.alive);assert.ok(s.effects.some(f=>f.kind==='cactus'));s.shots=[{kind,x:e.x+.3,y:e.y+.2,w:.28,h:.28,vx:0,vy:0}];tick(s);assert.equal(e.alive,false);assert.equal(s.shots.length,0);}
});
test('cactus ordinary contact is spiky, while spin jumps rebound safely',()=>{
 for(const spin of [false,true]){const s=flat(),e=makeEnemy('cactus',30,19,{height:3});e.vx=0;s.enemies=[e];s.invincible=0;s.player.y=e.y-s.player.h-.01;s.player.vy=5;s.grounded=false;s.spinning=spin;tick(s,spin?{spin:true}:{},3);assert.equal(e.alive,true);if(spin){assert.equal(s.phase,'playing');assert.ok(s.player.vy<0);}else assert.equal(s.phase,'dead');}
});
test('snowball blocks walking monsters, supports standing and can be pushed without touching the HUD',()=>{
 const s=flat(),snow=makeItem('snowball',35,19);snow.cooldown=0;s.items=[snow];const e=makeEnemy('duck',38,19);s.enemies=[e];tick(s,{},200);assert.ok(e.alive&&e.vx>0);assert.ok(e.x>=snow.x+snow.w-.01);s.enemies=[];s.player.x=35.1;s.player.y=16;s.player.vy=0;s.grounded=false;tick(s,{},120);assert.ok(s.grounded);assert.ok(Math.abs(s.player.y+s.player.h-snow.y)<.001);s.player.x=33;s.player.y=19.2;s.player.vx=0;const x=snow.x;tick(s,{axis:1},110);assert.ok(snow.x>x+2);assert.ok(s.player.x+s.player.w<=snow.x+.04);assert.ok(snow.alive);
});
test('snowball can be held, softly dropped or thrown at running speed, and shatters on the first enemy',()=>{
 const s=flat(),snow=makeItem('snowball',31,19);snow.cooldown=0;s.items=[snow];s.player.x=30.1;tick(s,{grab:true});assert.equal(s.held,snow);heldAction(s,{...EMPTY_INPUT,grab:true,fire:true});assert.equal(snow.vx,8.5);assert.equal(snow.thrown,true);assert.equal(s.held,null);const e=makeEnemy('duck',34,19),far=makeEnemy('duck',40,19);e.vx=far.vx=0;s.enemies=[e,far];tick(s,{},70);assert.equal(snow.alive,false);assert.equal(e.alive,false);assert.ok(far.alive);assert.ok(s.effects.length<=64);
 const t=flat(),other=makeItem('snowball',31,19);other.held=true;t.items=[other];t.held=other;heldAction(t,EMPTY_INPUT);assert.equal(other.vx,0);assert.equal(other.thrown,false);
});
test('carried snowball collides before player damage, and a side wall hit bumps its brick and kills supported enemies',()=>{
 const s=flat(),snow=makeItem('snowball',31,19);snow.held=true;s.items=[snow];s.held=snow;const e=makeEnemy('duck',31,19);e.vx=0;s.enemies=[e];s.invincible=0;tick(s,{grab:true});assert.equal(e.alive,false);assert.equal(snow.alive,false);assert.equal(s.phase,'playing');
 const t=flat(),ball=makeItem('snowball',8,18);Object.assign(ball,{vx:8.5,vy:0,thrown:true});t.items=[ball];t.player.x=2;t.level.cells[18*100+11]='B';t.level.cells[19*100+11]='B';const above=makeEnemy('duck',11,17);above.vx=0;t.enemies=[above];tick(t,{},60);assert.equal(ball.alive,false);assert.ok(t.bumps.some(b=>b.x===11)||t.events.some(e=>e.kind==='bump'));assert.equal(above.alive,false);assert.equal(t.level.cells[18*100+11],'B');
});
