import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&context.parentURL?.includes('/whale-maker/'))return next(specifier+'.ts',context);throw error;}}});
const {create,demo,step,validate,EMPTY_INPUT,respawn,blockOffset,tile,CHEER_DURATION,FLAG_WOBBLE_DURATION}=await import('../whale-maker/rules/model.ts');
const {objectCells,selectBox,clearCells,moveSelection,stampSelection,pasteStamp}=await import('../whale-maker/editor/selection.ts');
const {placePipe}=await import('../whale-maker/rules/levels.ts');
const {actorRect,walkFrame,spinFrame,shootFrame,coinFrame,eatFrame,biteFlight,checkpointFrame,flagWobble,checkpointRect,cheerFrame,cheerOffset}=await import('../whale-maker/rendering/poses.ts');
const tick=(s,input={},n=1)=>{for(let j=0;j<n;j++)step(s,{...EMPTY_INPUT,...input});};
test('whale maker deterministic fixed-step movement and jump',()=>{const a=create(demo()),b=create(demo());tick(a,{},120);tick(b,{},120);assert.deepEqual(a,b);assert.equal(a.grounded,true);const y=a.player.y;tick(a,{jump:true},10);assert.ok(a.player.y<y-.4);});
test('growth and fire collectible change power; fire produces bounded projectiles',()=>{const s=create(demo(1));s.player.x=5;s.player.y=14;tick(s);assert.equal(s.power,1);s.player.x=17;s.player.y=9;tick(s);assert.equal(s.power,2);tick(s,{fire:true});assert.equal(s.pendingShot,true);assert.equal(s.shots.length,0);tick(s,{fire:true},8);assert.equal(s.shots.length,1);tick(s,{fire:true},20);assert.ok(s.shots.length<=1);});
test('turtle stomp makes shell, holding and firing throws it',()=>{const s=create(demo());s.enemies=[{x:3,y:14.2,w:.8,h:.8,vx:0,vy:0,kind:'turtle',alive:true,held:false,cooldown:0}];s.player.x=3;s.player.y=13.35;s.player.vy=5;tick(s,{},5);const e=s.enemies[0];assert.equal(e.kind,'shell');e.cooldown=0;s.player.x=e.x-.3;s.player.y=e.y;s.player.vy=0;tick(s,{grab:true});assert.equal(s.held,e);tick(s,{fire:true});assert.equal(s.held,null);assert.ok(Math.abs(e.vx)>5);});
function carryShellFixture(direction=1,kind='duck',distance=1.2,reverse=false){
    const s=flat();Object.assign(s.player,{x:8,y:14.2,vx:0,vy:0});s.facing=direction;
    const shell={x:8,y:14.5,w:.8,h:.5,vx:0,vy:0,kind:'shell',alive:true,held:true,cooldown:0};
    const enemy={x:8+s.player.w/2+direction*distance-.4,y:14.2,w:.8,h:.8,vx:0,vy:0,kind,alive:true,held:false,cooldown:0};
    s.enemies=reverse?[enemy,shell]:[shell,enemy];s.held=shell;return {s,shell,enemy};
}
test('carried shell trades with a touching front enemy in either direction and either array order',()=>{
    for(const direction of [-1,1])for(const kind of ['duck','turtle','shell','spiky','plant','fish','squid'])for(const reverse of [false,true]){
        const {s,shell,enemy}=carryShellFixture(direction,kind,1.2,reverse);tick(s,{grab:true,axis:direction});
        assert.equal(shell.alive,false,`${direction} ${kind}: held shell is consumed`);assert.equal(enemy.alive,false);assert.equal(s.held,null);assert.equal(shell.held,false);assert.equal(s.phase,'playing');assert.equal(s.deaths,0);assert.equal(s.invincible,0);assert.equal(s.defeated.length,2);assert.ok(s.defeated.every(e=>e.cause==='shell'));
    }
});
test('held shell contact resolves before player damage and produces two bounded defeat effects once',()=>{
    for(const direction of [-1,1]){
        const {s,shell,enemy}=carryShellFixture(direction,'duck',.5);tick(s,{grab:true});
        assert.equal(s.phase,'playing');assert.equal(s.power,0);assert.equal(s.held,null);assert.equal(shell.alive,false);assert.equal(enemy.alive,false);
        const coins=s.coins;tick(s,{grab:true},12);assert.equal(s.defeated.length,2);assert.ok(s.defeated.every(e=>e.y<14.2&&e.angle!==0));assert.equal(s.coins,coins);
        tick(s,{grab:true},100);assert.equal(s.defeated.length,0);assert.equal(s.coins,coins);assert.equal(s.held,null);
    }
});
test('carried shells do not shield the back or attack enemies outside their actual bounds',()=>{
    for(const direction of [-1,1]){
        const rear=carryShellFixture(direction,'duck',-.5);tick(rear.s,{grab:true});assert.equal(rear.s.phase,'dead');assert.equal(rear.enemy.alive,true);assert.equal(rear.shell.alive,true);assert.equal(rear.s.defeated.length,0);
        const miss=carryShellFixture(direction,'duck',1.9);tick(miss.s,{grab:true});assert.equal(miss.shell.alive,true);assert.equal(miss.enemy.alive,true);assert.equal(miss.s.held,miss.shell);assert.equal(miss.s.defeated.length,0);
    }
});
test('retracted pipe plants do not consume a carried shell',()=>{
    const {s,shell,enemy}=carryShellFixture(1,'plant');enemy.mode='pipe';enemy.origin=[enemy.x,14.5];enemy.age=0;tick(s,{grab:true});assert.ok(enemy.h<.08);assert.equal(shell.alive,true);assert.equal(enemy.alive,true);assert.equal(s.held,shell);assert.equal(s.defeated.length,0);
});
test('fast shells break side bricks in both directions, emit fragments once, and rebound',()=>{
    for(const direction of [-1,1]) {
        const s=flat();s.level.cells[14*s.level.width+6]='B';const e={x:direction>0?5.17:7.03,y:14.5,w:.8,h:.5,vx:direction*12,vy:0,kind:'shell',alive:true,held:false,cooldown:1};s.enemies=[e];
        tick(s);assert.equal(tile(s.level,6,14),'.');assert.equal(s.fragments.length,4);assert.equal(e.vx,-direction*12);assert.equal(s.coins,0);assert.ok(Math.abs(e.x-(direction>0?5.2:7))<1e-10);
        tick(s,{},6);assert.equal(s.fragments.length,4,'one collision emits only one fragment group');assert.equal(e.alive,true);
    }
    const seam=flat();seam.level.cells[13*seam.level.width+6]='B';seam.level.cells[14*seam.level.width+6]='B';seam.enemies=[{x:5.17,y:13.75,w:.8,h:.5,vx:12,vy:0,kind:'shell',alive:true,held:false,cooldown:1}];tick(seam);
    assert.deepEqual([tile(seam.level,6,13),tile(seam.level,6,14)],['.','.']);assert.equal(seam.fragments.length,8);
});
test('shell brick breaking requires a fast unheld shell and preserves other solid tile types',()=>{
    for(const [kind,speed] of [['shell',0],['shell',2],['duck',12],['turtle',12]]) {
        const s=flat();s.level.cells[14*s.level.width+6]='B';s.enemies=[{x:5.17,y:14.5,w:.8,h:.5,vx:speed,vy:0,kind,alive:true,held:false,cooldown:1}];tick(s,{},4);assert.equal(tile(s.level,6,14),'B');assert.equal(s.fragments.length,0);
    }
    for(const type of ['#','?','U','P','Q','p','q']) {
        const s=flat();s.level.cells[14*s.level.width+6]=type;const e={x:5.17,y:14.5,w:.8,h:.5,vx:12,vy:0,kind:'shell',alive:true,held:false,cooldown:1};s.enemies=[e];tick(s);
        assert.equal(tile(s.level,6,14),type);assert.equal(e.vx,-12);assert.equal(s.fragments.length,0);assert.equal(s.rewards.length,0);
    }
    const held=flat();held.level.cells[14*held.level.width+6]='B';held.enemies=[{x:5.17,y:14.5,w:.8,h:.5,vx:12,vy:0,kind:'shell',alive:true,held:true,cooldown:1}];tick(held);assert.equal(tile(held.level,6,14),'B');
    const floor=flat();floor.level.cells[15*floor.level.width+6]='B';floor.enemies=[{x:6,y:14.5,w:.8,h:.5,vx:12,vy:0,kind:'shell',alive:true,held:false,cooldown:1}];tick(floor);assert.equal(tile(floor.level,6,15),'B');assert.equal(floor.fragments.length,0);
});
test('wall jump, spinning and fast fall',()=>{const s=create(demo());s.wall=1;s.player.y=5;tick(s,{jump:true});assert.ok(s.player.vx<0&&s.player.vy<0);s.grounded=true;tick(s,{spin:true});assert.equal(s.spinning,true);tick(s,{down:true},30);assert.ok(s.player.vy>0);});
test('validation rejects malformed levels, requires exit, and copies input',()=>{const l=demo();assert.deepEqual(validate(l),l);assert.notEqual(validate(l),l);assert.throws(()=>validate({...l,width:Infinity}));assert.throws(()=>validate({...l,cells:l.cells.map(()=>'.')}));assert.throws(()=>validate({...l,spawn:[NaN,0]}));});
test('fall dies, restart uses checkpoint and victory detects portal',()=>{const s=create(demo());s.player.y=22;tick(s);assert.equal(s.phase,'dead');respawn(s);assert.equal(s.phase,'playing');s.player.x=199;s.player.y=14;tick(s);assert.equal(s.phase,'won');});
test('held jump reaches the tutorial cloud four tiles above the floor',()=>{const s=create(demo(1));s.player.x=8;tick(s,{},120);assert.equal(s.grounded,true);tick(s,{jump:true},120);assert.equal(s.grounded,true);assert.ok(s.player.y+s.player.h<=11.02);});

