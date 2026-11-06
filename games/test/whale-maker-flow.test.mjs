import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,EMPTY_INPUT,validate,respawn}=await import('../whale-maker/rules/model.ts');
const {makeEnemy}=await import('../whale-maker/rules/expansion.ts');
const {launchBomb}=await import('../whale-maker/rules/workshop.ts');
const {centeredCamera}=await import('../whale-maker/rules/camera.ts');
const {resizeLevelHeight}=await import('../whale-maker/editor/height.ts');
const {playerArt}=await import('../whale-maker/rendering/player.ts');
const {drawGoal}=await import('../whale-maker/rendering/goal.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function level(surface='#'){const width=100,height=24,cells=Array(width*height).fill('.');for(let y=20;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]=y===20?surface:'#';cells[19*width+95]='E';return {version:1,name:'惯性与边界',width,height,cells,spawn:[2,19.2],properties:{},contents:{}};}
const flat=(t)=>{const s=create(level(t));s.player.x=30;tick(s);return s;};
const stopDistance=(s,i)=>{const x=s.player.x;for(let n=0;n<300&&Math.abs(s.player.vx)>.0001;n++)tick(s,i);assert.equal(s.player.vx,0);return Math.abs(s.player.x-x);};

test('walking release coasts 1.5 tiles and crouching brakes over half a tile in both directions',()=>{
 for(const dir of [-1,1]){const a=flat(),b=flat();tick(a,{axis:dir},30);tick(b,{axis:dir},30);assert.ok(Math.abs(stopDistance(a,{})-1.5)<1e-7);assert.ok(Math.abs(stopDistance(b,{axis:dir,down:true})-.5)<1e-7);assert.ok(b.crouching);assert.equal(b.player.h,.55);}
});
test('running coasts farther, crouch brakes farther, and ice still doubles distances',()=>{
 const run=flat(),slide=flat(),ice=flat('ice');for(const s of [run,slide])tick(s,{axis:1,grab:true},50);tick(ice,{axis:1},50);assert.ok(stopDistance(run,{})>3.5);assert.ok(Math.abs(stopDistance(slide,{down:true})-8.5**2/24)<.001);assert.ok(Math.abs(stopDistance(ice,{})-6)<1e-7);
});
test('opposite input at running speed performs a distinct short brake before reversing',()=>{
 const s=flat();tick(s,{axis:1,grab:true},50);const x=s.player.x;tick(s,{axis:-1});assert.ok(s.turning);assert.equal(playerArt(s).frame,24);assert.equal(s.facing,-1);for(let n=0;n<40&&s.player.vx>0;n++)tick(s,{axis:-1});assert.equal(s.player.vx,0);assert.ok(Math.abs(s.player.x-x-.6)<1e-7);tick(s,{axis:-1},10);assert.ok(s.player.vx<0);assert.equal(s.turning,false);
});
test('camera centres both body axes and clamps to all four map boundaries for every size',()=>{
 for(const [w,h]of [[.9,.8],[.9,2],[1.9,2]])for(const [x,y]of [[60,100],[0,0],[99,255]]){const l={width:100,height:256},p={x,y,w,h,vx:0,vy:0},c=centeredCamera(l,p,25.6666666667,12);assert.ok(c.x>=0&&c.x<=100-25.6666666667);assert.ok(c.y>=0&&c.y<=244);if(x===60){assert.ok(Math.abs(x+w/2-c.x-25.6666666667/2)<1e-8);assert.equal(y+h/2-c.y,6);}}
});
test('editor supports row 255, preserves old layout, validates tall routes and refuses destructive crop',()=>{
 const l=level(),saved=structuredClone(l),grown=resizeLevelHeight(l,256);assert.ok(grown);assert.equal(grown.cells.length,25600);assert.deepEqual(grown.cells.slice(0,l.cells.length),l.cells);assert.deepEqual(l,saved);grown.cells[25500+8]='?';grown.contents[25500+8]='coin';grown.cells[24000+20]='moving-platform';grown.properties[24020]={axis:'y',range:[230,255]};assert.deepEqual(validate(grown),grown);assert.equal(resizeLevelHeight(grown,24),null);assert.equal(resizeLevelHeight(l,257),null);assert.equal(resizeLevelHeight(l,24).height,24);
});
test('player cannot jump through the upper scene boundary',()=>{
 const s=flat();s.player.y=.01;s.player.vy=-10;s.grounded=false;tick(s,{jump:true});assert.equal(s.player.y,0);assert.ok(s.player.vy>=0);
});
test('red bombs can be side kicked five tiles and bounce once on their first landing',()=>{
 for(const direction of [-1,1]){const s=flat(),e=makeEnemy('bomb',35,19);e.bombFuse=5;e.cooldown=0;e.vx=0;s.enemies=[e];s.player.x=direction>0?e.x-.85:e.x+.75;s.player.y=e.y;tick(s);assert.equal(e.bombFlight,'kick');assert.equal(Math.sign(e.vx),direction);const start=e.x;let sawBounce=false;for(let n=0;n<160&&e.bombThrown;n++){s.player.x=2;tick(s);sawBounce ||= e.bombBounces===1&&e.vy<0;}assert.ok(sawBounce);assert.ok(Math.abs(Math.abs(e.x-start)-5)<.12,Math.abs(e.x-start));assert.ok(e.alive);}
});
test('thrown bombs arc higher, rebound once, and retain their fuse and attack status while rebounding',()=>{
 const s=flat(),e=makeEnemy('bomb',35,19);e.bombFuse=5;s.enemies=[e];launchBomb(e,1,'throw');const y=e.y;let top=y,bounces=0;for(let n=0;n<220&&e.bombThrown;n++){tick(s);top=Math.min(top,e.y);bounces=Math.max(bounces,e.bombBounces??0);}assert.ok(y-top>1.4&&y-top<1.6);assert.equal(bounces,1);assert.ok(e.bombFuse<5&&e.bombFuse>3);assert.equal(e.bombThrown,false);
});
test('fire placement is the fixed apex, starts descending, then rises from below view after waiting',()=>{
 const s=flat(),e=makeEnemy('fire-jumper',35,8);s.enemies=[e];s.view={x:22,y:7,w:25.6,h:12};const apex=e.y;tick(s);assert.ok(e.y>apex&&e.vy>0);for(let n=0;n<500&&e.flamePhase!=='wait';n++)tick(s);assert.equal(e.flamePhase,'wait');assert.equal(e.flameWait,3);tick(s,{},360);assert.equal(e.flamePhase,'flight');assert.ok(e.vy<0);assert.ok(e.y>19);let peak=e.y;for(let n=0;n<500&&e.vy<0;n++){tick(s);peak=Math.min(peak,e.y);}assert.ok(Math.abs(peak-apex)<.03);assert.equal(e.y,apex);
});
test('lava swallows all ordinary enemy types while fire remains immune, with no upward defeat hop',()=>{
 for(const kind of ['duck','turtle','shell','plant','fish','squid','spiky','ghost','iron-turtle','cannonball','bomb','hammer-otter']){const l=level('lava'),s=create(l),e=makeEnemy(kind,12,19);s.enemies=[e];tick(s,{},3);assert.equal(e.alive,false,kind);const d=s.defeated[0];assert.equal(d.cause,'lava');assert.equal(d.lavaY,20);assert.equal(d.vx,0);assert.equal(d.vy,0);const y=d.y;tick(s,{},20);assert.ok(d.y>y);assert.equal(d.angle,0);tick(s,{},100);assert.equal(s.defeated.length,0);}
 const s=create(level('lava')),e=makeEnemy('fire-jumper',12,19);s.enemies=[e];tick(s,{},100);assert.ok(e.alive);
});
test('both spring orientations fall from air, land, and respawn at their placed height',()=>{
 for(const kind of ['spring-h','spring-v']){const l=level();l.cells[8*100+12]=kind;const s=create(l),b=s.items[0];assert.equal(b.kind,kind);const start=b.y;tick(s,{},30);assert.ok(b.y>start+.7);tick(s,{},200);assert.ok(Math.abs(b.y+b.h-20)<.001);respawn(s);assert.equal(s.items[0].y,start);}
});
test('flagpole has a small round ball at its exact top, drawn with ordinary 2D',()=>{
 const circles=[],scene={fill(){},sprite(){},dustParticle(...a){circles.push(a);}};drawGoal(scene,flat(),95,19,100,700,48,0,false);assert.equal(circles.length,2);assert.equal(circles[0][0],124);assert.equal(circles[0][1],268);assert.ok(circles[0][2]<10);
});
