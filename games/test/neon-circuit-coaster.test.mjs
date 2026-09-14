import assert from 'node:assert/strict';
import test from 'node:test';
import {createCoasterTrack,dot,cross,frameTurn,sampleTrack,racePose,createInitialRaceState,stepRace} from '../neon-circuit/RaceRules.ts';
import {roadOverlay} from '../neon-circuit/RoadOverlay.ts';

test('coaster frames remain orthonormal and continuous through vertical poles, rolls and the lap seam',()=>{
  const track=createCoasterTrack(1.8);
  for(let i=0;i<track.samples.length;i++) {
    const a=track.samples[i],b=track.samples[(i+1)%track.samples.length],f=a.frame;
    for(const axis of [f.right,f.up,f.forward]) assert.ok(Math.abs(Math.hypot(...axis)-1)<1e-9);
    assert.ok(Math.abs(dot(f.right,f.up))<1e-9);
    assert.ok(dot(cross(f.right,f.up),f.forward)>.999999);
    assert.ok(dot(f.up,b.frame.up)>.99 && dot(f.right,b.frame.right)>.99,'no frame flip');
    assert.ok(Math.abs(frameTurn(a,b))<.05,'vertical motion must not create a false yaw impulse');
  }
  for(const section of ['loop','roll'])assert.ok(track.samples.some(s=>s.section===section&&s.frame.up[1]<-.9));
  assert.ok(track.samples.some(s=>Math.abs(s.frame.forward[1])>.98));
  const helix=track.samples.filter(s=>s.section==='helix');assert.ok(helix.at(-1).y-helix[0].y>3000);
  assert.deepEqual(sampleTrack(track,0),sampleTrack(track,track.length));
});

test('inverted hovercraft offsets and steering remain on its road plane',()=>{
  const track=createCoasterTrack(),s=track.samples.find(s=>s.section==='loop'&&s.frame.up[1]<-.98);
  const pose=racePose(track,{distance:s.distance,lateral:60,headingOffset:0});
  const offset=[pose.x-s.x,pose.y-s.y,pose.z-s.z];
  assert.ok(Math.abs(dot(offset,s.frame.right)-60)<1e-7);
  assert.ok(Math.abs(dot(offset,s.frame.up))<1e-7);
  const state={...createInitialRaceState(),distance:s.distance,speed:500};
  const left=stepRace(track,state,{throttle:1,brake:0,steer:1},.05).state;
  const right=stepRace(track,state,{throttle:1,brake:0,steer:-1},.05).state;
  assert.ok(left.lateral>right.lateral);assert.equal(left.wallHits,0);assert.equal(right.wallHits,0);
});

test('decals on inverted and vertical road faces lift toward the drivable side',()=>{
  for(const inverted of [true,false]) {
    const top=new Float32Array(inverted?[-92,0,0,92,0,0,-92,0,-100,92,0,-100,-92,0,0,92,0,0]:[0,-92,0,0,92,0,0,-92,100,0,92,100,0,-92,0,0,92,0]);
    const track={length:200,samples:[{distance:0,frame:{}},{distance:100,frame:{}}]};
    const mesh=roadOverlay(track,top,0,100,-16,16,92,.5,[1,1]);
    for(let i=0;i<mesh.positions.length;i+=3) assert.ok(Math.abs(mesh.positions[i+(inverted?1:0)]+.5)<1e-5);
  }
});
