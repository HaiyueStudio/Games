import assert from 'node:assert/strict';
import {makeCourse,verifyCourse} from './verify-fixture.mjs';

await verifyCourse('whale-end-boundary',async ({state,load,advance,capture,checks,delay})=>{
    const level=makeCourse({width:120,goal:94,spawn:[98,19.2],condition:{kind:'coins',amount:999}});
    await load(level);await advance(240,'ArrowRight','ShiftLeft');
    const edge=()=>state(g=>({right:g.state.player.x+g.state.player.w,camera:g.camera+g.state.view.w,
        grounded:g.state.grounded,phase:g.state.phase,width:g.state.level.width}));
    const bounded=await edge();
    assert.ok(Math.abs(bounded.right-104)<.001);
    assert.ok(Math.abs(bounded.camera-104)<.01);
    assert.equal(bounded.phase,'playing');
    await capture('condition-unmet-right-edge');
    checks.push('full-body-and-camera-stop-at-goal-column-plus-ten');

    const short=makeCourse({width:100,goal:94,spawn:[98,19.2],condition:{kind:'coins',amount:999}});
    await load(short);await advance(240,'ArrowRight','ShiftLeft');
    const tail=await edge();
    assert.equal(tail.width,100);assert.ok(Math.abs(tail.right-104)<.001);assert.equal(tail.grounded,true);
    assert.equal(await state(g=>g.state.level.cells.length),short.cells.length);
    await capture('short-map-derived-tail');
    checks.push('short-map-tail-is-solid-without-reindexing-stored-cells');

    await state(g=>{
        g.toggle();g.editCamera=83;g.editY=10;g.draw();
        g.selected='E';g.editorTool='paint';g.record();g.lastCell=-1;
        const cellPoint=g.cellPoint;g.cellPoint=()=>[90,19];
        try{g.paint(new PointerEvent('pointerdown'));}finally{g.cellPoint=cellPoint;}
        g.draw();
    });
    const flags=()=>state(g=>g.level.cells.flatMap((tile,id)=>tile==='E'?[id%g.level.width]:[]));
    assert.deepEqual(await flags(),[90]);
    await state(g=>g.undo());assert.deepEqual(await flags(),[94]);
    await state(g=>g.redoEdit());assert.deepEqual(await flags(),[90]);
    await capture('editor-boundary-overlay');
    checks.push('placing-goal-moves-the-single-end-zone-and-supports-undo-redo');

    await state(g=>g.save());await delay(200);
    await state(g=>{g.level.cells[19*g.level.width+90]='.';g.read();});await delay(250);
    assert.deepEqual(await flags(),[90]);
    await state(g=>{g.toggle();g.paused=true;g.draw();});
    assert.equal(await state(g=>g.state.level.endZone.right),100);
    await capture('relocated-goal-and-boundary');
    checks.push('save-read-recomputes-the-boundary-from-the-authored-flag');

    const legacy=makeCourse({width:240,height:40,goal:194,spawn:[225,19.2],warps:[{from:[5,16],to:[225,16]}]});
    await load(legacy);await advance(240,'ArrowRight','ShiftLeft');
    assert.ok(Math.abs((await edge()).right-240)<.001);
    await capture('legacy-underground-room');
    checks.push('classic-underground-room-keeps-its-own-bounds');

    await load(makeCourse({goal:94,spawn:[94,15]}));
    await advance(1,'ArrowRight');
    assert.equal(await state(g=>g.state.victory?.stage),'slide');
    await advance(1000);
    assert.equal(await state(g=>g.state.victory?.stage),'done');
    assert.ok((await edge()).right<=104);
    checks.push('flag-slide-celebration-and-castle-entry-complete-inside-the-ending-zone');
});
