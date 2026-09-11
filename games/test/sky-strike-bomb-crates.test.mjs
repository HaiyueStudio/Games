import test from 'node:test';
import assert from 'node:assert/strict';
import {SkyStrikeBombCrates,BOMB_CRATE_FIRST_MS,BOMB_CRATE_HEALTH} from '../sky-strike/bombCrates.ts';
const tick=(field,ms,active=true,bombs=0)=>{while(ms>0){const step=Math.min(16,ms);field.update(step,active,bombs);ms-=step;}};
test('supplies start only in active boss combat, wait six seconds then use bounded randomized intervals',()=>{
 const f=new SkyStrikeBombCrates();f.reset(()=>.5);tick(f,30000,false);assert.equal(f.crates.length,0);tick(f,BOMB_CRATE_FIRST_MS-1);assert.equal(f.crates.length,0);tick(f,1);assert.equal(f.crates.length,1);assert.equal(f.snapshot().nextMs,12500);
 assert.equal(f.crates[0].health,BOMB_CRATE_HEALTH);tick(f,12500);assert.equal(f.crates.length,1);tick(f,16000);assert.ok(f.crates.length<=1);tick(f,1,false);assert.equal(f.crates.length,0);
});
test('crate takes repeated damage, only breaks once and blocks buildup with two loose bombs',()=>{
 const f=new SkyStrikeBombCrates();tick(f,6000,true,2);assert.equal(f.crates.length,0);tick(f,12500,true,0);assert.equal(f.crates.length,1);const c=f.crates[0];assert.equal(f.damage(c,20),false);assert.equal(c.health,22);assert.equal(f.damage(c,NaN),false);assert.equal(f.damage(c,-4),false);assert.equal(f.damage(c,22),true);assert.equal(f.damage(c,42),false);assert.equal(f.crates.length,0);
});
test('crate movement stays within side margins, expires off screen, resets and is reproducible',()=>{
 const a=new SkyStrikeBombCrates(),b=new SkyStrikeBombCrates();a.reset(()=>.2);b.reset(()=>.2);tick(a,8000);tick(b,8000);assert.deepEqual(a.snapshot(),b.snapshot());
 const c=a.crates[0];assert.ok(c.y>0);assert.ok(c.x>=40&&c.x<=440);c.y=1001;tick(a,16);assert.equal(a.crates.length,0);a.spawn();a.clear();assert.equal(a.crates.length,0);assert.equal(a.snapshot().nextMs,BOMB_CRATE_FIRST_MS);
});
