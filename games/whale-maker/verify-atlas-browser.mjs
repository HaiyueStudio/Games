import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {makeCourse,verifyCourse} from './verify-fixture.mjs';

const baseline=process.argv.includes('--baseline'),loose=process.argv.includes('--loose');
const name=baseline?'whale-atlas-before':loose?'whale-atlas-loose':'whale-atlas-built';
await verifyCourse(name,async ({state,load,advance,capture,checks})=>{
    const resources=await state(()=>performance.getEntriesByType('resource').filter(entry=>{
        const url=new URL(entry.name);
        return url.pathname.includes('/assets/')&&/\.(png|svg|json)$/.test(url.pathname);
    }).map(entry=>({name:new URL(entry.name).pathname.split('/assets/').pop(),bytes:entry.encodedBodySize})));
    if(baseline||loose)assert.ok(resources.some(r=>r.name==='runtime/frames.json'));
    else assert.deepEqual(resources.map(r=>r.name),['atlas.build.png']);
    const metrics={resources,bytes:resources.reduce((sum,r)=>sum+r.bytes,0),views:{}};
    const resolution=await state(g=>[g.engine.displayWidth,g.engine.displayHeight]);
    assert.deepEqual(resolution,[2560,1440]);
    for(const backdrop of ['coast','castle','night']){
        const course=makeCourse({width:56,height:18,floor:14,spawn:[6,13.2],backdrop});
        for(const [x,y,t] of [[9,13,'C'],[12,13,'T'],[13,10,'?'],[15,13,'o'],[17,13,'iron-turtle'],[19,13,'p-switch'],[20,13,'star'],[22,13,'wood-crate'],[24,13,'firebar']])course.cells[y*course.width+x]=t;
        await load(course);await advance(20);
        await capture(backdrop);
        metrics.views[backdrop]=await state(g=>g.scene.stats);
        assert.ok(metrics.views[backdrop].drawCommands>50);
        if(!baseline)assert.equal(metrics.views[backdrop].drawCalls,1);
    }
    await state(g=>{g.toggle();g.paletteCategory=2;g.palettePage=0;g.draw();});await capture('editor');
    metrics.views.editor=await state(g=>g.scene.stats);
    if(!baseline)assert.equal(metrics.views.editor.drawCalls,1);
    assert.equal(await state(g=>g.paletteNodes.some(p=>p.category===2&&p.page===0&&p.nodes.some(n=>n.visible))),true);
    metrics.gui=await state(g=>{
        const sources=new Set(g.paletteNodes.flatMap(p=>p.nodes.filter(n=>n.source).map(n=>n.source)));
        const atlasIcons=['world','tokens','checkpoint','p1-costumes'].map(name=>name==='world'?g.terrain:
            name==='tokens'?g.tokens:name==='checkpoint'?g.checkpointArt:g.extraImages[name]);
        return {paletteTextureSources:sources.size,sharedRasterSources:new Set(atlasIcons).size};
    });
    assert.equal(metrics.gui.sharedRasterSources,baseline||loose?4:1);
    writeFileSync(resolve(import.meta.dirname,'../..','artifacts',name,'metrics.json'),JSON.stringify(metrics,null,2));
    checks.push('2560×1440 scenes and editor, asset transfer count and world sprite draw calls');
},{viewportWidth:2560,viewportHeight:1440});
