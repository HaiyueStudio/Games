import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&context.parentURL?.includes('/whale-maker/'))return next(specifier+'.ts',context);throw error;}}});
const {create,demo,step,respawn,EMPTY_INPUT,WALK_SPEED,RUN_SPEED,DUST_DURATION}=await import('../whale-maker/rules/model.ts');
const {makeItem}=await import('../whale-maker/rules/expansion.ts');
const {dustPose}=await import('../whale-maker/rendering/poses.ts');
const tick=(s,input={},n=1)=>{for(let k=0;k<n;k++)step(s,{...EMPTY_INPUT,...input});};
function flat(direction=1,power=0){const l=demo();l.cells.fill('.');delete l.contents;l.properties={};for(let y=15;y<l.height;y++)for(let x=0;x<l.width;x++)l.cells[y*l.width+x]='#';l.cells[14*l.width+95]='E';const s=create(l);s.power=power;Object.assign(s.player,{x:30,y:15-(power?1.4:.8),h:power?1.4:.8});s.grounded=true;s.facing=direction;return s;}

test('walking accelerates continuously to its cap in both directions and then covers equal distances',()=>{
 for(const direction of [-1,1]){const s=flat(direction),speeds=[];for(let n=0;n<24;n++){tick(s,{axis:direction});speeds.push(Math.abs(s.player.vx));}assert.ok(speeds[0]>0&&speeds[0]<1);assert.ok(speeds[5]<speeds[11]&&speeds[11]<WALK_SPEED);assert.equal(speeds.at(-1),WALK_SPEED);const x=s.player.x;tick(s,{axis:direction},30);const distance=Math.abs(s.player.x-x),next=s.player.x;tick(s,{axis:direction},30);assert.ok(Math.abs(Math.abs(s.player.x-next)-distance)<1e-8);assert.equal(s.running,false);assert.ok(s.stride>0);}
});

test('holding Shift accelerates from walking into a faster capped run, and releasing returns to walking',()=>{
 for(const direction of [-1,1]){const s=flat(direction);tick(s,{axis:direction},30);tick(s,{axis:direction,grab:true});assert.ok(Math.abs(s.player.vx)>WALK_SPEED&&Math.abs(s.player.vx)<RUN_SPEED);tick(s,{axis:direction,grab:true},40);assert.equal(s.player.vx,direction*RUN_SPEED);assert.equal(s.running,true);tick(s,{axis:direction},30);assert.equal(s.player.vx,direction*WALK_SPEED);assert.equal(s.running,false);tick(s,{},90);assert.equal(s.player.vx,0);}
});

test('a crouch from a run glides forward and decelerates monotonically to rest, even while holding forward',()=>{
 for(const direction of [-1,1])for(const power of [0,1]){const s=flat(direction,power);tick(s,{axis:direction,grab:true},45);const x=s.player.x,feet=s.player.y+s.player.h;tick(s,{axis:direction,grab:true,down:true});assert.equal(s.skidding,true);assert.equal(s.crouching,true);assert.ok(Math.abs(s.player.vx)>RUN_SPEED-1);assert.ok(Math.abs(s.player.y+s.player.h-feet)<1e-8);let speed=Math.abs(s.player.vx);for(let n=0;n<120;n++){tick(s,{axis:direction,grab:true,down:true});assert.ok(Math.abs(s.player.vx)<=speed+1e-8);speed=Math.abs(s.player.vx);}assert.equal(s.player.vx,0);const distance=direction*(s.player.x-x);assert.ok(distance>2.5&&distance<3.5);const stopped=s.player.x;tick(s,{axis:direction,grab:true,down:true},30);assert.equal(s.player.x,stopped);tick(s,{axis:direction,grab:true});assert.equal(s.skidding,false);assert.equal(s.crouching,false);assert.ok(direction*s.player.vx>0);}
});

