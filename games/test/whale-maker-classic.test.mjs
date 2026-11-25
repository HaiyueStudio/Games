import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,configureCoop,validate,step,stepCoop,respawn,EMPTY_INPUT,tile,solid}=await import('../whale-maker/rules/model.ts');
const {asPlayer,playerAt}=await import('../whale-maker/rules/coop-state.ts');
const {grantPower}=await import('../whale-maker/rules/power.ts');
const {classicLevel,nextClassic,transferCourse,CLASSIC_STAGE_COUNT}=await import('../whale-maker/rules/classic.ts');
const {MapPackLibrary,blankPackCourse,validateMapPack}=await import('../whale-maker/editor/map-pack-library.ts');
const {courseDestinations,enterCoursePortal}=await import('../whale-maker/rules/course-travel.ts');
const {prepareDocument,saveDocument,validDocumentSave}=await import('../whale-maker/app/document-session.ts');
const {packArea,unpackArea,lazyClassic}=await import('../whale-maker/levels/classic-codec.ts');
const {selectBox}=await import('../whale-maker/editor/selection.ts');
const {indexEditorLevel,editorVisibleCells}=await import('../whale-maker/editor/query.ts');
const {killPlayer}=await import('../whale-maker/rules/player-damage.ts');
const {readCoordinateData}=await import('../whale-maker/scripts/read-coordinate-data.mjs');
const {MAP_PACKS,packLevel}=await import('../whale-maker/rules/map-packs.ts');
const {advanceClassicMaze}=await import('../whale-maker/rules/classic-features.ts');
const {areaTravel}=await import('../whale-maker/rules/p2-areas.ts');
const {pipeShape}=await import('../whale-maker/rules/pipes.ts');
const {damageBoss,releaseBridge,placeBoss}=await import('../whale-maker/rules/fortress.ts');
const {objectCells,moveSelection,stampSelection,pasteStamp}=await import('../whale-maker/editor/selection.ts');
const tick=(s,n=1,i={})=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function arena(){const l=classicLevel(3);l.cells.fill('.');l.properties={};l.contents={};l.spawn=[3,14.2];for(let x=0;x<l.width;x++)l.cells[15*l.width+x]='#';l.cells[14*l.width+30]='E';placeBoss(l,12,13);return l;}

test('document identity round trips standalone imports and resolves missing courses before commit',()=>{
 const library=new MapPackLibrary(),level=blankPackCourse(1).level;level.name='独立地图';
 const save=saveDocument(library,{kind:'standalone'},level);assert.ok(validDocumentSave(save));
 const restored=prepareDocument(JSON.parse(JSON.stringify(save)));assert.equal(restored.level.name,level.name);assert.equal(restored.active.kind,'standalone');
 const legacy=prepareDocument({version:1,packs:[]},{kind:'course',pack:'classic',course:'1-1'},level);assert.equal(legacy.level.name,level.name);
 const absent=prepareDocument({version:1,packs:[]},{kind:'course',pack:'missing',course:'gone'});assert.equal(absent.active.pack,'classic');
 const user=library.create(),before=library.snapshot();
 assert.throws(()=>prepareDocument({version:1,packs:[{...user,courses:[]}]}));assert.deepEqual(library.snapshot(),before);
});

test('compressed library saves builtin references, copies without materializing originals, and migrates legacy data',()=>{
 const library=new MapPackLibrary();library.editable('classic');const a=library.create('lost-levels'),b=library.create('lost-levels');
 const save=library.snapshot();assert.equal(save.version,2);assert.equal(save.packs.length,3);assert.ok(!save.packs.some(p=>p.id==='lost-levels'));
 assert.ok(save.packs.find(p=>p.id==='classic').courses.some(c=>c.builtin));assert.ok(JSON.stringify(save).length<1_000_000);
 const restored=new MapPackLibrary();restored.restore(JSON.parse(JSON.stringify(save)));assert.deepEqual(restored.level(a.id,a.courses[0].id),library.level(a.id,a.courses[0].id));assert.equal(restored.get(b.id).courses.length,52);
 const old={version:1,packs:[structuredClone(library.editable(a.id))]};restored.restore(old);assert.equal(restored.get(a.id).courses.length,52);
 const pack=restored.create();restored.rename(pack.id,'x'.repeat(120));const copy=restored.create(pack.id);assert.ok(copy.title.length<=120);
 restored.rename(pack.id,'y'.repeat(120),pack.courses[0].id);assert.ok(restored.addCourse(pack.id,pack.courses[0].id).title.length<=120);
 assert.ok(validDocumentSave(saveDocument(restored,{kind:'course',pack:pack.id,course:pack.courses[0].id},pack.courses[0].level)));
});

