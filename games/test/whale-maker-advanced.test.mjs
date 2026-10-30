import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&context.parentURL?.includes('/whale-maker/'))return next(specifier+'.ts',context);throw error;}}});
const {create,demo,step,validate,respawn,EMPTY_INPUT,tile,solid}=await import('../whale-maker/rules/model.ts');
const {makeEnemy,makeItem}=await import('../whale-maker/rules/expansion.ts');
const {placeCannon,meltIce,toggleColor,payload}=await import('../whale-maker/rules/advanced.ts');
const {placeStone}=await import('../whale-maker/rules/adventure.ts');
const {placeGlassPipe,glassIntersects,curvedGlassCell}=await import('../whale-maker/rules/glass.ts');
const {objectCells,moveSelection,stampSelection,pasteStamp}=await import('../whale-maker/editor/selection.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function level(){const l=demo();l.cells.fill('.');l.properties={};l.contents={};l.spawn=[2,14.2];for(let y=15;y<l.height;y++)for(let x=0;x<l.width;x++)l.cells[y*l.width+x]='#';l.cells[14*l.width+220]='E';return l;}
const flat=()=>{const s=create(level());tick(s,{},2);return s;};
const put=(l,x,y,t)=>l.cells[y*l.width+x]=t;
const body=(s,p)=>{Object.assign(s.player,p);s.grounded=false;s.coyote=0;};

test('a helmet drops only a fading visual effect and never becomes a recoverable item',()=>{
 const s=flat();s.helmet=true;s.power=1;s.enemies=[{...makeEnemy('duck',2,14),vx:0}];tick(s);assert.equal(s.helmet,false);assert.equal(s.power,0);assert.ok(s.effects.some(e=>e.kind==='helmet'));assert.equal(s.items.some(e=>e.kind==='basin'),false);tick(s,{},90);assert.equal(s.effects.length,0);
});
test('a stationary basin blocks monsters from either side without drifting',()=>{
 for(const direction of [-1,1]){const s=flat(),basin=makeItem('basin',10,14);s.items=[basin];const e=makeEnemy('duck',direction>0?8:12,14);e.vx=direction*1.5;s.enemies=[e];tick(s,{},140);assert.ok(e.vx*direction<0);assert.equal(basin.x,10.1);assert.equal(basin.vx,0);assert.equal(e.alive,true);}
});
test('Shift release gently places every carryable; firing throws it without also firing a fireball',()=>{
 for(const kind of ['spring-v','p-switch','pow','basin','shell'])for(const fire of [false,true]){
  const s=flat(),item=kind==='shell'?makeEnemy('shell',4,14):makeItem(kind,4,14);item.held=true;item.cooldown=0;s.held=item;s.power=2;s.facing=1;if(kind==='shell')s.enemies=[item];else s.items=[item];s.previous.grab=true;tick(s,{grab:fire,fire});assert.equal(s.held,null);assert.equal(item.held,false);assert.equal(s.shots.length,0);if(fire)assert.ok(item.vx>5);else{assert.equal(item.vx,0);assert.ok(item.vy>=0);if('thrown'in item)assert.equal(item.thrown,false);}
 }
});
test('water kicks rise 40 percent of the former distance and have a bounded kick state',()=>{
 const s=flat();for(let x=4;x<15;x++)for(let y=1;y<15;y++)put(s.level,x,y,'water');body(s,{x:6,y:10,vy:0});tick(s,{jump:true});assert.equal(s.swimKickAge,0);let top=s.player.y;for(let n=0;n<150&&s.player.vy<0;n++){tick(s);top=Math.min(top,s.player.y);}const rise=10-top;assert.ok(Math.abs(rise-(6.5**2/10)*.4)<.06,rise);tick(s,{},180);assert.equal(s.swimKickAge,1);
});
test('tall squids jet upward quickly then drift down slowly, while shy ghosts freeze when watched',()=>{
 const s=flat();for(let x=4;x<20;x++)for(let y=2;y<15;y++)put(s.level,x,y,'water');const squid=makeEnemy('squid',10,10);s.enemies=[squid];assert.equal(squid.h,1.5);tick(s,{},12);assert.ok(squid.vy< -4);tick(s,{},60);assert.ok(squid.vy>=0&&squid.vy<=1.05);
 const ghost=makeEnemy('ghost',8,10);s.enemies=[ghost];s.player.x=2;s.facing=1;tick(s,{},60);assert.equal(ghost.shy,true);assert.equal(ghost.x,8.1);s.facing=-1;tick(s,{},60);assert.equal(ghost.shy,false);assert.ok(ghost.x<8.1);assert.ok(ghost.y>10.2);
});
test('cannons preserve height and payload through editing and reject orphan bodies',()=>{
 const l=level();placeCannon(l,10,12,4);l.contents[12*l.width+10]='squid';assert.deepEqual(validate(l),l);assert.equal(objectCells(l,10,9).length,4);const moved=moveSelection(l,new Set(objectCells(l,10,9)),5,1),stamp=stampSelection(l,moved);pasteStamp(l,stamp,20,8);assert.deepEqual(validate(l),l);assert.equal(l.contents[11*l.width+20],'squid');const s=create(l);assert.equal(s.turrets.length,2);assert.ok(s.turrets.every(c=>c.h===4&&c.content==='squid'));const bad=structuredClone(l);bad.cells[9*l.width+20]='.';assert.throws(()=>validate(bad));
});
test('an airborne cannon falls, crushes a grounded enemy and player, and fires a stompable default cannonball',()=>{
 for(const victim of ['enemy','player']){const l=level();placeCannon(l,8,10,2);const s=create(l);if(victim==='enemy')s.enemies=[{...makeEnemy('duck',8,14),vx:0}];else s.player.x=8.1;tick(s,{},100);if(victim==='enemy')assert.equal(s.enemies[0].alive,false);else assert.equal(s.phase,'dead');assert.ok(s.turrets[0].y>=11);}
 const l=level();placeCannon(l,10,14,3);const s=create(l);tick(s,{},121);const shot=s.enemies.find(e=>e.kind==='cannonball');assert.ok(shot);body(s,{x:shot.x,y:shot.y-.79,vy:4});tick(s,{},2);assert.equal(shot.alive,false);assert.equal(s.phase,'playing');
});
test('cannon payload choices really produce coins, gadgets and multiple enemy types',()=>{
 for(const kind of ['coin','growth','spring-v','pow','key','duck','iron-turtle','ghost']){const s=flat();payload(s,kind,8,10,1);assert.equal(s.items.length+s.enemies.length+s.rewards.length,1);const e=s.items[0]??s.enemies[0]??s.rewards[0];assert.equal(e.kind,kind);assert.ok(e.vx>0);}
});
test('red and blue switches change both collision and head-bump response',()=>{
 const s=flat();assert.equal(solid('red-block',0,s.redOn),true);assert.equal(solid('blue-block',0,s.redOn),false);put(s.level,8,12,'toggle-switch');body(s,{x:8.15,y:13.05,vy:-8});tick(s,{},3);assert.equal(s.redOn,false);assert.equal(solid('red-block',0,s.redOn),false);assert.equal(solid('blue-block',0,s.redOn),true);toggleColor(s);assert.equal(s.redOn,true);
});
test('fireballs double horizontal speed while retaining their raised bounce arc, and explode against brick or armored enemies',()=>{
 const s=flat();s.power=2;tick(s,{fire:true},8);const shot=s.shots[0];assert.equal(shot.vx,11);let start=shot.y,top=start;for(let n=0;n<100&&shot.vy<0;n++){tick(s);top=Math.min(top,shot.y);}assert.ok(start-top<.4&&start-top>.1);
 const brick=flat();put(brick.level,8,13,'B');brick.shots=[{x:7.7,y:13.2,w:.28,h:.28,vx:5.5,vy:0}];tick(brick);assert.equal(brick.shots.length,0);assert.ok(brick.effects.some(e=>e.kind==='fire'));assert.equal(tile(brick.level,8,13),'B');
 const armor=flat(),e=makeEnemy('iron-turtle',8,14);e.vx=0;armor.enemies=[e];armor.shots=[{x:8.1,y:14.3,w:.28,h:.28,vx:5.5,vy:0}];tick(armor);assert.equal(e.alive,true);assert.equal(armor.shots.length,0);assert.ok(armor.effects.some(e=>e.kind==='fire'));
});
test('ice freezes coin and enemies until fire melts it, with one bounded disappearance effect',()=>{
 for(const content of ['coin','duck','iron-turtle']){const l=level(),id=13*l.width+8;put(l,8,13,'ice');l.contents[id]=content;assert.deepEqual(validate(l),l);const s=create(l);tick(s,{},120);assert.equal(s.enemies.length,0);assert.equal(tile(s.level,8,13),'ice');s.shots=[{x:7.7,y:13.2,w:.28,h:.28,vx:5.5,vy:0}];tick(s);assert.equal(tile(s.level,8,13),content==='coin'?'o':'.');assert.equal(s.enemies.length,content==='coin'?0:1);assert.equal(s.effects.filter(e=>e.kind==='ice').length,1);meltIce(s,8,13);assert.equal(s.effects.filter(e=>e.kind==='ice').length,1);tick(s,{},90);assert.equal(s.effects.length,0);}
});
test('iron turtles retract on stomps and wake after ten seconds when stationary or held, while moving shells wait',()=>{
 for(const held of [false,true]){const s=flat(),e=makeEnemy('iron-turtle',8,14);e.vx=0;s.enemies=[e];body(s,{x:8,y:13.35,vy:5});tick(s,{},4);assert.equal(e.kind,'shell');assert.equal(e.iron,true);s.player.x=3;if(held){e.held=true;s.held=e;}tick(s,{grab:held},1201);assert.equal(e.kind,'iron-turtle');assert.equal(e.held,false);assert.equal(s.held,null);}
 const s=flat(),e=makeEnemy('shell',12,14);Object.assign(e,{iron:true,shellAge:11,vx:12});s.enemies=[e];tick(s);assert.equal(e.kind,'shell');e.vx=0;tick(s);assert.equal(e.kind,'iron-turtle');
});
test('a basin ride hops low, blocks foot spikes and Shift-jump exits the basin',()=>{
 const s=flat(),basin=makeItem('basin',8,14);s.items=[basin];basin.held=true;s.held=basin;s.player.x=8;tick(s,{grab:true,down:true});assert.equal(s.riding,basin);assert.equal(s.held,null);tick(s,{axis:1},8);assert.ok(s.player.vy<0);assert.equal(s.player.h,.55);assert.ok(s.player.y>14);put(s.level,9,14,'^');tick(s,{axis:1},45);assert.equal(s.phase,'playing');tick(s,{grab:true,jump:true});assert.equal(s.riding,null);assert.equal(basin.held,false);assert.ok(s.player.vy< -10);
 s.riding=basin;basin.held=true;s.door={age:0,from:[s.player.x,s.player.y],to:[20,12],source:0,target:1};tick(s,{},45);assert.ok(Math.abs(basin.x+basin.w/2-s.player.x-s.player.w/2)<1e-8);
 s.door=null;s.pipe={glass:true,age:0,from:[20,12],to:[24,12],path:[[20.325,12.275],[24,12.275]],travel:0,angle:0,flip:false,exitDirection:[1,0]};Object.assign(s.player,{x:20,y:12,h:.55});tick(s,{},60);assert.ok(s.pipe);assert.ok(Math.hypot(basin.x+basin.w/2-s.player.x-s.player.w/2,basin.y+basin.h/2-s.player.y-s.player.h/2)<.36);

});
test('air down performs a somersault before a downward brick hit, and destroys shells',()=>{
 const s=flat();put(s.level,8,12,'B');body(s,{x:8.15,y:10,vy:-2});tick(s,{down:true});assert.equal(s.pound,'flip');assert.equal(s.player.vy,0);tick(s,{down:true},26);assert.equal(s.pound,'fall');tick(s,{down:true},20);assert.ok(s.bumps.some(b=>b.x===8&&b.y===12&&b.down));assert.equal(tile(s.level,8,12),'B');
 const shell=flat(),e=makeEnemy('shell',8,14);Object.assign(e,{h:.5,y:14.5,vx:0,cooldown:.6});shell.enemies=[e];body(shell,{x:8.1,y:12.5,vy:1});tick(shell,{down:true},50);assert.equal(e.alive,false);assert.equal(shell.enemies.some(e=>e.alive&&e.kind==='shell'),false);assert.equal(shell.phase,'playing');
});
function springHeight(jump){const s=flat(),item=makeItem('spring-v',8,14);item.cooldown=0;s.items=[item];body(s,{x:8.1,y:13.45,vy:5});let launched=false,top=Infinity,base=0;for(let n=0;n<400;n++){tick(s,{jump});if(!launched&&s.springWindow>0){launched=true;base=s.player.y;}if(launched){top=Math.min(top,s.player.y);if(s.player.vy>=0)return base-top;}}throw Error('no spring launch');}
test('spring launch loses two tiles; a held jump adds the full normal jump height',()=>{
 const base=springHeight(false),boost=springHeight(true);assert.ok(Math.abs(base-(16**2/60-2))<.08,base);assert.ok(Math.abs(boost-base-13.5**2/40)<.12,[base,boost]);
});
test('three consecutive running jumps gain exactly two extra tiles on the third',()=>{
 const s=flat();s.player.x=20;tick(s,{axis:1,grab:true},40);const rises=[];
 for(let n=0;n<3;n++){tick(s,{axis:1,grab:true});const y=s.player.y;tick(s,{axis:1,grab:true,jump:true});assert.equal(s.jumpChain,n+1);let top=s.player.y;for(let k=0;k<300&&!s.grounded;k++){tick(s,{axis:1,grab:true,jump:true});top=Math.min(top,s.player.y);}rises.push(y-top);}
 assert.ok(Math.abs(rises[0]-rises[1])<.04);assert.ok(Math.abs(rises[2]-rises[1]-2)<.08,rises);
});
test('flag score increases with height, then slides, cheers and automatically enters the castle',()=>{
 const scores=[];for(const y of [14.2,10,6.2]){const s=flat();put(s.level,30,14,'E');body(s,{x:30.2,y,vy:0});tick(s);assert.equal(s.phase,'won');scores.push(s.score);tick(s,{},700);assert.equal(s.victory.stage,'done');assert.ok(s.player.x>=33.9);assert.equal(s.player.y,14.2);}assert.ok(scores[0]<scores[1]&&scores[1]<scores[2]);
});
test('glass bends use circular exterior collision and travel advances independent enemies',()=>{
 const s=flat();placeGlassPipe(s.level,8*s.level.width+6,[[0,0],[0,3],[8,3],[8,0]]);const air={x:6.02,y:12.7,w:.1,h:.1,vx:0,vy:0};assert.equal(curvedGlassCell(s.level,6,12),true);assert.equal(glassIntersects(s.level,air),false);assert.equal(glassIntersects(s.level,{...air,x:7,y:10}),true);
 const e=makeEnemy('duck',20,14);s.enemies=[e];body(s,{x:6.675,y:7.2,vy:0});s.grounded=true;tick(s,{down:true});assert.ok(s.pipe?.glass);const x=e.x;tick(s,{},60);assert.ok(s.pipe);assert.ok(e.x<x-.5);assert.equal(s.phase,'playing');
});
test('retry restores new devices, colors, ice, held state and all bounded effects',()=>{
 const l=level();placeCannon(l,8,12,3);put(l,15,14,'ice');l.contents[14*l.width+15]='coin';const s=create(l);s.redOn=false;s.score=5000;s.pound='fall';s.jumpChain=3;s.effects.push({kind:'fire',x:1,y:1,w:1,h:1,vx:0,vy:0,age:0});respawn(s);assert.equal(s.redOn,true);assert.equal(s.score,0);assert.equal(s.pound,'none');assert.equal(s.jumpChain,0);assert.equal(s.effects.length,0);assert.equal(s.riding,null);assert.equal(s.turrets.length,1);assert.equal(tile(s.level,15,14),'ice');
});

test('all advanced sprite UVs stay inside untouched generated PNGs, with common character frame sizes',()=>{
 const frames=JSON.parse(readFileSync(new URL('../whale-maker/assets/frames.json',import.meta.url),'utf8'));
 for(const [atlas,count]of [['mechanics',16],['motion2',16],['squid2',4],['devices',12],['fire-base',8],['fire-actions',16],['fire-motion',16],['fire-extra',16]]){
  const png=readFileSync(new URL(`../whale-maker/assets/${atlas}.png`,import.meta.url)),width=png.readUInt32BE(16),height=png.readUInt32BE(20);assert.ok(width>0&&height>0);assert.equal(frames[atlas].length,count);
  for(const [u,v,w,h]of frames[atlas])assert.ok(u>=0&&v>=0&&w>0&&h>0&&u+w<=1.00001&&v+h<=1.00001,atlas);
 }
 for(const atlas of ['fire-base','fire-actions','fire-extra'])for(let n=0;n<frames[atlas].length;n+=4)for(let k=1;k<4;k++)assert.deepEqual(frames[atlas][n+k].slice(2),frames[atlas][n].slice(2));
});

test('stone side contact can push without killing, while an actual wall pin is lethal',()=>{
 for(const pinned of [false,true]){const l=level();placeStone(l,10,13);l.properties[13*l.width+10].direction='left';if(pinned)for(let y=12;y<15;y++)put(l,7,y,'#');const s=create(l);body(s,{x:8.4,y:14.2,vy:0});s.grounded=true;tick(s,{},12);assert.equal(s.phase,pinned?'dead':'playing');}
});

test('the fifth course validates and resets its devices deterministically',()=>{
 const l=demo(4);assert.deepEqual(validate(l),l);const a=create(l),b=create(l);tick(a,{},240);tick(b,{},240);assert.deepEqual(a,b);assert.equal(a.turrets.length,2);assert.ok(a.enemies.some(e=>e.kind==='ghost'));assert.ok(a.enemies.some(e=>e.kind==='iron-turtle'));
});
