import test from 'node:test';
import assert from 'node:assert/strict';
import { VolcanicHazards, MAX_FIREBALLS } from '../neon-circuit/VolcanicHazards.ts';
import { createInitialRaceState } from '../neon-circuit/RaceRules.ts';
import { readCameraMode, saveCameraMode, windshieldStage } from '../neon-circuit/CameraMode.ts';
const initial = () => ({...createInitialRaceState(),speed:500});
const ready = () => {
  const hazards=new VolcanicHazards(123);
  hazards.balls.push({id:1,distance:1000,lateral:0,age:1.6,fallTime:1.7,radius:30,hit:false});
  return hazards;
};
test('warning cannot damage the car before a fireball lands',()=>{
  const h=ready(),state={...initial(),distance:1000};
  assert.equal(h.step(state,state,10000,.05).state.health,100);
  const result=h.step(state,state,10000,.06);
  assert.ok(result.state.health<100);assert.ok(result.state.speed<state.speed);
  assert.equal(h.step(result.state,result.state,10000,.05).state.health,result.state.health,'one impact cannot damage every simulation tick');
});
test('moving to either free lane avoids impact, and only a close direct hit is lethal at low health',()=>{
  for(const lateral of [-60,60]) {
    const h=ready(),state={...initial(),distance:1000,lateral};
    assert.equal(h.step(state,state,10000,.15).hit,0);
  }
  const state={...initial(),distance:1000,health:12},h=ready();
  const result=h.step(state,state,10000,.15);assert.equal(result.state.health,0);assert.equal(result.state.destroyed,true);
});
test('swept impact catches high-speed crossings and wraps at the lap seam',()=>{
  const h=ready();h.balls[0].age=1.71;
  assert.ok(h.step({...initial(),distance:900},{...initial(),distance:1100},10000,.05).hit>0);
  const seam=ready();seam.balls[0].distance=5;seam.balls[0].age=1.71;
  assert.ok(seam.step({...initial(),distance:9980},{...initial(),distance:40},10000,.05).hit>0);
});
test('equal seeds produce identical forward warnings and reset deterministically; pools stay bounded',()=>{
  const a=new VolcanicHazards(742),b=new VolcanicHazards(742);let state=initial(),first;
  for(let i=0;i<2000;i++) {
    const before=state;state={...state,distance:(state.distance+state.speed/120)%10000};
    a.step(before,state,10000,1/120);b.step(before,state,10000,1/120);
    assert.deepEqual(a.balls,b.balls);assert.ok(a.balls.length<=MAX_FIREBALLS);
    if(!first && a.balls.length){first={...a.balls[0]};assert.ok((first.distance-state.distance+10000)%10000>800);assert.ok(first.fallTime>=1.65);}
  }
  a.reset();assert.equal(a.balls.length,0);
  state=initial();for(let i=0;i<145;i++){const before=state;state={...state,distance:state.distance+500/120};a.step(before,state,10000,1/120);}
  assert.equal(a.balls[0].distance,first.distance);assert.equal(a.balls[0].lateral,first.lateral);
});
test('stopped, destroyed and finished races never launch attacks; expired impacts are removed',()=>{
  for(const state of [{...initial(),speed:0},{...initial(),destroyed:true},{...initial(),finished:true}]) {
    const h=new VolcanicHazards(1);for(let i=0;i<1000;i++)h.step(state,state,10000,.05);assert.equal(h.balls.length,0);
  }
  const h=ready(),state={...initial(),speed:0,distance:2000};for(let i=0;i<40;i++)h.step(state,state,10000,.05);assert.equal(h.balls.length,0);
});
test('camera preference persists with safe storage fallback and glass fractures increase monotonically',()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  assert.equal(readCameraMode(storage),'chase');saveCameraMode(storage,'first-person');assert.equal(readCameraMode(storage),'first-person');
  assert.equal(readCameraMode({getItem(){throw Error();}}),'chase');
  assert.deepEqual([100,99,67,66,34,33,16,15,0].map(windshieldStage),[0,1,1,2,2,3,3,4,4]);
});
