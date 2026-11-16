import assert from 'node:assert/strict';
import {makeCourse,verifyCourse} from './verify-fixture.mjs';

await verifyCourse('whale-maker-weather',async ({state,load,advance,capture,checks,delay})=>{
    const level=makeCourse();level.cells[15*level.width+13]='tornado';
    await load(level);
    await state(g=>{g.toggle();g.selection.clear();g.p1Editor.enabled=true;g.draw();});
    const slopeAlpha=await state(g=>['slope-up','slope-down'].map(tile=>{
        const [image,uv]=g.editorIcon(tile),canvas=document.createElement('canvas');
        canvas.width=canvas.height=48;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(image,uv[0]*image.naturalWidth,uv[1]*image.naturalHeight,
            uv[2]*image.naturalWidth,uv[3]*image.naturalHeight,0,0,48,48);
        return [8,39].map(x=>ctx.getImageData(x,0,1,48).data.filter((a,i)=>i%4===3&&a>80).length);
    }));
    assert.ok(slopeAlpha[0][0]<slopeAlpha[0][1]);
    assert.ok(slopeAlpha[1][0]>slopeAlpha[1][1]);
    await capture('slope-palette-and-tornado');
    checks.push('both-slope-palette-icons-have-visible-opposite-diagonals');

    const edit=(key,value)=>state((g,key,value)=>{
        const editor=g.p1Editor,index=editor.keys().indexOf(key);
        editor.page=Math.floor(index/4);g.draw();
        if(value===null)editor.cycle(index%4);
        else{const input=editor.inputs[index%4];input.setValue(String(value));input.submit();}
        g.draw();
    },key,value??null);
    await edit('windMode');await edit('windDirection');await edit('windStrength',4);await edit('windPeriod',10);
    const wind=()=>state(g=>g.level.wind);
    assert.deepEqual(await wind(),{mode:'constant',direction:'left',strength:4,period:10});
    await capture('constant-left-wind-settings');
    await edit('windMode');
    assert.equal((await wind()).mode,'periodic');
    await state(g=>g.undo());assert.equal((await wind()).mode,'constant');
    await state(g=>g.redoEdit());assert.equal((await wind()).mode,'periodic');
    await capture('periodic-wind-editor-preview');
    checks.push('native-gui-wind-mode-direction-strength-period-and-undo-redo');
    const saved=await wind();
    await state(g=>g.save());await delay(200);
    await state(g=>{delete g.level.wind;g.read();});await delay(250);
    assert.deepEqual(await wind(),saved);
    checks.push('wind-survives-save-and-read');

    await state(g=>{g.toggle();g.state.player.x=8;g.state.time=2.5;g.paused=true;});
    await advance(100);
    assert.ok(await state(g=>g.state.player.x)<6);
    assert.equal(await state(g=>g.scene.draws.filter(d=>d.id.startsWith('tornado:')).length),1);
    assert.ok(await state(g=>g.scene.draws.some(d=>d.id==='white'&&d.rect.height===1.2)));
    await capture('playing-conical-tornado');
    checks.push('wind-drifts-player-and-single-conical-tornado-renders-in-play');
});