function flat(){const level=demo();level.cells=level.cells.map((_,i)=>Math.floor(i/level.width)>=15?'#':'.');level.cells[14*level.width+95]='E';delete level.contents;const s=create(level);tick(s,{},120);return s;}
test('ground movement accelerates briefly to a steady walk, brakes to exact rest, and reverses direction',()=>{const s=flat();tick(s,{axis:1},6);const first=s.player.vx;assert.ok(first>0&&first<5.5);tick(s,{axis:1},6);assert.ok(s.player.vx>first&&s.player.vx<5.5);tick(s,{axis:1},12);assert.equal(s.player.vx,5.5);tick(s,{axis:1},12);assert.equal(s.player.vx,5.5);const x=s.player.x;tick(s,{},90);assert.equal(s.player.vx,0);assert.ok(Math.abs(s.player.x-x-1.5)<.001);tick(s,{},120);assert.equal(s.player.vx,0);tick(s,{axis:1},24);tick(s,{axis:-1},12);assert.ok(s.player.vx<0);assert.equal(s.player.y,14.2);});
test('tap and held jumps have distinct heights; holding never auto-bounces on landing',()=>{const short=flat(),long=flat();let shortTop=short.player.y,longTop=long.player.y;for(let n=0;n<180;n++){tick(short,{jump:n<2});tick(long,{jump:true});shortTop=Math.min(shortTop,short.player.y);longTop=Math.min(longTop,long.player.y);}assert.ok(shortTop-longTop>1.5);assert.ok(longTop<10.3);assert.equal(long.grounded,true);assert.equal(long.player.vy,0);});
test('landing buffer preserves spin even after the button has been released',()=>{const s=flat();s.player.y=14;s.player.vy=5;s.grounded=false;s.coyote=0;tick(s,{spin:true});let spun=false;for(let n=0;n<15;n++){tick(s);if(s.spinning&&s.player.vy<0)spun=true;}assert.ok(spun);});
test('wall kick retains an outward impulse while still holding toward the wall',()=>{const s=flat();for(let y=6;y<15;y++)s.level.cells[y*s.level.width+8]='B';s.player.x=8-s.player.w;s.player.y=11;s.player.vy=1;s.grounded=false;s.coyote=0;tick(s,{axis:1},4);assert.equal(s.wall,1);const x=s.player.x;tick(s,{axis:1,jump:true});tick(s,{axis:1,jump:true},14);assert.ok(s.player.x<x-.7);assert.ok(s.player.vx<0);assert.ok(s.player.vy<0);});
test('air down press cancels ascent and begins fast falling',()=>{const s=flat();tick(s,{jump:true},12);assert.ok(s.player.vy<0);tick(s,{down:true});assert.equal(s.pound,'flip');assert.equal(s.player.vy,0);tick(s,{down:true},26);assert.ok(s.player.vy>=14);});

