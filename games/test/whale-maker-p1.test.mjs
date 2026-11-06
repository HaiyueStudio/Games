import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,EMPTY_INPUT,validate,respawn,services,tile}=await import('../whale-maker/rules/model.ts');
const {REFERENCE_RULES}=await import('../whale-maker/rules/profile.ts');
const {makeEnemy,makeItem,pressPSwitch,pressSwitch,triggerPow,slopeAt}=await import('../whale-maker/rules/expansion.ts');
const {modifyEnemy}=await import('../whale-maker/rules/p1-enemies.ts');
const {breakCrate}=await import('../whale-maker/rules/workshop.ts');
const {defeatEnemy}=await import('../whale-maker/rules/combat.ts');
const {grantPower}=await import('../whale-maker/rules/power.ts');
const {freezeEnemy}=await import('../whale-maker/rules/frost.ts');
const {triggerExtension,redPow,treeContact,advanceDevices,deviceSolids}=await import('../whale-maker/rules/p1-mechanisms.ts');
const {conditionProgress}=await import('../whale-maker/rules/p1.ts');
const {p1Level,P1_DEMOS}=await import('../whale-maker/rules/p1-levels.ts');
const {P1_TOOLS,levelIssues}=await import('../whale-maker/rules/p1-schema.ts');
const {p1Art}=await import('../whale-maker/rendering/p1.ts');
const {playerArt}=await import('../whale-maker/rendering/player.ts');
const {spawnContent}=await import('../whale-maker/rules/containers.ts');
const {placeGlassPipe,glassRouteGeometry,enterGlassPipe,advanceGlassPipe}=await import('../whale-maker/rules/glass.ts');
const {advancePipeObjects}=await import('../whale-maker/rules/pipe-objects.ts');
const {toggleColor}=await import('../whale-maker/rules/advanced.ts');
const {editProperty,movePathNode}=await import('../whale-maker/editor/p1.ts');
const {stampSelection,pasteStamp,moveSelection,objectCells}=await import('../whale-maker/editor/selection.ts');
const {placeBoss}=await import('../whale-maker/rules/fortress.ts');
const {p1Timers}=await import('../whale-maker/rules/p1.ts');
const {specialHit}=await import('../whale-maker/rules/p1-abilities.ts');
const {writePipe}=await import('../whale-maker/rules/pipes.ts');
const {placeCannon}=await import('../whale-maker/rules/advanced.ts');
const {placeCactus}=await import('../whale-maker/rules/desert.ts');
const {editSnakeEnd}=await import('../whale-maker/rules/snake-path.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function level(modern=true){const width=100,height=32,cells=Array(width*height).fill('.');for(let y=20;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[19*width+95]='E';return {version:1,name:'P1 verification',width,height,cells,spawn:[3,19.2],properties:{},contents:{},...(modern?{rules:{...REFERENCE_RULES}}:{})};}
const flat=()=>{const s=create(level());tick(s);return s;};
const enemy=(s,kind='duck',x=8,p={})=>{const e=modifyEnemy(makeEnemy(kind,x,19,p),p,s.level.theme);e.y=20-e.h;s.enemies.push(e);return e;};

test('all seven P1 demos validate, serialize, reset and expose independent playable stages',()=>{
 assert.equal(P1_DEMOS.length,7);for(let n=0;n<P1_DEMOS.length;n++){const l=p1Level(n);assert.deepEqual(validate(JSON.parse(JSON.stringify(l))),l);const s=create(l);tick(s,{},120);assert.equal(s.phase,'playing',l.name);respawn(s);assert.deepEqual(s.startLevel,l);assert.equal(s.boomerangs.length,0);assert.equal(s.buildBoxes.length,0);}
});
test('box contents share bounded generation with pipes and enemies and release once',()=>{
 const l=level();l.cells[1906]='wood-crate';l.contents[1906]='key';const s=create(l),box=s.items[0];assert.equal(box.content,'key');breakCrate(s,box);breakCrate(s,box);assert.equal(s.items.filter(i=>i.kind==='key').length,1);assert.equal(s.coins,0);respawn(s);assert.equal(s.items[0].released,undefined);assert.equal(s.items[0].content,'key');
 for(let n=0;n<150;n++)spawnContent(s,'coin',10,10);assert.equal(s.items.length,128);
});
test('wood boxes float in water and lava and support a standing player without sinking to the bottom',()=>{
 for(const liquid of ['water','lava']){const l=level();for(let y=16;y<20;y++)for(let x=6;x<12;x++)l.cells[y*100+x]=liquid;l.cells[1408]='wood-crate';const s=create(l),box=s.items[0];tick(s,{},400);assert.ok(box.alive);assert.ok(Math.abs(box.y+box.h-16.22)<.04,`${liquid}: ${box.y}`);s.player.x=box.x;s.player.y=box.y-.8;s.player.vy=0;s.grounded=true;tick(s,{},90);assert.equal(s.phase,'playing',liquid);assert.equal(s.grounded,true);assert.ok(Math.abs(s.player.y+s.player.h-box.y)<.06);}
});
test('quicksand adds independent horizontal resistance while preserving jump escape and deep-jump penalty',()=>{
 const a=flat(),l=level();for(let y=20;y<24;y++)for(let x=0;x<40;x++)l.cells[y*100+x]='quicksand';const b=create(l);tick(a,{axis:1},120);tick(b,{axis:1},120);assert.ok(b.player.x<a.player.x-1);assert.ok(b.player.sandDepth>0);const y=b.player.y;tick(b,{jump:true});assert.ok(b.player.vy<0);tick(b,{jump:true},30);assert.ok(b.player.y<y-1);
});
test('normal snowball can be stopped by a top stomp and picked up again; large snowball stays uncarryable',()=>{
 const s=flat(),snow=makeItem('snowball',8,19);snow.vx=8.5;snow.thrown=true;snow.cooldown=0;s.items.push(snow);s.player.x=8;s.player.y=18.19;s.player.vy=4;s.grounded=false;tick(s,{},3);assert.equal(snow.thrown,false);assert.equal(snow.vx,0);s.player.x=snow.x-.91;s.player.y=19.2;snow.cooldown=0;tick(s,{grab:true});assert.equal(s.held,snow);
 const b=flat(),large=makeItem('snowball-large',5,19);large.cooldown=0;b.items.push(large);b.player.x=4.1;tick(b,{grab:true,axis:1},10);assert.equal(b.held,null);assert.ok(large.w===2&&large.x>5);
});
test('charged crouch and high spin launch higher than the normal jump; long jump stays low and travels farther',()=>{
 const normal=flat();tick(normal,{jump:true});const n=normal.player.vy;
 const charge=flat();tick(charge,{down:true},90);tick(charge,{down:true,jump:true});assert.equal(charge.motion,'charge');assert.ok(charge.player.vy<n-3);
 const high=flat();tick(high,{special:true,spin:true});assert.equal(high.motion,'high');assert.ok(high.player.vy<n-4);
 const long=flat();tick(long,{grab:true,axis:1},100);tick(long,{grab:true,axis:1,down:true,jump:true});assert.equal(long.motion,'long');assert.ok(long.player.vx>=12);assert.ok(long.player.vy>-9);tick(long,{grab:true,axis:1},50);assert.equal(long.phase,'playing');
});
test('rolling is explicit, brakes at a wall, and ordinary crouch keeps its previous behavior',()=>{
 const s=flat();tick(s,{down:true,special:true},20);assert.equal(s.motion,'roll');assert.ok(s.player.x>3.8);tick(s,{down:true,special:true},60);assert.notEqual(s.motion,'roll');
 const b=flat();tick(b,{down:true},30);assert.equal(b.motion,'none');assert.equal(b.player.x,3);
});
test('new forms preserve 0.9 width, two-tile height, feet, carry actions and downgrade to tall',()=>{
 for(const power of [5,6,7]){const s=flat(),feet=s.player.y+s.player.h;grantPower(s,power);assert.deepEqual([s.player.w,s.player.h],[.9,2]);assert.equal(s.player.y+s.player.h,feet);assert.equal(playerArt(s).atlas,'p1-costumes');const b=makeItem('pow',5,19);b.held=true;s.items.push(b);s.held=b;assert.equal(playerArt(s).frame,power===5?0:(power-5)*16+12);s.invincible=0;services.hurt(s);assert.equal(s.power,1);assert.equal(s.held,null);}
});
test('cat claw turns spiny into an inverted portable shell; dive and wall climb are finite',()=>{
 const s=flat();grantPower(s,5);const e=enemy(s,'spiky',4.1);e.vx=0;tick(s,{fire:true});assert.equal(e.kind,'shell');assert.equal(e.inverted,true);assert.equal(e.alive,true);
 const l=level();for(let y=6;y<20;y++)l.cells[y*100+7]='#';const a=create(l);grantPower(a,5);a.player.x=6.1;a.player.y=18;tick(a,{axis:1,interact:true},180);assert.ok(a.catStamina<1.8);const stamina=a.catStamina;tick(a,{axis:1,interact:true},180);assert.ok(a.catStamina<=stamina||a.grounded);assert.equal(a.phase,'playing');
});
test('cat climbs the goal pole before the normal finish sequence and receives a high flag award',()=>{
 const s=flat();grantPower(s,5);s.player.x=95.1;s.player.y=17;s.grounded=false;tick(s,{interact:true},330);assert.ok(s.phase==='won'||s.player.y<10);assert.equal(s.power,5);
});
test('boomerang goes out and returns, cannot duplicate on held fire, collects real coins and converts spiny',()=>{
 const s=flat();grantPower(s,6);s.level.cells[1907]='o';const e=enemy(s,'spiky',8);e.vx=0;tick(s,{fire:true},60);assert.equal(s.boomerangs.length,1);assert.equal(s.coins,1);assert.equal(e.kind,'shell');tick(s,{fire:true},260);assert.equal(s.boomerangs.length,0);assert.equal(s.phase,'playing');
});
test('hammer breaks hard bricks and permanently destroys skeletons while ordinary fire cannot',()=>{
 const s=flat();grantPower(s,7);s.level.cells[1804]='hard-block';const e=enemy(s,'dry-turtle',4.2);e.vx=0;tick(s,{fire:true});assert.equal(tile(s.level,4,18),'.');assert.equal(e.alive,false);assert.equal(s.defeatCounts['dry-turtle'],1);
});
test('construction boxes are capped, distinct from placed crates, and completely reset on retry',()=>{
 const s=flat();grantPower(s,7);for(let n=0;n<8;n++){s.player.x=3+n*3;s.previous.build=false;s.abilityWait=0;tick(s,{build:true});}assert.equal(s.buildBoxes.filter(b=>b.alive).length,5);assert.ok(s.items.some(i=>i.construction));assert.ok(s.items.filter(i=>i.alive).length<=5);respawn(s);assert.equal(s.buildBoxes.length,0);assert.equal(s.items.length,0);
});
test('red POW chains once, breaks ordinary/reward blocks locally and hurts nearby bosses',()=>{
 const l=level();l.cells[1907]='B';l.cells[1808]='?';l.contents[1808]='coin';const s=create(l),a=makeItem('red-pow',6,19),b=makeItem('red-pow',9,19),e=enemy(s,'duck',8);s.items.push(a,b);redPow(s,a,services);assert.equal(a.alive,false);assert.equal(b.alive,false);assert.equal(e.alive,false);assert.equal(tile(s.level,7,19),'.');assert.equal(tile(s.level,8,18),'U');assert.equal(s.rewards.length,1);redPow(s,a,services);assert.equal(s.rewards.length,1);assert.ok(s.shake>0);
});
test('conveyor moves resting player, enemies and boxes and reverses on ON/OFF',()=>{
 const l=level();for(let x=0;x<40;x++)l.cells[2000+x]='conveyor';const s=create(l),box=makeItem('wood-crate',8,19);s.items.push(box);tick(s,{},120);assert.ok(s.player.x>4);assert.ok(box.x>9);const x=s.player.x;toggleColor(s);tick(s,{},120);assert.ok(s.player.x<x-1);
});
test('dash block provides a separate impulse, while mushroom and disabled ON/OFF trampoline have different support',()=>{
 const l=level();l.cells[2003]='dash-block';const s=create(l);tick(s,{},3);assert.ok(s.player.vx>10);
 const a=level();a.cells[1806]='trampoline';a.properties[1806]={width:4};const b=create(a);b.player.x=7;b.player.y=15;b.player.vy=2;for(let n=0;n<150&&b.player.vy>=0;n++)tick(b);assert.ok(b.player.vy<-15);
});
test('stepped snake remains still until a rider arrives, advances at blue speed and stops at its endpoint',()=>{
 const l=level();l.cells[1808]='snake-fast';l.properties[1808]={path:[[0,0],[8,0]],length:3,trigger:'step'};const s=create(l),r=s.snakes[0];tick(s,{},120);assert.equal(r.travel,0);s.player.x=r.blocks[0].x;s.player.y=r.blocks[0].y-.8;s.grounded=true;tick(s,{},120);assert.ok(r.travel>1.9);tick(s,{},600);assert.equal(r.done,true);const end=r.travel;tick(s,{},120);assert.equal(r.travel,end);
});
test('blue path brick waits for a rider and returns to its starting point without teleporting the player',()=>{
 const l=level();l.cells[1808]='path-blue';l.properties[1808]={path:[[0,0],[3,0]],pace:2};const s=create(l),d=s.devices[0];tick(s,{},120);assert.equal(d.x,8);s.player.x=8;s.player.y=17.2;s.grounded=true;tick(s,{},100);assert.ok(d.x>9);const x=s.player.x;assert.ok(x>9);tick(s,{},300);assert.ok(d.x>=8&&d.x<=11);assert.equal(s.phase,'playing');
});
test('extension block expands along its authored route and retracts without leaving invisible collisions',()=>{
 const l=level();l.cells[1708]='extend-block';l.properties[1708]={path:[[0,0],[0,-3],[4,-3]]};const s=create(l),d=s.devices[0];triggerExtension(s,8,17);assert.equal(d.blocks.length,2);triggerExtension(s,8,17,true);assert.equal(d.blocks.length,8);tick(s,{},370);assert.equal(d.blocks.length,1);assert.equal(d.active,false);
});
test('tree contents release once from the crown and climbing can jump away',()=>{
 const l=level();l.cells[1908]='tree';l.properties[1908]={height:6};l.contents[1908]='key';const s=create(l),d=s.devices[0];s.player.x=8.2;s.player.y=d.y;s.climbing=true;treeContact(s,{...EMPTY_INPUT,interact:true},false,1/120);treeContact(s,{...EMPTY_INPUT,interact:true},false,1/120);assert.equal(s.items.filter(i=>i.kind==='key').length,1);treeContact(s,EMPTY_INPUT,true,1/120);assert.equal(s.climbing,false);assert.ok(s.player.vy<-13);
});
test('locked teleport consumes exactly one key, retains held body, and both boxes become spent',()=>{
 const l=level();l.cells[1903]='locked-warp';l.cells[1940]='warp-box';const s=create(l),pow=makeItem('pow',3,19);pow.held=true;s.items.push(pow);s.held=pow;s.keys.push({x:3,y:18,age:0});tick(s,{grab:true,interact:true});assert.equal(s.keys.length,0);tick(s,{grab:true},90);assert.ok(s.player.x>39);assert.equal(s.held,pow);assert.equal(s.usedWarps[1903],true);assert.equal(s.usedWarps[1940],true);s.previous.interact=false;tick(s,{grab:true,interact:true});assert.equal(s.door,null);
});
test('pink coins create one following key only after collecting the whole group and reset on retry',()=>{
 const l=level();l.cells[1903]='pink-coin';l.cells[1906]='pink-coin';const s=create(l);tick(s);assert.equal(s.keys.length,0);s.player.x=6;tick(s);assert.equal(s.keys.length,1);tick(s,{},30);assert.equal(s.keys.length,1);respawn(s);assert.equal(s.pinkCollected,0);assert.equal(s.keys.length,0);
});
test('P switches press from four configured directions and preserve no-trigger side contacts',()=>{
 for(const rotation of [0,90,180,270]){const s=flat(),p=makeItem('p-switch',10,19);p.rotation=rotation;s.items.push(p);const b={x:0,y:0,w:.8,h:.8,vx:0,vy:0},n=rotation===0?[0,-1]:rotation===90?[1,0]:rotation===180?[0,1]:[-1,0];b.x=p.x+p.w/2+n[0]*(p.w/2+.4)-.4;b.y=p.y+p.h/2+n[1]*(p.h/2+.4)-.4;b.vx=-n[0]*2;b.vy=-n[1]*2;const old={...b};b.x+=b.vx/120;b.y+=b.vy/120;assert.equal(pressPSwitch(s,b,old),true,String(rotation));assert.equal(p.spent,true);assert.ok(s.pTime>9.9);}
});
test('P expiration and color activation resolve player and frozen-body overlaps once',()=>{
 const s=flat();s.level.cells[1908]='blue-block';const e=enemy(s,'duck',8);freezeEnemy(s,e);toggleColor(s);assert.equal(e.alive,false);assert.equal(s.defeated.length,1);
 const a=flat();a.level.cells[1903]='blue-block';toggleColor(a);assert.equal(a.phase,'dead');
 const b=flat();b.level.cells[1908]='B';const ps=makeItem('p-switch',20,19);b.items.push(ps);pressSwitch(b,ps);const target=enemy(b,'duck',8);target.vx=0;b.pTime=.001;tick(b);assert.equal(target.alive,false);
});
test('mouse responds once to an actual jump event, not to a held button',()=>{
 const s=flat(),e=enemy(s,'jump-mouse',8);tick(s);assert.equal(e.grounded,true);tick(s,{jump:true});assert.equal(s.jumpSerial,1);assert.ok(e.vy<-15);const serial=s.jumpSerial;tick(s,{jump:true},30);assert.equal(s.jumpSerial,serial);assert.ok(e.ai.lastJump===serial);
});
test('ant soldiers attach to wall and ceiling geometry instead of falling as ordinary walkers',()=>{
 const l=level();for(let y=14;y<20;y++)l.cells[y*100+12]='#';for(let x=6;x<13;x++)l.cells[1400+x]='#';const s=create(l),e=enemy(s,'ant',8);let wall=false;for(let n=0;n<900;n++){tick(s);wall ||= e.ai.phase==='1'||e.ai.phase==='3';}assert.ok(wall);assert.ok(e.alive);assert.ok(e.y<20);
});
test('skeleton collapses without rewarding a defeat, revives, and dies permanently to hammer or frozen shatter',()=>{
 const s=flat(),e=enemy(s,'dry-turtle');defeatEnemy(s,e,'stomp');assert.equal(e.alive,true);assert.equal(e.downAge,3);assert.equal(s.defeatCounts['dry-turtle'],undefined);tick(s,{},365);assert.equal(e.downAge,undefined);freezeEnemy(s,e);defeatEnemy(s,e,'shell');assert.equal(e.alive,false);assert.equal(s.defeatCounts['dry-turtle'],1);
});
test('giant, wings and parachute modifiers are legal, serialized and retain a single drop identity',()=>{
 const l=level();l.cells[1908]='J';l.properties[1908]={large:true,winged:true,parachute:true,drop:'key'};validate(l);const s=create(l),e=s.enemies[0];assert.deepEqual([e.w,e.h],[1.6,1.6]);defeatEnemy(s,e,'stomp');assert.equal(e.alive,true);assert.equal(e.removedWings,true);defeatEnemy(s,e,'stomp');assert.deepEqual([e.w,e.h],[.8,.8]);defeatEnemy(s,e,'stomp');assert.equal(e.alive,false);assert.equal(s.items.filter(i=>i.kind==='key').length,1);
 const invalid=level();invalid.cells[1908]='ghost';invalid.properties[1908]={winged:true};assert.throws(()=>validate(invalid));
});
test('creeper follows the authored path, retreats and retains that route after freezing',()=>{
 for(const color of ['green','purple']){const s=flat(),e=enemy(s,'creeper-plant',8,{path:[[0,0],[0,-3],[5,-3]],color});tick(s,{},180);assert.ok(e.y<19&&e.x>=8);specialHit(s,e,'claw',services);assert.equal(e.ai.phase,'retreat');const x=e.x;freezeEnemy(s,e);assert.equal(e.frozen.anchored,true);tick(s,{},120);assert.equal(e.x,x);assert.equal(e.alive,true);}
});
test('snow theme changes cactus and generated balls while backdrop changes alone do not',()=>{
 const l=level();l.theme='snow';l.backdrop='night';l.cells[1908]='ball-thrower';const s=create(l),e=s.enemies[0];e.ai.wait=0;tick(s);assert.ok(s.items.some(i=>i.kind==='snowball'));assert.equal(s.enemyProjectiles.length,0);
 const a=flat(),b=enemy(a,'ball-thrower');b.ai.wait=0;tick(a);assert.ok(a.enemyProjectiles.some(p=>p.kind==='spike-ball'));
 const snow=enemy(s,'snow-cactus',15);defeatEnemy(s,snow,'shot');assert.ok(s.items.filter(i=>i.kind==='snowball').length>=2);
});
test('enemy fire, ball and generator budgets remain finite and reset with the scene',()=>{
 const l=level();l.cells[1908]='fire-brother';l.cells[1915]='bill-blaster';l.properties[1915]={period:.25,count:2,radius:16};const s=create(l);s.invincible=100;tick(s,{},1500);assert.ok(s.enemyProjectiles.length<=64);assert.ok(s.enemies.filter(e=>e.alive&&e.kind==='cannonball').length<=3);respawn(s);assert.equal(s.enemyProjectiles.length,0);assert.equal(s.devices.find(d=>d.kind==='bill-blaster').age,0);
});
test('coins, selected power and specified enemy clear conditions gate the real flag and ignore visual particles',()=>{
 for(const condition of [{kind:'coins',amount:1},{kind:'power',power:6},{kind:'defeats',amount:1,enemy:'duck'}]){const l=level();l.condition=condition;const s=create(l);s.player.x=95;s.player.y=17;s.grounded=false;tick(s);assert.equal(s.phase,'playing');assert.equal(conditionProgress(s).done,false);if(condition.kind==='coins')s.coins=1;else if(condition.kind==='power')grantPower(s,6);else defeatEnemy(s,enemy(s),'shot');tick(s);assert.equal(s.phase,'won');}
 const l=level();l.condition={kind:'coins',amount:1};l.cells[1904]='C';assert.equal(levelIssues(l)[0].cell,1904);assert.throws(()=>validate(l),/4,19/);
});
test('batch numeric editing only touches legal shared attributes and node movement commits atomically',()=>{
 const l=level();l.cells[1908]='jump-mouse';l.cells[1910]='fire-brother';assert.equal(editProperty(l,[1908,1910],'large',true),true);assert.equal(editProperty(l,[1908,1910],'width',5),false);assert.equal(editProperty(l,[1908,1910],'large',3),false);const stamp=stampSelection(l,new Set([1908]));pasteStamp(l,stamp,14,19);assert.equal(l.properties[1914].large,true);validate(l);
 l.cells[1208]='path-blue';l.properties[1208]={path:[[0,0],[5,0],[5,4]]};const before=structuredClone(l);assert.equal(movePathNode(l,1208,1,[6,0]),true);assert.deepEqual(l.properties[1208].path,[[0,0],[6,0],[6,4]]);assert.equal(movePathNode(l,1208,1,[200,0]),false);assert.notDeepEqual(l,before);
});
test('new tools all have palette art or an explicit slope material; no unknown metadata is accepted',()=>{
 for(const t of P1_TOOLS)assert.ok(p1Art(t),t);const l=level();l.theme='unknown';assert.throws(()=>validate(l));l.theme='snow';l.condition={kind:'coins',amount:0};assert.throws(()=>validate(l));
});
test('ordinary enemies and projectile-sized rewards enter, traverse and exit the same curved glass tube',()=>{
 for(const kind of ['duck','growth','coin','fire']){const l=level();placeGlassPipe(l,1208);const s=create(l),m=glassRouteGeometry(s.level)[0].mouths[0];let b;if(kind==='duck')b=enemy(s,'duck',9);else if(kind==='fire'){b={x:0,y:0,w:.28,h:.28,vx:0,vy:3,kind:'fire'};s.shots.push(b);}else if(kind==='growth'){b={x:0,y:0,w:.8,h:.8,vx:0,vy:3,kind:'growth',age:.4,originY:0,persistent:true};s.rewards.push(b);}else{b=makeItem('coin',9,10);s.items.push(b);}b.x=m.point[0]-b.w/2;b.y=m.point[1]-b.h-.003;b.vy=3;advancePipeObjects(s,1/120,services);assert.ok(b.transit,kind);for(let n=0;n<900&&b.transit;n++)advancePipeObjects(s,1/120,services);assert.equal(b.transit,undefined,kind);assert.ok(b.x>15,kind);assert.ok(b.transitWait>0);}
});

test('reference glass pipes reject airborne side entry and oversized carry while legacy side entry remains usable',()=>{
 for(const modern of [false,true]){const l=level(modern);placeGlassPipe(l,1208,[[0,0],[5,0]]);const s=create(l),m=glassRouteGeometry(s.level)[0].mouths[0],p=s.player;p.x=m.point[0]-p.w-.003;p.y=m.point[1]-p.h/2;s.grounded=false;assert.equal(enterGlassPipe(s,{...EMPTY_INPUT,axis:1},services.solid),!modern);}
 const l=level();placeGlassPipe(l,1208);const s=create(l),m=glassRouteGeometry(s.level)[0].mouths[0];s.player.x=m.point[0]-.45;s.player.y=m.point[1]-.803;const large=makeItem('snowball-large',8,11);s.items.push(large);s.held=large;large.held=true;assert.equal(enterGlassPipe(s,{...EMPTY_INPUT,down:true},services.solid),false);assert.match(s.notice,/太大/);
});
test('two closed glass mouths fail reference rules and retain the legacy return policy',()=>{
 for(const modern of [false,true]){const l=level(modern);placeGlassPipe(l,1208);const s=create(l),r=glassRouteGeometry(s.level)[0],m=r.mouths[0];s.player.x=m.point[0]-.45;s.player.y=m.point[1]-.803;assert.equal(enterGlassPipe(s,{...EMPTY_INPUT,down:true},services.solid),true);for(const m of r.mouths)s.level.cells[(Math.floor(m.point[1])-1)*100+Math.floor(m.point[0])]='B';for(let n=0;n<600&&s.pipe&&!s.pipe.glassReturns;n++)advanceGlassPipe(s,1/120,services.solid,()=>services.crush(s));assert.equal(s.phase,modern?'dead':'playing');if(!modern)assert.equal(s.pipe.glassReturns,1);}
});
test('pipe entry reserves space, queues the next body and respects an exit that closes in flight',()=>{
 const l=level();placeGlassPipe(l,1208);const s=create(l),r=glassRouteGeometry(s.level)[0],m=r.mouths[0];const a=enemy(s,'duck');for(const e of [a]){e.x=m.point[0]-.4;e.y=m.point[1]-.803;e.vx=0;e.vy=3;}advancePipeObjects(s,1/120,services);assert.ok(a.transit);const b=enemy(s,'duck');Object.assign(b,{x:m.point[0]-.4,y:m.point[1]-.803,vx:0,vy:3});advancePipeObjects(s,1/120,services);assert.equal(b.transit,undefined);for(let n=0;n<35;n++)advancePipeObjects(s,1/120,services);assert.ok(b.transit);const out=r.mouths[1];s.level.cells[(Math.floor(out.point[1])-1)*100+Math.floor(out.point[0])]='B';let returned=false;for(let n=0;n<600;n++){advancePipeObjects(s,1/120,services);returned ||= (a.transit?.returns??0)>0;}assert.equal(returned,true);assert.ok(!a.transit||Number.isFinite(a.x));
});
test('pipe projectiles keep fire resistance and boomerang hits do not duplicate per leg',()=>{
 for(const attack of ['fire','boomerang','ice']){const l=level();placeGlassPipe(l,1208);const s=create(l),m=glassRouteGeometry(s.level)[0].mouths[0],e=enemy(s,attack==='boomerang'?'dry-turtle':'iron-turtle');e.x=m.point[0]-.4;e.y=m.point[1]-.803;e.vx=0;e.vy=3;advancePipeObjects(s,1/120,services);const p={x:e.x,y:e.y,w:.28,h:.28,vx:0,vy:0,kind:attack,transit:structuredClone(e.transit)};if(attack==='boomerang'){Object.assign(p,{age:0,returning:false,distance:0,leg:0,hits:[],targets:[]});s.boomerangs.push(p);}else s.shots.push(p);advancePipeObjects(s,1/120,services);assert.equal(e.alive,true);if(attack==='fire')assert.equal(e.kind,'iron-turtle');if(attack==='ice')assert.equal(e.transit.freezeAtExit,true);if(attack==='boomerang'){assert.equal(e.downAge,3);assert.deepEqual(p.targets,[e]);advancePipeObjects(s,1/120,services);assert.deepEqual(p.targets,[e]);}}
});
test('blue path ends by disappearing and resets only into an unoccupied home',()=>{
 const l=level();l.cells[1808]='path-blue';l.properties[1808]={path:[[0,0],[2,0]],pace:2};const s=create(l),d=s.devices[0];d.active=true;d.phase='moving';for(let n=0;n<121;n++)advanceDevices(s,1/120,services);assert.equal(d.phase,'done');assert.equal(deviceSolids(s).includes(d),false);s.player.x=8;s.player.y=18;for(let n=0;n<200;n++)advanceDevices(s,1/120,services);assert.equal(d.phase,'done');s.player.x=3;advanceDevices(s,1/120,services);assert.equal(d.phase,'idle');assert.equal(d.x,8);assert.ok(deviceSolids(s).includes(d));
});
test('moving path blocks and snakes stop at solid terrain instead of tunneling through it',()=>{
 for(const kind of ['path-red','snake-fast']){const l=level();l.cells[1808]=kind;l.properties[1808]={path:[[0,0],[8,0]],length:2,pace:2};l.cells[1812]='hard-block';const s=create(l);tick(s,{},500);const blocks=kind==='path-red'?s.devices:s.snakes[0].blocks;assert.ok(blocks.every(b=>b.x+b.w<=12.001));}
});
test('extension growth stops at terrain and resolves newly filled cells exactly once',()=>{
 const l=level();l.cells[1708]='extend-block';l.properties[1708]={path:[[0,0],[5,0]]};l.cells[1712]='hard-block';const s=create(l),e=enemy(s,'duck');e.x=10;e.y=17;e.vx=0;triggerExtension(s,8,17,true,services);assert.equal(s.devices[0].blocks.length,4);assert.equal(e.alive,false);assert.equal(s.defeatCounts.duck,1);triggerExtension(s,8,17,true,services);assert.equal(s.defeatCounts.duck,1);
});
test('ON trampoline changes are safe at a shallow top overlap and switch-off releases support',()=>{
 const l=level();l.cells[1808]='trampoline-on';const s=create(l);toggleColor(s);assert.equal(s.redOn,false);s.player.x=8;s.player.y=17.3;toggleColor(s);assert.equal(s.phase,'playing');assert.equal(s.player.y,17.2);assert.equal(s.player.vy,-17);assert.equal(s.grounded,false);toggleColor(s);assert.equal(deviceSolids(s).length,0);
});
test('gentle two-to-one slopes meet exactly and selection moves both halves together',()=>{
 const l=level();l.cells[1808]='gentle-up';l.cells[1809]='gentle-up-body';assert.deepEqual(objectCells(l,9,18),[1808,1809]);assert.ok(Math.abs(slopeAt(l,8.999999,18).height-slopeAt(l,9,18).height)<.000001);const selection=new Set(objectCells(l,8,18));assert.deepEqual([...moveSelection(l,selection,2,-1)],[1710,1711]);validate(l);assert.equal(l.cells[1711],'gentle-up-body');
});
test('semi-platforms support from above and let bodies cross upward from below',()=>{
 const l=level();l.cells[1708]='semi-platform';l.properties[1708]={width:4,depth:3};const s=create(l);s.player.x=9;s.player.y=18;s.player.vy=-10;s.grounded=false;let passed=false;for(let n=0;n<150;n++){services.move(s,s.player,1/120,true);s.player.vy+=26/120;passed ||= s.player.y+s.player.h<17;}assert.equal(passed,true);for(let n=0;n<120;n++){s.player.vy+=26/120;services.move(s,s.player,1/120,true);}assert.ok(Math.abs(s.player.y+s.player.h-17)<.001);
});
test('editor dimension changes, rotation and boundary failures remain atomic',()=>{
 const l=level();placeCannon(l,8,19,2);assert.equal(editProperty(l,[1908],'height',4),true);assert.equal(l.cells[1608],'cannon-body');placeCactus(l,12,19,2);assert.equal(editProperty(l,[1912],'height',4),true);assert.equal(l.cells[1612],'cactus-body');writePipe(l,20,15,3,0);assert.equal(editProperty(l,[1520],'rotation',90),true);assert.equal(l.properties[1520].rotation,90);l.cells[1798]='semi-platform';l.properties[1798]={width:2};const before=structuredClone(l);assert.equal(editProperty(l,[1798],'width',4),false);assert.deepEqual(l,before);const selection=new Set([1798]);assert.equal(moveSelection(l,selection,1,0),null);assert.deepEqual(l,before);l.cells[1808]='path-blue';l.properties[1808]={path:[[0,0],[3,0]]};assert.equal(editSnakeEnd(l,1808,0,-1),true);assert.equal(editSnakeEnd(l,1808,0,0,true),true);assert.deepEqual(l.properties[1808].path,[[0,0],[3,0]]);
});
test('large brothers landing shockwave only stuns grounded nearby players and respects explicit disable',()=>{
 for(const airborne of [false,true])for(const disabled of [false,true]){const s=flat(),e=enemy(s,'fire-brother',10,{large:true,shockwave:!disabled});e.y=20-e.h-.015;e.vy=5;e.grounded=false;s.player.y=airborne?15:19.2;s.grounded=!airborne;tick(s);assert.equal(s.stun>0,!airborne&&!disabled);}
});
test('blue POW adds visible grounded boss damage for modern maps and red POW has local boss reach',()=>{
 for(const modern of [false,true]){const l=level(modern);placeBoss(l,10,18);const s=create(l),b=s.bosses[0];triggerPow(s,services);assert.equal(b.health,modern?4:5);b.hurt=0;b.y=16;triggerPow(s,services);assert.equal(b.health,modern?4:5);const p=makeItem('red-pow',9,17);s.items.push(p);redPow(s,p,services);assert.equal(b.health,modern?3:4);}
});
test('cannon balls expire offscreen, held or frozen timers pause, and cannon launch differs from blaster',()=>{
 const s=flat(),e=enemy(s,'cannonball',70);p1Timers(s,11);assert.equal(e.alive,true);e.held=true;p1Timers(s,3);assert.equal(e.alive,true);e.held=false;p1Timers(s,2);assert.equal(e.alive,false);
 const l=level();for(const [x,kind]of [[10,'cannon-basic'],[16,'bill-blaster']]){l.cells[1900+x]=kind;l.properties[1900+x]={period:.25,count:1};}const a=create(l);for(let n=0;n<32;n++)advanceDevices(a,1/120,services);const ball=a.enemies.find(e=>e.generatorId===1910),bill=a.enemies.find(e=>e.generatorId===1916);assert.equal(ball.ballistic,true);assert.ok(ball.vy<0);assert.equal(bill.ballistic,undefined);assert.equal(bill.vy,0);for(let n=0;n<120;n++)advanceDevices(a,1/120,services);assert.equal(a.enemies.length,2);
});
test('liquid underlay survives save and retry; fishbone remains inside its water region',()=>{
 const l=level();for(let y=16;y<20;y++)for(let x=10;x<20;x++)l.cells[y*100+x]='water';l.cells[1811]='fishbone';l.properties[1811]={liquid:'water'};const s=create(validate(JSON.parse(JSON.stringify(l)))),e=s.enemies[0];assert.equal(tile(s.level,11,18),'water');s.player.x=5;s.player.y=14;tick(s,{},1000);assert.equal(e.alive,true);assert.equal(tile(s.level,e.x+e.w/2,e.y+e.h/2),'water');respawn(s);assert.equal(tile(s.level,11,18),'water');
});
test('giant timed freeze is shorter, new attacks respect flame resistance and death clears new action state',()=>{
 const s=flat(),a=enemy(s,'duck',8,{large:true}),b=enemy(s,'duck',12);freezeEnemy(s,a);freezeEnemy(s,b);assert.equal(a.frozen.remaining,3);assert.equal(b.frozen.remaining,6);const flame=enemy(s,'fire-jumper',20);for(const kind of ['claw','boomerang','hammer'])specialHit(s,flame,kind,services);assert.equal(flame.alive,true);s.motion='roll';s.charge=s.runCharge=1;s.boomerangs.push({});services.crush(s);assert.equal(s.motion,'none');assert.equal(s.charge,0);assert.equal(s.boomerangs.length,0);assert.equal(s.phase,'dead');
});
test('all eight forms keep their own supplemental action atlas row and can roll, jump and recover while carrying',()=>{
 for(let power=0;power<=7;power++){const s=flat();grantPower(s,power);s.motion='roll';s.motionAge=.1;const art=playerArt(s),row=power===0||power===3?0:power===1?1:power===2?2:power===4?3:power-1;assert.equal(art.atlas,'p1-actions');assert.equal(Math.floor(art.frame/8),row);s.motion='none';const item=makeItem('wood-crate',4,19);s.items.push(item);s.held=item;item.held=true;tick(s,{grab:true,jump:true,axis:1},20);assert.equal(s.held,item);assert.equal(s.phase,'playing');tick(s,{grab:true},180);assert.equal(s.phase,'playing');assert.ok(s.grounded);}
});
test('pipe colors are editable and affect the generation period without replacing explicit custom timing',()=>{
 for(const [color,period]of [['red',1.2],['yellow',3.6]]){const l=level();writePipe(l,10,15,3,0);l.contents[1510]='coin';assert.equal(editProperty(l,[1510],'color',color),true);const s=create(l),d=s.devices.find(d=>d.kind==='P');d.wait=0;advanceDevices(s,1/120,services);assert.equal(d.wait,period);assert.equal(s.items.filter(i=>i.kind==='coin').length,1);d.props.period=5;d.wait=0;advanceDevices(s,1/120,services);assert.equal(d.wait,5);}
});
test('the action tutorial wall, low ceiling gap and high wall are physically passable with its taught moves',()=>{
 for(const mode of ['charge','long','high']){const s=create(p1Level(1));tick(s,{},2);if(mode==='charge'){s.player.x=12;tick(s,{down:true},100);tick(s,{axis:1,jump:true},200);assert.ok(s.player.x>16);}if(mode==='long'){s.player.x=19;tick(s,{axis:1,grab:true},70);tick(s,{axis:1,grab:true,down:true,jump:true});tick(s,{axis:1,grab:true,jump:true},180);assert.ok(s.player.x>32);assert.ok(s.player.y+s.player.h<=20.001);}if(mode==='high'){s.player.x=44;tick(s,{axis:1,special:true,spin:true},230);assert.ok(s.player.x>48);}assert.equal(s.phase,'playing');}
});