test('packed levels enforce expansion budgets, isolate queued snapshots and decode only on request',()=>{
 const level=blankPackCourse(1).level;level.properties={[14*level.width+95]:{goalHeight:9}};
 const packed=packArea(level);level.properties[14*level.width+95].goalHeight=5;assert.equal(unpackArea(packed).properties[14*level.width+95].goalHeight,9);
 assert.throws(()=>unpackArea({...packed,runs:[['.',1_000_000_000]]}));assert.throws(()=>unpackArea({...packed,runs:[['.',-1]]}));
 let reads=0;const runs=packed.runs;Object.defineProperty(packed,'runs',{get(){reads++;return runs;},enumerable:true});
 const make=lazyClassic(packed);assert.equal(reads,0);const a=make();assert.ok(reads>0);const count=reads;a.cells[0]='B';assert.equal(make().cells[0],'.');assert.equal(reads,count);
});

test('large rectangular selections collect objects once and viewport queries retain long pipe anchors',()=>{
 const l=blankPackCourse(1).level;l.width=512;l.height=256;l.cells=Array(l.width*l.height).fill('.');l.cells[254*l.width+500]='E';
 let reads=0;const cells=l.cells;l.cells=new Proxy(cells,{get(t,p,r){if(typeof p==='string'&&/^\d+$/.test(p))reads++;return Reflect.get(t,p,r);}});
 assert.equal(selectBox(l,[1,1],[16,16]).size,0);assert.ok(reads<l.cells.length*3,'one authored-grid pass, not one per selected cell');l.cells=cells;
 for(let row=0;row<80;row++){l.cells[(2+row)*l.width+5]=row?'p':'P';l.cells[(2+row)*l.width+6]=row?'q':'Q';}l.properties={};const index=indexEditorLevel(l);
 const visible=[...editorVisibleCells(l,index,0,70,23,16)];assert.ok(visible.includes(2*l.width+5));assert.ok(visible.length<5000);
});

test('course travel cancellation after a co-op death permits a survivor to enter again',()=>{
 const l=blankPackCourse(1).level,id=14*l.width+5;l.cells[id]='door';l.properties={[id]:{destination:{pack:'classic',course:'4-1'}}};l.spawn=[5.1,14.2];
 const s=create(l);configureCoop(s,2,25,12);stepCoop(s,[{...EMPTY_INPUT,interact:true},EMPTY_INPUT]);assert.ok(s.courseDestination);
 killPlayer(s,'crush');assert.equal(s.courseDestination,null);assert.equal(s.pipe,null);assert.equal(s.coop.traveler,-1);
 asPlayer(s,1,()=>{s.player.x=5.1;s.player.y=14.2;s.pipeWait=0;s.areaCooldown=0;s.previous.interact=false;assert.ok(enterCoursePortal(s,{...EMPTY_INPUT,interact:true}));});
});

test('unknown prototype area names are rejected and dead generated enemies remain bounded',()=>{
 for(const area of ['constructor','toString','__proto__']){
  const l=blankPackCourse(1).level;l.cells[14*l.width+5]='door';l.areas={};l.properties={[14*l.width+5]:{area}};assert.throws(()=>validate(JSON.parse(JSON.stringify(l))));
 }
 const s=create(blankPackCourse(1).level);s.invincible=1e6;
 for(let i=0;i<1000;i++){s.enemies.push({x:30,y:14,w:.8,h:.8,vx:0,vy:0,kind:'duck',alive:false,held:false,cooldown:0});tick(s);assert.ok(s.enemies.length<64);}
});

test('coordinate conversion accepts data and rejects code without executing it',()=>{
 const prefix='PlayMarioJas.PlayMarioJas.settings.maps.library["1-1"] = ';
 assert.deepEqual(readCoordinateData(prefix+'{areas:[{x:-2,macro:"Floor"}],night:true};','1-1'),{areas:[{x:-2,macro:'Floor'}],night:true});
 for(const text of ['(()=>42)()','{x:process.version}','{["dynamic"]:1}','{};process.exit()'])assert.throws(()=>readCoordinateData(prefix+text,'1-1'));
});

