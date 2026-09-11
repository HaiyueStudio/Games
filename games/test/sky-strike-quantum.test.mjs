import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quantumPose,quantumPoint,quantumTurretPose,quantumCoreState,quantumBossX,quantumAttachment,quantumVelocity,quantumPixels,quantumHardpoint,quantumGlitch,QUANTUM_GUN_MOUNTS} from '../sky-strike/quantum.ts';
import {requiredEnemyDefinition,enemyFireIntervalMs} from '../sky-strike/rules.ts';
import {loadSkyStrikeLevels,compileLevelTimeline} from '../sky-strike/levels/loader.ts';
const read=p=>JSON.parse(readFileSync(new URL('../sky-strike/'+p,import.meta.url)));
test('quantum dreadnought health is reduced by fifteen percent',()=>{
 assert.equal(requiredEnemyDefinition('quantum-dreadnought').hitPoints,4200*.85);
});
test('quantum pair is horizontally mirrored in every visible camera and rotates in the opposite direction',()=>{
 for(const cx of [140,240,340])for(const a of [-2,0,2]){
  const body={x:90,y:230,rotation:a},ghost=quantumPose(body,cx);
  assert.equal((body.x+ghost.x)/2,cx);assert.equal(ghost.y,body.y);
  assert.deepEqual(quantumPose(ghost,cx),body);
  assert.ok(Math.abs(quantumPose({...body,rotation:a+.1},cx).rotation-ghost.rotation+.1)<1e-12);
  assert.deepEqual(quantumPoint(quantumPoint(body,cx),cx),{x:90,y:230});
 }
});
test('six independent cannon hardpoints rotate with hull and glitch remains bounded and deterministic',()=>{
 assert.equal(QUANTUM_GUN_MOUNTS.length,6);
 const p=quantumHardpoint({x:100,y:200,rotation:Math.PI/2},100,.2,.3);
 assert.ok(Math.abs(p.x-70)<1e-10);assert.ok(Math.abs(p.y-220)<1e-10);
 for(let t=0;t<10000;t+=16){const a=quantumGlitch(t,.32);assert.deepEqual(a,quantumGlitch(t,.32));assert.ok(Math.abs(a.offset)<=8&&a.opacity>=.2&&a.opacity<=.5&&a.scan>=0&&a.scan<1);}
 assert.notDeepEqual(quantumGlitch(0),quantumGlitch(900));
});
test('mission 12 loads with paired mixed enemies, unpaired waves and one paired dreadnought after the new mission 11',async()=>{
 const levels=await loadSkyStrikeLevels(read),level=levels.at(-1);assert.equal(level.number,12);assert.equal(level.id,'quantum-armada');
 const timeline=compileLevelTimeline(level);assert.ok(timeline.some(s=>!s.quantumPair));assert.ok(new Set(timeline.filter(s=>s.quantumPair).map(s=>s.enemyId)).size>=5);
 assert.equal(timeline.filter(s=>s.enemyId===level.bossId).length,1);assert.ok(timeline.find(s=>s.enemyId===level.bossId).quantumPair);
 assert.equal(levels.at(-2).number,11);
 await assert.rejects(loadSkyStrikeLevels(p=>({...read(p),number:-1})),/invalid root/);
 await assert.rejects(loadSkyStrikeLevels(p=>{const l=read(p);return {...l,spawns:l.spawns.map(s=>({...s,quantumPair:'yes'}))};}),/invalid/);
});

test('ghost gun tips and fire track the counter-rotating sprite at arbitrary hull angles',()=>{
 for(const rotation of [-.7,0,.9]){
  const body={x:150,y:230,rotation},mount=quantumHardpoint(body,268,.28,.15);
  const actual=quantumAttachment(body,mount,210),expected=quantumHardpoint(quantumPose(body,210),268,-.28,.15);
  assert.ok(Math.hypot(actual.x-expected.x,actual.y-expected.y)<1e-9);
  const v=quantumVelocity(-Math.sin(rotation)*100,Math.cos(rotation)*100),a=quantumPose(body).rotation;
  assert.ok(Math.hypot(v.x+Math.sin(a)*100,v.y-Math.cos(a)*100)<1e-9);
 }
});

