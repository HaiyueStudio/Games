import assert from 'node:assert/strict';
import {makeCourse,verifyCourse} from './verify-fixture.mjs';

await verifyCourse('whale-coop',async ({state,load,advance,capture,checks,delay,cdp})=>{
    async function until(read){
        for(let i=0;i<100;i++){const value=await read();if(value)return value;await delay(30);}
        assert.fail('Timed out waiting for co-op controls or gameplay');
    }
    async function click(x,y){
        const [cx,cy]=await state((g,x,y)=>{
            const r=g.canvas.getBoundingClientRect(),scale=Math.min(r.width/1280,r.height/800);
            return [r.left+(r.width-1280*scale)/2+x*scale,r.top+(r.height-800*scale)/2+y*scale];
        },x,y);
        for(const type of ['mouseMoved','mousePressed','mouseReleased'])await cdp.call('Input.dispatchMouseEvent',{type,x:cx,y:cy,...(type==='mouseMoved'?{}:{button:'left',clickCount:1})});
        await delay(80);
    }
    const key=(type,code,value)=>cdp.call('Input.dispatchKeyEvent',{type,code,key:value});
    await state(()=>{
        window.__coopButtons=Array(4).fill(-1);
        Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>window.__coopButtons.map((button,index)=>({
            index,id:`Co-op controller ${index+1}`,connected:true,mapping:'standard',axes:[0,0,0,0],
            buttons:Array.from({length:17},(_,i)=>({pressed:i===button,touched:i===button,value:Number(i===button)})),
        }))});
    });
    await delay(5200);
    await click(444,38);
    assert.equal(await state(g=>g.settingsPanel.open&&!g.mainUi.visible),true);
    await click(710,121);
    await click(449,177);
    await click(624,302);
    await key('keyDown','KeyQ','q');await key('keyUp','KeyQ','q');
    await click(523,177);
    await click(836,425);
    await state(()=>{window.__coopButtons[2]=3;});
    await until(()=>state(g=>g.settingsPanel.draft.players[2].pad[4]==='b3'));
    await state(()=>{window.__coopButtons[2]=-1;});
    await capture('control-settings');
    await click(888,720);
    assert.deepEqual(await state(g=>[g.settingsPanel.open,g.state.coop.players.length,g.controls.players[1].keys[1],g.controls.players[2].pad[4]]),[false,4,'KeyQ','b3']);
    assert.deepEqual(await state(async g=>{const saved=await g.controlSave.load();return [saved.count,saved.players[1].keys[1],saved.players[2].pad[4]];}),[4,'KeyQ','b3']);
    checks.push('engine GUI configures four players and remaps a physical keyboard code and a controller button');

    const level=makeCourse({width:90,height:32,floor:20,spawn:[27,19.2]});
    await load(level);await advance(12);
    const positions=()=>state(g=>[g.state.player,...g.state.coop.players.slice(1).map(a=>a.player)].map(p=>[p.x,p.y]));
    const initial=await positions();
    await advance(80,'KeyQ');
    const after=await positions();
    assert.ok(after[1][0]>initial[1][0]+2);
    assert.deepEqual(after.filter((_,i)=>i!==1),initial.filter((_,i)=>i!==1));
    await state(g=>{g.clearControls();g.paused=false;});
    await delay(200);
    const baseline=await positions();
    await state(()=>{window.__coopButtons[2]=3;});
    await until(async()=> (await positions())[2][1]<baseline[2][1]-.7);
    await state(g=>{window.__coopButtons[2]=-1;g.paused=true;});
    assert.equal((await positions())[0][1],baseline[0][1]);
    await capture('four-players');
    checks.push('remapped controller 3 jumps independently of the other players');

    await advance(720,'KeyD');
    const view=await state(g=>{
        const actors=[g.state.player,...g.state.coop.players.slice(1).map(a=>a.player)];
        return {actors,camera:g.camera,cameraY:g.cameraY,w:1232/48,h:12};
    });
    assert.ok(Math.abs(view.actors.reduce((sum,p)=>sum+(p.x+p.w/2)/4,0)-view.camera-view.w/2)<1e-6);
    for(const p of view.actors)assert.ok(p.x>=view.camera-1e-6&&p.x+p.w<=view.camera+view.w+1e-6);
    checks.push('camera follows the mean and the outlier cannot move beyond the screen');

    const end=level.width-6;
    await state((g,end)=>{
        const actors=[g.state.player,...g.state.coop.players.slice(1).map(a=>a.player)];
        actors.forEach((p,i)=>Object.assign(p,{x:end-3-i,y:18.2,vx:0,vy:0}));
    },end);
    for(let i=0;i<4;i++){
        await state((g,i,end)=>{const p=i===0?g.state.player:g.state.coop.players[i].player;p.x=end;},i,end);
        await advance(1);
        assert.deepEqual(await state(g=>[g.state.phase,g.state.coop.arrivals.filter(Boolean).length]),[i===3?'won':'playing',i+1]);
        if(i===0){assert.match(await state(g=>g.p2Hud.text),/到达 1\/4/);await capture('waiting-at-flag');}
    }
    await advance(480);
    assert.equal(await state(g=>g.state.coop.players.every((a,i)=>(i===0?g.state:a).victory.stage==='done')),true);
    checks.push('the first three arrivals wait and the last starts the shared victory');

    await state(g=>g.applyControls({...g.controls,count:3}));
    const rescue=makeCourse({width:90,height:32,floor:20,spawn:[24,19.2],progress:{lives:true,initialLives:4}});
    for(let y=20;y<rescue.height;y++)for(let x=27;x<41;x++)rescue.cells[y*rescue.width+x]='.';
    await load(rescue);
    await state(g=>{
        const actors=[g.state.player,...g.state.coop.players.slice(1).map(a=>a.player)];
        [23,43,33].forEach((x,i)=>Object.assign(actors[i],{x,y:19.2,vx:0,vy:0}));
    });
    for(let frame=0;frame<20;frame++){
        await advance(12);
        if(await state(g=>g.state.coop.recovery[2]?.kind==='waiting'))break;
    }
    assert.deepEqual(await state(g=>[g.state.phase,g.state.lives,g.state.coop.recovery[2]?.kind]),['playing',3,'waiting']);
    await advance(96);
    assert.equal(await state(g=>g.state.coop.recovery[2]?.kind),'bubble');
    assert.match(await state(g=>g.p2Hud.text),/P3 泡泡待救/);
    assert.equal(await state(g=>g.scene.draws.some(draw=>draw.id==='rescue-bubble')),true);
    await capture('rescue-bubble');
    for(let frame=0;frame<50;frame++){
        await advance(12);
        if(await state(g=>g.state.coop.recovery[2]===null))break;
    }
    assert.deepEqual(await state(g=>[g.state.phase,g.state.coop.recovery[2],g.state.lives,g.state.coop.pops.length]),['playing',null,3,1]);
    await capture('teammate-rescued');
    checks.push('falling out of the shared screen keeps the match running, and a teammate touching the bubble revives its passenger');
});