test('small head bump animates intact brick; powered head bump breaks it into bounded fragments',()=>{for(const power of [0,1]){const s=flat();s.level.cells[12*s.level.width+5]='B';s.power=power;s.player.x=5.15;s.player.y=13.1;s.player.h=power?2:.8;s.player.vy=-8;s.grounded=false;tick(s,{jump:true},4);assert.equal(tile(s.level,5,12),power?'.':'B');assert.equal(s.bumps.length,1);assert.ok(blockOffset(.12)<-.2);assert.equal(s.fragments.length,power?4:0);tick(s,{},120);assert.equal(s.bumps.length,0);assert.equal(s.fragments.length,0);}});
function headBumpFixture(power=0,type='B'){
    const s=flat();s.level.cells[12*s.level.width+5]=type;s.level.contents={[12*s.level.width+5]:'empty'};s.power=power;
    Object.assign(s.player,{x:5.15,y:13.04,h:power?1.4:.8,vx:0,vy:-8});s.grounded=false;s.coyote=0;return s;
}
test('head bumps defeat enemies standing on intact, breaking and reward bricks',()=>{
    for(const power of [0,1,2])for(const type of ['B','?'])for(const kind of ['duck','turtle','shell','spiky','plant','fish','squid']){
        const s=headBumpFixture(power,type),e={x:5.1,y:11.2,w:.8,h:.8,vx:0,vy:0,kind,alive:true,held:false,cooldown:0};s.enemies=[e];tick(s,{jump:true});
        assert.equal(e.alive,false,`${power} ${type} ${kind}`);assert.equal(s.defeated.length,1);assert.equal(s.defeated[0].cause,'block');assert.equal(s.coins,1);assert.equal(s.power,power);assert.equal(s.phase,'playing');assert.equal(tile(s.level,5,12),type==='?'?'U':power?'.':'B');assert.equal(s.fragments.length,type==='B'&&power?4:0);
        const y=s.defeated[0].y;tick(s,{jump:true},12);assert.ok(s.defeated[0].y<y);assert.notEqual(s.defeated[0].angle,0);tick(s,{},100);assert.equal(s.defeated.length,0);assert.equal(s.coins,1);
    }
});
test('a seam bump defeats enemies on either contacted brick once, including a straddling enemy',()=>{
    for(const power of [0,1]){
        const s=headBumpFixture(power);s.level.cells[12*s.level.width+6]='B';s.player.x=6-s.player.w/2;
        s.enemies=[5.1,6.1,5.6,7].map(x=>({x,y:11.2,w:.8,h:.8,vx:0,vy:0,kind:'duck',alive:true,held:false,cooldown:0}));tick(s,{jump:true});
        assert.deepEqual(s.enemies.map(e=>e.alive),[false,false,false,true]);assert.equal(s.defeated.length,3);assert.equal(s.coins,3);assert.equal(s.bumps.length,2);tick(s,{},5);assert.equal(s.defeated.length,3);assert.equal(s.coins,3);
    }
});
test('block bumps exclude adjacent, airborne, held, dead and retracted enemies and inert blocks',()=>{
    for(const fields of [{x:6},{x:4.2},{y:10.8},{y:11.19,vy:-2},{held:true,kind:'shell'},{alive:false},{kind:'plant',h:.015,y:11.985,mode:'pipe',age:0,origin:[5.1,12]}]){
        const s=headBumpFixture(),e={x:5.1,y:11.2,w:.8,h:.8,vx:0,vy:0,kind:'duck',alive:true,held:false,cooldown:0,...fields};s.enemies=[e];if(e.held)s.held=e;tick(s,{jump:true,grab:true});assert.equal(e.alive,fields.alive!==false);assert.equal(s.defeated.length,0);assert.equal(s.coins,0);
    }
    for(const type of ['U','#']){const s=headBumpFixture(0,type),e={x:5.1,y:11.2,w:.8,h:.8,vx:0,vy:0,kind:'duck',alive:true,held:false,cooldown:0};s.enemies=[e];tick(s,{jump:true});assert.equal(e.alive,true);assert.equal(s.defeated.length,0);assert.equal(s.bumps.length,0);}
});
test('used treasure blocks cannot grant the same upgrade twice',()=>{const s=flat();s.player.x=5.15;s.player.y=13.1;s.player.vy=-8;s.grounded=false;s.level.cells[12*s.level.width+5]='?';tick(s,{jump:true},4);assert.equal(tile(s.level,5,12),'U');assert.equal(s.power,0);assert.equal(s.rewards.length,1);assert.equal(s.rewards[0].kind,'growth');});
test('a seam head impact bumps both contacted bricks and breaks both in powered forms',()=>{
    for(const power of [0,1,2])for(const center of [5.9,6,6.1])for(const action of ['jump','spin']) {
        const s=flat();s.level.cells[12*s.level.width+5]='B';s.level.cells[12*s.level.width+6]='B';s.power=power;
        Object.assign(s.player,{x:center-s.player.w/2,y:13.04,h:power?1.4:.8,vx:0,vy:-8});s.grounded=false;s.coyote=0;
        tick(s,{[action]:true});assert.deepEqual(s.bumps.map(b=>[b.x,b.y]),[[5,12],[6,12]]);
        assert.deepEqual([tile(s.level,5,12),tile(s.level,6,12)],power?['.','.']:['B','B']);
        assert.equal(s.fragments.length,power?8:0);assert.equal(s.player.y,13);assert.equal(s.player.vy,0);
        tick(s,{[action]:true},5);assert.equal(s.bumps.length,2);assert.equal(s.fragments.length,power?8:0);
    }
});
test('both treasure blocks at a seam independently release their configured contents once',()=>{
    const s=flat(),left=12*s.level.width+5,right=left+1;s.level.cells[left]='?';s.level.cells[right]='?';s.level.contents={[left]:'coin',[right]:'duck'};
    Object.assign(s.player,{x:6-s.player.w/2,y:13.04,vx:0,vy:-8});s.grounded=false;s.coyote=0;
    tick(s,{jump:true});assert.deepEqual([s.level.cells[left],s.level.cells[right]],['U','U']);assert.deepEqual(s.level.contents,{});
    assert.deepEqual(s.rewards.map(r=>[r.kind,r.x]),[['coin',5.1],['duck',6.1]]);assert.equal(s.bumps.length,2);
    Object.assign(s.player,{y:13.04,vy:-8});tick(s,{jump:true},4);assert.equal(s.rewards.length,2,'used blocks do not duplicate their contents');
});
test('head contacts exclude unoverlapped neighbours and still activate beside ordinary solid tiles',()=>{
    for(const center of [5.5,5.54,6.46,6.5]) {
        const s=flat();s.level.cells[12*s.level.width+5]='?';s.level.cells[12*s.level.width+6]='?';
        Object.assign(s.player,{x:center-s.player.w/2,y:13.04,vx:0,vy:-8});s.grounded=false;s.coyote=0;tick(s);
        const hit=Math.floor(center);assert.deepEqual(s.bumps.map(b=>b.x),[hit]);assert.equal(tile(s.level,hit,12),'U');assert.equal(tile(s.level,hit===5?6:5,12),'?');
    }
    for(const neighbour of ['#','U','B']) {
        const s=flat();s.level.cells[12*s.level.width+5]=neighbour;s.level.cells[12*s.level.width+6]='?';s.power=1;
        Object.assign(s.player,{x:6-s.player.w/2,y:13.04,h:1.4,vx:0,vy:-8});s.grounded=false;s.coyote=0;tick(s);
        assert.equal(tile(s.level,6,12),'U');assert.equal(s.rewards.length,1);assert.equal(s.fragments.length,neighbour==='B'?4:0);
    }
});
test('failure has a frozen windup, upward hop, downward fall and no horizontal control',()=>{const s=flat();s.level.cells[14*s.level.width+3]='^';s.player.x=3;tick(s);assert.equal(s.phase,'dead');const x=s.player.x,y=s.player.y;tick(s,{axis:1},15);assert.equal(s.player.y,y);tick(s,{axis:1},35);assert.ok(s.player.y<y);tick(s,{axis:1},100);assert.ok(s.player.y>y);assert.equal(s.player.x,x);assert.ok(s.deathAge>1);});
test('1-1 course includes progressive pipe heights, pits, brick runs, staircase and bonus warp round trip',()=>{const l=demo();assert.equal(l.width,240);assert.equal(tile(l,28,13),'P');assert.equal(tile(l,38,12),'P');assert.equal(tile(l,46,11),'P');assert.equal(tile(l,69,15),'.');assert.equal(tile(l,189,7),'B');assert.equal(tile(l,199,14),'E');assert.deepEqual(validate(l),l);const s=create(l);s.player.x=57.675;s.player.y=10.2;s.grounded=true;tick(s,{down:true});assert.ok(s.pipe);tick(s,{},120);assert.ok(s.player.x>224&&s.player.x<226);s.player.x=235.675;s.player.y=11.2;s.grounded=true;s.pipeWait=0;tick(s,{down:true});tick(s,{},120);assert.ok(s.player.x>163&&s.player.x<165);});
test('actor scaling preserves source ratio at every size and keeps the feet anchored',()=>{for(const source of [{width:300,height:180},{width:210,height:285}])for(const size of [46,50,80]){const r=actorRect(source,source,100,200,size);assert.ok(Math.abs(r.width/r.height-source.width/source.height)<1e-12);assert.equal(r.y+r.height,200);assert.equal(r.x+r.width/2,100);}assert.deepEqual([0,.13,.26,.39].map(t=>walkFrame(t,true)),[0,1,2,3]);assert.equal(walkFrame(10,false),0);});

