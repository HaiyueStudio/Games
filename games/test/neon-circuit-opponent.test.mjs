import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='./RaceRules' && c.parentURL?.endsWith('/RaceOpponent.ts')?'./RaceRules.ts':s,c)}});
const {RaceOpponent,raceWinner,raceProgress}=await import('../neon-circuit/RaceOpponent.ts');
import {CIRCUITS,circuitTrack,createInitialRaceState,stepRace,RAIL_LIMIT,CRUISE_MAX_SPEED,BOOST_MAX_SPEED} from '../neon-circuit/RaceRules.ts';
import {VolcanicHazards} from '../neon-circuit/VolcanicHazards.ts';
const initial=()=>({...createInitialRaceState(),lateral:-30});
function simulate(circuit,difficulty,seed=0x4e4f5641) {
  const track=circuitTrack(circuit),ai=new RaceOpponent(difficulty,seed);
  let state=initial(),boost=0,sideBoost=0,peakSpeed=0,brakingSteps=0;
  for(let i=0;i<120*450&&!state.finished;i++) {
    const controls=ai.update(track,state,1/120);
    for(const value of Object.values(controls))assert.ok(Number.isFinite(value));
    assert.ok(Math.abs(controls.steer)<=1 && controls.brake>=0 && controls.brake<=1 && controls.throttle>=0 && controls.throttle<=1);
    const result=stepRace(track,state,controls,1/120,false);state=result.state;
    peakSpeed=Math.max(peakSpeed,state.speed);if(controls.brake>.1)brakingSteps++;
    if(result.events.includes('boost')){boost++;if(Math.abs(state.lateral)>35)sideBoost++;}
  }
  return {state,boost,sideBoost,peakSpeed,brakingSteps};
}
test('all difficulties physically finish all seven 3D courses; harder AI is faster and has fewer rail impacts',()=>{
  for(const circuit of CIRCUITS) {
    const easy=simulate(circuit,'easy'),normal=simulate(circuit,'normal'),hard=simulate(circuit,'hard');
    for(const result of [easy,normal,hard]) {assert.equal(result.state.finished,true,circuit.id);assert.equal(result.state.health,100);}
    assert.ok(easy.state.wallHits>normal.state.wallHits,`${circuit.id}: ${easy.state.wallHits} > ${normal.state.wallHits}`);
    assert.ok(normal.state.wallHits>=hard.state.wallHits,circuit.id);
    assert.ok(easy.state.elapsed>normal.state.elapsed && normal.state.elapsed>hard.state.elapsed,`${circuit.id}: ${easy.state.elapsed}, ${normal.state.elapsed}, ${hard.state.elapsed}`);
    // Every difficulty now plans boosts, including both side lanes. Boost count
    // need not be strictly ordered when equally useful pads are safely reachable.
    for(const [difficulty,result] of Object.entries({easy,normal,hard})) {
      assert.ok(result.boost>=6 && result.sideBoost>0,`${circuit.id} ${difficulty} uses centre and side boosts`);
      assert.ok(result.peakSpeed>BOOST_MAX_SPEED*.9,`${circuit.id} ${difficulty} uses full boost power`);
      if(circuit.id==='reactor-run')assert.ok(result.brakingSteps>0,`${difficulty} brakes for hairpins`);
    }
  }
});
test('seeded driving replays exactly; alternate seeds change mistakes and all controls remain bounded',()=>{
  assert.deepEqual(simulate(CIRCUITS[1],'easy',123),simulate(CIRCUITS[1],'easy',123));
  assert.notDeepEqual(simulate(CIRCUITS[1],'easy',123),simulate(CIRCUITS[1],'easy',456));
});
test('duel wall and scrape penalties keep health but retain slowing and cancel boost',()=>{
  const track=circuitTrack(CIRCUITS[0]);
  const state={...initial(),speed:1000,lateral:RAIL_LIMIT,headingOffset:.8,lateralSpeed:600,boostRemaining:1};
  for(const cooldown of [0,.1]) {
    const source={...state,collisionCooldown:cooldown};
    const duel=stepRace(track,source,{throttle:1,brake:0,steer:1},1/120,false).state;
    const solo=stepRace(track,source,{throttle:1,brake:0,steer:1},1/120,true).state;
    assert.equal(duel.health,100);assert.ok(solo.health<100);assert.equal(duel.speed,solo.speed);assert.ok(duel.speed<state.speed);
  }
});
test('one shared fireball can slow both racers once each without any duel hull loss',()=>{
  const hazards=new VolcanicHazards(1);hazards.balls.push({id:1,distance:1000,lateral:0,age:1.7,fallTime:1.7,radius:30,hit:false});
  const s={...initial(),distance:1000,lateral:0,speed:600};
  const p=hazards.step(s,s,10000,1/120,false),b=hazards.step(s,s,10000,1/120,false,true);
  assert.ok(p.hit>0 && b.hit>0);assert.equal(p.state.health,100);assert.equal(b.state.health,100);assert.equal(p.state.speed,b.state.speed);
  assert.equal(hazards.step(b.state,b.state,10000,1/120,false,true).hit,0);
  assert.equal(hazards.step(p.state,p.state,10000,1/120,false).hit,0);
});
test('finish adjudication uses lap progress and fractional crossing, including an exact tie',()=>{
  const track={length:1000,samples:[]},a={...initial(),lap:3,distance:999},b={...a,distance:995};
  const done={...a,finished:true,distance:1};
  assert.equal(raceWinner(track,a,done,b,{...b,distance:997}),'player');
  assert.equal(raceWinner(track,a,a,b,done),'opponent');
  assert.equal(raceWinner(track,a,done,b,done),'player');
  assert.equal(raceWinner(track,a,done,a,done),'tie');
  assert.equal(raceWinner(track,a,a,b,b),null);
  assert.ok(raceProgress({...a,lap:2,distance:1},track)>raceProgress({...a,lap:1,distance:999},track));
});
test('shared volcanic warnings still target a moving rival when the player stops',()=>{
  const h=new VolcanicHazards(5),player={...initial(),lateral:0,speed:0},bot={...initial(),speed:700,distance:2000};
  for(let i=0;i<150;i++) {h.step(player,player,10000,1/120,false,false,bot);h.step(bot,bot,10000,1/120,false,true);}
  assert.equal(h.balls.length,1);assert.ok(h.balls[0].distance>bot.distance);
});
test('normal and hard drivers steer away from a predicted active fireball',()=>{
  const track=circuitTrack(CIRCUITS[0]);
  const state={...initial(),speed:500,distance:0};
  const ball={id:1,distance:500,lateral:-30,age:.8,fallTime:1.7,radius:30,hit:false};
  for(const difficulty of ['normal','hard']) {
    const driver=new RaceOpponent(difficulty);driver.update(track,state,1/120,[ball]);
    assert.ok(driver.targetLane>0,difficulty);
  }
});

