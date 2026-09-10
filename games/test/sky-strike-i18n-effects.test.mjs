import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const module = async name => import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(readFileSync(new URL(`../sky-strike/${name}.ts`,import.meta.url),'utf8'),{mode:'transform'}).replaceAll("'./rules'", JSON.stringify(new URL('../sky-strike/rules.ts',import.meta.url).href))).toString('base64')}`);
const {SkyStrikeLocale,SKY_TEXT,SKY_FONT_CHARACTERS,SKY_LANGUAGE_KEY} = await module('i18n');
const {SkyStrikeCombatEffects,bossShake,BOSS_BLAST_MS} = await module('combatEffects');
test('Chinese defaults and language survives restart independently of career save',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const a=new SkyStrikeLocale(storage);assert.equal(a.language,'zh');a.set('ja');assert.equal(new SkyStrikeLocale(storage).language,'ja');
 data.set(SKY_LANGUAGE_KEY,'invalid');assert.equal(new SkyStrikeLocale(storage).language,'zh');
});
test('all level/boss names and GUI strings exist in each locale and font atlas',()=>{
 const names=Array.from({length:7},(_,i)=>JSON.parse(readFileSync(new URL(`../sky-strike/levels/level-0${i+1}.json`,import.meta.url),'utf8'))).flatMap(l=>[l.id,l.bossId]);
 for(const language of ['zh','en','ja']){
  assert.deepEqual(Object.keys(SKY_TEXT[language]).sort(),Object.keys(SKY_TEXT.zh).sort());
  const locale=new SkyStrikeLocale();locale.set(language);for(const name of names)assert.ok(locale.named(name));
  for(const value of Object.values(SKY_TEXT[language]))for(const glyph of value)assert.ok(SKY_FONT_CHARACTERS.includes(glyph));
 }
});
test('unavailable preference storage stays playable, reports failure, and listeners detach',()=>{
 const locale=new SkyStrikeLocale({getItem(){throw Error();},setItem(){throw Error();}});let calls=0;
 const off=locale.subscribe(()=>calls++);locale.set('en');assert.equal(locale.language,'en');assert.equal(locale.saveFailed,true);assert.equal(calls,1);off();locale.set('zh');assert.equal(calls,1);
 assert.throws(()=>locale.set('fr'));assert.throws(()=>locale.named('constructor'));
});
test('muzzle bursts and detonations are bounded, expire, and clear on restart',()=>{
 const effects=new SkyStrikeCombatEffects();for(let i=0;i<200;i++)effects.shot({x:0,y:0},0,0,0,-1,'#ffffff','red');
 for(let i=0;i<8;i++)effects.detonate(0,0,300);
 assert.equal(effects.snapshot().muzzleFlashes,96);assert.equal(effects.snapshot().detonations,4);
 effects.update(200);assert.equal(effects.snapshot().muzzleFlashes,0);effects.update(BOSS_BLAST_MS);assert.equal(effects.snapshot().detonations,0);assert.deepEqual(effects.shake(),{x:0,y:0});
 effects.detonate(0,0,300);effects.clear();assert.equal(effects.snapshot().detonations,0);
});
test('boss shake is deterministic, strongest at impact, bounded and fully settles',()=>{
 assert.deepEqual(bossShake(120),bossShake(120));assert.ok(Math.abs(bossShake(0).x)>10);
 for(let t=0;t<=BOSS_BLAST_MS;t+=16){const s=bossShake(t);assert.ok(Math.abs(s.x)<=14 && Math.abs(s.y)<=14);}
 assert.deepEqual(bossShake(BOSS_BLAST_MS),{x:0,y:0});assert.deepEqual(bossShake(-1),{x:0,y:0});
});
const {drawShipDetails} = await module('shipDetails');
test('elite/Boss attachment animation follows hull translation and changes over time',()=>{
 const capture=(age,x)=>{const commands=[];const renderer=new Proxy({}, {get:(_,kind)=>(...args)=>commands.push([kind,...args])});
 const enemy={definition:{id:'star-carrier',size:350,tier:'boss',bulletPattern:'aimed',bossAttack:'carrier-deploy',fireIntervalMs:1450},x,y:200,ageMs:age,rotation:0,fireCooldownMs:500,laserCooldownMs:2700,charging:false};
 drawShipDetails(renderer,enemy,{x:240,y:800},true);drawShipDetails(renderer,enemy,{x:240,y:800},false);return commands;};
 const a=capture(100,240),b=capture(500,240);assert.notDeepEqual(a,b,'rotors and thrust animate');assert.equal(a.length,b.length,'no accumulating draw objects');
 const c=capture(100,260);assert.equal(c[0][2]-a[0][2],20,'exhaust follows hull movement');
});
