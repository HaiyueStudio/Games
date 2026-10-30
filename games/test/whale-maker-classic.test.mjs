import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,validate,step,respawn,EMPTY_INPUT,tile,solid}=await import('../whale-maker/rules/model.ts');
const {classicLevel,nextClassic}=await import('../whale-maker/rules/classic.ts');
const {damageBoss,releaseBridge,placeBoss}=await import('../whale-maker/rules/fortress.ts');
const {objectCells,moveSelection,stampSelection,pasteStamp}=await import('../whale-maker/editor/selection.ts');
const tick=(s,n=1,i={})=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function arena(){const l=classicLevel(3);l.cells.fill('.');l.properties={};l.contents={};l.spawn=[3,14.2];for(let x=0;x<l.width;x++)l.cells[15*l.width+x]='#';l.cells[14*l.width+30]='E';placeBoss(l,12,13);return l;}

test('four converted maps validate and each blueprint is independent',()=>{
 for(let n=0;n<4;n++){const l=validate(classicLevel(n));assert.equal(l.classicStage,n+1);assert.ok(l.cells.includes('E'));const s=create(l);tick(s,20);assert.equal(s.phase,'playing',l.name);assert.ok(s.grounded,l.name);assert.ok(s.events.length<64);l.cells[0]='o';assert.notEqual(classicLevel(n).cells[0],'o');}
 assert.throws(()=>validate({...classicLevel(),classicStage:5}));assert.throws(()=>validate({...classicLevel(),finish:'warp'}));
});
test('reference landmark coordinates: 1-1 blocks, pipes, pits, stair and flag',()=>{
 const l=classicLevel();assert.equal(tile(l,16,11),'?');assert.equal(tile(l,21,11),'?');assert.equal(tile(l,28,13),'P');assert.equal(tile(l,57,11),'P');assert.equal(tile(l,69,15),'.');assert.equal(tile(l,70,15),'.');assert.equal(tile(l,71,15),'#');assert.equal(tile(l,86,15),'.');assert.equal(tile(l,89,15),'#');assert.equal(tile(l,188,7),'#');assert.equal(tile(l,198,14),'E');
});
test('1-2 preserves elevators and an in-stage exit, with no world-skip destinations',()=>{
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
 const s=create(classicLevel(3)),l=s.level,bell=l.cells.indexOf('bridge-bell');Object.assign(s.player,{x:bell%l.width+.1,y:Math.floor(bell/l.width)+.2});tick(s);assert.ok(s.bridgeCollapse);const e=l.cells.indexOf('E');Object.assign(s.player,{x:e%l.width-s.player.w,y:14.2});tick(s);assert.equal(s.phase,'playing');s.bosses.forEach(b=>{b.health=0;b.phase='gone';});tick(s);assert.equal(s.phase,'won');assert.equal(s.victory.stage,'cheer');tick(s,400);assert.equal(s.victory.stage,'done');assert.equal(nextClassic(s),null);
});
test('campaign progresses only after castle entry, preserving scores and form without skipping stages',()=>{
 let s=create(classicLevel());s.coins=19;s.score=600;s.deaths=2;s.power=2;
 for(let stage=1;stage<4;stage++){assert.equal(s.level.classicStage,stage);assert.equal(nextClassic(s),null);s.phase='won';s.victory={stage:'cheer',age:2};assert.equal(nextClassic(s),null);s.victory.stage='done';s.victory.age=1.9;assert.equal(nextClassic(s),null);s.victory.age=2;s=nextClassic(s);assert.ok(s);assert.equal(s.level.classicStage,stage+1);assert.deepEqual([s.coins,s.score,s.deaths,s.power,s.player.h],[19,600,2,2,2]);assert.equal(s.held,null);}
 s.phase='won';s.victory={stage:'done',age:2};assert.equal(nextClassic(s),null);
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
