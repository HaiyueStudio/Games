import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {verifyCourse,makeCourse} from './verify-fixture.mjs';

await verifyCourse('whale-debt-fixed',async({state,checks,capture,delay})=>{
    await state(g=>{g.engine.stop();g.paused=true;});
    // Substitute only the OS picker; exercise the real standalone import handler.
    await state((g,level)=>{
        const create=document.createElement.bind(document);
        document.createElement=function(tag,...args){const node=create(tag,...args);if(tag==='input')node.click=()=>{
            const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(level)],'single.json',{type:'application/json'}));node.files=transfer.files;node.dispatchEvent(new Event('change'));
        };return node;};
        try{g.import();}finally{document.createElement=create;}
    },makeCourse({name:'独立关卡回归'}));
    await delay(150);
    await state(async g=>{await g.save();g.level.name='未保存改名';await g.read();});
    assert.deepEqual(await state(g=>[g.level.name,g.documentIdentity.kind,g.editing]),['独立关卡回归','standalone',true]);
    checks.push('Standalone import/save/read restores the same authored document through actual controllers');

    await state(async g=>{
        await g.packSave.saveNow({version:1,packs:[]});const pack=g.packLibrary.create();g.launchPack(pack.id,0,true);await g.read();
        g.showMapPacks();g.packPanel.close();
    });
    assert.equal(await state(g=>g.activePackId),'classic');
    await state(async g=>{
        const before=g.level;const read=g.packSave.load;g.packSave.load=async()=>{throw Error('simulated read failure');};
        try{await g.read();}finally{g.packSave.load=read;}
        if(g.level!==before)throw Error('failed read replaced the document');
    });
    checks.push('Missing unsaved pack falls back atomically; failed reads preserve the current document');

    const quota=await state(async g=>{
        g.editing=false;g.packLibrary.restore({version:1,packs:[]});g.packLibrary.editable('classic');
        g.packLibrary.create('lost-levels');g.packLibrary.create('lost-levels');
        const save=g.packLibrary.snapshot();await g.packSave.saveNow(save);
        return {chars:JSON.stringify(save).length,packs:save.packs.length};
    });
    assert.ok(quota.chars<1_000_000);checks.push('Two copied 52-course packs plus classic save below 1 million characters');

    const counts=await state((g,level)=>{
        g.level=level;g.editAreaId='main';g.areaRoot=undefined;g.editing=true;g.editY=level.height-16;
        const nodes=[],walk=n=>{nodes.push(n);for(const child of n.children)walk(child);};g.ui.root.children.forEach(walk);
        let flips=0;for(const n of nodes){const old=n.setVisible;n.setVisible=function(value){if(this.visible!==value)flips++;return old.call(this,value);};}
        const cases=[];
        for(const mode of ['basic','advanced','path','modal']){
            g.selection=new Set(mode==='basic'?[]:[level.cells.indexOf('E')]);g.p1Editor.enabled=mode!=='basic';
            if(mode==='path'){const id=10*level.width+8;level.cells[id]='snake-block';level.properties={[id]:{path:[[0,0],[4,0]]}};g.record();g.selection=new Set([id]);g.p1Editor.routeMode=true;}
            if(mode==='modal')g.showMapPacks();g.draw();flips=0;for(let n=0;n<20;n++)g.draw();cases.push({mode,flips});if(g.packPanel.open)g.packPanel.close();
        }
        // Closing the pack menu restores its own course. Reinstall the large
        // document before measuring, and assert the measured fixture explicitly.
        g.level=level;g.editAreaId='main';g.areaRoot=undefined;g.editing=true;g.editCamera=0;g.editY=level.height-16;
        g.documentIdentity={kind:'standalone'};g.record();g.selection.clear();g.p1Editor.enabled=false;g.draw();
        let reads=0;const live=g.level,cells=live.cells;live.cells=new Proxy(cells,{get(t,p,r){if(typeof p==='string'&&/^\d+$/.test(p))reads++;return Reflect.get(t,p,r);}});
        g.draw();reads=0;for(let n=0;n<10;n++)g.draw();live.cells=cells;
        return {cases,width:live.width,height:live.height,editing:g.editing,readsPerDraw:reads/10};
    },makeCourse({width:512,height:256,floor:254,spawn:[3,253.2]}));
    assert.ok(counts.cases.every(c=>c.flips===0),JSON.stringify(counts));assert.equal(counts.width,512);assert.equal(counts.height,256);assert.equal(counts.editing,true);
    assert.ok(counts.readsPerDraw>0&&counts.readsPerDraw<15_000,JSON.stringify(counts));
    await state(g=>{
        const point=g.cellPoint,baseline=g.editorIndex().snakeAnchors.length;g.record();g.selected='snake-block';g.editorTool='paint';g.erase=false;g.lastCell=-1;
        try{
            for(const x of [3,14]){g.cellPoint=()=>[x,242];g.paint({shiftKey:false});g.draw();}
            if(g.editorIndex().snakeAnchors.length!==baseline+2)throw Error('continuous paint retained a stale editor index');
            g.erase=true;g.cellPoint=()=>[14,242];g.lastCell=-1;g.paint({shiftKey:false});g.draw();
            if(g.editorIndex().snakeAnchors.length!==baseline+1)throw Error('erase retained a stale editor index');
            g.undo();g.draw();if(g.editorIndex().snakeAnchors.length!==baseline)throw Error('undo retained a stale editor index');
            g.redoEdit();g.draw();if(g.editorIndex().snakeAnchors.length!==baseline+1)throw Error('redo retained a stale editor index');
        }finally{g.cellPoint=point;g.erase=false;g.notice='';}
    });
    checks.push('Continuous paint, erase, undo and redo refresh cached object anchors between rendered frames');
    await state(g=>g.engine.run());await delay(180);
    await capture('editor-large-map');checks.push('Recursive GUI observes zero steady-state visibility changes in all inspector modes; viewport reads stay bounded');
    writeFileSync('artifacts/whale-debt-fixed/metrics.json',JSON.stringify({quota,counts},null,2));
});
