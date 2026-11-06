import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,EMPTY_INPUT,tile,validate,respawn,FIREBALL_SPEED}=await import('../whale-maker/rules/model.ts');
const {makeItem,makeEnemy,updateSpecialEnemy}=await import('../whale-maker/rules/expansion.ts');
const {grantPower}=await import('../whale-maker/rules/power.ts');
const {placeStone}=await import('../whale-maker/rules/adventure.ts');
const {categoryOf,categoryTools}=await import('../whale-maker/editor/catalog.ts');
const {TOOLS}=await import('../whale-maker/rules/model.ts');
const {drawGoal}=await import('../whale-maker/rendering/goal.ts');
const {objectCells,moveSelection,stampSelection,pasteStamp}=await import('../whale-maker/editor/selection.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function level(){const width=100,height=24,cells=Array(width*height).fill('.');for(let y=15;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[14*width+95]='E';return {version:1,name:'珍珠海岸',width,height,cells,spawn:[2,14.2],properties:{},contents:{}};}
const flat=()=>{const s=create(level());tick(s);return s;};

test('growth preserves feet, tall is .9 by 2, giant is 1.9 by 2, and damage has two downgrade stages',()=>{
 const s=flat(),feet=s.player.y+s.player.h,center=s.player.x+s.player.w/2;
 grantPower(s,1);assert.deepEqual([s.player.w,s.player.h],[.9,2]);assert.equal(s.player.y+s.player.h,feet);assert.equal(s.player.x+s.player.w/2,center);
 for(const power of [2,3]){
  grantPower(s,power);assert.deepEqual([s.player.w,s.player.h],[power===3?1.9:.9,2]);
  const enemy=makeEnemy('duck',s.player.x,14);enemy.x=s.player.x;enemy.vx=0;s.enemies=[enemy];s.invincible=0;tick(s);assert.equal(s.power,1);assert.equal(s.phase,'playing');assert.deepEqual([s.player.w,s.player.h],[.9,2]);
  s.invincible=0;enemy.x=s.player.x;enemy.y=14.2;tick(s);assert.equal(s.power,0);assert.equal(s.player.h,.8);
 }
});

test('giant pearl can be placed or emitted by a block, collected, and restored by retry',()=>{
 const l=level();l.cells[14*l.width+8]='giant-pearl';l.cells[12*l.width+5]='?';l.contents[12*l.width+5]='giant-pearl';assert.deepEqual(validate(l),l);
 const s=create(l),item=s.items[0];assert.deepEqual([item.w,item.h],[2,2]);item.cooldown=0;s.player.x=8.5;tick(s);assert.equal(s.power,3);assert.equal(s.items.length,0);
 respawn(s);assert.equal(s.power,0);assert.equal(s.items[0].kind,'giant-pearl');assert.equal(s.level.contents[12*l.width+5],'giant-pearl');
 const b=create(l);Object.assign(b.player,{x:5.15,y:13.05,vy:-8});tick(b,{},55);assert.ok(b.items.some(i=>i.kind==='giant-pearl'));assert.equal(b.level.cells[12*l.width+5],'U');
});

test('the visible two by two pearl selects, moves and copies as a whole editor object',()=>{
 const l=level();l.cells[14*l.width+8]='giant-pearl';const cells=objectCells(l,9,13);assert.equal(cells.length,4);
 const moved=moveSelection(l,new Set(cells),3,-2);assert.equal(l.cells[12*l.width+11],'giant-pearl');assert.equal(moved.size,4);
 const stamp=stampSelection(l,moved);assert.deepEqual([stamp.width,stamp.height],[2,2]);pasteStamp(l,stamp,20,8);assert.equal(l.cells[9*l.width+20],'giant-pearl');assert.deepEqual(validate(l),l);
 l.cells[99]='giant-pearl';assert.throws(()=>validate(l));
});

test('giant falls break exactly one support layer after two tiles and rebound a quarter tile',()=>{
 for(const brick of ['#','B'])for(const drop of [1.9,2,3]){
  const s=flat();grantPower(s,3);Object.assign(s.player,{x:8,y:13-drop,vy:0});s.grounded=false;s.fallPeak=15-drop;
  for(let x=8;x<10;x++)s.level.cells[15*s.level.width+x]=brick;
  let broken=false,contactY=0,top=Infinity;
  for(let n=0;n<150;n++){
   tick(s);if(tile(s.level,8,15)==='.'&&!broken){broken=true;contactY=s.player.y;assert.ok(s.player.vy<0);}
   if(broken){top=Math.min(top,s.player.y);if(s.player.vy>=0)break;}
  }
  assert.equal(broken,drop>=2,`${brick}, fall ${drop}`);
  assert.equal(tile(s.level,8,16),'#');assert.equal(tile(s.level,9,16),'#');
  if(broken)assert.ok(Math.abs(contactY-top-.25)<.02,contactY-top);
 }
});

test('a seated basin can make a full variable-height jump and stays attached until Shift-jump',()=>{
 const s=flat(),basin=makeItem('basin',2,14);basin.held=true;s.riding=basin;s.items=[basin];
 const feet=s.player.y+s.player.h;tick(s,{jump:true});assert.equal(s.riding,basin);assert.ok(s.player.vy< -13);
 let high=s.player.y+s.player.h;for(let n=0;n<75;n++){tick(s,{jump:true});high=Math.min(high,s.player.y+s.player.h);assert.equal(s.riding,basin);assert.ok(Math.abs(basin.y-(s.player.y+s.player.h-.2))<1e-8);}
 assert.ok(feet-high>4);tick(s,{},180);tick(s,{jump:true,grab:true});assert.equal(s.riding,null);assert.equal(basin.held,false);
});

test('squids steer horizontally only during ascent and sink one tile before rising when the player is above',()=>{
 const s=flat();for(let x=0;x<30;x++)for(let y=1;y<15;y++)s.level.cells[y*s.level.width+x]='water';
 s.player.x=12;s.player.y=3;const e=makeEnemy('squid',8,10),svc={move(_s,b,dt){b.x+=b.vx*dt;b.y+=b.vy*dt;return {floor:false,wall:0,slope:0};}};
 const x=e.x;for(let n=0;n<60;n++)updateSpecialEnemy(s,e,1/120,svc);assert.ok(e.x>x);assert.equal(e.squidPhase,'sink');assert.equal(e.vx,0);
 const sinkX=e.x,peak=e.squidPeak;for(let n=0;n<150&&e.squidPhase==='sink';n++){updateSpecialEnemy(s,e,1/120,svc);assert.equal(e.x,sinkX);}
 assert.equal(e.squidPhase,'rise');assert.ok(Math.abs(e.y-peak-1)<.05);
 s.player.x=11;s.player.y=12;for(let n=0;n<3200;n++)updateSpecialEnemy(s,e,1/120,svc);
 assert.ok(Math.abs(e.x+e.w/2-s.player.x-s.player.w/2)<.02);assert.ok(e.y+e.h<s.player.y+.1);
});

test('falling stones use reduced charge speed, quicker upward return and crush enemies below',()=>{
 const l=level();placeStone(l,8,8);const s=create(l);s.player.x=8.5;s.player.y=14.2;tick(s);assert.equal(s.stones[0].vy,14.4);
 const enemy=makeEnemy('duck',8,14);enemy.vx=0;s.enemies=[enemy];s.player.x=2;tick(s,{},70);assert.equal(enemy.alive,false);
 const stone=s.stones[0];stone.phase='return';stone.y=12;stone.vy=0;tick(s);assert.equal(stone.vy,-1.08);
});

test('goal pole matches the original nine tiles by one fifth tile, flag starts at its foot then rises during the slide',()=>{
 const s=flat(),draws=[],scene={dustParticle(){},fill(rect){draws.push({rect});},sprite(atlas,frame,x,y,w,h){draws.push({atlas,frame,rect:{x,y,width:w,height:h}});}};
 drawGoal(scene,s,95,14,100,700,48,0,false);assert.equal(draws[0].rect.height,432);assert.ok(Math.abs(draws[0].rect.width-9.6)<1e-10);
 assert.deepEqual(draws.find(d=>d.atlas==='goal-flags').rect,{x:128.8,y:652,width:48,height:48});
 Object.assign(s.player,{x:95.2,y:5,vy:0});s.grounded=false;tick(s);assert.equal(s.phase,'won');const target=s.victory.flagTarget;assert.ok(target<6);
 tick(s,{},80);assert.ok(s.victory.flagProgress>0&&s.victory.flagProgress<1);tick(s,{},700);assert.equal(s.victory.stage,'done');assert.equal(s.victory.flagProgress,1);assert.equal(s.player.y,14.2);
});

test('touching the side of the goal base does not finish until the player reaches the pole',()=>{
 const s=flat();s.level.cells[14*s.level.width+8]='E';s.player.x=6.5;tick(s,{axis:1},90);
 assert.equal(s.phase,'playing');assert.ok(s.player.x+s.player.w<=8.001);
 tick(s,{axis:1,jump:true},40);assert.equal(s.phase,'won');
});

test('four palette categories include every element exactly once and preserve projectile direction at doubled speed',()=>{
 const all=[0,1,2,3].flatMap(categoryTools);assert.equal(new Set(all).size,TOOLS.length);assert.deepEqual(new Set(all),new Set(TOOLS));assert.equal(categoryOf('giant-pearl'),2);assert.equal(categoryOf('squid'),0);assert.equal(categoryOf('glass-pipe'),1);assert.equal(categoryOf('C'),3);
 for(const facing of [-1,1]){const s=flat();grantPower(s,2);s.facing=facing;tick(s,{fire:true},8);assert.equal(s.shots.length,1);assert.equal(s.shots[0].vx,facing*11);assert.equal(FIREBALL_SPEED,11);}
});
