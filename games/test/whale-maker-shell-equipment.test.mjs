import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,EMPTY_INPUT,validate,respawn,services,CONTENTS,CONTENT_NAMES}=await import('../whale-maker/rules/model.ts');
const {makeItem,makeEnemy}=await import('../whale-maker/rules/expansion.ts');
const {placeCannon,heldAction,dropHelmet}=await import('../whale-maker/rules/advanced.ts');
const {placeStone}=await import('../whale-maker/rules/adventure.ts');
const {SHELL_TOOLS,equipShellHelmet,mountBoneShell,boneRest}=await import('../whale-maker/rules/shell-equipment.ts');
const {spawnContent}=await import('../whale-maker/rules/containers.ts');
const {categoryTools}=await import('../whale-maker/editor/catalog.ts');
const {changeArea}=await import('../whale-maker/rules/p2-areas.ts');
const {playerArt}=await import('../whale-maker/rendering/player.ts');
const {equipWearable}=await import('../whale-maker/rules/p2-wearables.ts');
const {grantPower}=await import('../whale-maker/rules/power.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function level(){const width=60,height=24,cells=Array(width*height).fill('.');for(let y=20;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[19*width+58]='E';return {version:1,name:'龟壳装备',width,height,cells,spawn:[2,19.2]};}
const flat=()=>create(level());
function mounted(s=flat()){const item=makeItem('bone-shell',10,19);s.items.push(item);s.player.x=10.1;mountBoneShell(s,item);return s;}
function pool(kind,dynamic=false){const l=level();for(let y=17;y<20;y++)for(let x=8;x<26;x++)l.cells[y*60+x]=kind;if(dynamic)l.liquid={kind,mode:'cycle',low:17,high:14,period:12,x:8,width:18};const s=create(l),item=makeItem('bone-shell',12,15);s.items.push(item);s.player.x=12.1;mountBoneShell(s,item);s.grounded=false;return s;}

test('all three items are editable, survive JSON validation and use the shared container spawn path',()=>{
 assert.equal(CONTENTS.length,CONTENT_NAMES.length);
 const l=level();l.contents={};SHELL_TOOLS.forEach((kind,n)=>{l.cells[19*60+10+n]=kind;l.cells[14*60+10+n]='?';l.contents[14*60+10+n]=kind;assert.ok(categoryTools(2).includes(kind));});
 const decoded=validate(JSON.parse(JSON.stringify(l))),s=create(decoded);assert.deepEqual(s.items.map(i=>i.kind),SHELL_TOOLS);assert.deepEqual(s.startLevel.contents,l.contents);
 for(const kind of SHELL_TOOLS){const item=spawnContent(s,kind,30,15);assert.equal(item.kind,kind);assert.ok(s.items.includes(item));}
});

test('shell helmets equip on contact or from carried items and replace the single head slot',()=>{
 for(const kind of SHELL_TOOLS.slice(0,2)){
  const s=flat(),item=makeItem(kind,2,19);item.cooldown=0;s.items=[item];s.helmet=true;tick(s);assert.equal(s.shellHelmet,kind);assert.equal(s.helmet,false);assert.equal(item.alive,false);
  const carried=flat(),hat=makeItem(kind,2,19);hat.held=true;carried.items=[hat];carried.held=hat;tick(carried,{interact:true,grab:true});assert.equal(carried.shellHelmet,kind);assert.equal(carried.held,null);
  services.hurt(carried,'top');assert.equal(carried.phase,'playing');assert.equal(carried.shellHelmet,null);assert.equal(carried.effects.at(-1).headgear,kind);
 }
});

test('both shell helmets defeat enemies from below and break ordinary bricks without being consumed',()=>{
 for(const kind of SHELL_TOOLS.slice(0,2)){
  const s=flat(),e=makeEnemy('spiky',10,14);e.vx=0;s.enemies=[e];equipShellHelmet(s,kind);Object.assign(s.player,{x:10,y:e.y+e.h+.03,vy:-9});s.grounded=false;tick(s,{},2);assert.equal(e.alive,false);assert.equal(s.shellHelmet,kind);assert.equal(s.phase,'playing');
  const brick=flat();equipShellHelmet(brick,kind);brick.level.cells[15*60+10]='B';Object.assign(brick.player,{x:10.1,y:16.02,vy:-9});tick(brick,{},2);assert.equal(brick.level.cells[15*60+10],'.');assert.equal(brick.shellHelmet,kind);
 }
});

test('every helmet absorbs one ordinary hit from every direction before any body power is lost',()=>{
 for(const gear of ['basin',...SHELL_TOOLS.slice(0,2)])for(const power of [0,1,2,3,4,5,6,7])for(const direction of ['top','side','bottom']){
  const s=flat();grantPower(s,power);if(gear==='basin')s.helmet=true;else equipShellHelmet(s,gear);const body={...s.player};
  services.hurt(s,direction);assert.equal(s.helmet,false);assert.equal(s.shellHelmet,null);assert.equal(s.power,power,`${gear} power=${power} ${direction}`);assert.deepEqual(s.player,body);assert.equal(s.phase,'playing');assert.ok(s.invincible>0);assert.equal(s.effects.filter(f=>f.kind==='helmet').length,1);
  services.hurt(s,direction);assert.equal(s.power,power,'same contact cannot consume body power during protection');assert.equal(s.effects.filter(f=>f.kind==='helmet').length,1);
  s.invincible=0;services.hurt(s,direction);assert.equal(s.phase,power?'playing':'dead');assert.equal(s.power,power>1?1:0,'after protection ends, the next hit follows ordinary body demotion');
 }
});

test('helmet protection precedes bone-shell and wearable damage, including several contacts in one simulation step',()=>{
 const s=mounted();grantPower(s,2);equipWearable(s,'cannon-box');equipShellHelmet(s,'spike-shell-helmet');const hull=s.riding,wearable=s.wearable;
 services.hurt(s,'side');assert.equal(s.shellHelmet,null);assert.equal(s.riding,hull);assert.equal(s.wearable,wearable);assert.equal(s.power,2);
 s.invincible=0;services.hurt(s,'side');assert.equal(s.riding,null);assert.equal(s.wearable,wearable);assert.equal(s.power,2);
 s.invincible=0;services.hurt(s,'side');assert.equal(s.wearable,null);assert.equal(s.power,2);
 for(const power of [1,2,3,4]){const crowded=flat();grantPower(crowded,power);crowded.helmet=true;crowded.enemies=[makeEnemy('duck',2,19),makeEnemy('duck',2.2,19)];for(const e of crowded.enemies)e.vx=0;tick(crowded);assert.equal(crowded.helmet,false);assert.equal(crowded.power,power);assert.equal(crowded.phase,'playing');}
});

test('an iron basin or shell helmet lifts cannon turrets; an unprotected head does not',()=>{
 for(const gear of ['basin',...SHELL_TOOLS.slice(0,2),null]){
  const l=level();placeCannon(l,10,15);const s=create(l),c=s.turrets[0];c.wait=99;
  if(gear==='basin')s.helmet=true;else if(gear)equipShellHelmet(s,gear);
  Object.assign(s.player,{x:10.05,y:16.02,vy:-9});s.grounded=false;tick(s,{},2);
  if(gear){assert.ok(c.vy<0,gear);assert.ok(c.y<14,gear);assert.equal(s.phase,'playing');}
  else assert.ok(c.vy>=0);
 }
});

test('bonked stones adopt their raised home for later attacks, while retry restores the blueprint',()=>{
 const l=level();placeStone(l,10,12);const s=create(l),stone=s.stones[0];s.helmet=true;Object.assign(s.player,{x:10.5,y:14.03,vy:-9});s.grounded=false;tick(s,{},2);assert.equal(stone.phase,'knocked');s.player.x=2;tick(s,{},110);
 const home=[...stone.origin];assert.ok(home[1]<12);assert.deepEqual([stone.x,stone.y],home);assert.equal(stone.phase,'idle');
 Object.assign(s.player,{x:10.5,y:19.2});tick(s);assert.equal(stone.phase,'charge');s.player.x=2;tick(s,{},1400);assert.deepEqual([stone.x,stone.y],home);assert.equal(stone.phase,'idle');
 respawn(s);assert.deepEqual(s.stones[0].origin,[10,12]);assert.deepEqual([s.stones[0].x,s.stones[0].y],[10,12]);
});

test('bone shells can be boarded from above, worn from carried items and exited with grab+jump',()=>{
 const s=flat(),item=makeItem('bone-shell',10,19);item.cooldown=0;s.items=[item];Object.assign(s.player,{x:10.1,y:17,vy:8});tick(s,{},60);assert.equal(s.riding,item);assert.equal(item.held,true);assert.equal(s.player.h,.8);
 tick(s,{grab:true,jump:true});assert.equal(s.riding,null);assert.equal(item.held,false);assert.ok(s.player.vy<0);
 const held=flat(),other=makeItem('bone-shell',2,19);held.items=[other];held.held=other;other.held=true;const feet=held.player.y+held.player.h;heldAction(held,{...EMPTY_INPUT,grab:true,down:true});assert.equal(held.riding,other);assert.equal(held.held,null);assert.equal(held.player.y+held.player.h,feet);assert.match(held.notice,/骨头龟壳/);
});

test('mounted and empty bone shells float on water and lava, including a moving liquid surface',()=>{
 for(const kind of ['water','lava'])for(const dynamic of [false,true]){
  const s=pool(kind,dynamic);tick(s,{},240);const surface=s.level.liquidSurface??17;
  assert.equal(s.phase,'playing',`${kind} dynamic=${dynamic}`);assert.equal(s.grounded,true);assert.equal(s.swimming,false);assert.ok(Math.abs(s.player.y+s.player.h-(surface-.15))<1e-6);assert.equal(s.riding.kind,'bone-shell');
  tick(s,{axis:1},60);assert.ok(s.player.x>12.5);assert.equal(s.phase,'playing');
  const empty=pool(kind,dynamic),hull=empty.riding;hull.held=false;empty.riding=null;empty.player.x=2;tick(empty,{},240);assert.equal(hull.alive,true);assert.ok(Math.abs(hull.y+hull.h-(empty.level.liquidSurface??17))<1e-6);
 }
});

test('down transforms the mounted player for exactly five seconds, blocks controls and damage, then restores automatically',()=>{
 const s=mounted();tick(s,{},60);tick(s,{down:true});assert.equal(s.boneTime,5);assert.equal(playerArt(s).atlas,'shell-equipment');assert.equal(playerArt(s).frame,3);const x=s.player.x;
 for(const direction of ['top','side','bottom'])services.hurt(s,direction);services.crush(s);assert.equal(s.phase,'playing');assert.equal(s.riding.alive,true);assert.equal(s.invincible,0);
 tick(s,{down:true,axis:1,jump:true,grab:true,fire:true,special:true},599);assert.ok(s.boneTime>0);assert.equal(s.player.x,x);assert.equal(s.phase,'playing');assert.equal(s.pendingShot,false);
 tick(s,{down:true});assert.equal(s.boneTime,0);assert.notEqual(playerArt(s).atlas,'shell-equipment');assert.equal(s.riding.kind,'bone-shell');tick(s,{down:true},30);assert.equal(s.boneTime,0,'holding down must not restart the timer');
 tick(s);tick(s,{down:true});assert.equal(s.boneTime,5);tick(s,{},600);services.crush(s);assert.equal(s.phase,'dead','ordinary damage rules resume after restoration');
});

test('airborne bone-shell ground pound transforms on landing, and lava remains safe throughout restoration',()=>{
 const s=mounted();s.player.y=12;s.grounded=false;tick(s,{down:true});assert.equal(s.pound,'flip');assert.equal(s.boneTime,0);tick(s,{},120);assert.ok(s.boneTime>4);assert.equal(s.grounded,true);
 const lava=pool('lava');tick(lava,{},120);tick(lava,{down:true});assert.equal(lava.boneTime,5);tick(lava,{},600);assert.equal(lava.boneTime,0);assert.equal(lava.phase,'playing');assert.equal(lava.grounded,true);
});

test('bone-shell side protection is consumed once, and falling out of the level cannot be shielded forever',()=>{
 const s=mounted();services.hurt(s,'side');assert.equal(s.riding,null);assert.equal(s.phase,'playing');assert.ok(s.invincible>0);s.invincible=0;services.hurt(s);assert.equal(s.phase,'dead');
 const falling=mounted();falling.level.cells.fill('.');falling.player.y=28;falling.grounded=false;boneRest(falling);tick(falling,{},601);assert.equal(falling.phase,'dead');assert.equal(falling.riding,null);
});

test('bone rest cancels wearable charge without firing, while helmet protection preserves existing wearable layering',()=>{
 const s=mounted();equipWearable(s,'cannon-box');s.wearable.charge=.9;boneRest(s);tick(s,{},30);assert.equal(s.wearable.kind,'cannon-box');assert.equal(s.cannonShots.length,0);assert.equal(s.wearable.charge,0);
 const helmet=flat();equipWearable(helmet,'propeller-box');equipShellHelmet(helmet,'shell-helmet');services.hurt(helmet,'top');assert.equal(helmet.shellHelmet,null);assert.equal(helmet.wearable.kind,'propeller-box');
});

test('cross-area inventory carries each shell exactly once and retry clears temporary equipment',()=>{
 const l=level();l.areas={side:{...level(),name:'副区'}};const s=mounted(create(l));equipShellHelmet(s,'spike-shell-helmet');boneRest(s);const hull=s.riding;assert.equal(changeArea(s,'side',create),true);assert.equal(s.shellHelmet,'spike-shell-helmet');assert.equal(s.boneTime,5);assert.equal(s.player.h,.8);assert.equal(s.items.filter(i=>i===hull).length,1);assert.equal(s.areaMemory.main.items.includes(hull),false);
 respawn(s);assert.equal(s.shellHelmet,null);assert.equal(s.boneTime,0);assert.equal(s.riding,null);dropHelmet(s);assert.equal(s.effects.length,0);
});
