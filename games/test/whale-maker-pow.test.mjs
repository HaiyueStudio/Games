import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,demo,step,EMPTY_INPUT,validate,respawn}=await import('../whale-maker/rules/model.ts');
const {makeItem,makeEnemy}=await import('../whale-maker/rules/expansion.ts');
const {placeStone}=await import('../whale-maker/rules/adventure.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function level(){const l=demo();l.cells.fill('.');l.properties={};l.contents={};l.spawn=[2,14.2];for(let y=15;y<l.height;y++)for(let x=0;x<l.width;x++)l.cells[y*l.width+x]='#';l.cells[14*l.width+200]='E';return l;}
function flat(){const s=create(level());tick(s);return s;}
const pow=(s,x=10,y=14)=>{const item=makeItem('pow',x,y);item.cooldown=0;s.items.push(item);return item;};
const enemy=(s,x,y=14.2)=>{const e=makeEnemy('duck',x-.1,y-.2);e.vx=0;s.enemies.push(e);return e;};

test('POW is one full tile: walking, ordinary landing and head contact do not activate it',()=>{
 const s=flat(),item=pow(s);assert.deepEqual([item.x,item.y,item.w,item.h],[10,14,1,1]);
 s.player.x=8;tick(s,{axis:1},120);assert.ok(s.player.x+s.player.w<=10.00001);assert.ok(item.alive);
 Object.assign(s.player,{x:10.15,y:10,vy:0,vx:0});s.grounded=false;tick(s,{},120);assert.ok(s.grounded);assert.ok(Math.abs(s.player.y+s.player.h-14)<.001);assert.ok(item.alive);assert.equal(s.shake,0);
 Object.assign(item,{y:10});Object.assign(s.player,{x:10.15,y:11.02,vy:-8});s.grounded=false;tick(s);assert.ok(item.alive);assert.ok(s.player.y>=11-.01);
});
test('a downward somersault attack detonates POW once and bounces the player',()=>{
 const s=flat(),item=pow(s),target=enemy(s,15);s.player.x=10.15;s.player.y=11;s.grounded=false;s.pound='fall';s.poundAge=.3;
 tick(s,{down:true},30);assert.equal(item.alive,false);assert.equal(target.alive,false);assert.ok(s.shake>0);assert.equal(s.phase,'playing');assert.equal(s.pound,'none');
});
test('a stationary POW blocks walking enemies without detonating',()=>{
 const s=flat(),item=pow(s),e=enemy(s,8);e.vx=1.5;tick(s,{},100);assert.ok(item.alive);assert.ok(e.x+e.w<=item.x+.001);assert.ok(e.vx<0);
});
test('thrown POW directly defeats the first airborne enemy plus visible grounded enemies only',()=>{
 const s=flat(),item=pow(s,7,11);item.thrown=true;item.vx=12;item.vy=-1;
 const farther=enemy(s,9.6,11),first=enemy(s,8.7,11),ground=enemy(s,14),offscreen=enemy(s,80),air=enemy(s,20,8);
 tick(s,{},18);assert.equal(item.alive,false);assert.equal(first.alive,false);assert.ok(farther.alive);assert.equal(ground.alive,false);assert.ok(offscreen.alive);assert.ok(air.alive);assert.ok(s.shake>0);
});
test('the small player carries and releases a full POW above the floor, in front of the body',()=>{
 const s=flat(),item=pow(s,3);s.player.x=2.5;tick(s,{grab:true},2);assert.equal(s.held,item);assert.ok(item.y+item.h<15);
 tick(s,{grab:true,fire:true});assert.equal(s.held,null);assert.ok(item.alive);assert.ok(item.thrown);assert.ok(item.x>=s.player.x+s.player.w);assert.ok(item.y+item.h<15);
});
test('a throw which meets no enemy still detonates when it reaches the floor',()=>{
 const s=flat(),item=pow(s,7,11);item.thrown=true;item.vx=12;item.vy=-3;tick(s,{},100);assert.equal(item.alive,false);assert.equal(s.items.length,0);tick(s,{},100);assert.equal(s.shake,0);assert.equal(s.powFlash,0);
});
test('POW impact destroys a charging stone and retry restores both objects',()=>{
 for(const direction of ['down','left','right']){
  const l=level();placeStone(l,10,8);l.properties[8*l.width+10]={direction};
  const px=direction==='left'?7:direction==='right'?14:10,py=direction==='down'?14:9;l.cells[py*l.width+px]='pow';
  const s=create(l);s.player.x=direction==='left'?4:direction==='right'?18:12;s.player.y=direction==='down'?14.2:9.2;
  // A lateral launch uses the same impact rule while the player is safely away.
  const stone=s.stones[0];stone.phase='charge';stone.vx=direction==='left'?-18:direction==='right'?18:0;stone.vy=direction==='down'?18:0;
  tick(s,{},60);assert.equal(s.stones.length,0,direction);assert.equal(s.items.filter(i=>i.kind==='pow').length,0);respawn(s);assert.equal(s.stones.length,1);assert.equal(s.items.filter(i=>i.kind==='pow').length,1);
 }
});
test('far background selection survives validation, serialization and retry; invalid names reject',()=>{
 for(const backdrop of ['coast','castle','mountains','plains']){const l=level();l.backdrop=backdrop;const s=create(validate(JSON.parse(JSON.stringify(l))));respawn(s);assert.equal(s.level.backdrop,backdrop);}
 assert.throws(()=>validate({...level(),backdrop:'bad'}),/远景/);
});
test('packed runtime removes unused art, reduces image bytes and keeps stone samples square',()=>{
 const root=new URL('../whale-maker/assets/runtime/',import.meta.url),frames=JSON.parse(readFileSync(new URL('frames.json',root),'utf8')),packing=JSON.parse(readFileSync(new URL('packing.json',root),'utf8'));
 assert.ok(packing.totals.runtimeBytes<packing.totals.sourceBytes*.25);assert.deepEqual(packing.coins.used,[8]);assert.ok(packing.expansion.removed.includes(10));assert.equal(frames.tokens.length,12);assert.equal(frames.backdrops.length,3);
 const [w,h]=packing.adventure.size;for(const i of [3,4,5])assert.ok(Math.abs(frames.adventure[i][2]*w-frames.adventure[i][3]*h)<.001);
 for(const [name,entry]of Object.entries(packing)){if(name==='totals')continue;for(const index of entry.used){const [u,v,w,h]=frames[name][index];assert.ok(u>=0&&v>=0&&w>0&&h>0&&u+w<=1&&v+h<=1,name);}}
});