const straight={length:200000,samples:[
  {x:0,y:0,z:0,heading:0,pitch:0,bank:0,distance:0},
  {x:0,y:0,z:199999,heading:0,pitch:0,bank:0,distance:199999},
]};
test('all difficulty levels match a player holding full throttle on clear road and boost expiry never causes AI braking',()=>{
  for(const difficulty of ['easy','normal','hard']) {
    const driver=new RaceOpponent(difficulty);
    let state={...createInitialRaceState(),distance:1000},player={...state};
    for(let i=0;i<120*8;i++) {
      const controls=driver.update(straight,Object.freeze(state),1/120);
      state=stepRace(straight,state,controls,1/120,false).state;
      player=stepRace(straight,player,{throttle:1,brake:0,steer:0},1/120,false).state;
    }
    assert.deepEqual(state,player,difficulty);assert.equal(state.speed,CRUISE_MAX_SPEED);
    state={...state,boostRemaining:1.8};
    for(let i=0;i<120;i++)state=stepRace(straight,state,driver.update(straight,state,1/120),1/120,false).state;
    assert.equal(state.speed,BOOST_MAX_SPEED,difficulty);
    state={...state,boostRemaining:0};
    for(let i=0;i<30;i++) {
      const controls=driver.update(straight,state,1/120);assert.equal(controls.brake,0,difficulty);
      state=stepRace(straight,state,controls,1/120,false).state;
    }
    assert.ok(state.speed>1300,difficulty);
  }
});
test('driver inputs recover a sideways wall rebound and remain smooth across decision ticks',()=>{
  for(const difficulty of ['easy','normal','hard']) {
    const driver=new RaceOpponent(difficulty);
    let state={...createInitialRaceState(),distance:1000,speed:400,lateral:79,lateralSpeed:100,headingOffset:.2},last={throttle:1,brake:0,steer:0};
    for(let i=0;i<120*8;i++) {
      const controls=driver.update(straight,Object.freeze(state),1/120);
      assert.ok(Math.abs(controls.steer-last.steer)<=6/120+1e-8);
      assert.ok(Math.abs(controls.throttle-last.throttle)<=8/120+1e-8);
      assert.ok(Math.abs(controls.brake-last.brake)<=8/120+1e-8);
      state=stepRace(straight,state,controls,1/120,false).state;last=controls;
    }
    assert.ok(Math.abs(state.lateral)<5 && Math.abs(state.headingOffset)<.01,difficulty);
    assert.ok(state.speed>950,difficulty);
  }
});

test('difficulty ordering survives different mistake seeds on technical and inverted tracks',()=>{
  for(const circuit of [CIRCUITS[2],CIRCUITS[6]]) {
    const totals={easy:{time:0,hits:0},normal:{time:0,hits:0},hard:{time:0,hits:0}};
    for(const difficulty of ['easy','normal','hard'])for(const seed of [123,456,789]) {
      const result=simulate(circuit,difficulty,seed);
      assert.equal(result.state.finished,true,`${circuit.id} ${difficulty} seed ${seed}`);
      assert.ok(result.boost>0 && result.sideBoost>0);
      totals[difficulty].time+=result.state.elapsed;totals[difficulty].hits+=result.state.wallHits;
    }
    assert.ok(totals.easy.time>totals.normal.time && totals.normal.time>totals.hard.time,`${circuit.id} ${JSON.stringify(totals)}`);
    assert.ok(totals.easy.hits>totals.normal.hits && totals.normal.hits>=totals.hard.hits,`${circuit.id} ${JSON.stringify(totals)}`);
  }
});
