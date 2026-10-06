import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobiusTrack, sampleTrack, dot, mixAxes, frameTurn, racePose, BOOST_PADS,
  BOOST_PAD_LENGTH, BOOST_PAD_HALF_WIDTH, ROAD_HALF_WIDTH, boostZoneAt, CIRCUITS, circuitTrack,
  createInitialRaceState,stepRace,BOOST_MAX_SPEED} from '../neon-circuit/RaceRules.ts';

test('Mobius lap visits opposite faces of one ribbon and closes without teleporting',()=>{
  const t=createMobiusTrack(), n=t.samples.length, original=createMobiusTrack(1);
  for(let i=0;i<n/2;i++) {
    const a=t.samples[i],b=t.samples[i+n/2];
    assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)-12)<.001);
    for(const axis of ['x','y','z']) assert.ok(Math.abs((a[axis]+b[axis])/2-(original.samples[i][axis]+original.samples[i+n/2][axis])/2*1.8)<1e-8);
    assert.ok(dot(a.frame.up,b.frame.up)<-.999);
    assert.ok(dot(a.frame.right,b.frame.right)<-.999);
  }
  assert.ok(t.samples[0].frame.up[1]>.999);
  assert.ok(t.samples[n/2].frame.up[1]<-.999);
  for(let i=0;i<n;i++) {
    const a=t.samples[i], b=t.samples[(i+1)%n];
    assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<31);
    assert.ok(dot(a.frame.up,b.frame.up)>.999);
    assert.ok(Math.abs(frameTurn(a,b))<.01);
    const pose=racePose(t,{distance:a.distance,lateral:58});
    assert.ok(Math.abs(Math.hypot(pose.x-a.x,pose.y-a.y,pose.z-a.z)-58)<1e-6);
  }
  const before=sampleTrack(t,t.length-.01),after=sampleTrack(t,.01);
  assert.ok(Math.hypot(before.x-after.x,before.y-after.y,before.z-after.z)<.021);
  assert.ok(dot(before.frame.up,after.frame.up)>.99999);
});

test('short pads cover all lanes and exact visible footprints on every course',()=>{
  assert.equal(BOOST_PAD_LENGTH,96);
  assert.equal(BOOST_PADS.length,15);
  for(const course of CIRCUITS) {
    const track=circuitTrack(course);
    for(const [i,pad] of BOOST_PADS.entries()) {
      assert.ok(Math.abs(pad.lateral)+BOOST_PAD_HALF_WIDTH<ROAD_HALF_WIDTH-10);
      assert.equal(boostZoneAt(pad.progress,pad.lateral,track.length),i);
      assert.equal(boostZoneAt(pad.progress+(BOOST_PAD_LENGTH/2+1)/track.length,pad.lateral,track.length),-1);
      assert.equal(boostZoneAt(pad.progress,pad.lateral+BOOST_PAD_HALF_WIDTH+1,track.length),-1);
    }
    for(const lane of [-58,0,58]) assert.equal(BOOST_PADS.filter(p=>p.lateral===lane).length,5);
  }
});

test('left and right pads trigger once at maximum speed, adjacent lanes do not',()=>{
  const track={length:34000,samples:[{x:0,y:0,z:0,heading:0,pitch:0,bank:0,distance:0},
    {x:0,y:0,z:34000,heading:0,pitch:0,bank:0,distance:34000}]};
  for(const pad of BOOST_PADS.slice(0,3)) {
    let state={...createInitialRaceState(),distance:pad.progress*track.length-55,lateral:pad.lateral,speed:BOOST_MAX_SPEED};
    let boosts=0;
    for(let i=0;i<15;i++) {const r=stepRace(track,state,{throttle:1,brake:0,steer:0},1/120);state=r.state;boosts+=r.events.filter(e=>e==='boost').length;}
    assert.equal(boosts,1);
    const miss=stepRace(track,{...createInitialRaceState(),distance:pad.progress*track.length,lateral:pad.lateral===0?58:0,speed:1000},{throttle:1,brake:0,steer:0},1/120);
    assert.ok(!miss.events.includes('boost'));
  }
});
