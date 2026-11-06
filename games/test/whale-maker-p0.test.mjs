import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,EMPTY_INPUT,validate,respawn,solid,tile}=await import('../whale-maker/rules/model.ts');
const {REFERENCE_RULES,LEGACY_RULES,rulesFor,modernLevel,elementOrigin}=await import('../whale-maker/rules/profile.ts');
const {attackResult,ENEMY_TRAITS,bossAttackResult,mechanismResult}=await import('../whale-maker/rules/interactions.ts');
const {defeatEnemy}=await import('../whale-maker/rules/combat.ts');
const {collectToken}=await import('../whale-maker/rules/scoring.ts');
const {makeEnemy,makeItem}=await import('../whale-maker/rules/expansion.ts');
const {freezeEnemy,thawEnemy,advanceFrost,FREEZE_DURATION,FREEZE_AIR_HANG}=await import('../whale-maker/rules/frost.ts');
const {grantPower}=await import('../whale-maker/rules/power.ts');
const {meltIce,heldAction}=await import('../whale-maker/rules/advanced.ts');
const {writePipe,pipeShape}=await import('../whale-maker/rules/pipes.ts');
const {placeBoss}=await import('../whale-maker/rules/fortress.ts');
const {surface,launchBomb}=await import('../whale-maker/rules/workshop.ts');
const {stampSelection,pasteStamp}=await import('../whale-maker/editor/selection.ts');
const {p0Level}=await import('../whale-maker/rules/p0-level.ts');
const {classicLevel,nextClassic}=await import('../whale-maker/rules/classic.ts');
const {drawItem}=await import('../whale-maker/rendering/expansion.ts');
const {placeGlassPipe,DEFAULT_GLASS_PATH,glassRouteGeometry}=await import('../whale-maker/rules/glass.ts');
function level(modern=true){const width=100,height=32,cells=Array(width*height).fill('.');for(let y=20;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[19*width+95]='E';return {version:1,name:'P0规则校验',width,height,cells,spawn:[2,19.2],properties:{},contents:{},...(modern?{rules:{...REFERENCE_RULES}}:{})};}
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
const flat=(modern=true)=>{const s=create(level(modern));tick(s);return s;};
const enemy=(s,kind='duck',x=8,y)=>{const e=makeEnemy(kind,x,19);e.y=y??20-e.h;s.enemies.push(e);return e;};
const fireAt=(s,e,kind='ice')=>{s.shots.push({x:e.x+.1,y:e.y+.1,w:.28,h:.28,vx:0,vy:0,kind});tick(s);};

test('missing rule metadata preserves legacy behavior; fresh profiles round-trip without rewriting old maps',()=>{
 const old=level(false),saved=JSON.stringify(old);assert.deepEqual(rulesFor(validate(JSON.parse(saved))),LEGACY_RULES);assert.equal(JSON.stringify(old),saved);
 const fresh=modernLevel(old);assert.deepEqual(validate(JSON.parse(JSON.stringify(fresh))),fresh);assert.deepEqual(rulesFor(fresh),REFERENCE_RULES);assert.equal(old.rules,undefined);
 for(const rules of [null,[],{...REFERENCE_RULES,revision:2},{...REFERENCE_RULES,rewards:'coins'},{...REFERENCE_RULES,freezing:'never'},{...REFERENCE_RULES,extra:1}])assert.throws(()=>validate({...old,rules}));
});
test('campaign transitions and retry retain the explicit rule profile',()=>{
 const l=modernLevel(classicLevel()),s=create(l);s.phase='won';s.victory={stage:'done',age:3};assert.deepEqual(nextClassic(s).level.rules,REFERENCE_RULES);s.score=1234;s.coins=6;s.scoreChain.stomp=4;respawn(s);assert.deepEqual(s.level.rules,REFERENCE_RULES);assert.deepEqual([s.score,s.coins,s.scoreChain.stomp,s.scorePops.length],[0,0,0,0]);
});
test('combat table covers every current enemy, special resistance, frozen result and boss damage',()=>{
 assert.equal(Object.keys(ENEMY_TRAITS).length,35);
 for(const kind of Object.keys(ENEMY_TRAITS)){const e=makeEnemy(kind,5,5);for(const attack of ['stomp','spin','pound','fire','ice','shell','star','block','helmet'])assert.ok(attackResult(e,attack));e.alive=false;assert.equal(attackResult(e,'star'),'ignore');}
 const e=makeEnemy('spiky',5,5);assert.equal(attackResult(e,'stomp'),'hurt');assert.equal(attackResult(e,'spin'),'rebound');assert.equal(attackResult(makeEnemy('turtle',5,5),'stomp'),'shell');assert.equal(attackResult(makeEnemy('iron-turtle',5,5),'fire'),'ignore');assert.equal(attackResult(makeEnemy('fire-jumper',5,5),'ice'),'defeat');
 e.frozen={thrown:false,vx:0};assert.equal(attackResult(e,'fire'),'thaw');assert.equal(attackResult(e,'pound'),'shatter');assert.equal(attackResult(e,'ice'),'ignore');assert.equal(bossAttackResult('ice'),'damage');assert.equal(bossAttackResult('stomp'),'hurt');
 assert.equal(elementOrigin('ice-flower'),'保留扩展');assert.equal(elementOrigin('ice-solid'),'3D基础');assert.equal(elementOrigin('.'),'编辑工具');
});
test('modern defeats award score once, legacy defeats keep coin rewards',()=>{
 for(const modern of [false,true]){const s=flat(modern),e=enemy(s);defeatEnemy(s,e,'shot');defeatEnemy(s,e,'stomp');assert.equal(s.coins,modern?0:1);assert.equal(s.score,modern?100:0);assert.equal(s.defeated.length,1);const b=enemy(s);defeatEnemy(s,b,'shell');assert.equal(s.coins,modern?0:3);}
});
test('bomb arming and launch, switches, springs and ice have distinct contact results',()=>{
 const b=makeEnemy('bomb',5,5);assert.equal(attackResult(b,'stomp'),'arm');b.bombFuse=3;assert.equal(attackResult(b,'stomp'),'launch');
 for(const c of ['head','pound','fire','ice'])assert.equal(mechanismResult('toggle-switch',c),'trigger');assert.equal(mechanismResult('pow','pound'),'trigger');assert.equal(mechanismResult('pow','shell'),'trigger');assert.equal(mechanismResult('pow','top'),'solid');assert.equal(mechanismResult('p-switch','top'),'trigger');assert.equal(mechanismResult('p-switch','side'),'solid');assert.equal(mechanismResult('spring-h','top'),'solid');assert.equal(mechanismResult('spring-h','side'),'rebound');assert.equal(mechanismResult('ice','fire'),'melt');assert.equal(mechanismResult('ice-solid','fire'),'solid');
});
test('physical coin drops render animated Token art at a fixed reference size',()=>{
 const calls=[],scene={actor(...args){calls.push(args);}},s=flat(),item=makeItem('coin',5,19);drawItem(scene,s,item,200,300,48);s.time=.05;drawItem(scene,s,item,200,300,48);assert.equal(calls[0][0],'tokens');assert.notEqual(calls[0][1],calls[1][1]);assert.equal(calls[0][4],40);assert.equal(calls[0][6],0);assert.equal(calls[1][6],0);
});
test('real coin pickups change coins and score; visual token particles award nothing',()=>{
 const s=flat();s.coinPops.push({x:8,y:16,age:0});tick(s,{},90);assert.deepEqual([s.coins,s.score],[0,0]);collectToken(s);assert.deepEqual([s.coins,s.score],[1,100]);
 const l=level();l.cells[19*l.width+2]='o';const a=create(l);tick(a);assert.deepEqual([a.coins,a.score],[1,100]);assert.equal(tile(a.level,2,19),'.');tick(a,{},30);assert.equal(a.coins,1);
});
test('configured coin and key drops are physical, separate, copied and issued once',()=>{
 for(const [kind,drop]of [['J','coin'],['T','key'],['bomb','coin']]){const l=level(),id=19*l.width+8;l.cells[id]=kind;l.properties[id]={drop};const stamp=stampSelection(l,new Set([id]));pasteStamp(l,stamp,12,19);validate(JSON.parse(JSON.stringify(l)));const s=create(l),e=s.enemies[0];defeatEnemy(s,e,'shot');defeatEnemy(s,e,'shot');assert.equal(s.coins,0);assert.equal(s.score,100);assert.equal(s.items.filter(i=>i.kind===drop).length,1);assert.equal(s.enemies[1].drop,drop);const item=s.items.find(i=>i.kind===drop);s.player.x=item.x;s.player.y=19.2;item.y=19.2;item.vy=0;item.cooldown=0;tick(s);assert.equal(drop==='coin'?s.coins:s.keys.length,1);assert.equal(s.items.filter(i=>i.kind===drop).length,0);}
 const l=level();l.properties[20*l.width+6]={drop:'coin'};assert.throws(()=>validate(l));l.cells[20*l.width+6]='J';l.properties[20*l.width+6]={drop:'star'};assert.throws(()=>validate(l));
});
test('drop floods stay bounded and never discard an object the player is holding',()=>{
 const s=flat(),held=makeItem('pow',2,19);held.held=true;s.items.push(held);s.held=held;
 for(let n=0;n<150;n++){const e=enemy(s);e.drop='coin';defeatEnemy(s,e,'shot');}
 assert.equal(s.items.length,128);assert.equal(s.items[0],held);assert.equal(s.held,held);assert.equal(s.scorePops.length,12);
});
test('coin and key drops that leave the playable world retire without rewarding the player',()=>{
 const s=flat();for(const kind of ['coin','key']){const item=makeItem(kind,5,19);item.y=s.level.height+3;s.items.push(item);}tick(s);assert.equal(s.items.length,0);assert.equal(s.coins,0);assert.equal(s.keys.length,0);
});
test('stomp chains continue in air and end at actual ground contact',()=>{
 const s=flat();s.player.y=14;s.grounded=false;defeatEnemy(s,enemy(s),'stomp');defeatEnemy(s,enemy(s),'stomp');assert.deepEqual(s.scorePops.map(p=>p.points),[100,200]);tick(s);assert.equal(s.scoreChain.stomp,2);s.player.y=19.2;s.player.vy=1;tick(s);assert.equal(s.scoreChain.stomp,0);defeatEnemy(s,enemy(s),'stomp');assert.equal(s.scorePops.at(-1).points,100);
});
test('turtle stomp scores a chain without creating a coin or configured drop before actual defeat',()=>{
 const s=flat(),e=enemy(s,'turtle');e.vx=0;e.drop='key';s.player.x=e.x;s.player.y=e.y-s.player.h-.025;s.player.vy=5;s.grounded=false;tick(s);assert.equal(e.kind,'shell');assert.equal(s.score,100);assert.equal(s.coins,0);assert.equal(s.items.length,0);assert.equal(e.drop,'key');
});
test('shell chains belong to each moving weapon and reset on a new throw',()=>{
 const s=flat(),a=enemy(s,'shell'),b=enemy(s,'shell',15);defeatEnemy(s,enemy(s),'shell',a);defeatEnemy(s,enemy(s),'shell',a);defeatEnemy(s,enemy(s),'shell',b);assert.deepEqual(s.scorePops.map(p=>p.points),[100,200,100]);a.held=true;s.held=a;s.previous.fire=false;heldAction(s,{...EMPTY_INPUT,grab:true,fire:true});assert.equal(a.attackChain,0);defeatEnemy(s,enemy(s),'shell',a);assert.equal(s.scorePops.at(-1).points,100);
 const bomb=enemy(s,'bomb');bomb.attackChain=8;launchBomb(bomb,1,'throw');assert.equal(bomb.attackChain,0);
});
test('a real moving shell defeats consecutive enemies with one escalating chain',()=>{
 const s=flat(),a=enemy(s,'shell',6),b=enemy(s,'duck',9),c=enemy(s,'duck',12);a.vx=12;b.vx=c.vx=0;tick(s,{},70);assert.equal(b.alive,false);assert.equal(c.alive,false);assert.equal(a.attackChain,2);assert.equal(s.score,300);assert.equal(s.coins,0);
});
test('star chain continues during the same star and resets after its expiration',()=>{
 const s=flat();s.starTime=2;defeatEnemy(s,enemy(s),'star');s.time=1;s.starTime=1;defeatEnemy(s,enemy(s),'star');s.time=3;s.starTime=10;defeatEnemy(s,enemy(s),'star');assert.deepEqual(s.scorePops.map(p=>p.points),[100,200,100]);
 for(let n=0;n<30;n++)defeatEnemy(s,enemy(s),'shot');assert.equal(s.scorePops.length,12);tick(s,{},121);assert.equal(s.scorePops.length,0);
});
test('old ice remains meltable even empty; ordinary ice is solid slippery terrain that cannot melt',()=>{
 for(const modern of [false,true]){const l=level(modern);for(const [x,t]of [[7,'ice'],[8,'ice'],[9,'ice-solid']])l.cells[20*l.width+x]=t;l.contents[20*l.width+8]='coin';const s=create(l);assert.equal(solid('ice-solid'),true);s.player.x=9;s.player.y=19.2;assert.equal(surface(s,s.player).grip,.5);meltIce(s,7,20);meltIce(s,8,20);meltIce(s,9,20);assert.equal(tile(s.level,7,20),'.');assert.equal(tile(s.level,8,20),'o');assert.equal(tile(s.level,9,20),'ice-solid');assert.equal(s.coins,0);}
 const l=level();l.cells[19*l.width+5]='ice-solid';l.contents[19*l.width+5]='duck';assert.throws(()=>validate(l));
});
test('ordinary ice slippery setting and enemy drop survive copy and JSON save',()=>{
 const l=level(),id=20*l.width+8;l.cells[id]='ice-solid';l.properties[id]={slippery:false};pasteStamp(l,stampSelection(l,new Set([id])),12,20);const saved=validate(JSON.parse(JSON.stringify(l)));assert.deepEqual(saved.properties[20*l.width+12],{slippery:false});const s=create(saved);s.player.x=12;s.player.y=19.2;assert.equal(surface(s,s.player).grip,1);
});
test('timed freezes warn then restore identity; legacy freezes remain permanent',()=>{
 const s=flat(),e=enemy(s);e.smart=true;assert.equal(freezeEnemy(s,e),true);assert.equal(freezeEnemy(s,e),false);assert.equal(e.frozen.remaining,FREEZE_DURATION);advanceFrost(s,4.9);assert.ok(e.frozen.remaining<1.2);advanceFrost(s,1.2);assert.equal(e.frozen,undefined);assert.equal(e.smart,true);assert.equal(e.alive,true);assert.equal(s.score,0);
 const old=flat(false),b=enemy(old);freezeEnemy(old,b);advanceFrost(old,99);assert.equal(b.frozen.remaining,Infinity);
});
test('held frozen enemies pause the timer and retain identity after soft placement at a new position',()=>{
 const s=flat(),e=enemy(s,'squid');e.origin=[8,16];e.squidPhase='sink';e.squidPeak=12;freezeEnemy(s,e);e.held=true;s.held=e;advanceFrost(s,20);assert.equal(e.frozen.remaining,6);s.player.x=20;heldAction(s,EMPTY_INPUT);const feet=e.y+e.h,center=e.x+e.w/2;assert.equal(s.held,null);advanceFrost(s,6.1);assert.equal(e.frozen,undefined);assert.equal(e.squidPhase,'sink');assert.ok(Math.abs(e.y+e.h-feet)<1e-9);assert.ok(Math.abs(e.x+e.w/2-center)<1e-9);assert.ok(e.origin[0]>8);
});
test('frozen air enemies hang briefly then fall and shatter on a hard landing once',()=>{
 const s=flat(),e=enemy(s,'duck',8,10);freezeEnemy(s,e);assert.equal(e.frozen.hang,FREEZE_AIR_HANG);tick(s,{},55);assert.equal(e.y,10);tick(s,{},30);assert.ok(e.y>10);tick(s,{},170);assert.equal(e.alive,false);assert.equal(s.score,100);assert.equal(s.defeated.length,1);
});
test('frozen enemies float towards the water surface and do not thaw in water',()=>{
 const l=level();for(let y=14;y<20;y++)for(let x=7;x<13;x++)l.cells[y*l.width+x]='water';const s=create(l),e=enemy(s,'fish',9,17);freezeEnemy(s,e);tick(s,{},1200);assert.equal(e.alive,true);assert.ok(e.frozen);assert.equal(e.frozen.remaining,6);assert.ok(Math.abs(e.y+e.h-(14+e.h*.18))<.05);e.x=15;advanceFrost(s,6.1);assert.equal(e.frozen,undefined);
});
test('all four pipe plant orientations retain their pipe association when thawed in place',()=>{
 for(const rotation of [0,90,180,270]){const l=level();writePipe(l,10,12,4,rotation);l.properties[12*l.width+10].plant=true;const s=create(l),e=s.enemies[0];e.age=2;tick(s);assert.ok(Math.min(e.w,e.h)>.08);const snapshot=structuredClone(e);freezeEnemy(s,e);assert.equal(e.frozen.anchored,true);tick(s,{},80);assert.equal(e.x,snapshot.x);assert.equal(e.y,snapshot.y);thawEnemy(s,e);assert.equal(e.mode,'pipe');assert.deepEqual(e.plantMouth,snapshot.plantMouth);assert.deepEqual(e.plantDirection,snapshot.plantDirection);assert.deepEqual(e.origin,snapshot.origin);assert.equal(e.w,snapshot.w);assert.equal(e.h,snapshot.h);}
});
test('pipe plant cannot be detached by modern grab, while a free plant can be carried and resumes gravity',()=>{
 const l=level();writePipe(l,10,16,4);l.properties[16*l.width+10].plant=true;const s=create(l),e=s.enemies[0];e.age=2;tick(s);freezeEnemy(s,e);e.cooldown=0;s.player.x=e.x-.9;s.player.y=e.y;tick(s,{grab:true});assert.equal(s.held,null);
 const a=flat(),b=enemy(a,'plant',6);freezeEnemy(a,b);b.cooldown=0;a.player.x=b.x-.91;a.player.y=19.2;tick(a,{grab:true});assert.equal(a.held,b);tick(a);thawEnemy(a,b);assert.equal(b.mode,'fixed');assert.equal(b.plantMouth,undefined);assert.equal(b.alive,true);
});
test('a legacy detached pipe plant thaws as an independent plant at its carried location',()=>{
 const l=level(false);writePipe(l,10,16,4);l.properties[16*l.width+10].plant=true;const s=create(l),e=s.enemies[0];e.age=2;tick(s);freezeEnemy(s,e);e.held=true;e.frozen.detached=true;s.held=e;s.player.x=20;heldAction(s,EMPTY_INPUT);const x=e.x,feet=e.y+e.h;thawEnemy(s,e);assert.equal(e.mode,'fixed');assert.equal(e.plantMouth,undefined);assert.equal(e.x,x);assert.equal(e.y+e.h,feet);assert.equal(s.held,null);
});
test('frozen bombs pause their fuse; flight paths and iron shell identity are restored on thaw',()=>{
 const s=flat(),bomb=enemy(s,'bomb');bomb.bombFuse=2;freezeEnemy(s,bomb);tick(s,{},120);assert.equal(bomb.bombFuse,2);thawEnemy(s,bomb);tick(s,{},60);assert.ok(bomb.bombFuse<1.51&&bomb.bombFuse>1.49);
 const flying=enemy(s,'turtle');flying.flight=[10,14];freezeEnemy(s,flying);assert.equal(flying.flight,undefined);thawEnemy(s,flying);assert.ok(flying.flight.every((v,i)=>Math.abs(v-[10,14][i])<1e-9));
 const iron=enemy(s,'shell');iron.iron=true;iron.shellAge=4;freezeEnemy(s,iron);thawEnemy(s,iron);assert.equal(iron.iron,true);assert.equal(iron.shellAge,4);
});
test('carrying frozen enemies through doors pauses thaw; unheld offscreen enemies still thaw',()=>{
 const l=level();l.cells[19*l.width+3]='door';l.cells[19*l.width+40]='door';const s=create(l),e=enemy(s);freezeEnemy(s,e);e.held=true;e.frozen.detached=true;s.held=e;s.player.x=3;s.player.y=19.2;tick(s,{grab:true,interact:true});assert.ok(s.door);tick(s,{grab:true},90);assert.equal(s.door,null);assert.ok(s.player.x>39);assert.equal(s.held,e);assert.equal(e.frozen.remaining,6);assert.ok(e.x>39);
 tick(s);assert.equal(s.held,null);tick(s,{},725);assert.equal(e.frozen,undefined);
 const a=flat(),b=enemy(a,'duck',80);freezeEnemy(a,b);tick(a,{},725);assert.equal(b.frozen,undefined);assert.equal(b.alive,true);
});
test('unheld frost clocks continue while traversing ordinary and transparent pipes',()=>{
 for(const glass of [false,true]){const l=level();if(glass)placeGlassPipe(l,10*l.width+8,DEFAULT_GLASS_PATH);else{writePipe(l,8,16,3);writePipe(l,20,16,3);l.properties[16*l.width+8].link=l.properties[16*l.width+20].link=8;}const s=create(l),e=enemy(s,'duck',80);freezeEnemy(s,e);e.frozen.remaining=.05;const m=glass?glassRouteGeometry(s.level)[0].mouths[0]:(()=>{const p=pipeShape(s.level,16*l.width+8);return {point:p.mouth,normal:p.normal};})();s.player.x=m.point[0]-s.player.w/2;s.player.y=m.point[1]-s.player.h-.003;s.grounded=true;tick(s,{down:true});assert.ok(s.pipe);tick(s,{},10);assert.equal(e.frozen,undefined);}
});
test('the same held frozen enemy traverses and exits real ordinary and curved pipes with its timer paused',()=>{
 for(const glass of [false,true]){const l=level();if(glass)placeGlassPipe(l,10*l.width+8,DEFAULT_GLASS_PATH);else{writePipe(l,8,16,3);writePipe(l,20,16,3);l.properties[16*l.width+8].link=l.properties[16*l.width+20].link=8;}const s=create(l),e=enemy(s);freezeEnemy(s,e);e.held=true;e.frozen.detached=true;s.held=e;const m=glass?glassRouteGeometry(s.level)[0].mouths[0]:(()=>{const p=pipeShape(s.level,16*l.width+8);return {point:p.mouth,normal:p.normal};})();s.player.x=m.point[0]-s.player.w/2;s.player.y=m.point[1]-s.player.h-.003;s.grounded=true;tick(s,{down:true,grab:true});assert.ok(s.pipe);let count=0;while(s.pipe&&count++<1000){tick(s,{grab:true});assert.equal(s.held,e);assert.equal(e.frozen.remaining,6);}assert.equal(s.pipe,null);assert.ok(s.player.x>15);assert.equal(e.alive,true);assert.ok(e.x>15);assert.equal(s.phase,'playing');}
});
test('downward pound shatters a frozen enemy while ordinary standing does not',()=>{
 for(const pound of [false,true]){const s=flat(),e=enemy(s);freezeEnemy(s,e);s.player.x=e.x;s.player.y=e.y-s.player.h-.02;s.player.vy=5;s.grounded=false;s.pound=pound?'fall':'none';s.previous.down=pound;tick(s,{down:pound},3);assert.equal(e.alive,!pound);if(pound){assert.equal(s.score,100);assert.equal(s.coins,0);}else assert.equal(s.grounded,true);}
});
test('throwing ice breaks ordinary brick and enemies once, but thaw alone never scores or drops',()=>{
 const s=flat(),e=enemy(s,'duck',5),other=enemy(s,'duck',8);e.drop='coin';other.vx=0;freezeEnemy(s,e);thawEnemy(s,e);freezeEnemy(s,e);assert.equal(s.score,0);assert.equal(s.items.length,0);s.level.cells[19*s.level.width+11]='B';e.frozen.thrown=true;e.frozen.hang=0;e.vx=12;tick(s,{},80);assert.equal(other.alive,false);assert.equal(e.alive,false);assert.equal(tile(s.level,11,19),'.');assert.equal(s.items.filter(i=>i.kind==='coin').length,1);assert.equal(s.coins,0);assert.equal(s.score,200);
});
test('modern ice balls have one ground rebound, then burst; fire balls keep bouncing',()=>{
 for(const kind of ['ice','fire']){const s=flat();s.shots.push({x:6,y:19.7,w:.28,h:.28,vx:1,vy:4,kind});tick(s,{},6);assert.equal(s.shots.length,1);assert.ok(s.shots[0].vy<0);if(kind==='ice')assert.equal(s.shots[0].bounces,1);tick(s,{},100);assert.equal(s.shots.length,kind==='ice'?0:1);if(kind==='ice')assert.ok(s.effects.some(e=>e.kind==='frost')||s.events.some(e=>e.kind==='ice'));}
});
test('fireballs melt only meltable ice; modern ice shoots slower, freezes ordinary enemies and extinguishes fire',()=>{
 const s=flat();grantPower(s,4);tick(s,{fire:true},9);assert.equal(s.shots[0].kind,'ice');assert.equal(s.shots[0].vx,8);
 for(const [x,t]of [[7,'ice'],[11,'ice-solid']]){s.level.cells[19*s.level.width+x]=t;s.shots=[{x:x-.3,y:19.3,w:.28,h:.28,vx:11,vy:0,kind:'fire'}];tick(s);assert.equal(s.shots.length,0);assert.equal(tile(s.level,x,19),t==='ice'?'.':'ice-solid');}
 const e=enemy(s);fireAt(s,e);assert.ok(e.frozen);fireAt(s,e,'fire');assert.equal(e.frozen,undefined);assert.equal(e.alive,true);assert.equal(s.score,0);
 const flame=enemy(s,'fire-jumper',10);fireAt(s,flame,'fire');assert.equal(flame.alive,true);fireAt(s,flame);assert.equal(flame.alive,false);assert.equal(flame.frozen,undefined);
});
test('ice damages the original boss without freezing and retry clears frozen and reward state',()=>{
 const l=level();placeBoss(l,10,18);l.cells[19*l.width+8]='J';l.properties[19*l.width+8]={drop:'coin'};const s=create(l),b=s.bosses[0];s.shots.push({x:10.3,y:18.2,w:.28,h:.28,vx:0,vy:0,kind:'ice'});tick(s);assert.equal(b.health,4);assert.equal(b.frozen,undefined);const e=s.enemies[0];freezeEnemy(s,e);defeatEnemy(s,e,'shot');respawn(s);assert.equal(s.enemies[0].frozen,undefined);assert.equal(s.enemies[0].drop,'coin');assert.equal(s.items.length,0);assert.equal(s.score,0);assert.deepEqual(s.level.rules,REFERENCE_RULES);
});
test('P0 demo validates, exposes all trial pieces, and survives JSON and retry',()=>{
 const l=p0Level();assert.deepEqual(validate(JSON.parse(JSON.stringify(l))),l);for(const t of ['ice-solid','ice','ice-flower','water','door','glass-pipe','bomb','iron-turtle','E'])assert.ok(l.cells.includes(t),t);const s=create(l);tick(s,{},240);assert.equal(s.phase,'playing');respawn(s);assert.deepEqual(s.startLevel,l);assert.deepEqual(s.level.rules,REFERENCE_RULES);assert.ok(pipeShape(l,17*l.width+92));
});
