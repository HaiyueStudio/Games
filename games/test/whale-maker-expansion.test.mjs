import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&context.parentURL?.includes('/whale-maker/'))return next(specifier+'.ts',context);throw error;}}});
const {create,demo,validate,step,EMPTY_INPUT,tile,solid,respawn}=await import('../whale-maker/rules/model.ts');
const {makeItem,makeEnemy,triggerP,firebarPoints,pairedExit}=await import('../whale-maker/rules/expansion.ts');
const {objectCells,stampSelection,pasteStamp,moveSelection}=await import('../whale-maker/editor/selection.ts');
const {placePipe}=await import('../whale-maker/rules/levels.ts');
const {placeGlassPipe}=await import('../whale-maker/rules/glass.ts');
const tick=(s,input={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...input});};
function flat(){const l=demo();l.cells.fill('.');l.properties={};l.contents={};for(let x=0;x<l.width;x++)for(let y=15;y<l.height;y++)l.cells[y*l.width+x]='#';l.cells[14*l.width+200]='E';const s=create(l);tick(s,{},120);return s;}
const enemy=(kind,x,y=14.2)=>({...makeEnemy(kind,x,y-.2),x,y,vx:0,cooldown:0});

test('mechanism demo and every new element validate, spawn deterministic entities, and reset',()=>{
 const level=demo(2);assert.deepEqual(validate(level),level);const a=create(level),b=create(level);tick(a,{},120);tick(b,{},120);assert.deepEqual(a,b);assert.ok(a.items.some(i=>i.kind==='pow'));assert.ok(a.enemies.some(e=>e.kind==='fish'));assert.ok(a.enemies.some(e=>e.kind==='plant'&&e.mode==='pipe'));a.items=[];a.pTime=5;a.starTime=6;a.helmet=true;respawn(a);assert.equal(a.pTime,0);assert.equal(a.starTime,0);assert.equal(a.helmet,false);assert.equal(a.items.length,create(level).items.length);
});
test('glass pipes select and move atomically while preserving plant and link properties',()=>{
 const l=flat().level;placePipe(l,8,10,3,true);l.properties={[10*l.width+8]:{link:7,plant:true}};assert.equal(objectCells(l,9,12).length,6);assert.equal(solid(tile(l,9,12)),true);const moved=moveSelection(l,new Set(objectCells(l,9,12)),4,1);assert.equal(moved.size,6);assert.deepEqual(l.properties[11*l.width+12],{link:7,plant:true});const stamp=stampSelection(l,moved);pasteStamp(l,stamp,20,10);assert.deepEqual(l.properties[10*l.width+20],{link:7,plant:true});assert.deepEqual(validate(l),l);
});
test('vertical springs launch, can be carried and thrown; horizontal springs repel to either side',()=>{
 const s=flat();const item=makeItem('spring-v',5,14);item.cooldown=0;s.items=[item];Object.assign(s.player,{x:5.1,y:13.45,vy:5});s.grounded=false;s.coyote=0;tick(s,{jump:true},8);assert.ok(s.player.vy<-15);assert.equal(s.springEffects.length,1);
 const carry=flat(),spring=makeItem('spring-v',3,14);spring.cooldown=0;carry.items=[spring];carry.player.x=3;tick(carry,{grab:true});assert.equal(carry.held,spring);tick(carry,{grab:true});assert.equal(spring.held,true);tick(carry,{fire:true});assert.equal(carry.held,null);assert.equal(spring.thrown,true);assert.ok(spring.vx>5);
 for(const direction of [-1,1]){const h=flat();h.level.cells[14*h.level.width+5]='spring-h';Object.assign(h.player,{x:direction<0?4.6:5.4,y:14.2,vx:0});tick(h);assert.equal(Math.sign(h.player.vx),direction);assert.equal(Math.abs(h.player.vx),9.6);assert.ok(h.wallKick>0);}
});
test('basin can be kicked, carried, worn, and dropped by head or side damage',()=>{
 const kicked=flat(),pan=makeItem('basin',3,14);pan.cooldown=0;kicked.items=[pan];kicked.player.x=pan.x-kicked.player.w-.01;tick(kicked,{axis:1},8);assert.ok(pan.vx>5);
 const s=flat(),held=makeItem('basin',3,14);held.cooldown=0;s.items=[held];s.player.x=3;tick(s,{grab:true});assert.equal(s.held,held);tick(s,{grab:true,interact:true});assert.equal(s.helmet,true);assert.equal(s.held,null);
 s.power=1;s.invincible=0;Object.assign(s.player,{x:6,y:12,h:2,w:1,vy:-2});s.enemies=[enemy('duck',6,11.4)];tick(s);assert.equal(s.helmet,false);assert.equal(s.power,1,'top hit is blocked');assert.ok(s.effects.some(i=>i.kind==='helmet'));
 const side=flat();side.power=1;side.helmet=true;side.enemies=[enemy('duck',side.player.x)];tick(side);assert.equal(side.helmet,false);assert.equal(side.power,0,'side hit still hurts');assert.ok(side.effects.some(i=>i.kind==='helmet'));
});

