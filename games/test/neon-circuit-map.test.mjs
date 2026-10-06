import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
// Node's type-strip runner needs an explicit extension for this bundler-resolved import.
registerHooks({resolve(specifier,context,next){
  return next(specifier==='./RaceRules' && context.parentURL?.endsWith('/HudMapMath.ts')?'./RaceRules.ts':specifier,context);
}});
const { hudMapBasis, hudMapPoint, hudMapProjection, raceHudLayout } = await import('../neon-circuit/HudMapMath.ts');
import { CIRCUITS, circuitTrack, racePose, sampleTrack, dot, cross, mixAxes } from '../neon-circuit/RaceRules.ts';

test('every 3D route fits the same sphere through all vehicle attitudes',()=>{
  for(const circuit of CIRCUITS) {
    const track=circuitTrack(circuit),projection=hudMapProjection(track);
    for(const pose of track.samples.filter((_,i)=>i%71===0)) for(const point of track.samples.filter((_,i)=>i%13===0)) {
      const p=hudMapPoint(projection,point,hudMapBasis(pose));
      assert.ok(Math.hypot(p.x-.5,p.y-.5)<=.330001,circuit.id);
      assert.ok(Math.abs(p.depth)<=.330001);
    }
  }
});
test('forward stays above the car and full pitch/roll are retained without a yaw singularity',()=>{
  const projection={center:[0,0,0],scale:.001};
  for(const f of [[0,0,1],[0,1,0],[0,-1,0],[1,0,0]]) {
    const r=Math.abs(f[1])>.9?[1,0,0]:cross([0,1,0],f),u=cross(f,r);
    for(const roll of [0,.8,Math.PI/2,Math.PI,Math.PI*2]) {
      const right=mixAxes(r,u,Math.cos(roll),Math.sin(roll));
      const basis=hudMapBasis({frame:{forward:f,right,up:cross(f,right)}});
      const p=hudMapPoint(projection,{x:f[0]*100,y:f[1]*100,z:f[2]*100},basis);
      assert.ok(Math.abs(p.x-.5)<1e-9);assert.ok(p.y<.42);
      assert.ok(Math.abs(dot(basis.right,basis.up))<1e-9);
    }
  }
});
test('actual height separates stacked paths, including when X/Z are identical',()=>{
  const projection={center:[0,0,0],scale:.001},basis=hudMapBasis({heading:0,pitch:0,bank:0});
  const a=hudMapPoint(projection,{x:10,y:0,z:10},basis),b=hudMapPoint(projection,{x:10,y:200,z:10},basis);
  assert.ok(Math.abs(a.y-b.y)>.09);assert.ok(Math.abs(a.depth-b.depth)>.17);
});
test('curve and vehicle marker use identical 3D projection including lateral movement',()=>{
  for(const circuit of CIRCUITS) {
    const track=circuitTrack(circuit),projection=hudMapProjection(track),sample=track.samples[100];
    const pose=racePose(track,{distance:sample.distance,lateral:0}),basis=hudMapBasis(pose);
    const car=hudMapPoint(projection,pose,basis),ink=hudMapPoint(projection,sample,basis);
    assert.ok(Math.hypot(car.x-ink.x,car.y-ink.y,car.depth-ink.depth)<1e-12);
    const side=racePose(track,{distance:sample.distance,lateral:58});
    assert.ok(hudMapPoint(projection,side,basis).x<hudMapPoint(projection,pose,basis).x);
  }
});
test('map screen-right agrees with the full chase camera frame on both sides of each spatial road',()=>{
  let positive=0,negative=0;
  for(const circuit of CIRCUITS) {
    const track=circuitTrack(circuit),projection=hudMapProjection(track);
    for(const sample of track.samples.filter((_,i)=>i%9===0)) {
      const basis=hudMapBasis(sample),ahead=sampleTrack(track,sample.distance+450);
      const cameraRight=sample.frame?mixAxes(sample.frame.right,sample.frame.right,-1,0):basis.right;
      const side=dot([ahead.x-sample.x,ahead.y-sample.y,ahead.z-sample.z],cameraRight);
      const a=hudMapPoint(projection,sample,basis),b=hudMapPoint(projection,ahead,basis);
      if(Math.abs(side)<2)continue;
      assert.equal(Math.sign(b.x-a.x),Math.sign(side));if(side>0)positive++;else negative++;
    }
  }
  assert.ok(positive>10 && negative>10);
});
test('Mobius and coaster map curves remain continuous at inversions, vertical tangents and lap seams',()=>{
  for(const id of ['mobius-ring','sky-coaster']) {
    const track=circuitTrack(CIRCUITS.find(c=>c.id===id)),projection=hudMapProjection(track);
    for(const sample of track.samples) {
      const before=hudMapBasis(sampleTrack(track,sample.distance-.02)),after=hudMapBasis(sampleTrack(track,sample.distance+.02));
      for(const point of track.samples.filter((_,i)=>i%127===0)) {
        const a=hudMapPoint(projection,point,before),b=hudMapPoint(projection,point,after);
        assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<.0001,`${id} ${sample.distance}`);
      }
    }
  }
});

test('iPhone moves its existing dial exactly left 25 and down 5, joins timing, and keeps a 44-point pause target inside screen', () => {
  const view={x:59,y:0,width:814,height:409},hud=raceHudLayout(view,true);
  assert.equal(hud.dial.x,-25); assert.equal(hud.dial.y,5); assert.equal(hud.dial.width,174*.8);
  assert.ok(hud.stats.x >= hud.dial.x+hud.dial.width);
  assert.ok(hud.stats.x+hud.stats.width < hud.instruments.x+hud.instruments.width);
  assert.ok(hud.instruments.x+hud.instruments.width < hud.compass.x);
  for (const width of [320,358,390,844,932]) {
    const h=raceHudLayout({x:0,y:0,width,height:430},true);
    assert.ok(h.instruments.x+h.instruments.width < h.compass.x);
    assert.ok(h.compass.x+h.compass.width*.85+22 <= width+.01);
  }
});
