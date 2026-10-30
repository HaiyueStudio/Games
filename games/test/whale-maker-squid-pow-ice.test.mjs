import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){try{return next(s,c);}catch(e){if(s.startsWith('.')&&c.parentURL?.includes('/whale-maker/'))return next(s+'.ts',c);throw e;}}});
const {create,step,EMPTY_INPUT,respawn}=await import('../whale-maker/rules/model.ts');
const {makeEnemy,makeItem,updateSpecialEnemy}=await import('../whale-maker/rules/expansion.ts');
const {grantPower}=await import('../whale-maker/rules/power.ts');
const tick=(s,i={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...i});};
function level(surface='#'){const width=100,height=32,cells=Array(width*height).fill('.');for(let y=26;y<height;y++)for(let x=0;x<width;x++)cells[y*width+x]=y===26?surface:'#';cells[25*width+95]='E';return {version:1,name:'squid pow ice',width,height,cells,spawn:[2,25.2],properties:{},contents:{}};}
const swimMove={move(_s,b,dt){b.x+=b.vx*dt;b.y+=b.vy*dt;return {floor:false,wall:0,slope:0};}};
function squid(){const s=create(level());s.player.x=35;s.player.y=29;const e=makeEnemy('squid',20,18);s.enemies=[e];return {s,e};}
function cycle(s,e,phase,dt=1/120){let n=0;while((e.squidPhase??'rise')===phase&&n++<2000)updateSpecialEnemy(s,e,dt,swimMove);assert.ok(n<2000);return n;}