test('jumping, releasing crouch, and hitting a wall interrupt the crouch slide without tunneling',()=>{
 for(const action of ['jump','release','wall']){const s=flat();tick(s,{axis:1,grab:true},45);tick(s,{down:true});assert.equal(s.skidding,true);if(action==='jump'){tick(s,{down:true,jump:true});assert.equal(s.skidding,false);assert.ok(s.player.vy<0);}else if(action==='release'){tick(s,{axis:-1});assert.equal(s.skidding,false);assert.equal(s.crouching,false);}else{const wall=Math.ceil(s.player.x+s.player.w)+1;for(let y=10;y<15;y++)s.level.cells[y*s.level.width+wall]='#';tick(s,{down:true},120);assert.equal(s.player.vx,0);assert.ok(s.player.x+s.player.w<=wall+1e-8);assert.equal(s.skidding,false);}}
});

test('the run key still carries and throws objects, including throughout a crouch slide',()=>{
 const s=flat(),spring=makeItem('spring-v',30,14);spring.cooldown=0;s.items=[spring];tick(s,{grab:true});assert.equal(s.held,spring);tick(s,{axis:1,grab:true},45);assert.equal(s.running,true);assert.equal(s.held,spring);tick(s,{axis:1,grab:true,down:true},20);assert.equal(s.skidding,true);assert.equal(s.held,spring);assert.ok(Math.abs(spring.x+spring.w/2-(s.player.x+s.player.w/2+s.facing*.6))<1e-8);tick(s,{down:true,fire:true});assert.equal(s.held,null);assert.equal(spring.thrown,true);assert.ok(spring.vx>0);
});

test('dust follows actual grounded movement, is denser while skidding, and is bounded and deterministic',()=>{
 const a=flat(),b=flat();tick(a,{axis:1,grab:true},45);tick(b,{axis:1,grab:true},45);assert.deepEqual(a,b);assert.ok(a.dust.length>0);assert.ok(a.dust.every(p=>p.y>14.9&&p.y<15.1));const runSize=Math.max(...a.dust.map(p=>p.size));tick(a,{down:true},18);assert.ok(a.dust.some(p=>p.size>runSize));assert.ok(a.dust.length<=24);const count=a.dust.length;tick(a,{down:true,jump:true},6);assert.ok(a.dust.length<=count);tick(a,{},240);assert.equal(a.dust.length,0);assert.equal(a.dustWait,0);
 const wall=flat();for(let y=10;y<15;y++)wall.level.cells[y*wall.level.width+31]='#';tick(wall,{axis:1,grab:true},180);assert.equal(wall.player.vx,0);assert.equal(wall.dust.length,0);
 const water=flat();for(let y=10;y<15;y++)for(let x=20;x<50;x++)water.level.cells[y*water.level.width+x]='water';tick(water,{axis:1,grab:true},90);assert.equal(water.swimming,true);assert.equal(water.running,false);assert.equal(water.dust.length,0);
});

test('dust expands, rises and fades through transit, while retry clears movement effects',()=>{
 const start=dustPose(0),middle=dustPose(DUST_DURATION/2),end=dustPose(DUST_DURATION);assert.ok(middle.scale>start.scale);assert.ok(middle.lift>start.lift);assert.ok(middle.opacity<start.opacity);assert.equal(end.opacity,0);
 for(const travel of ['door','pipe']){const s=flat();tick(s,{axis:1,grab:true},45);assert.ok(s.dust.length);if(travel==='door')s.door={age:0,from:[30,14.2],to:[50,14.2],source:0,target:1};else s.pipe={age:0,from:[30,14.2],to:[50,14.2]};tick(s,{},65);assert.equal(s.dust.length,0);assert.equal(s.running,false);assert.equal(s.skidding,false);respawn(s);assert.equal(s.dust.length,0);assert.equal(s.dustWait,0);assert.equal(s.stride,0);assert.equal(s.player.vx,0);}
});