test('ground crouch lowers collision with fixed feet, slows movement, and restores both body sizes',()=>{
    for(const power of [0,1,2]) {
        const s=flat();s.power=power;s.player.h=power?2:.8;s.player.y=15-s.player.h;
        const feet=s.player.y+s.player.h;tick(s,{down:true,axis:1},30);
        assert.equal(s.crouching,true);assert.equal(s.crouchAge,.12);assert.equal(s.player.h,power?.8:.55);
        assert.ok(Math.abs(s.player.y+s.player.h-feet)<1e-10);assert.equal(s.player.vx,1.6);
        tick(s,{},30);assert.equal(s.crouching,false);assert.equal(s.crouchAge,0);assert.equal(s.player.h,power?2:.8);
        assert.ok(Math.abs(s.player.y+s.player.h-feet)<1e-10);
    }
});
test('ceiling prevents standing until crouching player crawls out of the low space',()=>{
    const s=flat();s.power=1;s.player.x=5.1;s.player.h=1.4;s.player.y=13.6;tick(s,{down:true},20);
    s.level.cells[13*s.level.width+5]='B';tick(s,{},20);assert.equal(s.crouching,true);assert.equal(s.player.h,.8);
    tick(s,{axis:1},100);assert.ok(s.player.x>6);assert.equal(s.crouching,false);assert.equal(s.player.h,2);
});
test('crouch jump keeps tucked collision and ascent while a fresh air-down press still fast falls',()=>{
    const s=flat();tick(s,{down:true},20);tick(s,{down:true,jump:true});assert.equal(s.crouching,true);assert.ok(s.player.vy<0);assert.equal(s.player.h,.55);
    tick(s,{jump:true},4);assert.equal(s.crouching,false);assert.equal(s.player.h,.8);tick(s,{down:true});assert.equal(s.pound,'flip');assert.equal(s.player.vy,0);tick(s,{down:true},26);assert.ok(s.player.vy>=14);
});
test('flag victory slides, cheers twice, walks into the castle, ignores controls and resets',()=>{
    const s=flat();s.player.x=95;s.player.y=13.2;s.player.vx=5;tick(s);assert.equal(s.phase,'won');assert.equal(s.victory.stage,'slide');assert.ok(s.score>=100);tick(s);assert.equal(s.victory.stage,'cheer');
    const y=s.player.y,x=s.player.x,time=s.time;tick(s,{axis:1,down:true,jump:true,fire:true},58);assert.ok(s.player.y<y-1.5);assert.equal(s.player.x,x);assert.equal(s.time,time);assert.equal(s.crouching,false);
    tick(s,{},44);assert.ok(Math.abs(s.player.y-y)<1e-10);tick(s,{},39);assert.ok(s.player.y<y-.5);tick(s,{axis:-1,spin:true},400);assert.equal(s.player.y,14.2);assert.equal(s.player.vy,0);assert.ok(s.player.x>x+3);assert.equal(s.victory.stage,'done');
    respawn(s);assert.equal(s.victory,null);assert.equal(s.phase,'playing');assert.equal(s.score,0);
});
test('airborne contact with the exit lands before starting the celebration',()=>{
    const s=flat();s.player.x=95;s.player.y=12.5;s.grounded=false;tick(s);assert.equal(s.phase,'won');assert.equal(s.victory.ready,false);
    tick(s,{},30);assert.equal(s.victory.ready,true);assert.ok(Math.abs(s.victory.baseY-13.2)<1e-10);tick(s,{},200);assert.equal(s.player.y,s.victory.baseY);
});