test('Lost Levels contains all 52 Japanese courses with valid linked rooms and playable starts',()=>{
 const pack=MAP_PACKS.find(pack=>pack.id==='lost-levels');assert.equal(pack.courses.length,52);
 assert.equal(pack.courses[32].id,'9-1');assert.equal(pack.courses[36].id,'A-1');assert.equal(pack.courses.at(-1).id,'D-4');
 for(const course of pack.courses){
  const level=validate(course.make()),areas={main:level,...level.areas},reachable=new Set(['main']);
  for(let pass=0;pass<Object.keys(areas).length;pass++)for(const id of [...reachable])for(const p of Object.values(areas[id].properties??{}))if(p.area)reachable.add(p.area);
  assert.ok([...reachable].some(id=>areas[id]?.cells.includes('E')),course.id+' needs a reachable goal');
  for(const target of courseDestinations(level)){assert.equal(target.pack,pack.id);assert.ok(pack.courses.some(c=>c.id===target.course));}
  const s=create(level);s.invincible=10;tick(s,90);assert.equal(s.phase,'playing',course.id);assert.ok(Number.isFinite(s.player.y));
 }
 assert.ok(pack.courses.some(c=>Object.values(c.make().contents??{}).includes('poison-pearl')));
 assert.ok(pack.courses.some(c=>c.make().wind));
});

test('classic warp zones expose original world destinations without changing the ordinary exit',()=>{
 assert.deepEqual(courseDestinations(classicLevel(1)).map(target=>target.course),['4-1','3-1','2-1']);
 assert.deepEqual(courseDestinations(classicLevel(13)).map(target=>target.course).sort(),['5-1','6-1','7-1','8-1']);
 const level=classicLevel(1),s=create(level);Object.assign(s.player,{x:169.1,y:3.1});
 assert.ok(areaTravel(s,EMPTY_INPUT,1/120,create));assert.equal(s.currentArea,'warp-zone');
 const [key,p]=Object.entries(s.level.properties).find(([,p])=>p.destination),id=Number(key);
 Object.assign(s.player,{x:id%s.level.width+1-s.player.w/2,y:Math.floor(id/s.level.width)-s.player.h});s.areaCooldown=0;
 assert.equal(enterCoursePortal(s,EMPTY_INPUT),false);assert.ok(enterCoursePortal(s,{...EMPTY_INPUT,down:true}));
 assert.deepEqual(s.courseDestination,p.destination);assert.ok(s.pipe);
});

test('map pack edits retain stable links after rename/reorder and survive JSON save/restore',()=>{
 const library=new MapPackLibrary(),pack=library.create(),first=pack.courses[0],second=library.addCourse(pack.id);
 first.level.nextCourse={pack:pack.id,course:second.id};first.level.properties={};first.level.cells[14*first.level.width+5]='door';
 first.level.properties[14*first.level.width+5]={destination:{pack:pack.id,course:second.id}};
 const edited=library.level(pack.id,first.id);edited.cells[10*edited.width+4]='?';edited.contents={[10*edited.width+4]:'growth'};
 library.update(pack.id,first.id,edited);library.rename(pack.id,'海风关卡',second.id);library.move(pack.id,second.id,-1);
 assert.equal(library.get(pack.id).courses[0].id,second.id);assert.equal(library.level(pack.id,first.id).nextCourse.course,second.id);
 const restored=new MapPackLibrary();restored.restore(JSON.parse(JSON.stringify(library.snapshot())));
 assert.deepEqual(restored.level(pack.id,first.id),library.level(pack.id,first.id));assert.equal(restored.get(pack.id).courses[0].title,'海风关卡');
 const copy=restored.create(pack.id);assert.ok(courseDestinations(copy.courses.find(c=>c.id===first.id).level).every(p=>p.pack===copy.id));
 const imported=new MapPackLibrary();imported.import(JSON.parse(JSON.stringify(copy)));assert.equal(imported.get(copy.id).courses.length,2);
 restored.remove(pack.id,second.id);assert.equal(courseDestinations(restored.level(pack.id,first.id)).length,0);
 assert.throws(()=>restored.remove(pack.id,first.id));
 const invalid=structuredClone(copy);invalid.courses[0].level.nextCourse={pack:copy.id,course:'missing'};
 assert.throws(()=>imported.import(invalid),/目标不存在/);assert.equal(imported.get(copy.id).courses.length,2);
 assert.throws(()=>validateMapPack({...copy,courses:[copy.courses[0],copy.courses[0]]}));
});

