import test from 'node:test';
import assert from 'node:assert/strict';
import {turnFighterToward,angleDifference,fighterMuzzle,isAimingFighter,FIGHTER_TURN_RADIANS_PER_SECOND} from '../sky-strike/fighterAim.ts';
import {ENEMY_DEFINITIONS} from '../sky-strike/rules.ts';
test('aim animation turns by the shortest arc with bounded per-frame speed and settles without overshoot',()=>{
 const start=Math.PI-.04,target=-Math.PI+.04,next=turnFighterToward(start,target,16);
 assert.ok(next>start);assert.ok(Math.abs(angleDifference(next,target))<.01);
 let angle=0;for(let i=0;i<60;i++){const n=turnFighterToward(angle,-1.6,16);assert.ok(Math.abs(n-angle)<=FIGHTER_TURN_RADIANS_PER_SECOND*.016+1e-10);angle=n;}
 assert.ok(Math.abs(angle+1.6)<1e-10);assert.equal(turnFighterToward(angle,0,0),angle);
 for(let i=0;i<60;i++)angle=turnFighterToward(angle,0,16);assert.equal(angle,0);
});
test('aiming applies to seven ordinary firing ships; excludes kamikaze, train, saucer and boss',()=>{
 assert.deepEqual(ENEMY_DEFINITIONS.filter(isAimingFighter).map(e=>e.id),['scout','dart','bomber','splitter','stealth','gunship','drone']);
});
test('muzzle rotates with the nose and remains on the forward firing axis',()=>{
 const definition=ENEMY_DEFINITIONS.find(e=>e.id==='scout');
 for(const rotation of [0,-Math.PI/2,Math.PI/2,Math.PI]){
 const m=fighterMuzzle({x:200,y:300,rotation,definition});
 assert.ok(Math.abs(m.dx*Math.cos(rotation)+m.dy*Math.sin(rotation))<1e-10);
 assert.ok(m.dx*-Math.sin(rotation)+m.dy*Math.cos(rotation)>0);assert.equal(m.x,200+m.dx);assert.equal(m.y,300+m.dy);
 }
});