function rewardBlock(content,power=0){const s=flat();s.level.cells[12*s.level.width+5]='?';s.level.contents={[12*s.level.width+5]:content};s.power=power;Object.assign(s.player,{x:5.15,y:13.1,vy:-8});s.grounded=false;tick(s,{jump:true},4);return s;}
test('block contents emerge before activation, growth requires collection, coin auto-scores once',()=>{
    const s=rewardBlock('growth');assert.equal(s.power,0);assert.equal(s.rewards[0].kind,'growth');assert.equal(s.level.contents[12*s.level.width+5],undefined);
    const y=s.rewards[0].y;tick(s,{},20);assert.ok(s.rewards[0].y<y);assert.equal(s.power,0);tick(s,{},30);
    const r=s.rewards[0];Object.assign(s.player,{x:r.x,y:r.y,vy:0});tick(s);assert.equal(s.power,1);assert.equal(s.rewards.length,0);
    const coin=rewardBlock('coin');tick(coin,{},120);assert.equal(coin.coins,1);assert.equal(coin.rewards.length,0);tick(coin,{},120);assert.equal(coin.coins,1);
    assert.equal(rewardBlock('auto',1).rewards[0].kind,'fire');assert.equal(rewardBlock('empty').rewards.length,0);
});
test('configured enemy blocks spawn animated enemies only after emergence',()=>{
    for(const kind of ['duck','turtle']){const s=rewardBlock(kind);assert.equal(s.enemies.length,0);tick(s,{},20);assert.equal(s.enemies.length,0);tick(s,{},30);assert.ok(s.enemies.some(e=>e.alive&&e.kind===kind));assert.equal(s.rewards.length,0);assert.equal(s.phase,'playing');}
    const fire=rewardBlock('fire');tick(fire,{},50);const r=fire.rewards[0];Object.assign(fire.player,{x:r.x,y:r.y,vy:0});tick(fire);assert.equal(fire.power,2);
});
test('stomp, projectile and shell defeat retain bounded timed visual effects and score once',()=>{
    const enemy=(kind='duck',x=5)=>({x,y:14.2,w:.8,h:.8,vx:0,vy:0,kind,alive:true,held:false,cooldown:0});
    const stomp=flat();stomp.enemies=[enemy()];Object.assign(stomp.player,{x:5,y:13.35,vy:5});tick(stomp,{},5);assert.equal(stomp.enemies[0].alive,false);assert.equal(stomp.defeated[0].cause,'stomp');assert.equal(stomp.coins,1);tick(stomp,{},100);assert.equal(stomp.defeated.length,0);assert.equal(stomp.coins,1);
    const shot=flat();shot.enemies=[enemy('turtle',8)];shot.shots=[{x:8,y:14.2,w:.28,h:.28,vx:0,vy:0}];tick(shot);assert.equal(shot.defeated[0].cause,'shot');const y=shot.defeated[0].y;tick(shot,{},12);assert.ok(shot.defeated[0].y<y);assert.notEqual(shot.defeated[0].angle,0);
    const shell=flat();shell.enemies=[{...enemy('shell',8),vx:12},enemy('duck',8.5)];tick(shell);assert.equal(shell.defeated[0].cause,'shell');assert.equal(shell.coins,2);
});
test('validation strictly checks question-block content and preserves JSON round trips',()=>{
    const l=demo(),id=11*l.width+16;l.contents[id]='duck';assert.deepEqual(validate(JSON.parse(JSON.stringify(l))),l);
    for(const contents of [{[id]:'unknown'},{'-1':'coin'},{0:'fire'},[],null])assert.throws(()=>validate({...l,contents}));
});
test('single and box selections treat pipes atomically; move, copy, paste and erase preserve contents',()=>{
    const l=flat().level;placePipe(l,10,12);l.cells[10*l.width+6]='?';l.contents={[10*l.width+6]:'turtle'};
    assert.equal(objectCells(l,11,14).length,6);const pipe=selectBox(l,[11,13],[11,13]);assert.equal(pipe.size,6);
    const selected=selectBox(l,[6,10],[11,14]);assert.equal(selected.size,7);const snapshot=structuredClone(l);assert.equal(moveSelection(l,selected,-20,0),null);assert.deepEqual(l,snapshot);
    const moved=moveSelection(l,selected,3,-2);assert.equal(moved.size,7);assert.equal(tile(l,9,8),'?');assert.equal(l.contents[8*l.width+9],'turtle');assert.equal(l.contents[10*l.width+6],undefined);assert.equal(tile(l,13,10),'P');
    const stamp=stampSelection(l,moved),pasted=pasteStamp(l,stamp,20,8);assert.equal(pasted.size,7);assert.equal(l.contents[8*l.width+20],'turtle');clearCells(l,pasted);assert.equal(l.contents[8*l.width+20],undefined);assert.equal(tile(l,24,11),'.');assert.deepEqual(validate(l),l);
});