test('cross-course portals enforce keys and P state, carry the co-op party, and preserve progress',()=>{
 const l=blankPackCourse(1).level,id=14*l.width+5,destination={pack:'classic',course:'4-1'};
 l.cells[id]='locked-door';l.properties={[id]:{destination}};const s=create(validate(l));configureCoop(s,4,25,12);
 asPlayer(s,2,()=>{s.player.x=5.1;s.player.y=14.2;});s.coins=23;s.score=700;s.lives=8;
 const inputs=Array.from({length:4},()=>({...EMPTY_INPUT}));inputs[2].interact=true;
 stepCoop(s,inputs);assert.equal(s.courseDestination,null);s.keys.push({x:0,y:0});
 inputs[2].interact=false;stepCoop(s,inputs);inputs[2].interact=true;stepCoop(s,inputs);
 assert.deepEqual(s.courseDestination,destination);assert.equal(s.keys.length,0);assert.ok(s.pipe);
 for(let i=0;i<4;i++)assert.ok(playerAt(s,i).pipe,'party member '+i+' enters');
 const target=classicLevel(12);target.progress.timeLimit=200;s.level.progress={timeLimit:50,lives:true};
 const next=transferCourse(s,target);assert.equal(next.coop.players.length,4);assert.equal(next.lives,8);assert.equal(next.coins,23);assert.equal(next.score,700);assert.equal(next.courseDestination,null);assert.equal(next.timeRemaining,200);
 l.cells[id]='p-door';const p=create(l);p.player.x=5.1;assert.equal(enterCoursePortal(p,{...EMPTY_INPUT,interact:true}),false);p.pTime=1;
 assert.ok(enterCoursePortal(p,{...EMPTY_INPUT,interact:true}));
 assert.throws(()=>validate({...l,properties:{[id]:{destination,area:'main'}}}));
 assert.throws(()=>validate({...l,properties:{[id]:{destination:{pack:'classic',course:'bad/id'}}}}));
});

test('poison pearls fall, roll, and damage rather than granting growth',()=>{
 const l=blankPackCourse(1).level;l.cells[8*l.width+8]='poison-pearl';const s=create(l);s.invincible=10;tick(s,150);
 const poison=s.rewards.find(r=>r.kind==='poison-pearl');assert.ok(poison);assert.ok(poison.y>13);assert.notEqual(poison.x,8.1);
 grantPower(s,1);s.invincible=0;Object.assign(poison,{x:s.player.x,y:s.player.y,w:.8,h:.8,vx:0,vy:0});tick(s);
 assert.equal(s.power,0);assert.equal(s.rewards.length,0);assert.equal(s.phase,'playing');
});