function thrownSpring(direction=1,power=0){
 const s=flat(),spring=makeItem('spring-v',8,14);spring.cooldown=0;s.items=[spring];s.power=power;s.facing=direction;Object.assign(s.player,{x:8,y:15-(power?1.4:.8),h:power?1.4:.8});tick(s,{grab:true},2);assert.equal(s.held,spring);tick(s,{fire:true});assert.equal(s.held,null);return {s,spring};
}
test('a thrown spring brakes on first contact, rebounds with diminishing height and comes to exact rest',()=>{
 for(const direction of [-1,1])for(const power of [0,1]){
  const {s,spring}=thrownSpring(direction,power),start=spring.x,landings=[],heights=[];let previous=0,apex=spring.y;
  assert.equal(spring.vx,direction*8);assert.ok(spring.vy<0);
  for(let n=0;n<240&&spring.thrown;n++){
   tick(s);const count=spring.springBounces??0;
   if(count>previous){if(previous>0)heights.push(14.3-apex);landings.push({x:spring.x,vx:spring.vx,vy:spring.vy});apex=spring.y;previous=count;}else apex=Math.min(apex,spring.y);
  }
  assert.ok(landings.length>=3&&landings.length<=4);assert.ok(Math.abs(landings[0].vx)<4);assert.ok(direction*(landings[0].x-start)>1);assert.ok(Math.abs(spring.x-landings[0].x)<.7);assert.ok(heights.length>=2);for(let n=1;n<heights.length;n++)assert.ok(heights[n]<heights[n-1]);
  assert.equal(spring.thrown,false);assert.equal(spring.vx,0);assert.equal(spring.vy,0);assert.ok(Math.abs(spring.y-14.3)<1e-8);const x=spring.x;tick(s,{},240);assert.equal(spring.x,x);assert.equal(spring.vx,0);assert.equal(spring.vy,0);assert.equal(spring.compression,0);
 }
});
test('spring settling starts at ground contact and also works on one-way platforms',()=>{
 const s=flat(),spring=makeItem('spring-v',8,8);Object.assign(spring,{vx:8,vy:0,thrown:true,springBounces:0});s.items=[spring];for(let x=6;x<20;x++)s.level.cells[12*s.level.width+x]='=';
 tick(s,{},30);assert.equal(spring.vx,8);assert.equal(spring.springBounces,0);assert.ok(spring.y+spring.h<12);
 tick(s,{},240);assert.equal(spring.thrown,false);assert.equal(spring.vx,0);assert.equal(spring.vy,0);assert.ok(Math.abs(spring.y+spring.h-12)<1e-8);
 const idle=flat(),standing=makeItem('spring-v',8,14);idle.items=[standing];tick(idle,{},240);assert.equal(standing.x,8.1);assert.equal(standing.vy,0);assert.equal(standing.springBounces,undefined);
});
test('a settling spring can be picked up and rethrown with a fresh landing cycle',()=>{
 const {s,spring}=thrownSpring();for(let n=0;n<120&&(spring.springBounces??0)===0;n++)tick(s);assert.ok(spring.compression>0);spring.cooldown=0;s.player.x=spring.x;tick(s,{grab:true});assert.equal(s.held,spring);assert.equal(spring.thrown,false);assert.equal(spring.springBounces,0);assert.equal(spring.compression,0);
 s.facing=-1;tick(s,{grab:true});tick(s,{fire:true});assert.equal(spring.vx,-8);assert.ok(spring.vy<0);assert.equal(spring.springBounces,0);tick(s,{},240);assert.equal(spring.thrown,false);assert.equal(spring.vx,0);assert.ok(spring.springBounces>=3);
});
test('plants retract from pipes or stand freely, and spin jumps bounce without killing them',()=>{
 const s=flat(),plant=enemy('plant',5,14);plant.origin=[5,15];plant.mode='fixed';s.enemies=[plant];Object.assign(s.player,{x:5,y:13.15,vy:5});s.grounded=false;s.spinning=true;tick(s,{spin:true},4);assert.ok(s.player.vy<0);assert.equal(plant.alive,true);assert.equal(s.phase,'playing');
 const pipe=flat(),p=enemy('plant',8,13);p.origin=[8,13];p.mode='pipe';pipe.enemies=[p];pipe.player.x=2;tick(pipe,{},40);assert.ok(p.h<.08);tick(pipe,{},180);assert.ok(p.h>1);assert.equal(p.y+p.h,13);
 const normal=flat();normal.enemies=[enemy('plant',5,14)];Object.assign(normal.player,{x:5,y:13.15,vy:5});normal.grounded=false;tick(normal,{},4);assert.equal(normal.phase,'dead');
});
test('spiked turtles resist normal stomps and permit harmless repeated spin bounces',()=>{
 const s=flat(),spiky=enemy('spiky',5);s.enemies=[spiky];Object.assign(s.player,{x:5,y:13.35,vy:5});s.grounded=false;s.spinning=true;tick(s,{spin:true},4);assert.ok(s.player.vy<0);assert.equal(spiky.alive,true);assert.equal(s.phase,'playing');
 const n=flat();n.enemies=[enemy('spiky',5)];Object.assign(n.player,{x:5,y:13.35,vy:5});n.grounded=false;tick(n,{},4);assert.equal(n.phase,'dead');
});
test('water supports buoyancy, swim strokes and directional motion; aquatic enemies animate deterministically',()=>{
 const s=flat();for(let y=9;y<15;y++)for(let x=2;x<18;x++)s.level.cells[y*s.level.width+x]='water';Object.assign(s.player,{x:5,y:12,vx:0,vy:0});s.grounded=false;tick(s,{axis:1,jump:true},12);assert.equal(s.swimming,true);assert.ok(s.player.vy<0);assert.ok(s.player.vx>0&&s.player.vx<=3);const y=s.player.y;tick(s,{interact:true},30);assert.ok(s.player.y<y);s.enemies=[enemy('fish',10,12),enemy('squid',12,12)];const start=s.enemies.map(e=>[e.x,e.y]);tick(s,{},30);assert.notDeepEqual(s.enemies.map(e=>[e.x,e.y]),start);assert.ok(s.enemies.every(e=>e.alive));
});
test('firebar length and signed speed control the orbit and collision is harmful',()=>{
 const s=flat(),id=12*s.level.width+6;s.level.cells[id]='firebar';s.level.properties={[id]:{length:7,speed:-2,phase:0}};const a=firebarPoints(s.level,6,12,0),b=firebarPoints(s.level,6,12,.5);assert.equal(a.length,7);assert.ok(Math.abs(a[6].x-6.5-7*.55)<1e-10);assert.ok(b[0].y<12.5);s.time=0;Object.assign(s.player,{x:a[2].x-.3,y:a[2].y-.3});tick(s);assert.equal(s.phase,'dead');
});
test('doors pair by channel, P doors require an active switch, and transit has a re-entry lock',()=>{
 const s=flat(),w=s.level.width;for(const x of [3,12,18,24])s.level.cells[14*w+x]=x<18?'door':'p-door';s.level.properties={[14*w+3]:{link:2},[14*w+12]:{link:2},[14*w+18]:{link:3},[14*w+24]:{link:3}};s.player.x=3;tick(s,{interact:true});assert.ok(s.door);tick(s,{},90);assert.ok(Math.abs(s.player.x+s.player.w/2-12.5)<.01);assert.equal(s.door,null);assert.ok(s.doorWait>0);assert.equal(pairedExit(s.level,14*w+18,0),undefined);s.player.x=18;s.doorWait=0;tick(s,{interact:true});assert.equal(s.door,null);tick(s);triggerP(s);tick(s,{interact:true});assert.ok(s.door);tick(s,{},90);assert.ok(s.player.x>24);
});
test('P switch swaps coins and bricks for ten seconds, preserves consumed cells, and changes paths',()=>{
 const s=flat(),w=s.level.width;s.level.cells[11*w+6]='B';s.level.cells[11*w+7]='o';triggerP(s);assert.equal(tile(s.level,6,11),'o');assert.equal(tile(s.level,7,11),'B');assert.equal(s.pTime,10);assert.equal(solid('p-on',s.pTime),true);assert.equal(solid('p-off',s.pTime),false);s.level.cells[11*w+6]='.';tick(s,{},1201);assert.equal(s.pTime,0);assert.equal(tile(s.level,6,11),'.');assert.equal(tile(s.level,7,11),'o');assert.equal(solid('p-on',0),false);assert.equal(solid('p-off',0),true);
 const stomp=flat(),item=makeItem('p-switch',5,14);item.cooldown=0;stomp.items=[item];Object.assign(stomp.player,{x:5,y:13.6,vy:5});stomp.grounded=false;tick(stomp,{},8);assert.equal(item.spent,true);assert.ok(stomp.pTime>9);assert.equal(item.h,.18);
});