function jumpHeight(heldFrames,spin=false){const s=flat(),base=s.player.y;let top=base;for(let n=0;n<220;n++){tick(s,spin?{spin:n<heldFrames}:{jump:n<heldFrames});top=Math.min(top,s.player.y);}assert.equal(s.grounded,true);return base-top;}
test('jump release duration gives a continuous monotonic range, including spin jumps',()=>{
    const heights=Array.from({length:60},(_,n)=>jumpHeight(n+1));
    assert.ok(heights[0]>1&&heights[0]<1.8);assert.ok(jumpHeight(120)>4.2);
    for(let n=1;n<heights.length;n++)assert.ok(heights[n]>heights[n-1]+.001,`distinct height at ${n+1} frames`);
    for(const n of [1,8,24,48,100])assert.ok(Math.abs(jumpHeight(n,true)-jumpHeight(n))<1e-10);
});
test('jump release does not snap velocity; pressing again in midair cannot renew lift',()=>{
    const s=flat();tick(s,{jump:true},8);const vy=s.player.vy;tick(s);assert.ok(s.player.vy<vy+1);assert.equal(s.jumpCut,true);
    const released=s.player.vy;tick(s,{jump:true});assert.ok(s.player.vy>released);assert.equal(s.jumpSustain,false);
});
function stompFixture(){const s=flat();s.enemies=[{x:5,y:14.2,w:.8,h:.8,vx:0,vy:0,kind:'duck',alive:true,held:false,cooldown:0}];Object.assign(s.player,{x:5,y:13.35,vy:5});s.grounded=false;s.coyote=0;return s;}
test('stomp supports held, buffered and grace-window jumps with no renewed midair jump',()=>{
    const automatic=stompFixture(),held=stompFixture(),buffered=stompFixture(),spin=stompFixture();
    tick(automatic,{},2);tick(held,{jump:true},2);tick(buffered,{jump:true});tick(buffered);tick(spin,{spin:true},2);
    assert.equal(automatic.enemies[0].alive,false);assert.ok(automatic.player.vy>-10);assert.ok(held.player.vy<-13);assert.ok(buffered.player.vy<-13);assert.equal(spin.spinning,true);assert.equal(spin.spinAge,0);
    const bounceVy=automatic.player.vy;tick(automatic,{jump:true});assert.ok(automatic.player.vy<bounceVy-5);assert.equal(automatic.coyote,0);
    tick(automatic);const released=automatic.player.vy;tick(automatic,{jump:true});assert.ok(automatic.player.vy>released);
    const base=held.player.y;let heldTop=base,bufferedTop=buffered.player.y;for(let n=0;n<120;n++){tick(held,{jump:true});tick(buffered);heldTop=Math.min(heldTop,held.player.y);bufferedTop=Math.min(bufferedTop,buffered.player.y);}assert.ok(bufferedTop-heldTop>2);
});
test('shooting windup releases one projectile in its captured direction and cancels on reset',()=>{
    const s=flat();s.power=2;s.facing=-1;tick(s,{fire:true});assert.equal(s.pendingShot,true);assert.equal(s.shootAge,0);assert.equal(s.shots.length,0);
    s.facing=1;tick(s,{},4);assert.equal(s.shots.length,0);tick(s,{},4);assert.equal(s.shots.length,1);assert.equal(s.shots[0].vx,-11);assert.equal(s.pendingShot,false);
    tick(s,{fire:true},60);assert.equal(s.shootAge,.24);assert.ok(s.shots.length<=2);respawn(s);assert.equal(s.pendingShot,false);assert.equal(s.spinAge,0);assert.equal(s.jumpCut,false);assert.equal(s.jumpSustain,false);
});
test('action frames cycle through four real turn views and three shooting phases for both characters',()=>{
    for(const character of [0,1]) {
        assert.deepEqual([0,.063,.126,.189,.251].map(t=>spinFrame(t,character)),[0,1,2,3,0].map(n=>n+character*4));
        assert.deepEqual([0,.06,.16].map(t=>shootFrame(t,character)),[8,9,10].map(n=>n+character*4));
    }
});