test('all 32 converted maps validate and each blueprint is independent with a reachable goal',()=>{
 assert.equal(CLASSIC_STAGE_COUNT,32);
 for(let n=0;n<32;n++){
  const l=validate(classicLevel(n));assert.equal(l.classicStage,n+1);
  const reachable=new Set(['main']),areas={main:l,...l.areas};
  for(let pass=0;pass<Object.keys(areas).length;pass++)for(const id of [...reachable])for(const p of Object.values(areas[id].properties??{}))if(p.area)reachable.add(p.area);
  assert.ok([...reachable].some(id=>areas[id]?.cells.includes('E')),l.name);
  assert.equal(reachable.size,Object.keys(areas).length,l.name+' has no orphan subarea');
  const s=create(l);tick(s,90);assert.equal(s.phase,'playing',l.name);assert.ok(s.grounded||s.swimming,l.name);
  l.cells[0]='o';assert.notEqual(classicLevel(n).cells[0],'o');
 }
 assert.throws(()=>classicLevel(-1));assert.throws(()=>classicLevel(32));assert.throws(()=>classicLevel(.5));
 assert.throws(()=>validate({...classicLevel(),classicStage:33}));assert.throws(()=>validate({...classicLevel(),finish:'warp'}));
});
test('reference landmark coordinates: 1-1 blocks, pipes, pits, stair and flag',()=>{
 const l=classicLevel();assert.equal(tile(l,16,11),'?');assert.equal(tile(l,21,11),'?');assert.equal(tile(l,28,13),'P');assert.equal(tile(l,57,11),'P');assert.equal(tile(l,69,15),'.');assert.equal(tile(l,70,15),'.');assert.equal(tile(l,71,15),'#');assert.equal(tile(l,86,15),'.');assert.equal(tile(l,89,15),'#');assert.equal(tile(l,188,7),'#');assert.equal(tile(l,198,14),'E');
});
test('1-2 preserves elevators and its ordinary in-stage exit alongside the secret warp zone',()=>{
 const l=classicLevel(1),s=create(l);assert.equal(s.platforms.length,6);assert.equal(l.warps.length,3);assert.deepEqual(l.warps[0],{from:[164,10],to:[177,13]});assert.ok(l.cells.includes('plant')||Object.values(l.properties).some(p=>p.plant));
 Object.assign(s.player,{x:164.65,y:9.2});s.grounded=true;tick(s,1,{down:true});assert.ok(s.pipe);tick(s,115);assert.equal(s.level.classicStage,2);assert.ok(s.player.x>176);assert.equal(s.phase,'playing');
});
test('night platform stage has bounded horizontal and vertical moving platforms',()=>{
 const s=create(classicLevel(2));assert.equal(s.level.backdrop,'night');assert.equal(s.platforms.length,4);assert.ok(s.platforms.some(p=>p.axis==='x'));assert.ok(s.platforms.some(p=>p.axis==='y'));s.invincible=100;
 for(let k=0;k<500;k++){tick(s);for(const p of s.platforms)assert.ok(p[p.axis]>=p.start-.001&&p[p.axis]<=p.end+.001);}
});
test('both coin rooms return to the same stage and main-stage pits still kill promptly',()=>{
 for(let n=0;n<2;n++){
  const s=create(classicLevel(n)),warp=s.level.warps.find(w=>w.to[1]===38);Object.assign(s.player,{x:warp.from[0]+.65,y:warp.from[1]-.8,vx:0,vy:0});s.grounded=true;tick(s,1,{down:true});assert.ok(s.pipe);tick(s,115);assert.ok(s.player.y>36);assert.equal(s.phase,'playing');assert.equal(s.level.classicStage,n+1);assert.ok(s.level.cells.slice(26*s.level.width).includes('o'));
  Object.assign(s.player,{x:13.65,y:35.2,vx:0,vy:0});s.grounded=true;s.pipeWait=0;tick(s,1,{down:true});assert.ok(s.pipe);tick(s,115);assert.ok(s.player.y<15);assert.equal(s.phase,'playing');assert.equal(s.level.classicStage,n+1);
  s.player.y=20.1;s.invincible=0;tick(s);assert.equal(s.phase,'dead');
 }
});
test('one-way moving platforms catch a falling player and carry them horizontally',()=>{
 const l=arena();l.cells[10*l.width+7]='moving-platform';l.properties[10*l.width+7]={axis:'x',range:[7,12],speed:2,length:3};const s=create(l);s.bosses=[];Object.assign(s.player,{x:8,y:9.2,vy:0});s.grounded=true;tick(s,60);assert.ok(Math.abs(s.player.y+s.player.h-10)<.001);assert.ok(s.player.x>8.9);assert.ok(s.grounded);
 Object.assign(s.player,{x:s.platforms[0].x+.5,y:11,vy:-12});s.grounded=false;tick(s,10,{jump:true});assert.ok(s.player.y<10,'ascending through a platform is allowed');
});
test('2×2 boss walks, telegraphs then emits bounded directional flames',()=>{
 const s=create(arena()),b=s.bosses[0];assert.deepEqual([b.w,b.h,b.health],[2,2,5]);s.invincible=100;tick(s,200);assert.equal(b.phase,'breath');tick(s,70);assert.ok(s.bossFire.length>0);assert.ok(s.bossFire[0].vx<0);assert.ok(s.events.some(e=>e.kind==='fire'));assert.ok(b.x>=b.home-2.1&&b.x<=b.home+2.1);tick(s,1800);assert.ok(s.bossFire.length<24);
});
test('normal contact hurts, spin bounce is safe, and fire damages with a short hit grace',()=>{
 let s=create(arena()),b=s.bosses[0];Object.assign(s.player,{x:b.x-.4,y:b.y+.5});tick(s);assert.equal(s.phase,'dead');
 s=create(arena());b=s.bosses[0];Object.assign(s.player,{x:b.x+.6,y:b.y-.79,vy:3});s.spinning=true;s.previous.spin=true;tick(s,1,{spin:true});assert.equal(s.phase,'playing');assert.ok(s.player.vy<0);assert.equal(b.health,5);
 s=create(arena());b=s.bosses[0];s.shots.push({x:b.x+.5,y:b.y+.7,w:.28,h:.28,vx:11,vy:0});tick(s);assert.equal(b.health,4);assert.equal(s.shots.length,0);damageBoss(s,b);assert.equal(b.health,4);for(let k=0;k<4;k++){b.hurt=0;damageBoss(s,b);}assert.equal(b.phase,'fall');assert.equal(s.score,1000);
});
test('flames hurt the player but cannot travel through solid walls',()=>{
 const s=create(arena());s.bosses=[];s.bossFire.push({x:2.9,y:14.3,w:1,h:.45,vx:5.2,vy:0,age:0});tick(s);assert.equal(s.phase,'dead');
 const t=create(arena());t.bosses=[];t.level.cells[14*t.level.width+6]='#';t.bossFire.push({x:5,y:14.3,w:1,h:.45,vx:5.2,vy:0,age:0});tick(t,5);assert.equal(t.bossFire.length,0);
});
test('bridge supports the boss, collapses progressively, drops a jumping boss and resets on retry',()=>{
 const s=create(classicLevel(3)),b=s.bosses[0],bell=s.level.cells.indexOf('bridge-bell'),bridge=s.level.cells.filter(t=>t==='bridge').length;s.player.x=b.x-7;s.player.y=11.2;s.invincible=100;tick(s,10);assert.equal(b.y+b.h,12);releaseBridge(s,bell);tick(s,10);assert.ok(s.level.cells.filter(t=>t==='bridge').length<bridge);assert.ok(s.level.cells.includes('bridge'));b.y=8;b.vy=-6;tick(s,100);assert.equal(s.level.cells.includes('bridge'),false);assert.equal(b.health,0);assert.ok(['fall','gone'].includes(b.phase));assert.ok(s.bridgeDebris.length<=48);const score=s.score;releaseBridge(s,bell);assert.equal(s.score,score);respawn(s);assert.equal(s.level.cells.filter(t=>t==='bridge').length,bridge);assert.equal(s.bosses[0].health,5);assert.equal(s.bossFire.length,0);assert.equal(s.bridgeCollapse,null);
});
test('walking through the bridge bell triggers release; castle exit waits for boss defeat',()=>{
 const s=create(classicLevel(3)),l=s.level,bell=l.cells.indexOf('bridge-bell');Object.assign(s.player,{x:bell%l.width+.1,y:Math.floor(bell/l.width)+.2});tick(s);assert.ok(s.bridgeCollapse);const e=l.cells.indexOf('E');Object.assign(s.player,{x:e%l.width-s.player.w,y:14.2});tick(s);assert.equal(s.phase,'playing');s.bosses.forEach(b=>{b.health=0;b.phase='gone';});tick(s);assert.equal(s.phase,'won');assert.equal(s.victory.stage,'cheer');tick(s,400);assert.equal(s.victory.stage,'done');assert.equal(nextClassic(s).level.classicStage,5);
});
test('campaign progresses only after castle entry, preserving scores and form without skipping stages',()=>{
 let s=create(classicLevel());s.coins=19;s.score=600;s.deaths=2;s.power=2;
 for(let stage=1;stage<32;stage++){assert.equal(s.level.classicStage,stage);assert.equal(nextClassic(s),null);s.phase='won';s.victory={stage:'cheer',age:2};assert.equal(nextClassic(s),null);s.victory.stage='done';s.victory.age=1.9;assert.equal(nextClassic(s),null);s.victory.age=2;s=nextClassic(s);assert.ok(s);assert.equal(s.level.classicStage,stage+1);assert.deepEqual([s.coins,s.score,s.deaths,s.power,s.player.h],[19,600,2,2,2]);assert.equal(s.held,null);}
 s.phase='won';s.victory={stage:'done',age:2};assert.equal(nextClassic(s),null);
});

