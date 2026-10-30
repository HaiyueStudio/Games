import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,EMPTY_INPUT,validate,respawn}=await import('../whale-maker/rules/model.ts');
const {makeEnemy,makeItem}=await import('../whale-maker/rules/expansion.ts');
const {pipeShape,pipeAt,writePipe,rotatePipe}=await import('../whale-maker/rules/pipes.ts');
const {objectCells,stampSelection,pasteStamp,moveSelection}=await import('../whale-maker/editor/selection.ts');
const {drawPipe}=await import('../whale-maker/rendering/pipes.ts');
const {freezeEnemy,thawEnemy}=await import('../whale-maker/rules/frost.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function level(){const width=60,height=24,cells=Array(width*height).fill('.');for(let y=20;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]='#';cells[19*width+58]='E';return {version:1,name:'spring pipe fixtures',width,height,cells,spawn:[2,19.2],properties:{},contents:{}};}
const bounced=(s,b,n=200)=>{for(let k=0;k<n;k++){tick(s);if(b.vy<-8)return true;}return false;};

test('placed growth pearls fall, roll and reverse at walls, and respawn at their blueprint position',()=>{
 const l=level();l.cells[12*l.width+12]='G';for(let y=15;y<20;y++)l.cells[y*l.width+17]='B';const s=create(l),p=s.rewards[0];assert.equal(s.level.cells[12*l.width+12],'.');assert.equal(p.kind,'growth');tick(s,{},30);assert.ok(p.y>12.1&&p.x>12.1);tick(s,{},300);assert.ok(p.vx<0);assert.ok(Math.abs(p.y+p.h-20)<.001);s.phase='dead';respawn(s);assert.equal(s.rewards[0].x,12.1);assert.equal(s.rewards[0].y,12.1);assert.equal(l.cells[12*l.width+12],'G');
});
test('vertical springs rebound ordinary enemies, shells, bombs and iron turtles',()=>{
 for(const kind of ['duck','turtle','shell','spiky','iron-turtle','bomb','hammer-otter']){const s=create(level()),spring=makeItem('spring-v',14,19),e=makeEnemy(kind,14,17);e.vx=0;s.items=[spring];s.enemies=[e];assert.ok(bounced(s,e),kind);assert.equal(e.grounded,false);assert.ok(spring.compression>0);assert.ok(e.alive);}
});
test('vertical springs rebound pearls and physical items, including a thrown POW without detonating it',()=>{
 for(const kind of ['pow','star','giant-pearl','basin','p-switch','wood-crate','coin']){const s=create(level()),spring=makeItem('spring-v',14,19),item=makeItem(kind,14,16);item.vx=item.vy=0;if(kind==='pow')item.thrown=true;s.items=[spring,item];assert.ok(bounced(s,item),kind);assert.ok(item.alive,kind);assert.equal(s.shake,0);}
 const s=create(level());s.items=[makeItem('spring-v',14,19)];const pearl={kind:'growth',x:14.1,y:16,w:.8,h:.8,vx:0,vy:0,age:.4,originY:16,persistent:true};s.rewards=[pearl];assert.ok(bounced(s,pearl));
});
test('horizontal springs rebound items without changing player facing or wall kick',()=>{
 for(const kind of ['pow','star','giant-pearl','basin','wood-crate']){const s=create(level()),spring=makeItem('spring-h',14,19),item=makeItem(kind,13,19);item.x=spring.x-item.w-.01;item.y=20-item.h;item.vx=4;item.vy=0;s.items=[spring,item];tick(s,{},2);assert.ok(item.vx<0,kind);assert.equal(s.facing,1);assert.equal(s.wallKick,0);assert.equal(s.springDrift,false);}
 const s=create(level()),spring=makeItem('spring-h',14,19);s.items=[spring];const p={kind:'growth',x:13.29,y:19.2,w:.8,h:.8,vx:2,vy:0,age:.4,originY:19,persistent:true};s.rewards=[p];tick(s,{},2);assert.ok(p.vx<0);assert.equal(s.wallKick,0);
});
test('spring compression never prevents simultaneous actors from rebounding',()=>{
 const s=create(level()),spring=makeItem('spring-v',14,19);s.items=[spring];const e=makeEnemy('duck',14,18.49);e.y=18.49;e.vx=0;e.vy=4;s.enemies=[e];const pearl={kind:'growth',x:14.15,y:18.49,w:.8,h:.8,vx:0,vy:4,age:.4,originY:18,persistent:true};s.rewards=[pearl];tick(s);assert.ok(e.vy<0);assert.ok(pearl.vy<0);
});
test('falling enemies press P switches, while side contacts only block',()=>{
 for(const kind of ['duck','shell','iron-turtle','bomb']){const s=create(level()),ps=makeItem('p-switch',14,19),e=makeEnemy(kind,14,17);e.vx=0;s.items=[ps];s.enemies=[e];for(let n=0;n<120&&!ps.spent;n++)tick(s);assert.ok(ps.spent,kind);assert.ok(s.pTime>9.9);assert.equal(ps.h,.18);}
 const s=create(level()),ps=makeItem('p-switch',14,19),e=makeEnemy('duck',13,19);e.vx=1.5;s.items=[ps];s.enemies=[e];tick(s,{},100);assert.equal(ps.spent,false);assert.equal(s.pTime,0);assert.ok(e.x+e.w<=ps.x+.02);
});
test('rolling pearls and giant pearls press switches only when landing from above',()=>{
 const l=level();l.cells[17*l.width+12]='G';l.cells[19*l.width+13]='p-switch';l.cells[18*l.width+25]='B';l.cells[18*l.width+26]='o';const s=create(l),ps=s.items[0];for(let n=0;n<120&&!ps.spent;n++)tick(s);assert.ok(ps.spent);assert.equal(s.level.cells[18*l.width+25],'o');assert.equal(s.level.cells[18*l.width+26],'B');
 const giant=create(level()),switch2=makeItem('p-switch',14,19),p=makeItem('giant-pearl',14,16);giant.items=[switch2,p];for(let n=0;n<150&&!switch2.spent;n++)tick(giant);assert.ok(switch2.spent);
 const side=create(level()),switch3=makeItem('p-switch',14,19);side.items=[switch3];side.rewards=[{kind:'growth',x:13,y:19.2,w:.8,h:.8,vx:2,vy:0,age:.4,originY:19,persistent:true}];tick(side,{},120);assert.equal(switch3.spent,false);
});
test('pipes rotate through four solid rectangular footprints and preserve plant/link properties',()=>{
 const l=level(),id=12*l.width+10;writePipe(l,10,12,4);l.properties[id]={plant:true,link:7};for(const rotation of [0,90,180,270,0]){const p=pipeShape(l,id);assert.equal(p.rotation,rotation);assert.equal(p.cells.length,8);assert.equal(p.width,rotation%180?4:2);for(const n of p.cells){assert.deepEqual(objectCells(l,n%l.width,Math.floor(n/l.width)),p.cells);assert.equal(pipeAt(l,n).anchor,id);}validate(l);if(rotation!==0||p.rotation===0)assert.ok(rotatePipe(l,id));}assert.equal(l.properties[id].plant,true);assert.equal(l.properties[id].link,7);
});
test('blocked or out of bounds pipe rotation is atomic',()=>{
 for(const [x,y,wall]of [[10,12,true],[58,12,false]]){const l=level();writePipe(l,x,y,4);if(wall)l.cells[y*l.width+x+3]='B';const before=structuredClone(l);assert.equal(rotatePipe(l,y*l.width+x),false);assert.deepEqual(l,before);}
});
test('rotated pipes copy, move, serialize and retain their collider and plant mouth direction',()=>{
 const l=level(),id=12*l.width+10;writePipe(l,10,12,4,270);l.properties[id].link=5;l.properties[id].plant=true;const selected=new Set(objectCells(l,13,13)),stamp=stampSelection(l,selected),pasted=pasteStamp(l,stamp,20,10);assert.ok(pasted);assert.equal(pipeShape(l,10*l.width+20).rotation,270);assert.ok(moveSelection(l,pasted,3,1));const s=create(validate(JSON.parse(JSON.stringify(l)))),plant=s.enemies.find(e=>e.plantMouth?.[0]===23);assert.ok(plant);assert.deepEqual(plant.plantDirection,[-1,0]);tick(s,{},220);assert.ok(plant.x<23);assert.equal(plant.y,11.6);
});
test('linked pipes enter and exit through the mouth in each direction',()=>{
 for(const rotation of [0,90,180,270]){const l=level();writePipe(l,10,12,3,rotation);writePipe(l,20,12,3,(rotation+90)%360);l.properties[12*l.width+10].link=8;l.properties[12*l.width+20].link=8;const s=create(l),a=pipeShape(l,12*l.width+10),b=pipeShape(l,12*l.width+20),p=s.player;p.x=a.mouth[0]+a.normal[0]*(p.w/2+.002)-p.w/2;p.y=a.mouth[1]+a.normal[1]*(p.h/2+.002)-p.h/2;const input=rotation===0?{down:true}:rotation===90?{axis:-1}:rotation===180?{interact:true}:{axis:1};tick(s,input);assert.ok(s.pipe,rotation);const from={...p};tick(s,input,20);assert.ok((p.x-from.x)*(-a.normal[0])+(p.y-from.y)*(-a.normal[1])>0);tick(s,{},90);assert.equal(s.pipe,null);const normalGap=(p.x+p.w/2-b.mouth[0])*b.normal[0]+(p.y+p.h/2-b.mouth[1])*b.normal[1];assert.ok(normalGap>0);assert.ok(s.pipeWait>0);}
});
test('legacy explicit vertical warps retain their exit coordinates',()=>{
 const l=level();writePipe(l,10,12,3);l.warps=[{from:[10,12],to:[30,20]}];const s=create(l);s.player.x=10.55;s.player.y=11.2;s.grounded=true;tick(s,{down:true});assert.ok(s.pipe);tick(s,{},109);assert.equal(s.pipe,null);assert.ok(Math.abs(s.player.x+s.player.w/2-30)<.001);assert.ok(Math.abs(s.player.y+s.player.h-20)<.03);
});
test('native pipe sections rotate without stretching the repeated texture',()=>{
 for(const rotation of [0,90,180,270]){const l=level();writePipe(l,10,12,5,rotation);const draws=[],scene={sprite(...args){draws.push(args);}};drawPipe(scene,pipeShape(l,12*l.width+10),100,200,48,.3);assert.equal(draws.length,6);for(const d of draws.slice(0,-1)){assert.equal(d[4],1.84*48);assert.equal(d[5],48);assert.ok(Math.abs(d[7]%(Math.PI)-rotation*Math.PI/180%Math.PI)<1e-9);}assert.equal(draws.at(-1)[1],12);}
});

test('retracted side plants are harmless, unfreezable and do not act as solid monster obstacles',()=>{
 const l=level();writePipe(l,10,12,4,90);l.properties[12*l.width+10].plant=true;const s=create(l),e=s.enemies[0];s.player.x=14.002;s.player.y=12.6;s.player.vy=0;tick(s);assert.ok(e.w<.08);assert.equal(s.phase,'playing');assert.equal(freezeEnemy(s,e),false);
 e.age=2;s.player.x=3;tick(s);assert.ok(e.w>1);assert.equal(freezeEnemy(s,e),true);thawEnemy(s,e);tick(s);assert.equal(e.mode,'pipe');assert.deepEqual(e.plantMouth,[14,13]);assert.deepEqual(e.plantDirection,[1,0]);assert.ok(e.w>1);assert.equal(e.h,.8);
});
test('spring-launched swimming enemies and cannonballs retain their upward momentum after contact',()=>{
 for(const kind of ['fish','squid','cannonball']){const l=level();if(kind==='fish'||kind==='squid')for(let y=15;y<20;y++)for(let x=13;x<16;x++)l.cells[y*l.width+x]='water';const s=create(l),spring=makeItem('spring-v',14,19),e=makeEnemy(kind,14,18);e.x=14.1;e.y=spring.y-e.h-.01;e.vy=1;e.vx=0;if(kind==='squid'){e.squidPhase='sink';e.squidPeak=e.y;}s.items=[spring];s.enemies=[e];if(kind==='cannonball')e.y=spring.y-e.h+.005;for(let n=0;n<30&&!e.springAir;n++)tick(s);assert.ok(e.springAir,kind);const y=e.y;tick(s,{},8);assert.ok(e.y<y-.4,kind);assert.ok(e.vy<0,kind);}
});