test('squid ascends exactly five tiles and drifts at most four toward a distant player in both directions',()=>{
 for(const dir of [-1,1])for(const dt of [1/120,1/60,.013]){const {s,e}=squid();s.player.x=e.x+dir*20;const start={...e};cycle(s,e,'rise',dt);assert.equal(e.squidPhase,'sink');assert.ok(Math.abs(start.y-e.y-5)<1e-8);assert.ok(Math.abs(Math.abs(e.x-start.x)-4)<1e-8);assert.equal(Math.sign(e.x-start.x),dir);assert.equal(e.vx,0);assert.equal(e.vy,1.05);}
});
test('nearby squid aligns with player centre without overshooting or spending more drift if the player crosses',()=>{
 const {s,e}=squid();s.player.x=e.x+1;const centre=s.player.x+s.player.w/2;cycle(s,e,'rise');assert.ok(Math.abs(e.x+e.w/2-centre)<1e-8);
 const b=squid();const start=b.e.x;for(let n=0;n<60;n++){b.s.player.x=n<25?45:2;updateSpecialEnemy(b.s,b.e,1/120,swimMove);}assert.ok(b.e.squidDrift<=4+1e-8);assert.ok(Math.abs(b.e.x-start)<=4+1e-8);
});
test('squid descent keeps x fixed, approaches player height and never exceeds six tiles',()=>{
 for(const offset of [2,4,20]){const {s,e}=squid();cycle(s,e,'rise');const peak=e.y,x=e.x;s.player.y=peak+offset+e.h/2-s.player.h/2;const n=cycle(s,e,'sink');assert.ok(n>120);assert.equal(e.x,x);assert.ok(Math.abs(e.y-peak-Math.min(6,offset))<1e-8);assert.equal(e.squidPhase,'rise');}
});
test('squid sinks exactly one tile when the player is above, including a mid-descent move',()=>{
 for(const during of [false,true]){const {s,e}=squid();cycle(s,e,'rise');const peak=e.y,x=e.x;if(during)for(let n=0;n<40;n++)updateSpecialEnemy(s,e,1/120,swimMove);s.player.y=peak-4;cycle(s,e,'sink');assert.equal(e.x,x);assert.ok(Math.abs(e.y-peak-1)<1e-8);}
});
test('each squid ascent resets its five-tile rise and four-tile tracking budgets',()=>{
 const {s,e}=squid();for(let n=0;n<4;n++){s.player.x=e.x+15;s.player.y=e.y+20;const y=e.y,x=e.x;cycle(s,e,'rise');assert.ok(Math.abs(y-e.y-5)<1e-8);assert.ok(Math.abs(e.x-x-4)<1e-8);cycle(s,e,'sink');}
});
function head(s,centre=10.5){Object.assign(s.player,{x:centre-s.player.w/2,y:23.04,vx:0,vy:-8});s.grounded=false;s.coyote=0;s.previous={...EMPTY_INPUT};tick(s,{jump:true});}
function powCourse(t='B'){const l=level();l.cells[22*l.width+10]=t;l.contents[22*l.width+10]='empty';l.cells[21*l.width+10]='pow';return l;}
test('bumping a POW support brick detonates it once for small, tall and helmeted players',()=>{
 for(const form of ['small','tall','helmet'])for(const t of ['B','?']){const s=create(powCourse(t)),pow=s.items[0];if(form==='tall')grantPower(s,1);if(form==='helmet')s.helmet=true;const ground=makeEnemy('duck',16,25),air=makeEnemy('duck',19,15),far=makeEnemy('duck',80,25);ground.vx=air.vx=far.vx=0;s.enemies=[ground,air,far];s.view={x:0,y:14,w:26,h:12};head(s);assert.equal(pow.alive,false,form+t);assert.equal(ground.alive,false);assert.ok(air.alive&&far.alive);assert.ok(s.shake>0);assert.equal(s.events.filter(e=>e.kind==='pow').length,1);tick(s,{},30);assert.equal(s.events.filter(e=>e.kind==='pow').length,1);}
});
test('a seam hit detonates a straddling POW once; adjacent, held and rising POWs remain intact',()=>{
 const s=create(powCourse());s.level.cells[22*100+11]='B';s.items[0].x=10.5;head(s,11);assert.equal(s.events.filter(e=>e.kind==='pow').length,1);
 for(const mode of ['adjacent','held','rising']){const a=create(powCourse()),pow=a.items[0];if(mode==='adjacent')pow.x=11;if(mode==='held'){pow.held=true;a.held=pow;}if(mode==='rising')pow.vy=-3;head(a);assert.ok(pow.alive,mode);}
});
test('only the rising brick reaching a POW can trigger it, and retry restores the supported block',()=>{
 const s=create(powCourse()),pow=s.items[0];pow.y=20.84;head(s);assert.ok(pow.alive);tick(s,{},12);assert.equal(pow.alive,false);s.phase='dead';respawn(s);assert.equal(s.items[0].kind,'pow');assert.ok(s.items[0].alive);assert.equal(s.items[0].y,21);assert.equal(s.level.cells[22*100+10],'B');
});
function brake(surface,mode,dir=1,disabled=false){const s=create(level(surface));if(disabled)for(let x=0;x<100;x++)s.level.properties[26*100+x]={slippery:false};s.player.x=40;tick(s);s.player.vx=dir*(mode==='walk'||mode==='crouch'?5.5:8.5);const start=s.player.x,i=mode==='crouch'||mode==='run-crouch'?{axis:dir,down:true}:mode==='reverse'?{axis:-dir}:{};let n=0;while(Math.abs(s.player.vx)>1e-9&&n++<600)tick(s,i);assert.equal(s.player.vx,0);return Math.abs(s.player.x-start);}
test('ice braking distances double again for release, crouch and reverse in either direction',()=>{
 for(const dir of [-1,1])for(const mode of ['walk','run','crouch','run-crouch','reverse']){const normal=brake('#',mode,dir),ice=brake('ice',mode,dir);assert.ok(Math.abs(ice-normal*4)<1e-7,`${dir} ${mode}: ${normal} ${ice}`);assert.ok(Math.abs(brake('ice',mode,dir,true)-normal)<1e-7);}
});