test('map packs expose all stages, independent editing copies and all existing trials',()=>{
 assert.deepEqual(MAP_PACKS.map(p=>p.id),['classic','whale','trials','lost-levels']);
 assert.equal(MAP_PACKS[0].courses.length,32);assert.equal(MAP_PACKS[0].courses.at(-1).id,'8-4');
 for(const pack of MAP_PACKS)for(let index=0;index<pack.courses.length;index++){
  const l=validate(packLevel(pack.id,index));l.cells[0]='o';assert.notEqual(packLevel(pack.id,index).cells[0],'o');
 }
 assert.throws(()=>packLevel('unknown',0));assert.throws(()=>packLevel('classic',32));
});

test('cross-world advancement waits for all four players and carries each player form',()=>{
 const s=create(classicLevel(3));configureCoop(s,4,25,12);
 for(let index=0;index<4;index++)asPlayer(s,index,()=>{
  grantPower(s,index);s.phase='won';s.victory={stage:index===3?'cheer':'done',age:2};
 });
 assert.equal(nextClassic(s),null);
 asPlayer(s,3,()=>{s.victory.stage='done';});
 const next=nextClassic(s);assert.equal(next.level.classicStage,5);assert.equal(next.coop.players.length,4);
 assert.deepEqual([0,1,2,3].map(index=>playerAt(next,index).power),[0,1,2,3]);
});