test('red and dark enemy art becomes blue while alpha silhouette remains exact',()=>{
 const source=new Uint8Array([255,0,0,130,0,0,0,0,20,20,20,255]),copy=source.slice(),out=quantumPixels(source);
 assert.deepEqual(source,copy);assert.equal(out[3],130);assert.equal(out[7],0);assert.equal(out[11],255);
 assert.ok(out[2]>out[1]&&out[1]>out[0]);assert.ok(out[10]>out[8]);assert.ok(out[2]>out[10]);
});

test('paired enemies enter from above at identical height and battleship fire is 20 percent less frequent',()=>{
 for(const cx of [149,240,331])for(let t=0;t<20000;t+=137){
  const body={x:quantumBossX(cx,t),y:-180+t*.016,rotation:Math.sin(t)*.2},ghost=quantumPose(body,cx);
  assert.equal(ghost.y,body.y);assert.equal((ghost.x+body.x)/2,cx);assert.equal(ghost.rotation,-body.rotation);
 }
 assert.ok(quantumPose({x:120,y:-60,rotation:0}).y<0);
 const d=requiredEnemyDefinition('quantum-dreadnought');assert.equal(d.fireIntervalMs,875);
 for(const wave of [0,12,30])assert.ok(Math.abs(enemyFireIntervalMs(700,wave)/enemyFireIntervalMs(d.fireIntervalMs,wave)-.8)<1e-10);
 const shot=quantumVelocity(50,200);assert.deepEqual(shot,{x:-50,y:200});
});

test('battleship crosses both halves smoothly and adapts its sweep to the visible width',()=>{
 const period=2*Math.PI/.0005;
 for(const width of [298,390,480])for(const cx of [149,240,331]){
  const left=quantumBossX(cx,0,width),right=quantumBossX(cx,period/2,width);
  assert.ok(left<cx-width*.28&&right>cx+width*.28,'wide sweep reaches both screen halves');
  assert.ok(left>cx-width/2&&right<cx+width/2,'centers stay in visible field');
  assert.ok(Math.abs(quantumBossX(cx,period,width)-left)<1e-9,'continuous periodic path');
  for(let t=0;t<period;t+=16){
   const x=quantumBossX(cx,t,width),next=quantumBossX(cx,t+16,width);
   assert.ok(Math.abs(next-x)<=140*.0005*16,'bounded speed without edge jumps');
  }
  assert.ok(Math.abs(quantumBossX(cx,16,width)-left)<.01,'smooth turn at edge');
 }
});

test('reactor breathes in yellow at 35 percent, turns red strictly below and flashes faster',()=>{
 const a=quantumCoreState(0,35,100),b=quantumCoreState(1100,35,100),low=quantumCoreState(210,34.99,100);
 assert.equal(a.critical,false);assert.equal(a.color,'#ffd052');assert.equal(a.periodMs,2200);assert.ok(b.intensity>a.intensity+.7);
 assert.equal(low.critical,true);assert.equal(low.color,'#ff3538');assert.equal(low.periodMs,420);assert.ok(low.intensity>.99);
 for(const hp of [100,34])for(const t of [0,31,500,10000]){const v=quantumCoreState(t,hp,100);assert.ok(v.intensity>=.22&&v.intensity<=1);assert.ok(Math.abs(v.intensity-quantumCoreState(t+v.periodMs,hp,100).intensity)<1e-10);}
});
test('six turret image pivots and barrel tips stay attached while rotating and recoiling',()=>{
 const body={x:130,y:160,rotation:.17};
 for(let i=0;i<6;i++)for(const angle of [-Math.PI,0,Math.PI/2]){
  const a=quantumTurretPose(body,268,i,angle),b=quantumTurretPose(body,268,i,angle,2);
  assert.deepEqual(a.pivot,b.pivot);assert.ok(Math.abs(Math.hypot(a.muzzle.x-b.muzzle.x,a.muzzle.y-b.muzzle.y)-2)<1e-10);
  const distance=Math.hypot(a.muzzle.x-a.pivot.x,a.muzzle.y-a.pivot.y);assert.ok(Math.abs(distance-a.drawSize*.57)<1e-10);
  assert.ok(Math.abs((a.muzzle.x-a.pivot.x)*Math.sin(angle)-(a.muzzle.y-a.pivot.y)*Math.cos(angle))<1e-10);
 }
});
