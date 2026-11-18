import test from 'node:test';import assert from 'node:assert/strict';import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return n(s+'.ts',c);throw e;}}});
const {create,step,stepCoop,configureCoop,EMPTY_INPUT,validate,respawn,services,tile}=await import('../whale-maker/rules/model.ts');
const {asPlayer,playerAt,coopCamera}=await import('../whale-maker/rules/coop-state.ts');
const {defaultSettings,changeBinding,assignDevice,validSettings,playerInput}=await import('../whale-maker/app/coop-controls.ts');
const {REFERENCE_RULES}=await import('../whale-maker/rules/profile.ts');
const {makeEnemy,makeItem,modifyEnemy}=await import('../whale-maker/rules/body-factory.ts');
const {equipWearable,wearCeiling,advanceCannonShots,disguised}=await import('../whale-maker/rules/p2-wearables.ts');
const {updateP2Enemy,advanceMagic}=await import('../whale-maker/rules/p2-enemies.ts');
const {damageBoss,updateFortress,placeBoss}=await import('../whale-maker/rules/fortress.ts');
const {updateP2Bosses}=await import('../whale-maker/rules/p2-bosses.ts');
const {advanceP2Mechanisms}=await import('../whale-maker/rules/p2-mechanisms.ts');
const {changeArea,areaTravel}=await import('../whale-maker/rules/p2-areas.ts');
const {finishProgress,lifeReward}=await import('../whale-maker/rules/p2-progress.ts');
const {advanceLiquid}=await import('../whale-maker/rules/p2-liquid.ts');
const {cameraFor,advanceP2Camera}=await import('../whale-maker/rules/p2-camera.ts');
const {poleHeight,goalAt}=await import('../whale-maker/rules/goal.ts');
const {grantPower}=await import('../whale-maker/rules/power.ts');
const {defeatEnemy}=await import('../whale-maker/rules/combat.ts');
const {collectToken}=await import('../whale-maker/rules/scoring.ts');
const {freezeEnemy}=await import('../whale-maker/rules/frost.ts');
const {attackResult,ENEMY_TRAITS}=await import('../whale-maker/rules/interactions.ts');
const {pipeShape,writePipe}=await import('../whale-maker/rules/pipes.ts');
const {placeGlassPipe,glassRouteGeometry}=await import('../whale-maker/rules/glass.ts');
const {advancePipeObjects}=await import('../whale-maker/rules/pipe-objects.ts');
const {deviceSolids}=await import('../whale-maker/rules/device-solids.ts');
const {driveCar,seatPlayer}=await import('../whale-maker/rules/p2-vehicle.ts');
const {p2Level,P2_DEMOS}=await import('../whale-maker/rules/p2-levels.ts');
const {P2_TOOLS,P2_ENEMIES,WEARABLES,p2Issues}=await import('../whale-maker/rules/p2-schema.ts');
const {p2Art}=await import('../whale-maker/rendering/p2.ts');
const {windVelocity}=await import('../whale-maker/rules/wind.ts');
const {tornadoPlanes,drawTornado,drawEnvironmentWind,TORNADO_FRAMES}=await import('../whale-maker/rendering/wind.ts');
const {editProperty,propertyKeys}=await import('../whale-maker/editor/p1.ts');
const {editSetting,resizeWidth}=await import('../whale-maker/editor/p2-settings.ts');
const {stampSelection,pasteStamp,objectCells}=await import('../whale-maker/editor/selection.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function level(width=100,height=32,floor=20){const cells=Array(width*height).fill('.');for(let y=floor;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[(floor-1)*width+width-6]='E';return {version:1,name:'P2 test',width,height,spawn:[3,floor-.8],cells,properties:{},contents:{},rules:{...REFERENCE_RULES}};}
const flat=()=>{const s=create(level());tick(s);return s;};
const enemy=(s,kind,x=10,y=19,p={})=>{const e=modifyEnemy(makeEnemy(kind,x,y,p),p);s.enemies.push(e);return e;};

test('environment wind is validated, editable and retained by level serialization',()=>{
    let l=editSetting(level(),'windMode','periodic');l=editSetting(l,'windDirection','left');l=editSetting(l,'windStrength',3);l=editSetting(l,'windPeriod',8);
    assert.deepEqual(validate(JSON.parse(JSON.stringify(l))).wind,{mode:'periodic',direction:'left',strength:3,period:8});
    assert.equal(editSetting(l,'windStrength',Infinity),null);assert.equal(editSetting(l,'windPeriod',0),null);
    assert.equal(editSetting(l,'windDirection','up'),null);assert.equal(editSetting(l,'windMode','none').wind,undefined);
    assert.throws(()=>validate({...l,wind:{...l.wind,mode:'unknown'}}),/环境风/);
});
test('periodic wind eases through gust and calm without changing direction or replay results',()=>{
    const w={mode:'periodic',direction:'right',strength:4,period:10};
    assert.equal(windVelocity(undefined,5),0);assert.equal(windVelocity(w,0),0);assert.equal(windVelocity(w,8),0);
    assert.equal(windVelocity(w,3.5),4);assert.equal(windVelocity(w,13.5),4);
    assert.equal(windVelocity({...w,direction:'left'},3.5),-4);
    assert.equal(windVelocity({...w,mode:'constant'},8),4);
});
test('wind moves idle players, enemies and loose objects while preserving their own walking velocity',()=>{
    for(const direction of ['left','right']){
        const l=level();l.spawn=[15,19.2];l.wind={mode:'constant',direction,strength:2,period:6};
        const s=create(l),e=enemy(s,'duck',22,19);e.vx=0;
        const box=makeItem('wood-crate',30,19);s.items.push(box);
        const px=s.player.x,ex=e.x,ix=box.x;tick(s,{},120);const sign=direction==='right'?1:-1;
        assert.ok((s.player.x-px)*sign>1.8);assert.ok((e.x-ex)*sign>1.8);assert.ok((box.x-ix)*sign>1.8);
        assert.equal(s.player.vx,0);assert.equal(e.vx,0);assert.equal(box.vx,0);
    }
});
test('wind respects terrain collisions and leaves held objects attached to their carrier',()=>{
    const l=level();l.spawn=[8,19.2];l.wind={mode:'constant',direction:'right',strength:6,period:6};
    l.cells[1909]='B';const s=create(l);tick(s,{},180);
    assert.ok(s.player.x+s.player.w<=9.00001);assert.equal(s.phase,'playing');
    const a=create(level()),b=create(level());a.level.wind={mode:'constant',direction:'right',strength:2,period:6};
    const held=makeItem('wood-crate',4,18);held.held=true;a.items.push(held);a.held=held;tick(a,{grab:true},30);tick(b,{grab:true},30);
    assert.equal(a.held,held);assert.ok(Math.abs(held.x-a.player.x)<2);assert.ok(a.player.x>b.player.x);
});
test('wind resets and remains area-local across travel',()=>{
    const l=withAreas();l.wind={mode:'periodic',direction:'left',strength:2,period:6};
    l.areas.sub.wind={mode:'constant',direction:'right',strength:1,period:4};
    const s=create(l);s.time=3;changeArea(s,'sub',create,[5,58]);assert.equal(s.level.wind.direction,'right');
    changeArea(s,'main',create,[3,19.2]);assert.equal(s.level.wind.direction,'left');
    s.phase='dead';respawn(s);assert.equal(s.time,0);assert.equal(s.level.wind.mode,'periodic');
});
test('tornado frames form one tapered volume and wind effects remain bounded',()=>{
    const planes=tornadoPlanes();assert.equal(planes.length,TORNADO_FRAMES);
    const p=planes[0],span=y=>{let n=0;for(let x=0;x<p.width;x++)if(p.pixels[(y*p.width+x)*4+3]>10)n++;return n;};
    assert.ok(span(25)>span(185)*2);assert.ok(span(100)>span(185));assert.ok(span(185)>0);
    assert.notDeepEqual(planes[0].pixels,planes[1].pixels);
    const draws=[],scene={sprite:(...a)=>draws.push(['sprite',...a]),dustParticle:(...a)=>draws.push(['particle',...a]),fill:(...a)=>draws.push(['fill',...a])};
    drawTornado(scene,0,0,72,180,1);assert.equal(draws.filter(d=>d[0]==='sprite').length,1);assert.equal(draws[0][1],'tornado');
    draws.length=0;drawEnvironmentWind(scene,level(),1,0,0,36,{x:0,y:0,w:800,h:500});assert.equal(draws.length,0);
    drawEnvironmentWind(scene,{...level(),wind:{mode:'constant',direction:'left',strength:3,period:6}},1,0,0,36,{x:0,y:0,w:800,h:500});assert.ok(draws.length>20&&draws.length<100);
});
function withAreas(){const l=level(),sub=level(40,64,60);sub.orientation='vertical';sub.cells[59*40+5]='door';sub.properties[59*40+5]={area:'main',targetX:20,targetY:19};l.cells[1906]='door';l.properties[1906]={area:'sub',targetX:5,targetY:59};l.areas={sub};return l;}
function boss(kind){const l=level();l.cells[1809]=kind;return create(l);}

test('fourteen P2 demos validate, round-trip and remain alive at their starts',()=>{assert.equal(P2_DEMOS.length,14);for(let n=0;n<14;n++){const l=p2Level(n);assert.deepEqual(validate(JSON.parse(JSON.stringify(l))),l);const s=create(l);tick(s,{},120);assert.equal(s.phase,'playing',l.name);respawn(s);assert.equal(s.currentArea,'main');assert.equal(s.wearable,null);assert.equal(s.magicShots.length,0);}});
test('all P2 tools have actual palette art and all new enemies have combat traits',()=>{for(const t of P2_TOOLS)assert.ok(p2Art(t),t);for(const t of P2_ENEMIES)assert.ok(ENEMY_TRAITS[t],t);assert.equal(WEARABLES.length,5);});
test('wearable pickups preserve all eight body forms and collider dimensions',()=>{for(let power=0;power<=7;power++)for(const kind of WEARABLES){const l=level();l.cells[1903]=kind;const s=create(l);grantPower(s,power);tick(s);assert.equal(s.wearable?.kind,kind);assert.equal(s.power,power);assert.equal(s.player.w,power===3?1.9:.9);assert.equal(s.player.h,power?2:.8);}});
test('wearable damage absorbs once without demoting the body; old basin head protection has priority',()=>{const s=flat();grantPower(s,5);equipWearable(s,'cannon-box');services.hurt(s);assert.equal(s.power,5);assert.equal(s.wearable,null);assert.equal(s.phase,'playing');s.invincible=0;s.helmet=true;equipWearable(s,'propeller-box');services.hurt(s,'top');assert.equal(s.helmet,false);assert.equal(s.wearable.kind,'propeller-box');assert.equal(s.power,5);});
test('changing wearables clears flight, charge and boost without replacing the body',()=>{const s=flat();grantPower(s,4);equipWearable(s,'bullet-mask');Object.assign(s.wearable,{active:true,flight:2,charge:1,boost:1});equipWearable(s,'goomba-mask');assert.deepEqual([s.wearable.active,s.wearable.flight,s.wearable.charge,s.wearable.boost],[false,0,0,0]);assert.equal(s.power,4);});
test('cannon uses physical button edges, fires on release and distinguishes charged shots',()=>{for(const [frames,charged]of [[8,false],[90,true]]){const s=flat();grantPower(s,2);equipWearable(s,'cannon-box');tick(s,{fire:true},frames);assert.equal(s.cannonShots.length,0);assert.equal(s.shots.length,0);assert.equal(s.previous.fire,true);tick(s);assert.equal(s.cannonShots.length,1);assert.equal(s.cannonShots[0].charged,charged);assert.equal(s.wearable.charge,0);tick(s,{},330);assert.equal(s.cannonShots.length,0);}});
test('cannon cannot charge or duplicate a projectile while J throws a held object',()=>{const s=flat();grantPower(s,5);equipWearable(s,'cannon-box');const b=makeItem('wood-crate',4,19);b.held=true;s.items.push(b);s.held=b;tick(s,{grab:true,fire:true});assert.equal(s.held,null);assert.equal(b.thrown,true);assert.equal(s.cannonShots.length,0);assert.notEqual(s.motion,'claw');});
test('standing cannon shots reach ground enemies in small and tall body forms',()=>{for(const power of [0,1,5]){const s=flat();grantPower(s,power);equipWearable(s,'cannon-box');const e=enemy(s,'iron-turtle',8);tick(s,{fire:true},8);tick(s,{},80);assert.equal(e.alive,false);assert.equal(s.defeatCounts['iron-turtle'],1);}});
test('charged cannon breaks ordinary bricks and normal cannon respects hard terrain',()=>{for(const charged of [false,true]){const l=level();l.cells[1908]=charged?'B':'hard-block';const s=create(l);s.cannonShots.push({kind:'cannon',x:7.5,y:19.2,w:.4,h:.4,vx:12,vy:0,age:0,charged});for(let n=0;n<30;n++)advanceCannonShots(s,1/120,services);assert.equal(tile(s.level,8,19),charged?'.':'hard-block');if(!charged)assert.equal(s.cannonShots.length,0);}});
test('propeller has three boosts, cannot gain a fourth in air, and refills on landing',()=>{const s=flat();equipWearable(s,'propeller-box');for(let n=0;n<3;n++){tick(s,{special:true});tick(s,{},8);assert.equal(s.wearable.uses,2-n);}const before=s.wearable.boost;tick(s,{special:true});assert.equal(s.wearable.uses,0);assert.ok(s.wearable.boost<before);Object.assign(s.player,{y:19.2,vy:0});s.grounded=true;tick(s);assert.equal(s.wearable.uses,3);});
test('propeller dive accelerates downward and swimming disables boost',()=>{const s=flat();equipWearable(s,'propeller-box');tick(s,{special:true});tick(s,{},4);tick(s,{down:true});assert.ok(s.player.vy>=17);assert.equal(s.pound,'none');const a=flat();equipWearable(a,'propeller-box');a.swimming=true;tick(a,{special:true});assert.equal(a.wearable.uses,3);});
test('bullet mask flies horizontally with finite air time and is consumed on wall contact',()=>{const l=level();for(let y=10;y<20;y++)l.cells[y*100+10]='hard-block';const s=create(l);tick(s);equipWearable(s,'bullet-mask');tick(s,{special:true});assert.equal(s.wearable.active,true);tick(s,{axis:-1,interact:true},10);assert.ok(s.player.vx<0&&s.player.vy===0);s.player.x=8;tick(s,{axis:1},30);assert.equal(s.wearable,null);assert.ok(s.player.x+s.player.w<=10.001);const a=flat();a.player.y=8;a.grounded=false;equipWearable(a,'bullet-mask');tick(a,{special:true});tick(a,{interact:true},500);assert.equal(a.wearable.active,false);assert.equal(a.wearable.flight,0);});
test('goomba disguise suppresses recognition and jumping exposes it temporarily',()=>{const s=flat(),bee=enemy(s,'bee',10,15);equipWearable(s,'goomba-mask');tick(s,{},30);assert.equal(disguised(s),true);assert.equal(bee.vx,0);tick(s,{jump:true},4);assert.equal(disguised(s),false);assert.ok(bee.vx<0);tick(s,{},300);assert.equal(disguised(s),true);});
test('red POW wearable has three guarded activations and uses normal red POW interactions',()=>{const s=flat();equipWearable(s,'pow-box');const e=enemy(s,'duck',4);wearCeiling(s,services);assert.equal(e.alive,false);assert.equal(s.wearable.uses,2);wearCeiling(s,services);assert.equal(s.wearable.uses,2);for(let n=0;n<2;n++){s.wearable.cooldown=0;wearCeiling(s,services);}assert.equal(s.wearable,null);assert.equal(s.defeatCounts.duck,1);});
test('real upward ceiling collision activates the worn POW without shrinking the character',()=>{const l=level();l.cells[1703]='hard-block';const s=create(l);tick(s);equipWearable(s,'pow-box');s.player.y=18.1;s.player.vy=-10;s.grounded=false;tick(s,{},5);assert.equal(s.wearable.uses,2);assert.equal(s.player.w,.9);assert.equal(s.phase,'playing');});
test('death and retry clear every wearable transient and preserve the blueprint',()=>{const s=flat();equipWearable(s,'bullet-mask');tick(s,{special:true});s.cannonShots.push({});services.crush(s);assert.equal(s.wearable,null);assert.equal(s.cannonShots.length,0);respawn(s);assert.equal(s.wearable,null);assert.equal(s.vehicle,null);assert.equal(s.areaMemory.constructor,Object);});
test('wearable and cannon projectile use the clear pipe without losing inventory',()=>{const l=level();placeGlassPipe(l,1208);const s=create(l),m=glassRouteGeometry(s.level)[0].mouths[0];equipWearable(s,'cannon-box');const p={kind:'cannon',x:m.point[0]-.2,y:m.point[1]-.403,w:.4,h:.4,vx:0,vy:3,age:0,charged:false};s.cannonShots.push(p);advancePipeObjects(s,1/120,services);assert.ok(p.transit);for(let n=0;n<900&&p.transit;n++)advancePipeObjects(s,1/120,services);assert.equal(p.transit,undefined);assert.ok(p.x>15);assert.equal(s.wearable.kind,'cannon-box');});
test('spring enemy modifiers are removed before it becomes one portable spring',()=>{const s=flat(),e=enemy(s,'spring-enemy',10,19,{winged:true,large:true});defeatEnemy(s,e,'stomp');assert.equal(e.removedWings,true);assert.equal(s.items.length,0);defeatEnemy(s,e,'stomp');assert.equal(e.modifiers.large,false);assert.equal(s.items.length,0);defeatEnemy(s,e,'stomp');defeatEnemy(s,e,'stomp');assert.equal(s.items.filter(i=>i.kind==='spring-v').length,1);assert.equal(s.defeatCounts['spring-enemy'],1);});
test('winged spring monster jumps higher than its unwinged counterpart',()=>{const a=flat(),b=flat(),e=enemy(a,'spring-enemy'),f=enemy(b,'spring-enemy',10,19,{winged:true});for(const x of [e,f]){x.grounded=true;x.ai.wait=0;}updateP2Enemy(a,e,1/120,services);updateP2Enemy(b,f,1/120,services);assert.ok(f.vy<e.vy-3);});
test('ring ghosts remain evenly spaced around the authored center',()=>{const l=level();l.cells[1415]='ring-ghost';l.properties[1415]={count:6,orbit:3};const s=create(l);tick(s,{},200);assert.equal(s.enemies.length,6);for(const e of s.enemies)assert.ok(Math.abs(Math.hypot(e.x-e.ai.home[0],e.y-e.ai.home[1])-3)<.001);assert.equal(new Set(s.enemies.map(e=>e.x.toFixed(3)+','+e.y.toFixed(3))).size,6);});
test('bully body contact pushes without damage and attacks recoil it rather than award kills',()=>{const s=flat(),e=enemy(s,'bully',4);s.player.x=4.2;s.player.y=19.2;tick(s);assert.equal(s.phase,'playing');assert.equal(s.power,0);assert.ok(Math.abs(s.player.vx)>3);defeatEnemy(s,e,'shot');assert.equal(e.alive,true);assert.equal(s.defeatCounts.bully,undefined);assert.ok(Math.abs(e.vx)>5);defeatEnemy(s,e,'lava');assert.equal(e.alive,false);assert.equal(s.defeatCounts.bully,1);});
test('giant fish takes several light hits and lava dragon rejects fire and ice',()=>{const s=flat(),e=enemy(s,'giant-fish');defeatEnemy(s,e,'shot');defeatEnemy(s,e,'shot');assert.equal(e.alive,true);defeatEnemy(s,e,'shot');assert.equal(e.alive,false);const dragon=enemy(s,'lava-dragon',20);assert.equal(attackResult(dragon,'fire'),'ignore');assert.equal(attackResult(dragon,'ice'),'ignore');assert.equal(freezeEnemy(s,dragon),false);});
test('giant fish and lava dragon have visible entry, leap, exit and repeat phases',()=>{for(const kind of ['giant-fish','lava-dragon']){const s=flat(),e=enemy(s,kind,10,18);s.invincible=100;let leap=false,returned=false;for(let n=0;n<700;n++){updateP2Enemy(s,e,1/120,services);leap ||= e.ai.phase==='leap';returned ||= leap&&e.ai.phase==='wait';}assert.ok(leap&&returned,kind);assert.equal(e.alive,true);}});
test('magical conversion is restricted to original ordinary bricks and has a finite budget',()=>{const l=level();for(let x=10;x<20;x++)l.cells[1910+x-10]='B';l.cells[1921]='?';const s=create(l),wizard=enemy(s,'magikoopa',5);for(let n=0;n<10;n++){s.magicShots.push({kind:'magic',x:10+n,y:19,w:.3,h:.3,vx:0,vy:0,age:0,owner:wizard});advanceMagic(s,1/120,services);}assert.equal(wizard.magicCount,8);assert.equal(tile(s.level,18,19),'B');s.magicShots.push({kind:'magic',x:21,y:19,w:.3,h:.3,vx:0,vy:0,age:0,owner:wizard});advanceMagic(s,1/120,services);assert.equal(tile(s.level,21,19),'?');assert.equal(s.magicShots.length,0);});
test('homing and cat bills adjust their trajectory; the giant bill retains its heading',()=>{for(const kind of ['homing-bill','cat-bill','giant-bill']){const s=flat(),e=enemy(s,kind,16,12);e.vx=-4;updateP2Enemy(s,e,.1,services);assert.equal(e.vy>0,kind!=='giant-bill');}const s=flat(),e=enemy(s,'cat-bill',9,19);s.level.cells[1910]='B';e.vx=6;e.vy=0;for(let n=0;n<30;n++)updateP2Enemy(s,e,1/120,services);assert.equal(tile(s.level,10,19),'.');});
test('car can be entered, driven, jumped, exited and destroyed with independent durability',()=>{const l=level();l.cells[1904]='koopa-car';const s=create(l),car=s.items[0];s.player.x=4;driveCar(s,{...EMPTY_INPUT,interact:true},1/120,services);assert.equal(s.vehicle,car);s.previous.interact=true;driveCar(s,{...EMPTY_INPUT,axis:1,jump:true},1/120,services);seatPlayer(s);assert.ok(car.vx>0&&car.vy<0);assert.equal(s.player.w,.9);s.previous.interact=false;driveCar(s,{...EMPTY_INPUT,grab:true,interact:true},1/120,services);assert.equal(s.vehicle,null);s.vehicle=car;for(let n=0;n<3;n++){s.invincible=0;services.hurt(s);}assert.equal(car.alive,false);assert.equal(s.vehicle,null);assert.equal(s.phase,'playing');});
test('a moving car defeats an enemy at its body while standing cars remain obstacles',()=>{const l=level();l.cells[1908]='koopa-car';const s=create(l),car=s.items[0],e=enemy(s,'duck',9.1);car.vx=8;s.vehicle=car;driveCar(s,{...EMPTY_INPUT,axis:1},1/120,services);assert.equal(e.alive,false);assert.ok(s.score>0);});
test('new bosses use distinct armor windows and resistance instead of identical damage rules',()=>{const a=boss('boom-boss'),b=boss('pom-boss'),c=boss('cat-boss');for(const s of [a,b,c])assert.equal(s.bosses.length,1);a.bosses[0].brain.mode='shell';damageBoss(a,a.bosses[0],'fire');assert.equal(a.bosses[0].health,3);damageBoss(a,a.bosses[0],'heavy');assert.equal(a.bosses[0].health,2);b.bosses[0].brain.mode='hidden';damageBoss(b,b.bosses[0],'hammer');assert.equal(b.bosses[0].health,3);c.bosses[0].brain.mode='climb';damageBoss(c,c.bosses[0],'fire');assert.equal(c.bosses[0].health,19);damageBoss(c,c.bosses[0],'stone');assert.equal(c.bosses[0].health,0);});
test('bosses collapse once and preserve the original five-health reef boss behavior',()=>{for(const kind of ['boom-boss','pom-boss','cat-boss']){const s=boss(kind),b=s.bosses[0];damageBoss(s,b,'crush');const score=s.score;damageBoss(s,b,'crush');assert.equal(b.health,0);assert.equal(s.score,score);assert.equal(b.phase,'fall');tick(s,{},300);assert.equal(b.phase,'gone');}const l=level();placeBoss(l,10,18);const s=create(l),b=s.bosses[0];assert.equal(b.health,5);assert.equal(b.brain,undefined);for(let n=0;n<5;n++){b.hurt=0;damageBoss(s,b,'fire');}assert.equal(b.phase,'fall');assert.equal(s.score,1000);});
test('ninja creates bounded mirages and projectiles, and cat boss cycles climb telegraph pounce',()=>{for(const kind of ['pom-boss','cat-boss']){const s=boss(kind);s.player.x=25;s.invincible=100;const b=s.bosses[0],modes=new Set();for(let n=0;n<1600;n++){updateP2Bosses(s,1/120,services);modes.add(b.brain.mode);}if(kind==='pom-boss'){assert.ok(modes.has('hidden')&&modes.has('telegraph'));assert.ok(b.brain.mirages.length<=2);assert.ok(s.magicShots.length<=24);}else assert.ok(modes.has('climb')&&modes.has('pounce')&&modes.has('vulnerable'));}});
test('falling heavy objects and icicles use boss damage paths',()=>{const s=boss('boom-boss'),b=s.bosses[0];s.stones.push({x:b.x,y:b.y,w:2,h:2,vx:0,vy:8,phase:'charge',timer:0,origin:[b.x,b.y],direction:'down'});updateFortress(s,1/120,services);assert.equal(b.health,0);assert.equal(s.stones[0].phase,'pause');});
test('beat blocks share the clock and resolve only the newly materialized overlap',()=>{const l=level();l.cells[1808]='beat-block';l.cells[1810]='beat-block';const s=create(l);s.time=.5;advanceP2Mechanisms(s,1/120,services);assert.equal(s.p2Mechanisms.every(d=>d.active),true);assert.equal(deviceSolids(s).filter(b=>b.kind==='beat-block').length,2);s.time=1.5;advanceP2Mechanisms(s,1/120,services);const e=enemy(s,'duck',8,18);s.time=2.01;advanceP2Mechanisms(s,1/120,services);assert.equal(e.alive,false);assert.equal(s.defeatCounts.duck,1);advanceP2Mechanisms(s,1/120,services);assert.equal(s.defeatCounts.duck,1);});
test('falling ring platform cancels its warning when stepped off, then falls and safely respawns',()=>{const l=level();l.cells[1708]='fall-block';l.properties[1708]={width:3,delay:.1,recovery:.1};const s=create(l),d=s.p2Mechanisms[0];s.player.x=8;s.player.y=16.2;s.player.vy=0;advanceP2Mechanisms(s,1/120,services);assert.equal(d.phase,'warn');s.player.x=3;advanceP2Mechanisms(s,1/120,services);assert.equal(d.phase,'idle');s.player.x=8;for(let n=0;n<20;n++){s.player.y=d.y-.8;s.player.vy=0;advanceP2Mechanisms(s,1/120,services);}assert.equal(d.phase,'fall');s.player.x=3;for(let n=0;n<500;n++)advanceP2Mechanisms(s,1/120,services);assert.equal(d.phase,'idle');assert.equal(d.y,17);});
test('icicle warns, falls, hits enemies and returns; tornado affects all physical body types',()=>{const l=level();l.cells[1008]='icicle';l.properties[1008]={height:2,delay:.1,recovery:.2};l.cells[1516]='tornado';const s=create(l),ice=s.p2Mechanisms[0];s.player.x=8;s.player.y=18;s.invincible=100;const e=enemy(s,'duck',8,19);advanceP2Mechanisms(s,1/120,services);s.player.x=3;for(let n=0;n<300&&e.alive;n++)advanceP2Mechanisms(s,1/120,services);assert.equal(e.alive,false);assert.equal(ice.phase,'gone');s.player.x=16;s.player.y=17;const item=makeItem('pow',16,18);s.items.push(item);const fish=enemy(s,'duck',16,17);advanceP2Mechanisms(s,1/120,services);assert.ok(s.player.vy<0&&item.vy<0&&fish.vy<0);});
test('areas validate independently and serialize with links while refusing missing targets',()=>{const l=withAreas();l.areas.sub.cells[l.areas.sub.cells.indexOf('E')]='.';assert.deepEqual(validate(JSON.parse(JSON.stringify(l))),l);const invalid=structuredClone(l);invalid.properties[1906].area='missing';assert.throws(()=>validate(invalid),/目标区域不存在/);const nested=structuredClone(l);nested.areas.sub.areas={x:level()};assert.throws(()=>validate(nested),/嵌套/);});
test('area travel preserves a single held item and mutable scene state across repeated returns',()=>{const s=create(withAreas()),item=makeItem('pow',4,19);s.items.push(item);s.held=item;item.held=true;s.level.cells[1810]='B';s.coins=9;s.keys.push({x:3,y:18,age:0});equipWearable(s,'cannon-box');const wear=s.wearable;assert.equal(changeArea(s,'sub',create,[5,59]),true);assert.equal(s.held,item);assert.equal(s.items.filter(i=>i===item).length,1);assert.equal(s.areaMemory.main.items.includes(item),false);assert.equal(s.coins,9);assert.equal(s.keys.length,1);assert.equal(s.wearable,wear);s.level.cells[58*40+10]='B';assert.equal(changeArea(s,'main',create,[20,19]),true);assert.equal(tile(s.level,10,18),'B');assert.equal(s.items.filter(i=>i===item).length,1);assert.equal(changeArea(s,'sub',create),true);assert.equal(s.level.cells[58*40+10],'B');assert.equal(s.items.filter(i=>i===item).length,1);});
test('a held frozen enemy and its paused thaw timer cross areas without duplication',()=>{const s=create(withAreas()),e=enemy(s,'duck',5);freezeEnemy(s,e);e.held=true;s.held=e;const remaining=e.frozen.remaining;changeArea(s,'sub',create,[5,58]);tick(s,{grab:true},100);assert.equal(s.held,e);assert.equal(e.frozen.remaining,remaining);assert.equal(s.enemies.filter(x=>x===e).length,1);changeArea(s,'main',create,[3,18]);assert.equal(s.enemies.filter(x=>x===e).length,1);assert.equal(s.areaMemory.sub.enemies.includes(e),false);});
test('linked area doors consume a key once and arrive in the configured destination',()=>{const l=withAreas();l.cells[1906]='locked-door';const s=create(l);s.player.x=6;s.player.y=19.2;s.keys.push({x:4,y:18,age:0});assert.equal(areaTravel(s,{...EMPTY_INPUT,interact:true},1/120,create),true);assert.equal(s.currentArea,'sub');assert.equal(s.keys.length,0);assert.ok(Math.abs(s.player.x-5)<.01);assert.equal(areaTravel(s,{...EMPTY_INPUT,interact:true},1/120,create),false);});
test('checkpoint respawn restores the correct area and rebuilds all scene objects',()=>{const l=withAreas();l.areas.sub.cells[59*40+7]='C';l.areas.sub.properties[59*40+7]={checkpointPower:2};const s=create(l);changeArea(s,'sub',create,[7,59.2]);tick(s);assert.equal(s.checkpointArea,'sub');assert.equal(s.power,2);const id=58*40+15;s.level.cells[id]='B';services.crush(s);tick(s);respawn(s);assert.equal(s.currentArea,'sub');assert.equal(s.level.cells[id],'.');assert.equal(s.litCheckpoints[59*40+7],true);assert.equal(s.keys.length,0);assert.equal(s.held,null);});
test('optional lives decrement once per death, game over resets the run, old free play stays unlimited',()=>{const l=level();l.progress={lives:true,initialLives:1};const s=create(l);services.crush(s);tick(s,{},20);assert.equal(s.lives,0);assert.equal(s.gameOver,true);respawn(s);assert.equal(s.lives,1);assert.equal(s.gameOver,false);assert.equal(s.phase,'playing');const a=flat();services.crush(a);tick(a,{},20);assert.equal(a.lives,3);assert.equal(a.gameOver,false);});
test('large coins, hundred-coin milestones and life pearls never count visual particles',()=>{const l=level();l.progress={lives:true,initialLives:3};l.cells[1903]='coin-50';const s=create(l);tick(s);assert.equal(s.coins,50);collectToken(s,50);assert.equal(s.lives,4);assert.equal(s.coins,100);lifeReward(s);assert.equal(s.lives,5);assert.equal(s.coins,100);tick(s,{},40);assert.equal(s.lives,5);});
test('countdown crosses regions, times out once, and converts remaining time into score once at finish',()=>{const l=withAreas();l.progress={lives:true,initialLives:3,timeLimit:10};const s=create(l);tick(s,{},120);const time=s.timeRemaining;changeArea(s,'sub',create,[5,58]);assert.equal(s.timeRemaining,time);s.timeRemaining=.001;tick(s);assert.equal(s.phase,'dead');assert.equal(s.lives,2);const a=create(l);a.timeRemaining=7.2;finishProgress(a,1994);assert.equal(a.timeBonus,400);assert.equal(a.score,400);finishProgress(a,1994);assert.equal(a.score,400);});
test('flag height and checkpoint power are per element; the original pole remains nine tiles',()=>{const s=flat();assert.equal(poleHeight(s,94,19),9);s.level.properties[1994]={goalHeight:6,goalBonus:'life'};assert.equal(poleHeight(s,94,19),6);s.player.x=94;s.player.y=10;assert.equal(goalAt(s),null);s.player.y=13;assert.ok(goalAt(s));const l=level();l.cells[1903]='C';l.properties[1903]={checkpointPower:4};const a=create(l);tick(a);assert.equal(a.power,4);});
test('automatic camera follows an authored path, respects bounds and holds inside a stop zone',()=>{const l=level();l.cameraRules={mode:'auto',speed:2};l.cells[1000]='camera-rail';l.properties[1000]={path:[[0,0],[10,0],[10,-5]]};l.cells[1805]='camera-stop';l.properties[1805]={width:4,depth:3};const s=create(l);advanceP2Camera(s,2);let c=cameraFor(s,{x:0,y:10},25,12);assert.equal(c.x,4);s.player.x=6;const held=cameraFor(s,c,25,12);advanceP2Camera(s,2);assert.deepEqual(cameraFor(s,{x:0,y:10},25,12),held);s.player.x=30;advanceP2Camera(s,10);c=cameraFor(s,{x:0,y:10},25,12);assert.ok(c.x>=0&&c.x<=75&&c.y>=0&&c.y<=20);});
test('rising liquids change only their band, leave terrain intact and can recede again',()=>{const l=level();l.liquid={kind:'water',low:20,high:15,period:8,mode:'cycle',x:10,width:10};l.cells[1714]='B';l.cells[1805]='water';const s=create(l);s.time=4;advanceLiquid(s,1/120);assert.equal(s.liquidLevel,15);assert.equal(tile(s.level,11,16),'water');assert.equal(tile(s.level,14,17),'B');assert.equal(tile(s.level,5,18),'water');s.time=8;advanceLiquid(s,1/120);assert.equal(tile(s.level,11,16),'.');assert.equal(tile(s.level,5,18),'water');assert.equal(tile(s.level,14,17),'B');});
test('editor settings and new common properties are validated, copied and kept atomic at bounds',()=>{const l=level();assert.equal(editSetting(l,'initialLives',0),null);assert.equal(editSetting(l,'timeLimit',120).progress.timeLimit,120);assert.equal(editSetting(l,'orientation','vertical').orientation,'vertical');l.cells[1908]='propeller-box';assert.equal(editProperty(l,[1908],'charges',4),true);const stamp=stampSelection(l,new Set([1908]));pasteStamp(l,stamp,12,19);assert.equal(l.properties[1912].charges,4);l.cells[1610]='cat-boss';assert.ok(propertyKeys('cat-boss').includes('durability'));assert.deepEqual(objectCells(l,11,17),[1610]);const before=structuredClone(l);assert.equal(editProperty(l,[1610],'durability',-1),false);assert.deepEqual(l,before);assert.ok(p2Issues({...l,progress:{timeLimit:-1}}).length);assert.equal(resizeWidth(l,20),null);});

test('instant retry charges exactly one life even before the next dead tick',()=>{const l=level();l.progress={lives:true,initialLives:3};const s=create(l);services.crush(s);respawn(s);assert.equal(s.lives,2);assert.equal(s.phase,'playing');tick(s);assert.equal(s.lives,2);services.crush(s);respawn(s);assert.equal(s.lives,1);services.crush(s);respawn(s);assert.equal(s.lives,3);assert.equal(s.gameOver,false);});
test('all four ordinary pipe mouths can enter a separate area including distant horizontal anchors',()=>{for(const rotation of [0,90,180,270]){const l=withAreas();writePipe(l,10,12,6,rotation);l.properties[1210]={length:6,rotation,area:'sub',targetX:5,targetY:59};const s=create(l),shape=pipeShape(s.level,1210),n=shape.normal,p=s.player;p.x=shape.mouth[0]+n[0]*(p.w/2+.002)-p.w/2;p.y=shape.mouth[1]+n[1]*(p.h/2+.002)-p.h/2;const i={...EMPTY_INPUT,axis:-n[0],down:n[1]<0,interact:n[1]>0};assert.equal(areaTravel(s,i,1/120,create),true,String(rotation));assert.equal(s.currentArea,'sub');}});
test('cross-area warp boxes are consumed once and a failed destination never spends a key',()=>{const l=withAreas();l.cells[1906]='locked-warp';const s=create(l);s.player.x=6;s.player.y=19.2;s.keys.push({x:4,y:18,age:0});assert.equal(areaTravel(s,{...EMPTY_INPUT,interact:true},1/120,create),true);assert.equal(s.keys.length,0);changeArea(s,'main',create,[6,19.2]);s.areaCooldown=0;s.keys.push({x:4,y:18,age:0});assert.equal(areaTravel(s,{...EMPTY_INPUT,interact:true},1/120,create),false);assert.equal(s.keys.length,1);assert.equal(s.usedWarps[1906],true);const a=create(l);a.level.properties[1906].area='missing';a.player.x=6;a.player.y=19.2;a.keys.push({x:4,y:18,age:0});areaTravel(a,{...EMPTY_INPUT,interact:true},1/120,create);assert.equal(a.keys.length,1);});
test('subarea return coordinates validate against the main area dimensions',()=>{const l=withAreas();l.areas.sub.properties[2365].targetX=90;assert.ok(validate(l));l.properties[1906].targetX=41;assert.throws(()=>validate(l),/出口坐标/);delete l.properties[1906].targetX;l.areas.sub.properties[2365].targetY=40;assert.throws(()=>validate(l),/出口坐标/);});
test('large mechanisms cannot overflow a row and width shrinking refuses outgoing routes',()=>{const l=level();l.cells[1999]='fall-block';l.properties[1999]={width:4};assert.throws(()=>validate(l),/机关尺寸/);l.cells[1999]='.';delete l.properties[1999];l.cells[l.cells.indexOf('E')]='.';l.cells[1910]='E';l.cells[1205]='camera-rail';l.properties[1205]={path:[[0,0],[50,0]]};assert.equal(resizeWidth(l,30),null);});
test('controlled liquid takes ownership of prepainted cells only within its configured band',()=>{const l=level();l.liquid={kind:'water',low:20,high:15,period:8,mode:'cycle',x:10,width:5};l.cells[1711]='water';l.cells[1705]='water';const s=create(l);advanceLiquid(s,1/120);assert.equal(tile(s.level,11,17),'.');assert.equal(tile(s.level,5,17),'water');s.time=4;advanceLiquid(s,1/120);assert.equal(tile(s.level,11,17),'water');});
test('original and new bosses receive heavy-object contact without changing the original five HP',()=>{for(const kind of ['turtle-boss','boom-boss','pom-boss','cat-boss']){const l=level();if(kind==='turtle-boss')placeBoss(l,10,18);else l.cells[1810]=kind;const s=create(l),b=s.bosses[0],hp=b.health;s.turrets.push({...b,vy:8});updateFortress(s,1/120,services);assert.equal(b.health,kind==='turtle-boss'?hp-1:0);}});
test('each boss demo blocks its castle until defeated, then finishes the approach and celebration',()=>{for(let n=8;n<=10;n++){const s=create(p2Level(n));s.invincible=100;s.player.x=61.5;s.player.y=19.2;tick(s,{axis:1},40);assert.equal(s.phase,'playing');for(const b of s.bosses)damageBoss(s,b,'crush');tick(s,{axis:1},80);assert.equal(s.phase,'won');tick(s,{},1000);assert.equal(s.victory.stage,'done');}});
test('bullet tutorial gap is traversable using its actual finite flight',()=>{const s=create(p2Level(3));equipWearable(s,'bullet-mask');s.player.x=14;s.player.y=18;s.grounded=false;tick(s,{axis:1,special:true});tick(s,{axis:1},270);assert.ok(s.player.x>37);assert.equal(s.phase,'playing');assert.ok(s.wearable.flight>0);});
test('propeller tutorial first high wall can be crossed through three actual boosts',()=>{const s=create(p2Level(1));equipWearable(s,'propeller-box');s.player.x=16;s.player.y=19.2;s.grounded=true;for(let n=0;n<3;n++){tick(s,{axis:1,special:true});tick(s,{axis:1},30);}tick(s,{axis:1},130);assert.ok(s.player.x>19);assert.equal(s.phase,'playing');});

test('configured propeller capacity survives use, landing and area travel',()=>{const s=create(withAreas());equipWearable(s,'propeller-box',4);s.grounded=true;tick(s,{special:true});assert.equal(s.wearable.uses,3);changeArea(s,'sub',create,[5,58]);s.grounded=true;tick(s);assert.equal(s.wearable.uses,4);assert.equal(s.wearable.capacity,4);});
test('liquid creatures launch from their matching moving liquid surface',()=>{for(const kind of ['giant-fish','lava-dragon']){const l=level();l.liquid={kind:kind==='giant-fish'?'water':'lava',low:20,high:12,period:8,mode:'cycle',x:8,width:10};const s=create(l),e=enemy(s,kind,10,18);s.time=4;advanceLiquid(s,1/120);e.ai.phase='wait';e.ai.wait=.5;updateP2Enemy(s,e,1/120,services);assert.equal(e.y,15);s.time=8;advanceLiquid(s,1/120);updateP2Enemy(s,e,1/120,services);assert.equal(e.y,23);}});

test('editing a subarea without a goal preserves legal links back to a wider main area',()=>{const l=withAreas();l.areas.sub.properties[2365].targetX=90;l.areas.sub.cells[l.areas.sub.cells.indexOf('E')]='.';const sub={...l.areas.sub,areas:l.areas};assert.equal(editSetting(sub,'liquidPeriod',10,l).liquid.period,10);assert.equal(editSetting(sub,'areaHeight',80,l).height,80);assert.equal(editSetting(sub,'areaWidth',50,l).width,50);});

const {collectPinkCoin,checkpointPinkCoins}=await import('../whale-maker/rules/pink-coins.ts');
const {conditionProgress,advanceClearRun}=await import('../whale-maker/rules/conditions.ts');
const {wearableInput,wearMotion,afterWearMove}=await import('../whale-maker/rules/p2-wearables.ts');

test('pink coins form one set across areas and award exactly one key',()=>{
 const l=withAreas();l.cells[1904]='pink-coin';l.areas.sub.cells[59*40+8]='pink-coin';const s=create(l);
 assert.equal(s.pinkTotal,2);collectPinkCoin(s,1904);assert.equal(s.keys.length,0);
 changeArea(s,'sub',create);assert.equal(s.pinkCollected,1);assert.equal(s.pinkTotal,2);collectPinkCoin(s,59*40+8);assert.equal(s.keys.length,1);
 changeArea(s,'main',create);assert.equal(s.level.cells[1904],'.');collectPinkCoin(s,1904);assert.equal(s.keys.length,1);
 changeArea(s,'sub',create);assert.equal(s.level.cells[59*40+8],'.');assert.equal(s.pinkCollected,2);
});
test('pink checkpoint subset survives death, but completing the set causes key death reset',()=>{
 const l=withAreas();l.cells[1904]='pink-coin';l.areas.sub.cells[59*40+8]='pink-coin';const s=create(l);
 collectPinkCoin(s,1904);checkpointPinkCoins(s);services.crush(s);respawn(s);assert.equal(s.pinkCollected,1);assert.equal(s.level.cells[1904],'.');
 changeArea(s,'sub',create);collectPinkCoin(s,59*40+8);assert.equal(s.keys.length,1);services.crush(s);respawn(s);
 assert.equal(s.pinkCollected,0);assert.equal(s.keys.length,0);assert.equal(s.level.cells[1904],'pink-coin');changeArea(s,'sub',create);assert.equal(s.level.cells[59*40+8],'pink-coin');
});
test('lit checkpoints can be reactivated in alternation and update saved pink progress',()=>{
 const l=level();l.cells[1905]='C';l.cells[1915]='C';l.cells[1908]='pink-coin';l.cells[1918]='pink-coin';const s=create(l);
 const touch=x=>{s.player.x=x;s.player.y=19.2;s.player.vx=s.player.vy=0;tick(s);};
 touch(5);collectPinkCoin(s,1908);touch(15);touch(5);assert.equal(s.checkpoint[0],5);services.crush(s);respawn(s);assert.equal(s.pinkCollected,1);
});
test('contact warp boxes carry the same driven car through both local and cross-area travel',()=>{
 const l=level();l.cells[1906]='warp-box';l.cells[1916]='warp-box';const s=create(l),car=makeItem('koopa-car',6,19);s.items.push(car);s.vehicle=car;seatPlayer(s);tick(s,{},90);
 assert.equal(s.vehicle,car);assert.ok(car.x>15);assert.ok(Math.abs(car.y+car.h-20)<.05);assert.equal(s.usedWarps[1906],true);assert.equal(s.usedWarps[1916],true);
 const a=withAreas();a.cells[1906]='warp-box';a.areas.sub.cells[59*40+5]='warp-box';const t=create(a),c=makeItem('koopa-car',6,19);t.items.push(c);t.vehicle=c;seatPlayer(t);assert.equal(areaTravel(t,EMPTY_INPUT,1/120,create),true);
 assert.equal(t.currentArea,'sub');assert.equal(t.vehicle,c);assert.equal(t.items.filter(i=>i===c).length,1);assert.equal(t.areaMemory.main.items.includes(c),false);assert.ok(Math.abs(c.y+c.h-60)<.001);
 changeArea(t,'main',create,[10,19.2]);assert.equal(t.vehicle,c);assert.equal(t.items.filter(i=>i===c).length,1);assert.equal(t.areaMemory.sub.vehicle,null);assert.equal(t.areaMemory.sub.items.includes(c),false);
});
test('bullet mask has horizontal unlimited slow underwater flight and wall loss preserves no-damage',()=>{
 const l=level();for(let y=10;y<20;y++)for(let x=1;x<90;x++)l.cells[y*100+x]='water';l.condition={kind:'no-damage'};const s=create(l);s.player.y=14;equipWearable(s,'bullet-mask');
 wearableInput(s,{...EMPTY_INPUT,special:true},1/120);s.wearable.flight=.01;for(let n=0;n<700;n++)wearMotion(s,EMPTY_INPUT,1/120);
 assert.equal(s.wearable.active,true);assert.equal(s.player.vy,0);assert.equal(s.player.vx,6);assert.equal(s.wearable.flight,.01);
 afterWearMove(s,1);assert.equal(s.wearable,null);assert.ok(s.invincible>0);assert.equal(conditionProgress(s).done,true);assert.equal(s.clearRun.damaged,false);
});
test('bullet jump activation and release never replenish the airborne flight budget',()=>{
 const s=flat();s.grounded=false;s.player.y=8;s.player.vy=2;equipWearable(s,'bullet-mask');wearableInput(s,{...EMPTY_INPUT,jump:true},.01);assert.equal(s.wearable.active,true);
 wearMotion(s,EMPTY_INPUT,1);const remaining=s.wearable.flight;wearableInput(s,EMPTY_INPUT,.01);assert.equal(s.wearable.active,false);wearableInput(s,{...EMPTY_INPUT,jump:true},.01);assert.equal(s.wearable.flight,remaining);
});
test('cannon shots expire at six or twelve travelled tiles and fully extend a hit ! block',()=>{
 for(const charged of [false,true]){const s=flat(),b={kind:'cannon',x:4,y:10,w:.4,h:.4,vx:11,vy:0,age:0,charged};s.cannonShots.push(b);for(let n=0;n<300&&s.cannonShots.length;n++)advanceCannonShots(s,1/120,services);assert.ok(Math.abs(b.x-4-(charged?12:6))<.001);assert.equal(s.cannonShots.length,0);}
 const l=level();l.cells[1908]='extend-block';l.properties[1908]={path:[[0,0],[0,-4]]};const s=create(l);s.cannonShots.push({kind:'cannon',x:6,y:19.2,w:.4,h:.4,vx:11,vy:0,age:0});for(let n=0;n<50;n++)advanceCannonShots(s,1/120,services);assert.equal(s.devices[0].blocks.length,5);
 for(const charged of [false,true]){const a=level();a.cells[1908]='hard-block';const t=create(a);t.cannonShots.push({kind:'cannon',x:6,y:19.2,w:.4,h:.4,vx:11,vy:0,age:0,charged});for(let n=0;n<50;n++)advanceCannonShots(t,1/120,services);assert.equal(t.level.cells[1908],'hard-block');}
});
test('boss attack counts match three stomps/cannon shots, fifteen fireballs, twenty fireballs, seven cannon shots and two POWs',()=>{
 for(const [kind,attack,count] of [['boom-boss','cannon',3],['pom-boss','cannon',3],['boom-boss','fire',15],['cat-boss','fire',20],['cat-boss','cannon',7],['cat-boss','pow',2]]){
  const s=boss(kind),b=s.bosses[0];for(let n=0;n<count;n++){b.hurt=0;b.vy=0;b.brain.mode='walk';damageBoss(s,b,attack);if(n<count-1)assert.ok(b.health>0,`${kind}/${attack}/${n}`);}assert.equal(b.health,0,`${kind}/${attack}`);
 }
 for(const kind of ['boom-boss','pom-boss','cat-boss'])for(const attack of ['star','stone','turret']){const s=boss(kind),b=s.bosses[0];b.brain.mode='hidden';b.hurt=.5;damageBoss(s,b,attack);assert.equal(b.health,0);}
});
test('star, riding and wearing clear conditions follow the actual current inventory',()=>{
 const s=flat();s.level.condition={kind:'star'};assert.equal(conditionProgress(s).done,false);s.starTime=1;assert.equal(conditionProgress(s).done,true);s.starTime=0;assert.equal(conditionProgress(s).done,false);
 s.level.condition={kind:'wearing',item:'cannon-box'};equipWearable(s,'cannon-box');assert.equal(conditionProgress(s).done,true);s.wearable=null;assert.equal(conditionProgress(s).done,false);
 s.level.condition={kind:'riding',item:'koopa-car'};const car=makeItem('koopa-car',4,19);s.items.push(car);assert.equal(conditionProgress(s).done,false);s.vehicle=car;assert.equal(conditionProgress(s).done,true);car.alive=false;assert.equal(conditionProgress(s).done,false);
 for(const condition of [{kind:'star'},{kind:'stay-water'},{kind:'wearing',item:'bullet-mask'},{kind:'riding',item:'basin'}]){const l=level();l.condition=condition;assert.deepEqual(validate(JSON.parse(JSON.stringify(l))),l);}
});
test('water clear condition is irrevocably lost upon leaving water and resets on retry',()=>{
 const l=level();l.condition={kind:'stay-water'};for(let y=12;y<20;y++)for(let x=1;x<20;x++)l.cells[y*100+x]='water';const s=create(l);s.player.y=16;advanceClearRun(s);assert.equal(conditionProgress(s).done,true);
 s.player.x=25;advanceClearRun(s);assert.equal(conditionProgress(s).failed,true);s.player.x=5;advanceClearRun(s);assert.equal(conditionProgress(s).done,false);services.crush(s);respawn(s);assert.equal(s.clearRun.leftWater,false);
});

test('3D falling ring blocks are solid on all faces and stone weight triggers their fall',()=>{
 const l=level();l.cells[1508]='fall-block';l.properties[1508]={delay:.05};const s=create(l),d=s.p2Mechanisms[0];assert.equal(d.h,1);assert.ok(deviceSolids(s).includes(d));
 const side={x:7,y:15,w:.8,h:.8,vx:5,vy:0};assert.equal(services.move(s,side,.1).wall,1);
 const below={x:8.1,y:16.1,w:.8,h:.8,vx:0,vy:-5};services.move(s,below,.1);assert.ok(below.y>=16);
 s.stones.push({x:8,y:13,w:2,h:2,vx:0,vy:0,origin:[8,13],direction:'down',phase:'idle',timer:0});for(let n=0;n<10;n++)advanceP2Mechanisms(s,1/120,services);assert.equal(d.phase,'fall');
});

test('unsatisfied clear conditions gray the goal flag and display a world-space lock',async()=>{
 const {drawGoal}=await import('../whale-maker/rendering/goal.ts');const s=create(level());s.level.condition={kind:'coins',amount:1};
 const sprites=[],fills=[],scene={sprite(...args){sprites.push(args);},fill(...args){fills.push(args);},dustParticle(){}};
 drawGoal(scene,s,94,19,100,500,48,0,false);assert.ok(sprites.find(a=>a[0]==='goal-flags')[9]);const locked=fills.length;s.coins=1;sprites.length=fills.length=0;drawGoal(scene,s,94,19,100,500,48,0,false);assert.equal(sprites.find(a=>a[0]==='goal-flags')[9],undefined);assert.ok(fills.length<locked);
});

function coopLevel(count=4){
 const l=level(100,72,60);l.progress={lives:true,initialLives:3,timeLimit:100};
 l.spawn=[24,59.2];l.cells[59*l.width+27]='G';
 const s=create(l);configureCoop(s,count,1232/48,12);return s;
}
const teamTick=(s,inputs=[],n=1)=>{for(let frame=0;frame<n;frame++)stepCoop(s,inputs.map(i=>({...EMPTY_INPUT,...i})));};
const bodies=s=>s.coop.players.map((_,i)=>playerAt(s,i).player);

test('co-op walks, jumps and picks up independently while the shared world advances once',()=>{
 const s=coopLevel();const enemy=makeEnemy('duck',20,59);enemy.vx=0;s.enemies.push(enemy);
 teamTick(s);
 const start=bodies(s).map(p=>p.x);const t=s.time;
 teamTick(s,[{},{axis:1,jump:true},{},{}],8);
 assert.equal(s.player.x,start[0]);assert.ok(bodies(s)[1].x>start[1]);assert.ok(bodies(s)[1].y<bodies(s)[0].y);
 assert.deepEqual(bodies(s).slice(2).map(p=>p.x),start.slice(2));
 assert.ok(Math.abs(s.time-t-8/120)<1e-8);assert.ok(Math.abs(s.timeRemaining-100+9/120)<1e-8);
 assert.ok(Math.abs(enemy.age-9/120)<1e-8);
 asPlayer(s,1,()=>{Object.assign(s.player,{x:27,y:59.2,vx:0,vy:0});});
 teamTick(s);
 assert.equal(playerAt(s,1).power,1);assert.equal(s.power,0);
 assert.ok(s.rewards.every(r=>r.kind!=='growth'));
});

test('co-op tethers an outlier horizontally and vertically around the mean camera',()=>{
 const s=coopLevel();s.rewards=[];
 const onScreen=()=>{
  const camera=coopCamera(s),p=bodies(s),bounds=s.coop.viewport;
  assert.ok(Math.abs(camera.x+bounds.w/2-p.reduce((sum,b)=>sum+b.x+b.w/2,0)/4)<1e-8);
  for(const b of p){assert.ok(b.x>=camera.x-1e-6&&b.x+b.w<=camera.x+bounds.w+1e-6);assert.ok(b.y>=camera.y-1e-6&&b.y+b.h<=camera.y+bounds.h+1e-6);}
 };
 teamTick(s,[{axis:1}],600);onScreen();
 const edge=s.player.x;
 teamTick(s,[{axis:1}],120);assert.ok(Math.abs(s.player.x-edge)<1e-7);
 teamTick(s,[{axis:1},{axis:1},{axis:1},{axis:1}],240);onScreen();assert.ok(s.player.x>edge+5);
 const high=coopLevel();high.rewards=[];high.player.y=50;high.player.vy=-12;high.grounded=false;
 for(let f=0;f<100;f++)teamTick(high);
 assert.equal(high.phase,'playing');
 assert.ok(Math.max(...bodies(high).map(p=>p.y+p.h))-Math.min(...bodies(high).map(p=>p.y))<=high.coop.viewport.h+1e-6);
});

test('an early arrival waits and only the fourth arrival starts victory for the whole team',()=>{
 const s=coopLevel();s.rewards=[];
 const id=s.goalCells[0],goalX=id%s.level.width,goalY=Math.floor(id/s.level.width);
 for(let i=0;i<4;i++)asPlayer(s,i,()=>{s.player.x=goalX-4-i;s.player.y=goalY-.8;});
 for(let i=0;i<4;i++){
  asPlayer(s,i,()=>{s.player.x=goalX;s.player.y=goalY-.8;});
  teamTick(s);
  assert.equal(s.coop.arrivals.filter(Boolean).length,i+1);
  assert.equal(s.phase,i===3?'won':'playing');
  assert.equal(s.events.filter(e=>e.kind==='goal').length,i===3?1:0);
 }
 teamTick(s,[],500);assert.ok(s.coop.players.every((_,i)=>playerAt(s,i).victory?.stage==='done'));
});

test('a teammate can take the group through a long door and revive without resetting the world',()=>{
 const l=level(100,72,60);l.progress={lives:true,initialLives:3};l.cells[59*l.width+8]='door';l.cells[59*l.width+48]='door';
 const s=create(l);configureCoop(s,2,1232/48,12);
 asPlayer(s,1,()=>{s.player.x=8;grantPower(s,1);});
 teamTick(s,[{},{interact:true}],95);
 assert.equal(s.coop.traveler,-1);assert.ok(bodies(s).every(p=>p.x>46));assert.equal(playerAt(s,1).power,1);assert.equal(s.power,0);
 asPlayer(s,1,()=>services.crush(s));teamTick(s);
 assert.equal(s.coop.recovery[1].kind,'waiting');assert.equal(s.lives,2);assert.equal(s.phase,'playing');
 const previousX=s.player.x;s.coins=9;teamTick(s,[{axis:1}],90);
 assert.ok(s.player.x>previousX+1);assert.equal(s.coins,9);assert.equal(s.coop.recovery[1],null);
 assert.equal(s.lives,2);assert.equal(playerAt(s,1).power,0);assert.ok(playerAt(s,1).invincible>0);
 assert.ok(Math.abs(playerAt(s,1).player.x-s.player.x)<.1);
});

test('co-op control remaps isolate all four keyboard and gamepad assignments',()=>{
 const settings=defaultSettings();settings.count=4;
 assert.equal(changeBinding(settings,1,'keys',4,'KeyA'),true);
 assert.equal(settings.players[0].keys[0],'Enter');
 assert.equal(changeBinding(settings,2,'pad',4,'b3'),true);
 assert.equal(changeBinding(settings,0,'keys',3,'KeyP'),false);
 assignDevice(settings,2,3);
 assert.equal(validSettings(JSON.parse(JSON.stringify(settings))),true);
 const pad={index:3,values:{x:.8},held:new Set(['b3']),pressed:new Set(['b3'])};
 const inputs=settings.players.map((_,i)=>playerInput(settings,i,new Set(['KeyA']),[pad],new Set()));
 assert.deepEqual(inputs.map(i=>i.jump),[false,true,true,false]);
 assert.deepEqual(inputs.map(i=>i.axis),[0,0,1,0]);
});

test('cross-area doors move the whole team and preserve a companion’s held object',()=>{
 const s=create(withAreas());configureCoop(s,3,1232/48,12);
 const crate=makeItem('wood-crate',3,19);crate.held=true;s.items.push(crate);s.held=crate;
 asPlayer(s,1,()=>{s.player.x=6;});
 teamTick(s,[{grab:true},{interact:true}]);
 assert.equal(s.currentArea,'sub');assert.ok(bodies(s).every(p=>Math.abs(p.x-5)<1));
 assert.equal(s.held,crate);assert.equal(s.items.filter(i=>i===crate).length,1);assert.equal(s.areaMemory.main.items.includes(crate),false);
});

function rescueCourse(pitLeft,pitRight){
 const l=level(100,72,60);l.spawn=[25,59.2];l.progress={lives:true,initialLives:5};
 for(let y=60;y<l.height;y++)for(let x=pitLeft;x<pitRight;x++)l.cells[y*l.width+x]='.';
 const s=create(l);configureCoop(s,3,1232/48,12);return s;
}
function placeCoopPlayer(s,index,x,y=59.2){asPlayer(s,index,()=>{Object.assign(s.player,{x,y,vx:0,vy:0});s.grounded=false;});}

test('revival searches the nearest safe dry ground when the surviving camera is centered over a pit',()=>{
 const s=rescueCourse(31,37);placeCoopPlayer(s,0,28);placeCoopPlayer(s,1,40);placeCoopPlayer(s,2,34);
 const stepBefore=s.time;
 for(let f=0;f<200&&!s.coop.recovery[2];f++)teamTick(s);
 assert.equal(s.phase,'playing');assert.equal(s.coop.recovery[2]?.kind,'waiting');assert.equal(s.lives,4);
 const camera=coopCamera(s);assert.ok(Math.abs(camera.x+s.coop.viewport.w/2-34.45)<1e-8);
 const time=s.time;assert.ok(time>stepBefore);
 teamTick(s,[],90);const q=playerAt(s,2).player;
 assert.equal(s.coop.recovery[2],null);assert.ok(s.time>time+.7);
 assert.ok(q.x+q.w<=31.002||q.x>=36.998);assert.ok(Math.abs(q.y+q.h-60)<1e-8);assert.equal(s.lives,4);
});

test('when neither side of the camera center has nearby ground, a bubble needs a teammate touch',()=>{
 const s=rescueCourse(26,41);placeCoopPlayer(s,0,23);placeCoopPlayer(s,1,43);placeCoopPlayer(s,2,33);
 asPlayer(s,2,()=>services.crush(s));teamTick(s,[{},{},{axis:1,jump:true}],91);
 const bubble=playerAt(s,2).player;
 assert.equal(s.coop.recovery[2]?.kind,'bubble');assert.ok(Math.abs(bubble.x-33)<.12);assert.equal(s.coop.arrivals[2],null);
 teamTick(s,[{},{},{axis:1,jump:true,fire:true}],45);
 assert.equal(s.coop.recovery[2]?.kind,'bubble');assert.equal(s.shots.length,0);
 // The bubble drifts into the nearer player on the ledge. Recovery occurs only with physical contact.
 for(let f=0;f<600&&s.coop.recovery[2];f++)teamTick(s);
 assert.equal(s.phase,'playing');assert.equal(s.coop.recovery[2],null);assert.equal(s.coop.pops.length,1);
 const view=coopCamera(s);
 assert.ok(bodies(s).every(p=>p.x>=view.x-.001&&p.x+p.w<=view.x+s.coop.viewport.w+.001));
 assert.ok(Math.abs(playerAt(s,2).player.x-s.player.x)<3.1||Math.abs(playerAt(s,2).player.x-playerAt(s,1).player.x)<3.1);
 assert.equal(s.lives,4);
});

test('a wipe, exhausted lives and timeouts end the team run once and clear recovery on retry',()=>{
 const s=coopLevel(2);
 services.crush(s);asPlayer(s,1,()=>services.crush(s));
 assert.equal(s.phase,'dead');assert.equal(s.lives,1);assert.equal(s.deaths,2);
 teamTick(s,[],40);assert.equal(s.lives,1);respawn(s);assert.deepEqual(s.coop.recovery,[null,null]);assert.equal(s.lives,1);
 services.crush(s);assert.equal(s.phase,'dead');assert.equal(s.gameOver,true);assert.equal(s.lives,0);
 respawn(s);assert.equal(s.lives,3);assert.equal(s.phase,'playing');assert.deepEqual(s.coop.recovery,[null,null]);
 s.timeRemaining=.001;teamTick(s);assert.equal(s.phase,'dead');assert.equal(s.lives,2);
 teamTick(s);assert.equal(s.lives,2);
});

test('a teammate already at the goal keeps the run alive and can wait for the final player to revive',()=>{
 const s=coopLevel(2),id=s.goalCells[0],x=id%s.level.width,y=Math.floor(id/s.level.width);
 placeCoopPlayer(s,0,x,y-.8);placeCoopPlayer(s,1,x-3,y+.2);teamTick(s);
 assert.ok(s.coop.arrivals[0]);assert.equal(s.coop.arrivals[1],null);
 asPlayer(s,1,()=>{services.crush(s);services.crush(s);});
 assert.equal(s.phase,'playing');assert.equal(s.lives,2);
 const time=s.time;teamTick(s,[],92);
 assert.ok(s.time>time+.7);assert.equal(s.coop.recovery[1],null);assert.ok(s.coop.arrivals[0]);assert.equal(s.phase,'playing');
 placeCoopPlayer(s,1,x,y-.8);teamTick(s);assert.equal(s.phase,'won');
});