test('long 8-1 retains the original late staircase and flag instead of truncating at the editor edge',()=>{
 const l=classicLevel(28);assert.ok(l.width>380);assert.equal(tile(l,376,14),'E');assert.ok(l.cells.slice(300).includes('iron-turtle'));
 assert.equal(validate(JSON.parse(JSON.stringify(l))).width,l.width);
});

function travelAreaPipe(s,id){
 const pipe=pipeShape(s.level,id),n=pipe.normal,p=s.player;
 const cx=pipe.mouth[0]+n[0]*p.w/2,cy=pipe.mouth[1]+n[1]*p.h/2;
 Object.assign(p,{x:cx-p.w/2,y:cy-p.h/2,vx:0,vy:0});s.areaCooldown=0;
 assert.equal(areaTravel(s,{...EMPTY_INPUT,down:n[1]===-1,axis:-n[0],interact:n[1]===1},1/120,create),true);
}

test('2-2 and 7-2 begin underwater and their horizontal exits reach the flag area',()=>{
 for(const index of [5,25]){
  const s=create(classicLevel(index));tick(s,5);assert.ok(s.swimming);assert.ok(s.enemies.some(e=>e.kind==='squid'));assert.ok(s.enemies.some(e=>e.kind==='fish'));
  const entry=Object.entries(s.level.properties).find(([,p])=>p.area);travelAreaPipe(s,+entry[0]);assert.ok(s.level.cells.includes('E'));assert.equal(s.startLevel.classicStage,index+1);
 }
});

test('8-4 has four forward pipe transfers, a water passage and a final boss with no backward loops',()=>{
 const s=create(classicLevel(31)),visited=['main'];
 for(let pass=0;pass<4;pass++){
  const [id]=Object.entries(s.level.properties).find(([,p])=>p.area);
  travelAreaPipe(s,+id);visited.push(s.currentArea);
  if(pass===2){tick(s,5);assert.ok(s.swimming);}
 }
 assert.deepEqual(visited,['main','area-1','area-2','area-3','area-4']);
 assert.ok(s.level.cells.includes('E'));assert.equal(s.bosses.length,1);assert.ok(s.level.cells.includes('bridge-bell'));
 s.phase='dead';respawn(s);assert.equal(s.currentArea,'main');assert.equal(s.classicRuntime.gate,0);
});

