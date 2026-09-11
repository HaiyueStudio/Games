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
 const names=[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>JSON.parse(readFileSync(new URL(`../sky-strike/levels/level-${String(n).padStart(2,'0')}.json`,import.meta.url),'utf8'))).flatMap(l=>[l.id,l.bossId]);
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
const {drawShipDetails,drawSerpentSegment,SHIP_DETAIL_ASSETS} = await module('shipDetails');
test('elite/Boss attachment animation follows hull translation and changes over time',()=>{
 const capture=(age,x)=>{const commands=[];const renderer=new Proxy({}, {get:(_,kind)=>(...args)=>commands.push([kind,...args])});
 const enemy={definition:{id:'star-carrier',size:350,tier:'boss',bulletPattern:'aimed',bossAttack:'carrier-deploy',fireIntervalMs:1450},x,y:200,ageMs:age,rotation:0,fireCooldownMs:500,laserCooldownMs:2700,charging:false};
 drawShipDetails(renderer,enemy,{x:240,y:800},true);drawShipDetails(renderer,enemy,{x:240,y:800},false);return commands;};
 const a=capture(100,240),b=capture(500,240);assert.notDeepEqual(a,b,'thrust animates');assert.equal(a.length,b.length,'no accumulating draw objects');
 const c=capture(100,260);assert.equal(c[0][2]-a[0][2],20,'exhaust follows hull movement');
});

test('each hull uses its own attachment and bounded deterministic motion',async()=>{
 const {ENEMY_DEFINITIONS,CARRIER_DEPLOY_INTERVAL_MS}=await import('../sky-strike/rules.ts');
 const ids=['dreadnought','ion-seraph','void-mantis','star-carrier','helios-prism','ore-reaper','crimson-lance','violet-fortress','prism-lancer','fission-elite'];
 const used=new Set();
 for(const id of ids){
  const capture=(age,offset=0)=>{const calls=[],r=new Proxy({},{get:(_,kind)=>(...args)=>calls.push([kind,...args])});
   drawShipDetails(r,{definition:ENEMY_DEFINITIONS.find(d=>d.id===id),x:240+offset,y:300,rotation:.2,ageMs:age,lastShotAgeMs:0,laserCooldownMs:CARRIER_DEPLOY_INTERVAL_MS-age,charging:false},{x:120+offset,y:680},false);return calls;};
  const a=capture(0),b=capture(420),c=capture(420,20),sprites=b.filter(v=>v[0]==='sprite');
  assert.ok(sprites.length>0,id);assert.deepEqual(b,capture(420));assert.notDeepEqual(a,b,id+' moves');assert.equal(a.length,b.length);
  for(const call of sprites){assert.ok(SHIP_DETAIL_ASSETS.includes(call[1]),id);assert.ok(!used.has(call[1]),'other hull cannot reuse '+call[1]);}
  for(const call of sprites)used.add(call[1]);
  for(let i=0;i<b.length;i++){const xi=b[i][0]==='sprite'?2:1;assert.ok(Math.abs(c[i][xi]-b[i][xi]-20)<1e-8,'attached to translated hull');}
 }
 assert.equal(SHIP_DETAIL_ASSETS.length,15);
});

test('serpent vertebra follows its predecessor while its gun tracks independently',async()=>{
 const {requiredEnemyDefinition}=await import('../sky-strike/rules.ts');
 const capture=(previous,target)=>{const calls=[],r=new Proxy({},{get:(_,kind)=>(...args)=>calls.push([kind,...args])});
 drawSerpentSegment(r,{definition:requiredEnemyDefinition('iron-serpent-turret'),x:240,y:300,rotation:0,ageMs:420,segmentOrder:2,hitPoints:100},previous,target);return calls;};
 const a=capture({x:240,y:250},{x:100,y:600}),b=capture({x:290,y:300},{x:100,y:600}),c=capture({x:240,y:250},{x:400,y:600});
 const part=(calls,id)=>calls.find(v=>v[1]===`assets/part-serpent-${id}.png`);
 assert.notEqual(part(a,'body')[6],part(b,'body')[6]);assert.equal(part(a,'gun')[6],part(b,'gun')[6]);
 assert.equal(part(a,'body')[6],part(c,'body')[6]);assert.notEqual(part(a,'gun')[6],part(c,'gun')[6]);
});

test('quantum battleship retains engine thrust without a decorative central rotor',()=>{
 const calls=[];const renderer=new Proxy({}, {get:(_,kind)=>(...args)=>calls.push([kind,...args])});
 const e={definition:{id:'quantum-dreadnought',size:268,tier:'boss',bulletPattern:'aimed',bossAttack:'quantum-broadside'},x:240,y:160,ageMs:1000,rotation:.1,charging:false};
 drawShipDetails(renderer,e,{x:240,y:800},true);drawShipDetails(renderer,e,{x:240,y:800},false);
 assert.equal(calls.filter(c=>c[1]==='assets/fx-flame.png').length,2);
 assert.ok(!calls.some(c=>c[1]==='assets/fx-rotor.png'||c[1]==='assets/fx-turret.png'));
});
