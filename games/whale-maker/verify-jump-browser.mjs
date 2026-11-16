import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {makeCourse,verifyCourse} from './verify-fixture.mjs';

await verifyCourse('whale-jump/browser',async ({state,load,advance,capture,checks})=>{
    const course=(wall=false,corridor=false)=>{
        const level=makeCourse({width:80,height:64,floor:60,spawn:[wall?39.1:20,59.2]});
        for(let y=0;wall&&y<60;y++){
            level.cells[y*level.width+40]='#';
            if(corridor)level.cells[y*level.width+34]='#';
        }
        return level;
    };
    await load(course());await advance(1);
    const normal=await state(g=>{
        const base=g.state.player.y;let top=base,apex=0,ticks=0;
        g.clearControls();g.keys.add('Space');g.paused=false;
        while(ticks<240){
            g.tick(1/120);ticks++;
            if(g.state.player.y<top){top=g.state.player.y;apex=ticks;}
            if(g.state.grounded)break;
        }
        g.paused=true;
        return {height:base-top,rise:apex/120,fall:(ticks-apex)/120};
    });
    assert.ok(normal.height>4.45&&normal.height<4.55);
    assert.ok(normal.rise>.63&&normal.rise<.70&&normal.fall>.53&&normal.fall<.59);
    checks.push('normal-held-jump-keeps-asymmetric-rise-and-fall-and-original-height');

    const startWall=async corridor=>{
        await load(course(true,corridor));
        await state(g=>{g.state.player.y=40;g.state.grounded=false;g.state.wall=1;g.state.coyote=0;});
    };
    await startWall(false);await advance(26,'ArrowRight','Space');
    const kick=await state(g=>({x:g.state.player.x,vx:g.state.player.vx,time:g.state.wallKick}));
    assert.ok(kick.x<37.1&&kick.vx<0&&kick.time>0);
    await capture('wall-kick-outward');
    checks.push('holding-into-wall-keeps-outward-impulse-before-air-steering-returns');

    const repeat=corridor=>state((g,corridor)=>{
        const s=g.state;let axis=1,top=s.player.y;const kicks=[];
        g.clearControls();g.keys.add('ShiftLeft');g.paused=false;
        for(let n=0;n<1800;n++){
            const jump=corridor?s.wall?!s.previous.jump:true:n%16!==15;
            g.keys.delete('ArrowLeft');g.keys.delete('ArrowRight');g.keys.add(axis>0?'ArrowRight':'ArrowLeft');
            if(jump)g.keys.add('Space');else g.keys.delete('Space');
            const serial=s.jumpSerial;g.tick(1/120);
            if(s.jumpSerial!==serial){kicks.push(s.player.y);if(corridor)axis=Math.sign(s.player.vx)||axis;}
            top=Math.min(top,s.player.y);
            if(s.grounded||s.phase!=='playing'||top<15)break;
        }
        g.paused=true;
        return {height:40-top,kicks};
    },corridor);
    await startWall(false);const single=await repeat(false);
    assert.ok(single.kicks.length>0&&single.height<4);
    assert.ok(single.kicks.every((y,i)=>i===0||y>=single.kicks[i-1]-.001));
    await capture('single-wall-cannot-climb');
    checks.push('running-and-repeated-wall-jumps-cannot-gain-height-from-one-wall');

    await startWall(true);const corridor=await repeat(true);
    assert.ok(corridor.kicks.length>=4&&corridor.height>20);
    await capture('alternating-walls-climb');
    checks.push('opposite-walls-still-allow-repeated-upward-wall-jumps');
    const output=resolve(import.meta.dirname,'../../artifacts/whale-jump/browser');
    mkdirSync(output,{recursive:true});
    writeFileSync(resolve(output,'measurements.json'),JSON.stringify({normal,kick,single,corridor},null,2));
});
