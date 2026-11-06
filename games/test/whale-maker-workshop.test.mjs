import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,EMPTY_INPUT,validate,respawn,tile}=await import('../whale-maker/rules/model.ts');
const {makeEnemy,makeItem}=await import('../whale-maker/rules/expansion.ts');
const {armBomb,bombContact}=await import('../whale-maker/rules/workshop.ts');
const {freezeEnemy}=await import('../whale-maker/rules/frost.ts');
const {editSnakeEnd,validSnakePath}=await import('../whale-maker/rules/snake-path.ts');
const {objectCells,moveSelection,stampSelection,pasteStamp}=await import('../whale-maker/editor/selection.ts');
const {placeBoss}=await import('../whale-maker/rules/fortress.ts');
const {categoryOf}=await import('../whale-maker/editor/catalog.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function level(surface='#'){const width=100,height=24,cells=Array(width*height).fill('.');for(let y=20;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]=y===20?surface:'#';cells[19*width+95]='E';return {version:1,name:'机关规则',width,height,cells,spawn:[2,19.2],properties:{},contents:{}};}
const flat=(surface)=>{const s=create(level(surface));s.invincible=100;tick(s);return s;};
const enemy=(s,kind,x=8,y=19)=>{const e=makeEnemy(kind,x,y);s.enemies.push(e);return e;};

test('speed belts increase walking and enemy speed without compounding AI velocity',()=>{
 const a=flat(),b=flat('speed-belt');tick(a,{axis:1},240);tick(b,{axis:1},240);assert.equal(b.player.vx,11);assert.ok(b.player.x-2>(a.player.x-2)*1.8);
 const a2=flat(),b2=flat('speed-belt'),ea=enemy(a2,'duck',20),eb=enemy(b2,'duck',20);tick(a2,{},120);tick(b2,{},120);assert.ok(Math.abs((20.1-eb.x)/(20.1-ea.x)-2)<.01);assert.equal(eb.vx,-1.5);
});
test('slippery ice doubles acceleration time, quadruples stopping distance and can be disabled',()=>{
 const measure=(ice,off=false)=>{const s=flat(ice?'ice':'#');if(off)for(let x=0;x<100;x++)s.level.properties[20*100+x]={slippery:false};let frames=0;while(s.player.vx<5.5&&frames<150){tick(s,{axis:1});frames++;}const start=s.player.x;for(let n=0;n<350&&s.player.vx>0;n++)tick(s);return {frames,stop:s.player.x-start};};
 const a=measure(false),b=measure(true),c=measure(true,true);assert.ok(Math.abs(b.frames-a.frames*2)<=1);assert.ok(Math.abs(b.stop-4*a.stop)<5.5/120,'distance quadruples within one fixed physics step');assert.deepEqual(a,c);
});
test('snake bricks move one tile per second around bends, reverse, carry riders once, and remain solid',()=>{
 const l=level();l.cells[16*100+10]='snake-block';l.properties[1610]={length:4,path:[[0,0],[6,0],[6,-3],[10,-3]]};const s=create(l),r=s.snakes[0];s.invincible=100;Object.assign(s.player,{x:10.05,y:15.2});tick(s,{},120);assert.ok(Math.abs(r.travel-1)<1e-8);assert.ok(Math.abs(s.player.x-11.05)<.02);assert.ok(Math.abs(s.player.y+s.player.h-16)<.02);
 s.player.x=2;s.player.y=19.2;tick(s,{},720);assert.ok(r.blocks.some(b=>b.y<16));assert.equal(r.blocks.length,4);tick(s,{},1500);assert.ok(r.travel>=0&&r.travel<=r.length-3);assert.ok(r.blocks.every(b=>Number.isFinite(b.x+b.y)));
 const s2=create(l);s2.player.x=9.1;s2.player.y=16.2;s2.player.vx=0;tick(s2,{axis:1},20);assert.ok(s2.player.x+s2.player.w<=s2.snakes[0].blocks[0].x+.02);
});
test('wide riders on two snake segments are carried once and retries restore the route',()=>{
 const l=level();l.cells[16*100+10]='snake-block';l.properties[1610]={length:4,path:[[0,0],[8,0]]};const s=create(l);s.power=3;Object.assign(s.player,{x:10.1,y:14,w:1.9,h:2});tick(s,{},120);assert.ok(Math.abs(s.player.x-11.1)<.03);respawn(s);assert.equal(s.snakes[0].travel,0);assert.equal(s.hammers.length,0);
});
test('snake paths edit, serialize and copy as one object; invalid moves are atomic',()=>{
 const l=level();l.cells[14*100+10]='snake-block';l.properties[1410]={length:4,path:[[0,0],[5,0]]};assert.equal(editSnakeEnd(l,1410,0,-1),true);assert.equal(editSnakeEnd(l,1410,0,-1),true);assert.equal(editSnakeEnd(l,1410,1,0),true);assert.deepEqual(validate(JSON.parse(JSON.stringify(l))),l);assert.deepEqual(objectCells(l,12,14),[1410]);const ids=new Set([1410]),stamp=stampSelection(l,ids);assert.ok(pasteStamp(l,stamp,30,14));const before=structuredClone(l);assert.equal(moveSelection(l,ids,87,0),null);assert.deepEqual(l,before);assert.equal(validSnakePath(l,1410,[[0,0],[2,2]]),false);assert.equal(validSnakePath(l,1410,[[0,0],[2,0],[0,0]]),false);
});
test('an unconfigured snake at the right map edge gets a finite in-bounds route',()=>{
 const l=level();l.cells[14*100+99]='snake-block';assert.deepEqual(validate(l),l);const s=create(l);tick(s,{},240);assert.equal(s.snakes[0].blocks.length,4);assert.ok(s.snakes[0].blocks.every(b=>Number.isFinite(b.x+b.y)&&b.x>=0&&b.x+1<=100));
});
test('wood crates block players and enemies, support standing, can be carried and thrown',()=>{
 const s=flat(),box=makeItem('wood-crate',8,19);box.cooldown=0;s.items=[box];s.player.x=6;tick(s,{axis:1},100);assert.ok(s.player.x+s.player.w<=box.x+.001);assert.equal(box.w,1);assert.equal(box.h,1);
 tick(s,{grab:true});assert.equal(s.held,box);tick(s,{grab:true,fire:true});assert.equal(s.held,null);assert.equal(box.thrown,true);assert.equal(box.vx,12);
 const a=flat(),b=makeItem('wood-crate',8,19);a.items=[b];Object.assign(a.player,{x:8,y:18.2});tick(a,{},20);assert.ok(Math.abs(a.player.y+a.player.h-b.y)<.001);const e=enemy(a,'duck',6);e.vx=1.5;a.player.x=2;tick(a,{},160);assert.ok(e.x+e.w<=b.x+.01);assert.ok(e.vx<0);
});
test('wood crates float at the surface and rise from underwater, supporting the player',()=>{
 for(const y of [10,17]){const l=level();for(let row=14;row<20;row++)for(let x=8;x<15;x++)l.cells[row*100+x]='water';const s=create(l),b=makeItem('wood-crate',10,y);s.items=[b];tick(s,{},1200);assert.ok(Math.abs(b.y+b.h-14.22)<.04,JSON.stringify(b));Object.assign(s.player,{x:b.x+.05,y:b.y-.8,vy:0});tick(s,{},120);assert.ok(Math.abs(s.player.y+s.player.h-b.y)<.03);assert.ok(s.grounded);}
});
test('ground pounds shatter wood crates but ordinary jumps and standing do not',()=>{
 const s=flat(),b=makeItem('wood-crate',8,19);s.items=[b];Object.assign(s.player,{x:8,y:18.05,vy:10});s.grounded=false;s.pound='fall';s.poundAge=1;tick(s,{},2);assert.equal(b.alive,false);assert.ok(s.effects.some(f=>f.kind==='wood'));assert.ok(s.player.vy<0);
});
test('stomping a bomb arms five seconds and carrying cannot pause its fuse',()=>{
 const s=flat(),e=enemy(s,'bomb');Object.assign(s.player,{x:8.1,y:18.38,vy:6});s.grounded=false;tick(s,{},3);assert.ok(e.bombFuse>4.95&&e.bombFuse<=5);assert.ok(e.alive);assert.ok(s.player.vy<0);
 e.cooldown=0;s.player.x=e.x-.88;s.player.y=e.y;tick(s,{grab:true});assert.equal(s.held,e);const fuse=e.bombFuse;tick(s,{grab:true},Math.ceil(fuse*120));assert.equal(e.alive,false);assert.equal(s.held,null);assert.ok(s.effects.some(f=>f.kind==='blast'));
});
test('bomb explosion covers exactly three by three cells, destroys ordinary brick/crate/enemies and leaves bosses',()=>{
 const l=level();placeBoss(l,8,16);l.cells[19*100+7]='B';l.cells[19*100+10]='B';const s=create(l),e=enemy(s,'bomb',8),inside=enemy(s,'duck',9),outside=enemy(s,'duck',10);s.items=[makeItem('wood-crate',9,18)];e.bombFuse=.001;tick(s);assert.equal(tile(s.level,7,19),'.');assert.equal(tile(s.level,10,19),'B');assert.equal(inside.alive,false);assert.equal(outside.alive,true);assert.equal(s.items.length,0);assert.equal(s.bosses[0].health,5);assert.equal(e.alive,false);
});
test('a second bomb stomp launches half a tile high and four tiles horizontally, killing enemies in flight',()=>{
 for(const victim of [false,true]){const s=flat(),e=enemy(s,'bomb',8);armBomb(s,e);e.cooldown=0;Object.assign(s.player,{x:e.x-.2,y:e.y-.79,vy:6});bombContact(s,e,EMPTY_INPUT,e.y-.01,{hurt(){}});assert.ok(Math.abs(e.vx-4/(2*(Math.sqrt(26)+Math.sqrt(13))/26))<1e-8);assert.equal(e.vy,-Math.sqrt(26));const start={x:e.x,y:e.y};s.player.x=2;s.player.y=19.2;const other=victim?enemy(s,'duck',10):null;let peak=e.y;for(let n=0;n<100;n++){tick(s);peak=Math.min(peak,e.y);}assert.ok(Math.abs(start.y-peak-.5)<.04);assert.ok(Math.abs(e.x-start.x-4)<.12,e.x-start.x);if(other)assert.equal(other.alive,false);assert.ok(e.alive);}
});
test('armed bombs throw with fire, kill along the throw, and can be frozen without advancing the fuse',()=>{
 const s=flat(),e=enemy(s,'bomb',3);armBomb(s,e);e.held=true;s.held=e;const other=enemy(s,'duck',10);tick(s,{grab:true,fire:true});assert.equal(s.held,null);assert.ok(e.bombThrown);tick(s,{},100);assert.equal(other.alive,false);assert.ok(e.alive);freezeEnemy(s,e);const time=e.bombFuse;tick(s,{},120);assert.equal(e.bombFuse,time);
});
test('hammer otters jump five tiles through brick undersides, land on top, and can later jump down',()=>{
 const l=level();for(let x=4;x<14;x++)l.cells[16*100+x]='B';const s=create(l),e=enemy(s,'hammer-otter',8);s.invincible=100;tick(s);e.hammerJumpWait=0;let peak=e.y,start=e.y;for(let n=0;n<240;n++){tick(s);peak=Math.min(peak,e.y);if(n>30&&e.grounded)break;}assert.ok(Math.abs(start-peak-5)<.09,start-peak);assert.ok(Math.abs(e.y+e.h-16)<.02);e.hammerJumpWait=0;tick(s,{},270);assert.ok(Math.abs(e.y+e.h-20)<.02,JSON.stringify(e));
});
test('hammer projectiles use sixty degree initial velocity, gravity, rotation and bounded lifetime',()=>{
 const s=flat(),e=enemy(s,'hammer-otter',8);e.hammerWait=0;tick(s);assert.equal(s.hammers.length,1);const h=s.hammers[0];assert.ok(Math.abs(Math.atan2(-h.vy,Math.abs(h.vx))*180/Math.PI-60)<1e-8);const oldY=h.y;tick(s,{},20);assert.ok(h.y<oldY);assert.notEqual(h.angle,0);tick(s,{},600);assert.ok(s.hammers.length<=16);assert.ok(!s.hammers.includes(h));
});
test('new elements keep editor categories, content validation and complete retry reconstruction',()=>{
 const l=level();l.cells[19*100+8]='bomb';l.cells[19*100+12]='wood-crate';l.cells[20*100+16]='ice';l.properties[2016]={slippery:false};l.cells[16*100+20]='?';l.contents[1620]='hammer-otter';assert.deepEqual(validate(l),l);const s=create(l);armBomb(s,s.enemies[0]);s.hammers.push({x:1,y:1,w:.3,h:.3,vx:5,vy:-8,age:0,angle:0});s.items[0].alive=false;respawn(s);assert.equal(s.enemies[0].bombFuse,undefined);assert.ok(s.items[0].alive);assert.equal(s.hammers.length,0);assert.equal(s.level.properties[2016].slippery,false);assert.equal(categoryOf('bomb'),0);assert.equal(categoryOf('hammer-otter'),0);assert.equal(categoryOf('wood-crate'),2);assert.equal(categoryOf('snake-block'),1);assert.equal(categoryOf('speed-belt'),1);
});