test('castle route choices reset the failed section and allow the correct passages to advance',()=>{
 for(const index of [15,27]){
  const s=create(classicLevel(index)),gates=s.level.classicFeatures.maze;
  assert.ok(gates.length>=2);
  s.player.x=gates[0].end+1;s.player.y=14;
  assert.equal(advanceClassicMaze(s),true);assert.equal(s.classicRuntime.gate,0);assert.equal(s.player.x,gates[0].restart);assert.ok(s.player.y>10,'retry spawns in the corridor below the ceiling');
  for(const [n,gate] of gates.entries()){
   const c=gate.checks[0];Object.assign(s.player,{x:c.x+.1,y:c.y+c.h/2-s.player.h/2});
   advanceClassicMaze(s);assert.equal(s.classicRuntime.hits[n],true);
   s.player.x=gate.end;assert.equal(advanceClassicMaze(s),false);assert.equal(s.classicRuntime.gate,n+1);
  }
  respawn(s);assert.equal(s.classicRuntime.gate,0);assert.equal(s.classicRuntime.hits.length,0);
 }
});

test('balance platforms share rope travel while falling platforms wait for a rider',()=>{
 const s=create(classicLevel(10)),left=s.platforms.find(p=>p.mode==='balance'),right=s.platforms.find(p=>p!==left&&p.mode==='balance'&&p.link===left.link);
 assert.ok(right);const sum=left.y+right.y,old=left.y;
 Object.assign(s.player,{x:left.x+.2,y:left.y-s.player.h,vx:0,vy:0});s.invincible=100;s.enemies=[];
 tick(s,30);assert.ok(left.y>old);assert.ok(Math.abs(left.y+right.y-sum)<1e-8);
 const f=create(classicLevel(27)),platform=f.platforms.find(p=>p.mode==='fall'),top=platform.y;
 tick(f,60);assert.equal(platform.y,top);
 Object.assign(f.player,{x:platform.x+.1,y:top-f.player.h,vx:0,vy:0});f.invincible=100;
 tick(f,20);assert.ok(platform.y>top);
});

test('bridge fish, cannonball waves and cloud riders are deterministic and reset on retry',()=>{
 for(const index of [6,12,18]){
  const l=classicLevel(index),a=create(l),b=create(l),source=l.classicFeatures.spawners[0];
  for(const s of [a,b]){s.player.x=source.start+2;s.invincible=100;tick(s,360);}
  assert.deepEqual(a,b);
  assert.ok(a.enemies.some(e=>source.kind==='lakitu'?e.lakitu:e.kind===source.kind),l.name);
  respawn(a);assert.deepEqual(a.classicRuntime.cycles,[]);
 }
});
test('editor treats boss as one four-cell object and keeps links while moving',()=>{
 const l=arena(),id=l.cells.indexOf('turtle-boss');l.properties[id]={link:3};const cells=objectCells(l,id%l.width+1,Math.floor(id/l.width)+1);assert.equal(cells.length,4);const moved=moveSelection(l,new Set(cells),4,-2);assert.equal(moved.size,4);validate(l);assert.equal(l.cells[id],'.');assert.equal(l.properties[id+4-2*l.width].link,3);assert.ok(solid('bridge'));assert.equal(solid('lava'),false);
});
test('the opening pit, four-tile treetop climb and boss bridge can be crossed using normal controls',()=>{
 const s=create(classicLevel());Object.assign(s.player,{x:67,y:14.2,vx:8.5,vy:0});s.grounded=true;tick(s,110,{axis:1,grab:true,jump:true});assert.ok(s.player.x>71);assert.equal(s.phase,'playing');
 const t=create(classicLevel(2));t.enemies=[];Object.assign(t.player,{x:25.2,y:10.2,vx:5.5,vy:0});t.grounded=true;tick(t,110,{axis:1,jump:true});assert.ok(t.grounded);assert.ok(t.player.y+t.player.h<=7.01);assert.equal(t.phase,'playing');
 const b=create(classicLevel(3));Object.assign(b.player,{x:131,y:11.2,vx:8.5,vy:0});b.grounded=true;tick(b,145,{axis:1,grab:true,jump:true});assert.equal(b.phase,'playing');assert.ok(b.bridgeCollapse,'jumping over the boss reaches the bridge release');
});
test('moving and copying a platform translates its route instead of snapping back to old coordinates',()=>{
 const l=arena(),id=10*l.width+8;l.cells[id]='moving-platform';l.properties[id]={axis:'x',range:[6,12],length:3,speed:2};const ids=moveSelection(l,new Set([id]),4,0),target=id+4;assert.deepEqual(l.properties[target].range,[10,16]);const stamp=stampSelection(l,ids);pasteStamp(l,stamp,20,8);assert.deepEqual(l.properties[8*l.width+20].range,[18,24]);validate(l);
});
