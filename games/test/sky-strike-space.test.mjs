import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const code=stripTypeScriptTypes(readFileSync(new URL('../sky-strike/spaceBackdrop.ts',import.meta.url),'utf8'),{mode:'transform'});
const {SkyStrikeSpaceBackdrop,spaceTiles,SPACE_THEMES,SPACE_FADE_MS}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('all seven missions own a distinct background; some include independently moving planets',()=>{
 const ids=Array.from({length:7},(_,i)=>JSON.parse(readFileSync(new URL(`../sky-strike/levels/level-0${i+1}.json`,import.meta.url))).id);
 assert.deepEqual(SPACE_THEMES.map(t=>t.level),ids);
 assert.equal(new Set(SPACE_THEMES.map(t=>t.texture)).size,7);
 assert.ok(SPACE_THEMES.some(t=>!t.planet));assert.ok(SPACE_THEMES.some(t=>t.planet==='planet-amber'));assert.ok(SPACE_THEMES.some(t=>t.planet==='planet-ice'));
});
test('scroll tiles cover the full field without gaps or unmatched seams across many wrap boundaries',()=>{
 for(const [size,speed] of [[680,7],[1080,19]])for(const cycles of [0,1,2,3,10000])for(const epsilon of [-0.001,0,0.001]) {
  const age=Math.max(0,cycles*size/speed*1000+epsilon),tiles=spaceTiles(age,speed,size);
  assert.ok(tiles.length<=4);assert.ok(tiles[0].y-size/2<=0);assert.ok(tiles.at(-1).y+size/2>=960);
  for(let i=1;i<tiles.length;i++){assert.ok(Math.abs(tiles[i].y-tiles[i-1].y-size)<1e-6);assert.notEqual(tiles[i].flipY,tiles[i-1].flipY);}
 }
});
test('crossfade preserves total weight, supports interruptions, settles and resets cleanly',()=>{
 const b=new SkyStrikeSpaceBackdrop();b.select('orbital-gate',true);b.update(2000);b.select('ion-tempest');
 assert.deepEqual(b.weights(),[1,0,0,0,0,0,0]);b.update(SPACE_FADE_MS/2);assert.deepEqual(b.weights(),[.5,.5,0,0,0,0,0]);
 const before=b.weights(),age=b.snapshot().ageMs;b.select('void-hunt');assert.deepEqual(b.weights(),before);assert.equal(b.snapshot().ageMs,age);
 for(let i=0;i<90;i++){b.update(100);assert.ok(Math.abs(b.weights().reduce((a,v)=>a+v,0)-1)<1e-12);}
 assert.deepEqual(b.weights(),[0,0,1,0,0,0,0]);b.select('binary-nova',true);assert.equal(b.snapshot().ageMs,0);assert.deepEqual(b.weights(),[0,0,0,0,0,0,1]);
 assert.throws(()=>b.select('missing'));b.update(NaN);assert.equal(b.snapshot().ageMs,0);
});
test('space layers keep independent scroll speeds and depth, with bounded immutable sprite commands',()=>{
 const b=new SkyStrikeSpaceBackdrop();b.select('carrier-siege',true);
 const draw=(camera=0)=>{const commands=[];b.draw({sprite(...args){commands.push(args);}},camera,240);return commands;};
 const a=draw(),camera=draw(100);assert.ok(a.length<=9);
 assert.ok(Math.abs(camera[0][1]-a[0][1]-88)<1e-8,'far field follows only 12% of the camera after projection');
 b.update(1000);const c=draw();assert.ok(c.length<=9);assert.ok(c.some(v=>v[4]===680&&Math.abs(v[2]-a[0][2]-7)<1e-8));
 const dust=a.findIndex(v=>v[4]===1080);assert.ok(c.some(v=>v[4]===1080&&Math.abs(v[2]-a[dust][2]-19)<1e-8));
 const planet=a.findIndex(v=>v[0].includes('planet-'));assert.ok(Math.abs(c.find(v=>v[0].includes('planet-'))[2]-a[planet][2]-11)<1e-8);
 b.select('binary-nova');b.update(4500);assert.ok(draw().length<=18);
});
