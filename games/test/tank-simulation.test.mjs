import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { createGame } from '../tank-battle/rules/rules.ts';
const hook=registerHooks({resolve(specifier,context,next){return next(/^\.{1,2}\//.test(specifier)&&! /\.[a-z0-9]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const {TankSimulation}=await import('../tank-battle/game/TankSimulation.ts');
hook.deregister();
const inputs=[{direction:null,fire:false}];
test('desktop/mobile tank simulation is identical at 30, 60, 120 and 144 Hz',()=>{
  const states=[30,60,120,144].map(hz=>{
    const state=createGame(1,12345),simulation=new TankSimulation();
    for(let frame=0;frame<hz*2;frame++)simulation.advance(1000/hz,state,inputs,()=>{});
    return state;
  });
  for(const state of states.slice(1))assert.deepEqual(state,states[0]);
});
test('long frames are bounded and reset discards fractional pre-pause time',()=>{
  const state=createGame(1,12345),simulation=new TankSimulation();let ticks=0;
  simulation.advance(60000,state,inputs,()=>ticks++);assert.equal(ticks,6);
  simulation.advance(8,state,inputs,()=>ticks++);simulation.reset();
  simulation.advance(9,state,inputs,()=>ticks++);assert.equal(ticks,6);
});
test('phase changes stop the current batch without advancing a freshly changed phase',()=>{
  const state=createGame(1,12345),simulation=new TankSimulation();let ticks=0;
  state.baseAlive=false;
  assert.equal(simulation.advance(100,state,inputs,()=>ticks++),true);
  assert.equal(state.phase,'gameover');assert.equal(ticks,1);
});