test('a stomped P switch stays flat briefly, cannot be grabbed or retriggered, and vanishes without ending its effect',()=>{
 const s=flat(),item=makeItem('p-switch',5,14);Object.assign(item,{cooldown:0,vx:1});s.items=[item];Object.assign(s.player,{x:5,y:13.6,vy:5});s.grounded=false;tick(s,{},8);
 assert.equal(item.spent,true);assert.equal(item.h,.18);assert.ok(Math.abs(item.y+item.h-15)<1e-8);assert.equal(item.vx,0);assert.equal(item.vy,0);assert.ok(item.alive);
 const x=item.x,y=item.y,time=s.pTime;Object.assign(s.player,{x:item.x,y:item.y-s.player.h+.05,vy:0});tick(s,{grab:true},12);
 assert.equal(s.held,null);assert.equal(item.x,x);assert.equal(item.y,y);assert.ok(item.pressedAge>=.1);assert.ok(item.alive);assert.ok(s.pTime<time);
 tick(s,{grab:true},40);assert.equal(item.alive,false);assert.equal(s.items.includes(item),false);assert.ok(s.pTime>9.4);assert.equal(s.held,null);
});

test('pressed switches also disappear during door and pipe travel, while unused switches remain available',()=>{
 for(const travel of ['door','pipe']){
  const s=flat(),pressed=makeItem('p-switch',5,14),unused=makeItem('p-switch',9,14);pressed.cooldown=0;s.items=[pressed,unused];Object.assign(s.player,{x:5,y:13.6,vy:5});s.grounded=false;tick(s,{},8);assert.equal(pressed.spent,true);
  if(travel==='door')s.door={age:0,from:[5,14.2],to:[20,14.2],source:0,target:1};else s.pipe={age:0,from:[5,14.2],to:[20,14.2]};
  tick(s,{},52);assert.equal(s.items.includes(pressed),false);assert.equal(pressed.alive,false);assert.equal(s.items.includes(unused),true);assert.equal(unused.spent,false);assert.ok(s.pTime>9.4);
 }
});

