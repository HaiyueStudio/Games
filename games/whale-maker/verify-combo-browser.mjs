import assert from 'node:assert/strict';
import {makeCourse,verifyCourse} from './verify-fixture.mjs';

await verifyCourse('whale-combo',async ({state,load,capture,checks})=>{
    const width=32,floor=14;
    const level=makeCourse({width,height:18,floor,spawn:[22.455,10.9],progress:{lives:true,initialLives:3}});
    level.cells[(floor-1)*width+22]='T';
    for(let stair=0;stair<3;stair++)for(let y=floor-1-stair;y<floor;y++)level.cells[y*width+19-stair]='#';
    await load(level);
    await state(g=>{
        const s=g.state,shell=s.enemies[0];
        shell.x=22.205;shell.vx=0;s.facing=-1;
    });
    const bounceTo=target=>state((g,target)=>{
        const s=g.state;
        g.paused=false;
        for(let frame=0;frame<720&&s.phase==='playing'&&s.scoreChain.stomp<target;frame++)g.tick(1/120);
        g.paused=true;g.draw();
        return {stomp:s.scoreChain.stomp,lives:s.lives,grounded:s.grounded,phase:s.phase,banner:g.scoreBanner.text,hud:g.p2Hud.text};
    },target);

    const eighth=await bounceTo(8);
    assert.deepEqual([eighth.stomp,eighth.lives,eighth.grounded,eighth.phase],[8,3,false,'playing']);
    assert.match(eighth.banner,/8000/);
    const ninth=await bounceTo(9);
    assert.deepEqual([ninth.stomp,ninth.lives,ninth.grounded,ninth.phase],[9,4,false,'playing']);
    assert.match(ninth.banner,/连击 ×9\s+1UP/);
    assert.match(ninth.hud,/生命 4/);
    await capture('ninth-shell-stomp');
    const tenth=await bounceTo(10);
    assert.deepEqual([tenth.stomp,tenth.lives,tenth.grounded,tenth.phase],[10,5,false,'playing']);
    checks.push('stair shell rally awards a life on each stomp from the ninth and updates the GUI');
});
