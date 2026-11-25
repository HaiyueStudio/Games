import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { verifyCourse } from './verify-fixture.mjs';

await verifyCourse('whale-map-packs', async ({ state, capture, checks, delay, cdp }) => {
    // 1280×800 design coordinates fitted into a 2560×1440 viewport.
    const click = async (x, y) => {
        const point = { x: 128 + x * 1.8, y: y * 1.8, button: 'left', clickCount: 1 };
        await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, buttons: 1 });
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, buttons: 0 });
        await delay(130);
    };
    await state(g => { g.paused = true; });
    await click(690, 88);
    assert.equal(await state(g => g.packPanel.open), true);
    assert.equal(await state(g => g.packPanel.courses.filter(button => button.visible).length), 32);
    const before = await state(g => [g.state.time, g.state.player.x, g.state.player.y]);
    await delay(250);
    assert.deepEqual(await state(g => [g.state.time, g.state.player.x, g.state.player.y]), before);
    await click(1030, 564);
    await capture('classic-pack-32-courses');
    await click(1050, 655);
    assert.equal(await state(g => g.state.level.classicStage), 32);
    assert.equal(await state(g => g.packPanel.open), false);
    checks.push('Engine GUI pack menu selects 8-4 and pauses the underlying course');

    const maps = [];
    for (let index = 0; index < 32; index++) {
        maps.push(await state((g, index) => {
            g.startClassic(index); g.paused = true; g.draw();
            return { stage: g.level.classicStage, width: g.level.width, draws: g.scene.draws.length,
                valid: g.scene.draws.every(draw => g.scene.sources.has(draw.id)) };
        }, index));
        assert.equal(maps[index].stage, index + 1); assert.ok(maps[index].valid); assert.ok(maps[index].draws > 40);
    }
    checks.push('All 32 independently selected maps submit valid ordinary 2D sprites');

    for (const [index, x, y, name] of [[5, 70, 10, '2-2-water'], [15, 38, 7, '4-4-castle-route'],
        [22, 64, 6, '6-3-balance-platforms'], [28, 366, 12, '8-1-long-course']]) {
        await state((g, index, x, y) => {
            g.startClassic(index); g.paused = true;
            Object.assign(g.state.player, { x, y, vx: 0, vy: 0 });
            g.camera = Math.max(0, x - 9); g.cameraY = 3; g.draw();
        }, index, x, y);
        await capture(name);
    }
    await state(g => {
        g.startClassic(3); g.state.coins = 17; g.state.score = 600; g.state.lives = 7;
        g.state.phase = 'won'; g.state.victory = { stage: 'done', age: 2 };
        g.tick(1 / 120); g.paused = true;
    });
    assert.deepEqual(await state(g => [g.state.level.classicStage, g.state.coins, g.state.score, g.state.lives]), [5, 17, 600, 7]);
    checks.push('1-4 advances to 2-1 with coins, score and lives');

    await state(g => { g.startClassic(28); g.showMapPacks(); });
    await click(860, 655);
    assert.equal(await state(g => g.editing), true);
    assert.equal(await state(g => g.campaignActive), false);
    assert.ok(await state(g => g.level.width) > 380);
    await state(g => { g.editCamera = 350; g.editY = 2; g.draw(); });
    await capture('8-1-editor');
    checks.push('Selected long course opens in the editor with campaign progression disabled');

    await state(g => { g.showMapPacks(); });
    await click(224, 286);
    await capture('whale-adventure-pack');
    await click(1050, 655);
    assert.equal(await state(g => g.activePackId), 'whale');
    assert.equal(await state(g => g.editing), false);
    assert.equal(await state(g => g.campaignActive), false);
    await state(g => { g.showMapPacks(); });
    await click(224, 330);
    await capture('mechanism-trials-pack');
    await click(1050, 655);
    assert.equal(await state(g => g.activePackId), 'trials');
    checks.push('Adventure and mechanism trial packs load their own courses');

    await state(g=>g.showMapPacks());await click(224,382);
    assert.equal(await state(g=>g.packPanel.courses.filter(button=>button.visible).length),32);
    await capture('lost-levels-first-32');await click(1095,206);
    assert.equal(await state(g=>g.packPanel.courses.filter(button=>button.visible).length),20);
    await click(1030,432);await capture('lost-levels-bonus-worlds');await click(1050,655);
    assert.deepEqual(await state(g=>[g.activePackId,g.activeCourseId]),['lost-levels','D-4']);
    checks.push('Lost Levels menu pages across all 52 courses and starts D-4');
    for(const [index,name]of [[0,'lost-1-1'],[9,'lost-3-2-water'],[24,'lost-7-1-wind'],[31,'lost-8-4-castle']]){
        await state((g,index)=>{g.launchPack('lost-levels',index);g.paused=true;g.draw();},index);await capture(name);
    }

    await state(g=>{g.launchPack('classic',0,true);g.showMapPacks();});
    await click(180,480);await click(180,564);
    const custom=await state(g=>g.packPanel.packId);
    assert.equal(await state((g,id)=>g.packLibrary.get(id).courses.length,custom),2);
    await capture('map-pack-editor');
    await click(550,256);await click(860,655);
    assert.equal(await state(g=>g.editing),true);
    await state(g=>{
        const id=12*g.level.width+8;
        for(let dy=0;dy<3;dy++){g.level.cells[id+dy*g.level.width]=dy?'p':'P';g.level.cells[id+dy*g.level.width+1]=dy?'q':'Q';}
        g.level.properties={[id]:{length:3,rotation:0}};g.selection=new Set([id]);g.editorTool='select';
    });
    await click(510,88);assert.equal(await state(g=>g.packPanel.open),true);
    await click(184,438);await click(224,382);await click(710,256);await capture('choose-course-destination');await click(1050,655);
    assert.deepEqual(await state(g=>Object.values(g.level.properties).find(p=>p.destination).destination),{pack:'lost-levels',course:'1-2'});
    await state(async g=>{
        g.stashCourse();const save=g.packLibrary.snapshot();await g.packSave.saveNow(save);
        g.packLibrary.restore(await g.packSave.load());
    });
    assert.equal(await state((g,id)=>g.packLibrary.get(id).courses.length,custom),2);
    await state((g,id)=>{
        g.launchPack(id,0);g.state.coins=27;g.state.lives=8;g.state.score=1300;
        Object.assign(g.state.player,{x:8+1-g.state.player.w/2,y:12-g.state.player.h,vx:0,vy:0});
        g.clearControls();g.keys.add('ArrowDown');g.tick(1/120);g.clearControls();
        for(let n=0;n<60;n++)g.tick(1/120);g.paused=true;
    },custom);
    assert.deepEqual(await state(g=>[g.activePackId,g.activeCourseId,g.state.coins,g.state.lives,g.state.score]),['lost-levels','1-2',27,8,1300]);
    checks.push('GUI creates a two-course pack, configures a cross-pack pipe, persists it and travels with progress');

    await state(g => { g.startClassic(31); g.paused = true; });
    const visited = [];
    for (let room = 0; room < 4; room++) {
        visited.push(await state(g => {
            const s = g.state, [cell, property] = Object.entries(s.level.properties).find(([, p]) => p.area);
            const id = Number(cell), x = id % s.level.width, y = Math.floor(id / s.level.width), p = s.player;
            const sideways = property.rotation === 270;
            Object.assign(p, { x: sideways ? x - p.w : x + 1 - p.w / 2, y: sideways ? y + 1 - p.h / 2 : y - p.h, vx: 0, vy: 0 });
            s.areaCooldown = 0; s.invincible = 100;
            g.clearControls(); g.keys.add(sideways ? 'ArrowRight' : 'ArrowDown');
            g.paused = false; g.tick(1 / 120); g.paused = true; g.clearControls();
            return s.currentArea;
        }));
        if (room === 2) await capture('8-4-underwater-corridor');
    }
    assert.deepEqual(visited, ['area-1', 'area-2', 'area-3', 'area-4']);
    await state(g => {
        const s = g.state, id = s.level.cells.indexOf('bridge-bell');
        Object.assign(s.player, { x: id % s.level.width + .1, y: Math.floor(id / s.level.width) + .2, vx: 0, vy: 0 });
        s.invincible = 100; g.paused = false;
        for (let n = 0; n < 16; n++) g.tick(1 / 120);
        g.paused = true;
    });
    await capture('8-4-final-bridge');
    await state(g => {
        g.paused = false;
        for (let n = 0; n < 1200; n++) g.tick(1 / 120);
        g.paused = true; g.draw();
    });
    assert.deepEqual(await state(g => [g.state.phase, g.state.victory?.stage, g.state.startLevel.classicStage]), ['won', 'done', 32]);
    await capture('8-4-pack-complete');
    assert.equal(await state(g => g.banner.text.includes('全部完成')), true);
    assert.equal(await state(g => g.scene.stats.drawCalls), 1);
    checks.push('8-4 forward pipe travel, water corridor, bridge collapse and automatic final castle entry');
    checks.push('Pack completion keeps one scene sprite draw call');
    writeFileSync('artifacts/whale-map-packs/maps.json', JSON.stringify(maps, null, 2));
}, { viewportWidth: 2560, viewportHeight: 1440 });