test('retry restores a consumed P switch and resets the P door activation timer',()=>{
 const l=flat().level;l.cells[14*l.width+5]='p-switch';l.cells[14*l.width+12]='p-door';const s=create(l);tick(s,{},120);const item=s.items[0];item.cooldown=0;Object.assign(s.player,{x:5,y:13.6,vy:5});s.grounded=false;tick(s,{},60);assert.equal(s.items.length,0);assert.ok(s.pTime>9);
 respawn(s);assert.equal(s.pTime,0);assert.equal(s.items.length,1);assert.equal(s.items[0].kind,'p-switch');assert.equal(s.items[0].spent,false);assert.equal(s.items[0].pressedAge,undefined);assert.equal(s.items[0].h,.5);assert.equal(tile(s.level,12,14),'p-door');
});

test('carried objects stay in the hands throughout door and glass pipe travel',()=>{
 for(const pipe of [false,true]){
  const s=flat(),w=s.level.width;
  if(pipe){placeGlassPipe(s.level,12*w+6,[[0,0],[0,3],[12,3],[12,0]]);Object.assign(s.player,{x:6.675,y:11.2});}
  else{for(const x of [6,18])s.level.cells[14*w+x]='door';Object.assign(s.player,{x:6,y:14.2});}
  const item=makeItem('spring-v',6,14);item.held=true;s.items=[item];s.held=item;s.grounded=true;
  tick(s,{grab:true,down:pipe,interact:!pipe});tick(s,{grab:true},60);
  assert.equal(s.held,item);
  if(pipe){const angle=s.pipe.angle;assert.ok(Math.abs(item.x+item.w/2-(s.player.x+s.player.w/2+Math.cos(angle)*.45))<1e-8);assert.ok(Math.abs(item.y+item.h/2-(s.player.y+s.player.h/2+Math.sin(angle)*.45))<1e-8);for(let n=0;n<700&&s.pipe;n++)tick(s,{grab:true});assert.ok(s.player.x>18);}
  else{assert.ok(s.player.x>18);assert.ok(Math.abs(item.x+item.w/2-(s.player.x+s.player.w/2+s.facing*.6))<1e-8);assert.ok(Math.abs(item.y+item.h/2-(s.player.y+s.player.h-.45))<1e-8);}
 }
});
test('slopes support walking and descending slides that defeat ordinary enemies',()=>{
 const s=flat(),w=s.level.width;for(let n=0;n<3;n++){s.level.cells[(12+n)*w+6+n]='slope-down';for(let y=13+n;y<15;y++)s.level.cells[y*w+6+n]='#';}Object.assign(s.player,{x:6.1,y:12-s.player.h,vx:0,vy:1});tick(s,{},8);assert.equal(s.grounded,true);assert.equal(s.slope,1);tick(s,{down:true},18);assert.ok(s.player.vx>4);assert.equal(s.sliding,true);const duck=enemy('duck',s.player.x+.3,s.player.y);s.enemies=[duck];tick(s,{down:true});assert.equal(duck.alive,false);assert.equal(s.phase,'playing');assert.equal(s.defeated[0].cause,'slide');
});

