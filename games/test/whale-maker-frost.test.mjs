import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,EMPTY_INPUT,validate,respawn,tile}=await import('../whale-maker/rules/model.ts');
const {makeEnemy}=await import('../whale-maker/rules/expansion.ts');
const {freezeEnemy}=await import('../whale-maker/rules/frost.ts');
const {grantPower}=await import('../whale-maker/rules/power.ts');
const {placeBoss}=await import('../whale-maker/rules/fortress.ts');
const {categoryOf}=await import('../whale-maker/editor/catalog.ts');
const {playerArt}=await import('../whale-maker/rendering/player.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function level(){const width=100,height=24,cells=Array(width*height).fill('.');for(let y=15;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[14*width+95]='E';return {version:1,name:'寒冰火焰',width,height,cells,spawn:[2,14.2],properties:{},contents:{}};}
const flat=()=>{const s=create(level());tick(s);return s;};
const target=(s,kind,x=8,y=14)=>{const e=makeEnemy(kind,x,y);s.enemies.push(e);return e;};
const shot=(s,e,kind)=>{s.shots.push({x:e.x+.15,y:e.y+.15,w:.28,h:.28,vx:0,vy:0,kind});tick(s);};

test('placed fire and ice flowers fall, settle permanently, and reset on death',()=>{
 for(const marker of ['F','ice-flower']){
  const l=level();l.cells[7*l.width+8]=marker;const s=create(l),r=s.rewards[0];assert.equal(tile(s.level,8,7),'.');assert.equal(r.kind,marker==='F'?'fire':'ice-flower');
  tick(s,{},25);assert.ok(r.y>7.5);tick(s,{},180);assert.ok(Math.abs(r.y+r.h-15)<.001);r.age=100;tick(s);assert.ok(s.rewards.includes(r));respawn(s);assert.equal(s.rewards[0].y,7.1);
 }
});
test('ice flower grants ice shots and damage downgrades to tall',()=>{
 const l=level();l.cells[14*l.width+2]='ice-flower';const s=create(l);tick(s,{},5);assert.equal(s.power,4);assert.deepEqual([s.player.w,s.player.h],[.9,2]);tick(s,{fire:true},10);assert.ok(s.shots.some(b=>b.kind==='ice'));
 const e=target(s,'duck',2);e.x=s.player.x;e.y=s.player.y;e.vx=0;s.invincible=0;tick(s);assert.equal(s.power,1);assert.equal(s.phase,'playing');
});
test('ordinary enemies freeze with stopped AI and frozen bodies block walking',()=>{
 for(const kind of ['duck','turtle','spiky','iron-turtle','ghost','fish','squid','plant','cannonball']){
  const s=flat(),e=target(s,kind);shot(s,e,'ice');assert.ok(e.alive&&e.frozen,kind);const x=e.x;tick(s,{},100);assert.equal(e.x,x,kind);assert.equal(e.vx,0);
 }
 const s=flat(),e=target(s,'duck');freezeEnemy(s,e);s.player.x=6;tick(s,{axis:1},150);assert.ok(s.player.x+s.player.w<=e.x+.001);assert.equal(s.phase,'playing');
});
test('frozen enemies can be picked up, put down, and thrown with fire without a simultaneous shot',()=>{
 const s=flat(),e=target(s,'duck',4);freezeEnemy(s,e);e.cooldown=0;s.player.x=3.3;tick(s,{grab:true});assert.equal(s.held,e);
 tick(s);assert.equal(s.held,null);assert.equal(e.frozen.thrown,false);assert.equal(e.vx,0);
 e.cooldown=0;tick(s,{grab:true});assert.equal(s.held,e);grantPower(s,4);tick(s,{grab:true,fire:true});assert.equal(s.held,null);assert.equal(e.frozen.thrown,true);assert.equal(e.vx,12);assert.equal(s.shots.length,0);
});
test('thrown ice breaks on walls, breaks ordinary bricks, and defeats ordinary enemies along its path',()=>{
 for(const wall of ['#','B']){const s=flat(),e=target(s,'duck',5);freezeEnemy(s,e);e.frozen.thrown=true;e.vx=12;s.level.cells[14*s.level.width+8]=wall;tick(s,{},70);assert.equal(e.alive,false);assert.equal(tile(s.level,8,14),wall==='#'?'#':'.');}
 const s=flat(),e=target(s,'duck',5),a=target(s,'duck',8),b=target(s,'turtle',11);freezeEnemy(s,e);e.frozen.thrown=true;e.vx=12;tick(s,{},75);assert.equal(a.alive,false);assert.equal(b.alive,false);assert.equal(e.alive,true);
});
test('ice projectiles damage bosses but never freeze them',()=>{
 const l=level();placeBoss(l,10,13);const s=create(l),b=s.bosses[0];s.shots.push({x:10.5,y:13.5,w:.28,h:.28,vx:0,vy:0,kind:'ice'});tick(s);assert.equal(b.health,4);assert.equal(b.frozen,undefined);assert.equal(freezeEnemy(s,b),false);
});
test('jumping fire starts falling from its apex, waits three seconds, ignores fire and dies to ice',()=>{
 const s=flat(),e=target(s,'fire-jumper',12,8);s.view={x:0,y:4,w:25.6,h:12};const start=e.y;tick(s);assert.equal(e.flamePhase,'flight');assert.ok(e.vy>0&&e.y>start);
 for(let n=0;n<400&&e.flamePhase!=='wait';n++)tick(s);assert.equal(e.flamePhase,'wait');assert.equal(e.flameWait,3);assert.ok(e.y>16);
 tick(s,{},359);assert.equal(e.flamePhase,'wait');tick(s);assert.equal(e.flamePhase,'flight');for(let n=0;n<80&&e.y>13;n++)tick(s);assert.ok(e.vy<0);shot(s,e,'fire');assert.equal(e.alive,true);shot(s,e,'ice');assert.equal(e.alive,false);assert.equal(e.frozen,undefined);
});
test('jump height and wait period serialize and reset, editor categories expose new tools',()=>{
 const l=level();l.cells[14*l.width+12]='fire-jumper';l.properties[14*l.width+12]={jumpHeight:7.5,period:1.25};assert.deepEqual(validate(JSON.parse(JSON.stringify(l))),l);const s=create(l);assert.equal(s.enemies[0].jumpHeight,7.5);assert.equal(s.enemies[0].period,1.25);respawn(s);assert.equal(s.enemies[0].period,1.25);
 assert.equal(categoryOf('lava'),categoryOf('water'));assert.equal(categoryOf('fire-jumper'),0);assert.equal(categoryOf('ice-flower'),2);l.properties[14*l.width+12].jumpHeight=0;assert.throws(()=>validate(l));l.properties[14*l.width+12]={period:0};assert.throws(()=>validate(l));
});
test('all power forms use new widths while preserving feet and centres through crouching and damage',()=>{
 const s=flat();assert.equal(s.player.w,.9);const feet=s.player.y+s.player.h,center=s.player.x+s.player.w/2;
 for(const p of [1,2,4,3,0]){grantPower(s,p);assert.equal(s.player.w,p===3?1.9:.9);assert.ok(Math.abs(s.player.x+s.player.w/2-center)<1e-8);assert.equal(s.player.y+s.player.h,feet);tick(s,{down:true});assert.equal(s.player.w,p===3?1.9:.9);tick(s);}
});
test('forms retain matching action maps and use the compact design for the giant',()=>{
 const s=flat();for(const [p,atlas]of [[0,'whale-small'],[1,'whale-tall'],[2,'whale-fire'],[4,'whale-ice'],[3,'whale-small']]){grantPower(s,p);s.grounded=true;s.cheerAge=10;s.eatAge=10;assert.equal(playerArt(s).atlas,atlas);assert.equal(playerArt(s).size,p?96:48);s.crouchAge=.12;assert.equal(playerArt(s).frame,8);s.crouchAge=0;s.spinning=true;s.spinAge=.13;assert.equal(playerArt(s).frame,11);s.spinning=false;}
});

test('small wall grip uses a complete full-width figure with full height and transparent padding',()=>{
 const base=new URL('../whale-maker/assets/',import.meta.url),source=JSON.parse(readFileSync(new URL('frames.json',base),'utf8')),png=readFileSync(new URL('whale-small.png',base)),w=png.readUInt32BE(16),h=png.readUInt32BE(20),uv=source['whale-small'][23];assert.ok(uv[2]*w>source['whale-small'][0][2]*w*.75);assert.ok(uv[3]*h>=source['whale-small'][0][3]*h*.95);
 const packed=JSON.parse(readFileSync(new URL('runtime/frames.json',base),'utf8'))['whale-small'];assert.ok(packed[23][2]>=packed[0][2]);assert.ok(packed[23][3]>packed[0][3]);
 for(const wall of [-1,1]){const s=flat();s.grounded=false;s.wall=wall;s.player.vy=4;s.facing=wall;const art=playerArt(s);assert.equal(art.frame,23);assert.equal(art.flip,wall>0);assert.equal(art.reference,0);}
});
test('retry restores ice flowers and enemies and clears ice form, projectiles, frozen bodies and held references',()=>{
 const l=level();l.cells[14*l.width+8]='T';l.cells[8*l.width+5]='ice-flower';const s=create(l),e=s.enemies[0];freezeEnemy(s,e);e.held=true;s.held=e;grantPower(s,4);s.shots.push({x:10,y:10,w:.28,h:.28,vx:11,vy:0,kind:'ice'});s.rewards=[];respawn(s);assert.equal(s.held,null);assert.equal(s.power,0);assert.equal(s.shots.length,0);assert.equal(s.enemies[0].kind,'turtle');assert.equal(s.enemies[0].frozen,undefined);assert.equal(s.rewards[0].kind,'ice-flower');assert.equal(s.effects.length,0);assert.deepEqual(s.startLevel,l);
});
