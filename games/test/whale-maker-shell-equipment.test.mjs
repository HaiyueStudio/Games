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

test('shell helmets equip from below or by crouching with the held shell',()=>{
 for(const kind of SHELL_TOOLS.slice(0,2)){
  const s=flat(),item=makeItem(kind,2,15);item.cooldown=0;s.items=[item];s.helmet=true;Object.assign(s.player,{y:item.y+item.h+.03,vy:-9});s.grounded=false;tick(s,{jump:true});assert.equal(s.shellHelmet,kind);assert.equal(s.helmet,false);assert.equal(item.alive,false);
  const carried=flat(),hat=makeItem(kind,2,19);hat.held=true;carried.items=[hat];carried.held=hat;tick(carried,{down:true,grab:true});assert.equal(carried.shellHelmet,kind);assert.equal(carried.held,null);
  services.hurt(carried,'top');assert.equal(carried.phase,'playing');assert.equal(carried.shellHelmet,null);assert.equal(carried.effects.at(-1).headgear,kind);
 }
});

test('ordinary shell helmet deflects while the spiked helmet defeats; both break ordinary bricks',()=>{
 for(const kind of SHELL_TOOLS.slice(0,2)){
  const s=flat(),e=makeEnemy('spiky',10,14);e.vx=0;s.enemies=[e];equipShellHelmet(s,kind);Object.assign(s.player,{x:10,y:e.y+e.h+.03,vy:-9});s.grounded=false;tick(s,{},2);assert.equal(e.alive,kind==='shell-helmet');assert.equal(s.shellHelmet,kind);assert.equal(s.phase,'playing');
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

const {updateStones,stoneCells}=await import('../whale-maker/rules/adventure.ts');
const {placeBoss,damageBoss}=await import('../whale-maker/rules/fortress.ts');
const {editProperty}=await import('../whale-maker/editor/p1.ts');
const {specialHit,abilities}=await import('../whale-maker/rules/p1-abilities.ts');

test('spiked helmet destroys hard, empty, ice and reward blocks without releasing stored contents',()=>{
 for(const t of ['B','?','U','hard-block','ice','ice-solid']){const s=flat(),id=15*60+10;equipShellHelmet(s,'spike-shell-helmet');s.level.cells[id]=t;s.level.contents={[id]:'growth'};Object.assign(s.player,{x:10.1,y:16.02,vy:-9});tick(s,{},2);assert.equal(s.level.cells[id],'.',t);assert.equal(s.rewards.length,0,t);assert.equal(s.level.contents[id],undefined,t);}
 const s=flat(),id=15*60+10;s.level.cells[id]='ice';s.level.contents={[id]:'coin'};equipShellHelmet(s,'spike-shell-helmet');services.hitBlock(s,10,15,'ice');assert.equal(s.coins,1);
});
test('empty helmets require a below contact or carried crouch, and thrown shells defeat enemies',()=>{
 for(const kind of ['shell-helmet','spike-shell-helmet']){
  const s=flat(),item=makeItem(kind,4,19);item.cooldown=0;s.items=[item];s.player.x=4;tick(s);assert.equal(s.shellHelmet,null);
  const a=flat(),hat=makeItem(kind,10,15),enemy=makeEnemy('duck',11,15);hat.vx=12;hat.cooldown=.3;enemy.vx=0;a.items=[hat];a.enemies=[enemy];tick(a,{},16);assert.equal(enemy.alive,false,kind);
 }
 const s=flat(),hat=makeItem('spike-shell-helmet',10,19);hat.cooldown=0;s.items=[hat];Object.assign(s.player,{x:10,y:hat.y-s.player.h-.02,vy:6});tick(s,{},2);assert.equal(s.phase,'dead');
});
test('submerged empty and worn bone shells rise from the bottom, and worn shells can dive and surface again',()=>{
 for(const riding of [false,true]){const l=level();for(let y=14;y<20;y++)for(let x=8;x<26;x++)l.cells[y*60+x]='water';const s=create(l),item=makeItem('bone-shell',12,18);s.items=[item];if(riding){s.player.x=12;mountBoneShell(s,item);s.grounded=false;}tick(s,{},300);const feet=riding?s.player.y+s.player.h+.15:item.y+item.h;assert.ok(Math.abs(feet-14)<.02,`${riding}: ${feet}`);if(riding){tick(s,{down:true},50);assert.ok(s.player.y+s.player.h>14.5);assert.equal(s.boneTime,0);tick(s,{interact:true},90);assert.ok(Math.abs(s.player.y+s.player.h+.15-14)<.02);}}
});
test('bone shell hitting a wall shatters, and its pound defeats even a boss in one hit',()=>{
 const s=flat();s.level.cells[19*60+12]='hard-block';const item=makeItem('bone-shell',10,19);item.vx=12;item.cooldown=.3;s.items=[item];tick(s,{},30);assert.equal(item.alive,false);
 const l=level();placeBoss(l,10,18);const a=create(l);damageBoss(a,a.bosses[0],'bone-pound');assert.equal(a.bosses[0].health,0);
});
test('builder hammer shatters stones and respects giant ant immunity',()=>{
 const l=level();placeStone(l,10,18);const s=create(l);grantPower(s,7);s.player.x=8.6;s.facing=1;abilities(s,{...EMPTY_INPUT,fire:true},1/120,services);assert.equal(s.stones.length,0);
 for(const large of [false,true]){const a=flat(),e=makeEnemy('ant',6,19);e.modifiers={large};a.enemies=[e];specialHit(a,e,'hammer',services);assert.equal(e.alive,large);}
});
test('stones destroy one normal brick layer, while giant stones continue through bricks and hard blocks',()=>{
 for(const large of [false,true]){const l=level();placeStone(l,10,8,{large});const width=large?4:2;for(const y of [14,16])for(let x=10;x<10+width;x++)l.cells[y*60+x]=large?'hard-block':'B';const s=create(l),stone=s.stones[0];stone.phase='charge';stone.vy=14.4;s.player.x=2;for(let n=0;n<140;n++)updateStones(s,1/120,services);assert.equal(s.level.cells[14*60+10],'.');assert.equal(s.level.cells[16*60+10],large?'.':'B');}
});
test('giant and winged stone properties validate, resize atomically, copy and render with matching collision bounds',()=>{
 const l=level();placeStone(l,10,8);assert.equal(editProperty(l,[8*60+10],'large',true),true);assert.equal(stoneCells(l,8*60+10).length,16);assert.equal(editProperty(l,[8*60+10],'winged',true),true);validate(JSON.parse(JSON.stringify(l)));const s=create(l),stone=s.stones[0];assert.equal(stone.w,4);assert.equal(stone.winged,true);s.player.x=2;tick(s,{},40);assert.ok(stone.x>10);
 assert.equal(editProperty(l,[8*60+10],'large',false),true);assert.equal(stoneCells(l,8*60+10).length,4);assert.equal(l.cells[11*60+13],'.');
});