test('both ramp directions connect to the raised platform and flat floor without blocking or sinking',()=>{
 for(const axis of [1,-1]){
  const s=create(demo(2));s.items=[];s.enemies=[];Object.assign(s.player,{x:axis===1?58:69,y:14.2,vy:0});s.grounded=true;
  let minFeet=15,wallFrames=0;for(let n=0;n<270;n++){tick(s,{axis});minFeet=Math.min(minFeet,s.player.y+s.player.h);if(s.wall)wallFrames++;}
  assert.equal(s.phase,'playing');assert.equal(wallFrames,0);assert.ok(minFeet<=12.01,'walk onto the raised platform');assert.ok(axis===1?s.player.x>69:s.player.x<58,'cross the complete ramp in either direction');
 }
});
test('invincibility stars bounce, protect from enemies, defeat them and expire',()=>{
 const s=flat(),star=makeItem('star',8,14);star.y=14.3;star.vy=5;s.items=[star];tick(s,{},3);assert.ok(star.vy<0);star.cooldown=0;star.x=s.player.x;star.y=s.player.y;tick(s);assert.equal(s.starTime,10);assert.equal(s.items.length,0);const spiky=enemy('spiky',s.player.x);s.enemies=[spiky];tick(s);assert.equal(spiky.alive,false);assert.equal(s.phase,'playing');tick(s,{},1201);assert.equal(s.starTime,0);
});
test('ground-pounded POW only defeats visible grounded enemies and starts bounded camera shake',()=>{
 const s=flat();s.view={x:0,y:4,w:25,h:12};const ground=enemy('duck',8),air=enemy('duck',10,10),off=enemy('duck',40),spiky=enemy('spiky',12);s.enemies=[ground,air,off,spiky];const pow=makeItem('pow',5,14);s.items=[pow];Object.assign(s.player,{x:5.15,y:13.19,vy:23});s.grounded=false;s.pound='fall';s.poundAge=.3;tick(s,{down:true});assert.equal(ground.alive,false);assert.equal(spiky.alive,false);assert.equal(air.alive,true);assert.equal(off.alive,true);assert.equal(s.items.length,0);assert.ok(s.shake>0&&s.powFlash>0);tick(s,{},90);assert.equal(s.shake,0);assert.equal(s.powFlash,0);
});
test('new configuration validation rejects invalid values and preserves JSON round trips',()=>{
 const l=demo(2);assert.deepEqual(validate(JSON.parse(JSON.stringify(l))),l);const id=l.cells.indexOf('firebar');for(const bad of [{length:0},{length:17},{speed:Infinity},{speed:7},{link:0},{mode:'other'},{unknown:true}]){const b=structuredClone(l);b.properties[id]=bad;assert.throws(()=>validate(b));}
});
test('new atlas metadata is bounded and uses stable common animation canvases',async()=>{
 const {readFile}=await import('node:fs/promises'),f=JSON.parse(await readFile(new URL('../whale-maker/assets/frames.json',import.meta.url),'utf8'));for(const name of ['gadgets','creatures','environment','motion']){assert.equal(f[name].length,16);for(const uv of f[name])assert.ok(uv[0]>=0&&uv[1]>=0&&uv[0]+uv[2]<=1.000001&&uv[1]+uv[3]<=1.000001,`${name} frame stays in bounds`);}
});
test('linked glass pipes transport visibly, while plant spin bouncing can repeat indefinitely',()=>{
 const l=flat().level;placePipe(l,6,12,3,true);placePipe(l,18,12,3,true);l.properties={[12*l.width+6]:{link:5},[12*l.width+18]:{link:5}};const s=create(l);Object.assign(s.player,{x:6.675,y:11.2,vy:0});s.grounded=true;tick(s,{down:true});assert.equal(s.pipe.glass,true);for(let n=0;n<700&&s.pipe;n++)tick(s);assert.ok(s.player.x>18&&s.player.x<20);
 const bounce=flat(),plant=enemy('plant',5,14);plant.origin=[5,15];bounce.enemies=[plant];Object.assign(bounce.player,{x:5,y:13.15,vy:5});bounce.grounded=false;bounce.coyote=0;bounce.spinning=true;let count=0,previous=5;for(let n=0;n<480;n++){tick(bounce,{spin:true});if(previous>=0&&bounce.player.vy<0)count++;previous=bounce.player.vy;}assert.ok(count>=3);assert.equal(plant.alive,true);assert.equal(bounce.phase,'playing');
});
test('POW can actually be picked up and thrown to detonate on the first enemy',()=>{
 const s=flat(),pow=makeItem('pow',3,14);pow.cooldown=0;s.items=[pow];s.player.x=3;s.enemies=[enemy('duck',7)];tick(s,{grab:true},2);assert.equal(s.held,pow);tick(s,{fire:true});assert.equal(pow.thrown,true);assert.equal(s.held,null);tick(s,{},160);assert.equal(pow.alive,false);assert.equal(s.enemies[0].alive,false);assert.ok(s.defeated.length===0,'POW effects clean up after the impact');
});