test('Token coin animation visits twelve painted half-turn views and wraps at twenty-four fps',()=>{
    assert.deepEqual(Array.from({length:13},(_,n)=>coinFrame(n/24+.0001)),[...Array.from({length:12},(_,n)=>n),0]);
    assert.equal(coinFrame(-1),0);assert.equal(coinFrame(0,3),3);assert.equal(coinFrame(11/24+.0001,3),2);
});
test('Token coin frame canvases preserve scale and foot anchor through narrow edge views',async()=>{
    const {readFile}=await import('node:fs/promises');const frames=JSON.parse(await readFile(new URL('../whale-maker/assets/frames.json',import.meta.url),'utf8')).tokens;
    assert.equal(frames.length,12);const reference={width:frames[0][2],height:frames[0][3]},rect=actorRect(reference,reference,100,200,40);
    for(const f of frames){assert.ok(f[0]>=0&&f[1]>=0&&f[2]>0&&f[3]>0&&f[0]+f[2]<=1.000001&&f[1]+f[3]<=1.000001);}
    for(const f of frames){assert.equal(f[2],reference.width);assert.equal(f[3],reference.height);assert.deepEqual(actorRect({width:f[2],height:f[3]},reference,100,200,40),rect);}
});


test('death reconstructs the complete world while retaining checkpoint and death count',()=>{
    const level=demo(1),s=create(level),fresh=create(level),width=level.width;s.checkpoint=[44,13];s.deaths=3;
    s.level.cells[11*width+9]='U';s.level.cells[11*width+11]='.';s.level.cells[14*width+5]='.';s.level.cells[8*width+5]='.';
    s.enemies[0].x+=10;s.enemies[0].alive=false;s.enemies[1].kind='shell';s.enemies[1].held=true;s.held=s.enemies[1];
    const body={x:5,y:5,w:.3,h:.3,vx:4,vy:-3};s.shots=[body];s.rewards=[{...body,kind:'growth',originY:5,age:.2}];s.fragments=[{...body,age:.1,angle:1}];s.bumps=[{x:5,y:5,age:.1}];s.bites=[{x:5,y:5,age:.1}];s.eatAge=0;s.pendingShot=true;s.coins=30;s.time=45;s.power=2;s.phase='dead';
    respawn(s);assert.deepEqual(s.level,fresh.level);assert.deepEqual(s.enemies,fresh.enemies);assert.deepEqual(s.startLevel,level);assert.notEqual(s.level,s.startLevel);assert.notEqual(s.level.cells,s.startLevel.cells);
    assert.deepEqual([s.player.x,s.player.y],[44,13]);assert.deepEqual(s.checkpoint,[44,13]);assert.equal(s.deaths,3);assert.equal(s.time,0);assert.equal(s.coins,0);assert.equal(s.power,0);assert.equal(s.invincible,2);assert.equal(s.held,null);assert.equal(s.pendingShot,false);
    for(const key of ['shots','fragments','bumps','defeated','bites'])assert.equal(s[key].length,0);
    assert.deepEqual(s.rewards,fresh.rewards);s.level.cells[11*width+9]='U';s.enemies[0].x=99;respawn(s);assert.deepEqual(s.level,fresh.level);assert.deepEqual(s.enemies,fresh.enemies);
});
test('touching a Token coin starts a bounded eating sequence without freezing movement or double counting',()=>{
    const s=flat();s.level.cells[14*s.level.width+3]='o';s.player.x=3.1;tick(s);assert.equal(s.coins,1);assert.equal(s.eatAge,0);assert.equal(s.bites.length,1);assert.equal(tile(s.level,3,14),'.');
    const x=s.player.x;tick(s,{axis:1},12);assert.ok(s.player.x>x+.1);assert.ok(s.eatAge>0&&s.eatAge<.14);assert.equal(s.coins,1);tick(s,{},80);assert.equal(s.bites.length,0);assert.equal(s.eatAge,.56);
    for(let n=0;n<20;n++){s.player.x=10+n;s.player.y=14.2;s.level.cells[14*s.level.width+10+n]='o';tick(s);}assert.equal(s.coins,21);assert.ok(s.bites.length<=16);
    s.player.y=s.level.height+3;s.invincible=0;tick(s);assert.equal(s.phase,'dead');assert.equal(s.bites.length,0);respawn(s);assert.equal(s.bites.length,0);assert.equal(s.eatAge,.56);
});
test('eating poses and coin flight progress from reach to mouth, chew, and swallow',()=>{
    for(const c of [0,1])assert.deepEqual([0,.15,.30,.45].map(t=>eatFrame(t,c)),[0,1,2,3].map(n=>n+c*4));
    const start={x:1,y:4},mouth={x:2,y:2},a=biteFlight(start,mouth,0),b=biteFlight(start,mouth,.32),mid=biteFlight(start,mouth,.16);
    assert.equal(a.x,start.x);assert.equal(a.y,start.y);assert.equal(a.opacity,1);assert.equal(b.x,mouth.x);assert.ok(Math.abs(b.y-mouth.y)<1e-10);assert.equal(b.opacity,0);assert.ok(mid.x>start.x&&mid.x<mouth.x);assert.ok(mid.size<a.size&&mid.size>b.size);
});
test('cloud source includes its complete silhouette across the old left cell boundary',async()=>{
    const {readFile}=await import('node:fs/promises'),frames=JSON.parse(await readFile(new URL('../whale-maker/assets/frames.json',import.meta.url),'utf8'));
    const cloud=frames.world[14];assert.ok(cloud[0]*1254<=615);assert.ok(cloud[2]*1254>=300);assert.ok(cloud[0]+cloud[2]<.75);
    assert.equal(frames.eating.length,8);for(const f of frames.eating)assert.ok(f[0]>=0&&f[1]>=0&&f[0]+f[2]<=1.000001&&f[1]+f[3]<=1.000001);
});
function checkpointStage(){const l=flat().level;l.cells[14*l.width+6]='C';l.cells[14*l.width+10]='C';const s=create(l);Object.assign(s.player,{x:6,y:14.2});return s;}
test('checkpoint contact lights once, starts waves and cheer, and permits movement and jumping',()=>{
    const s=checkpointStage(),id=14*s.level.width+6;tick(s);assert.deepEqual(s.checkpoint,[6,13]);assert.equal(s.litCheckpoints[id],true);assert.equal(s.flagWaves.length,1);assert.equal(s.cheerAge,0);assert.equal(tile(s.level,6,14),'C');
    tick(s,{},30);assert.ok(Math.abs(s.cheerAge-.25)<1e-10);assert.ok(Math.abs(s.flagWaves[0].age-.25)<1e-10);assert.equal(s.flagWaves.length,1);assert.equal(s.player.y,14.2,'happy bounce does not alter physics');
    const x=s.player.x;tick(s,{axis:1},24);assert.ok(s.player.x>x+.3);tick(s,{axis:1,jump:true},12);assert.ok(s.player.vy<0);assert.equal(s.phase,'playing');
});
test('lit checkpoints and the latest spawn survive death, while a fresh run starts gray',()=>{
    const s=checkpointStage();tick(s);s.player.x=10;tick(s);const lit={...s.litCheckpoints};assert.equal(Object.keys(lit).length,2);assert.deepEqual(s.checkpoint,[10,13]);
    s.player.x=6;tick(s);assert.deepEqual(s.checkpoint,[10,13],'revisiting a lit flag does not overwrite the latest checkpoint');
    s.player.y=s.level.height+3;tick(s);assert.equal(s.phase,'dead');assert.equal(s.flagWaves.length,0);assert.equal(s.cheerAge,CHEER_DURATION);respawn(s);
    assert.deepEqual(s.litCheckpoints,lit);assert.deepEqual([s.player.x,s.player.y],[10,13]);assert.equal(s.flagWaves.length,0);assert.equal(s.cheerAge,CHEER_DURATION);
    const beforeRetry=s.litCheckpoints;respawn(s);assert.notEqual(s.litCheckpoints,beforeRetry);delete beforeRetry[14*s.level.width+6];assert.deepEqual(s.litCheckpoints,lit);
    const fresh=create(s.startLevel);assert.deepEqual(fresh.litCheckpoints,{});assert.equal(fresh.cheerAge,CHEER_DURATION);assert.equal(Object.keys(s.litCheckpoints).length,2);
});
test('checkpoint transient effects are bounded, expire, and stop when hurt or finishing',()=>{
    const s=flat();for(let n=0;n<40;n++){const x=5+n;s.level.cells[14*s.level.width+x]='C';s.player.x=x;tick(s);}assert.equal(Object.keys(s.litCheckpoints).length,40);assert.equal(s.flagWaves.length,32);tick(s,{},150);assert.equal(s.flagWaves.length,0);assert.equal(s.cheerAge,CHEER_DURATION);
    const hurt=checkpointStage();tick(hurt);hurt.power=1;hurt.level.cells[14*hurt.level.width+6]='^';tick(hurt);assert.equal(hurt.power,0);assert.equal(hurt.flagWaves.length,0);assert.equal(hurt.cheerAge,CHEER_DURATION);assert.equal(Object.keys(hurt.litCheckpoints).length,1);
    const win=checkpointStage();tick(win);win.player.x=95;tick(win);assert.equal(win.phase,'won');assert.equal(win.flagWaves.length,0);assert.equal(win.cheerAge,CHEER_DURATION);
});
test('checkpoint poses flutter in gray or color and wobble around a fixed foot before settling',()=>{
    assert.deepEqual(Array.from({length:8},(_,n)=>checkpointFrame((n+.001)/12,false)),[0,1,2,3,4,5,6,7]);assert.deepEqual(Array.from({length:8},(_,n)=>checkpointFrame((n+.001)/12,true)),[8,9,10,11,12,13,14,15]);assert.equal(checkpointFrame(8/12,false),0);
    assert.equal(flagWobble(0,1),0);assert.equal(flagWobble(FLAG_WOBBLE_DURATION,1),0);assert.ok(flagWobble(.08,1)>0);assert.ok(flagWobble(.25,1)<0);assert.equal(flagWobble(.08,-1),-flagWobble(.08,1));
    for(const angle of [-.2,0,.2]){const r=checkpointRect({width:250,height:270},100,200,72,angle),dx=-r.width*.22,dy=r.height/2;const x=r.x+r.width/2+dx*Math.cos(angle)-dy*Math.sin(angle),y=r.y+r.height/2+dx*Math.sin(angle)+dy*Math.cos(angle);assert.ok(Math.abs(x-100)<1e-10&&Math.abs(y-200)<1e-10);assert.ok(Math.abs(r.width/r.height-250/270)<1e-10);}
    for(const character of [0,1])assert.deepEqual([0,.21,.41,.61].map(t=>cheerFrame(t,character)),[0,1,2,3].map(n=>n+character*4));assert.equal(cheerOffset(0),0);assert.ok(cheerOffset(.4)<-9);assert.equal(cheerOffset(CHEER_DURATION),0);
});
test('checkpoint and cheer atlases retain all generated animation frames within source bounds',async()=>{
    const {readFile}=await import('node:fs/promises'),frames=JSON.parse(await readFile(new URL('../whale-maker/assets/frames.json',import.meta.url),'utf8'));assert.equal(frames.checkpoint.length,16);assert.equal(frames.cheer.length,8);
    for(const f of [...frames.checkpoint,...frames.cheer])assert.ok(f[0]>=0&&f[1]>=0&&f[2]>0&&f[3]>0&&f[0]+f[2]<=1.000001&&f[1]+f[3]<=1.000001);
    for(const start of [0,4])for(const f of frames.cheer.slice(start,start+4))assert.deepEqual(f.slice(2),frames.cheer[start].slice(2));
});

