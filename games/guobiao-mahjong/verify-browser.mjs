import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const root = resolve(process.env.MAHJONG_VERIFY_ROOT ?? sourceRoot);
const modelService = process.env.MAHJONG_MODEL_SERVICE;
const output = resolve(sourceRoot, 'artifacts/guobiao-mahjong'); mkdirSync(output, { recursive: true });
const delay = ms => new Promise(r => setTimeout(r, ms));
const result = await runChromeWebGpuFixture({ root, fixture: 'games/guobiao-mahjong/index.html', query: { verify: 1, seed: 20261105 }, timeoutMs: 90000,
  visualCapture: { viewportWidth: 1440, viewportHeight: 900 },
  interact: async cdp => {
    const errors = []; cdp.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.exception?.description ?? e.exceptionDetails.text));
    const evaluate = async expression => { const r = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text); return r.result?.result?.value; };
    const until = async (condition, label, interval=100) => { for (let n = 0; n < 300; n++) { if (await evaluate(condition)) return; await delay(interval); } throw new Error(`Timed out: ${label}`); };
    const capture = async name => { const r = await cdp.call('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve(output, name), Buffer.from(r.result.data, 'base64')); };
    const clickRect = async (r,settle=150) => {
      const viewport=await evaluate(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect(),h=haiyueMahjong.snapshot().hud;return{x:r.x,y:r.y,width:r.width,height:r.height,guiWidth:h.width,guiHeight:h.height}})()`);
      const point={x:viewport.x+(r.x+r.width/2)/viewport.guiWidth*viewport.width,y:viewport.y+(r.y+r.height/2)/viewport.guiHeight*viewport.height};
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point }); if(settle)await delay(settle);
    };
    const click = async text => {
      if(['AI 模型','新比赛','导出回放'].includes(text)&&!await evaluate(`haiyueMahjong.snapshot().presentation.drawer.visible`))await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.controls.settings.rect`));
      const key=['开始对局','继续','暂停'].includes(text)?'play':text==='单步'?'step':text==='提示'?'hint':null;
      const r=await evaluate(key?`haiyueMahjong.snapshot().presentation.controls.${key}.rect`:`haiyueMahjong.snapshot().hud.nodes.find(n=>n.visible&&n.type==='GuiButton'&&n.text===${JSON.stringify(text)}).rect`);await clickRect(r);
    };
    const checkRows = presentation => {
      for(const t of presentation.tiles.filter(t=>['hand','revealed','concealed','meld','flower'].includes(t.role))) {
        const p=t.pose,r=t.surfaceRect,standing=['hand','revealed','concealed'].includes(t.role)&&!t.flat;
        assert.ok(Math.abs(p.angle-(t.flat?0:t.role==='concealed'?Math.PI/2:standing?70*Math.PI/180:0))<1e-8);
        const edge=p.x*Math.sin(p.yaw)+p.z*Math.cos(p.yaw)+(standing?Math.cos(p.angle)*r.height/2+Math.sin(p.angle)*p.thickness:r.height/2);
        assert.ok(Math.abs(edge-450)<1e-6,'hand and meld share the rack edge');
      }
    };
    await until(`!!window.haiyueMahjong || document.body?.dataset.renderStatus==='failed'`, 'engine ready');
    assert.equal(await evaluate(`document.body.dataset.renderStatus`), 'ready'); await delay(300);
    assert.equal(await evaluate(`document.querySelectorAll('canvas').length`), 1);
    await until(`!!haiyueMahjong.snapshot().handAnalysis`, 'current fan analysis');
    assert.equal(await evaluate(`(()=>{const c=haiyueMahjong.controller,original=c.observation;let count=0;c.observation=function(...args){count++;return original.apply(this,args)};try{haiyueMahjong.snapshot();return count}finally{c.observation=original}})()`),1,'public snapshot observes the match once');
    const idleWork=await evaluate(`haiyueMahjong.snapshot().presentation.scene.work`);await delay(200);
    assert.deepEqual(await evaluate(`haiyueMahjong.snapshot().presentation.scene.work`),idleWork,'unchanged table does not regenerate mesh buffers');
    const presentation = await evaluate(`haiyueMahjong.snapshot().presentation`);
    assert.equal(presentation.atlas, 'mahjong:reference-atlas:v2');
    assert.equal(presentation.scene.renderer, 'haiyue-mesh3d'); assert.equal(presentation.scene.elevationDegrees, 30);
    checkRows(presentation);
    assert.equal(presentation.scene.projection,'perspective');
    assert.equal(presentation.scene.sharedAtlasMaterial,true);
    assert.ok(await evaluate(`haiyueMahjong.snapshot().handAnalysis.items.some(f=>f.name==='门前清'&&f.value===2)`));
    assert.ok(presentation.table.height / 900 > .55 && presentation.table.height / 900 <= .951);
    assert.ok(presentation.table.width > presentation.table.height);
    assert.ok(presentation.compassRect.width > 145);
    assert.equal(presentation.scene.wall.remaining, await evaluate(`haiyueMahjong.snapshot().observation.wallRemaining`));
    assert.ok(presentation.scene.wall.tiles.every(t => !('tile' in t)));
    assert.equal(presentation.scene.dealer.relative, 0);
    assert.equal(presentation.scene.surface.renderer,'printed-cloth-atlas');assert.equal(presentation.scene.surface.beast,'青龙');
    assert.equal(presentation.scene.tileMaterial.type,'pbr');assert.equal(presentation.scene.tileMaterial.normalColorSpace,'linear');
    assert.equal(presentation.scene.bodies.shape,'engine-rounded-box');assert.equal(presentation.scene.bodies.draws,1);
    assert.equal(presentation.scene.instanceRendering.batches,2,'native instance renderer submits table frame and tile bodies');
    assert.ok(!await evaluate(`haiyueMahjong.snapshot().hud.nodes.some(n=>['庄','东','南','西','北','东风圈','南风圈','西风圈','北风圈'].includes(n.text))`),'table markings are textures, with no central GUI labels');
    assert.ok(!await evaluate(`haiyueMahjong.snapshot().hud.nodes.some(n=>n.rect.y<80&&/风圈|余.*张/.test(n.text))`));
    assert.ok(!await evaluate(`haiyueMahjong.snapshot().hud.nodes.some(n=>n.text.includes('八番起胡')||n.text.includes('8 番起胡'))`));
    assert.ok(presentation.tiles.every(t => t.sourceKey === presentation.atlas && t.uv.length === 4));
    const own = presentation.tiles.filter(t => t.role === 'hand'), drawn = own.find(t => t.drawn);
    assert.ok(drawn); assert.equal(drawn.rect.x, Math.max(...own.map(t => t.rect.x)));
    const ordinaryGap = own[1].rect.x - own[0].rect.x - own[0].rect.width;
    const drawGap = drawn.rect.x - own.at(-2).rect.x - own.at(-2).rect.width;
    assert.ok(drawGap > ordinaryGap * 3);
    await capture('desktop.png');
    assert.ok(Math.abs(presentation.table.x+presentation.table.width/2-720)<1);assert.equal(presentation.scene.zoom,1.15);assert.equal(presentation.scene.bodies.thickness,15);
    await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.controls.settings.rect`));
    assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.drawer.visible`),true);await delay(200);await capture('drawer-settings.png');
    assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.scene.dock`),'right');
    await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.drawer.closeRect`));await delay(150);assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.scene.dock`),'none');
    await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.controls.ranking.rect`));await capture('drawer-ranking.png');
    assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.drawer.section`),'ranking');
    await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.drawer.closeRect`));

    await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(180);
    await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.controls.settings.rect`));await capture('drawer-settings-portrait.png');
    const portraitDrawer=await evaluate(`haiyueMahjong.snapshot().presentation.drawer`);assert.ok(portraitDrawer.rect.x>=0&&portraitDrawer.rect.x+portraitDrawer.rect.width<=390);await clickRect(portraitDrawer.closeRect);
    await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.controls.ranking.rect`));await capture('drawer-ranking-portrait.png');await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.drawer.closeRect`));
    await cdp.call('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await delay(180);await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.controls.settings.rect`));
    const scrollRect=await evaluate(`haiyueMahjong.snapshot().hud.nodes.find(n=>n.id==='drawer-scroll').rect`);
    await cdp.call('Input.dispatchMouseEvent',{type:'mouseWheel',x:scrollRect.x+scrollRect.width/2,y:scrollRect.y+scrollRect.height/2,deltaY:190,deltaX:0});await delay(200);await capture('drawer-settings-landscape.png');
    assert.ok(await evaluate(`haiyueMahjong.snapshot().hud.nodes.find(n=>n.id==='ai-delay').rect.y < ${scrollRect.y+330}`));await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.drawer.closeRect`));
    await cdp.call('Emulation.setDeviceMetricsOverride',{width:3500,height:734,deviceScaleFactor:1,mobile:false});await delay(250);
    const wide=await evaluate(`haiyueMahjong.snapshot().presentation`);
    assert.ok(wide.scene.heightRatio>.85&&wide.scene.heightRatio<=.951);
    assert.ok(wide.tiles.every(t=>t.rect.x>=0&&t.rect.y>=0&&t.rect.x+t.rect.width<=3500&&t.rect.y+t.rect.height<=734));
    await capture('widescreen.png');
    await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await delay(250);
    await until(`(()=>{const s=haiyueMahjong.snapshot(),b=s.hud.nodes.find(n=>n.type==='GuiButton'&&n.text==='番型明细');return s.hud.width===1440&&s.hud.height===900&&b.rect.x+b.rect.width<=1440&&b.rect.y>650})()`,'desktop GUI resize');
    await click('番型明细');
    await until(`haiyueMahjong.snapshot().presentation.modal?.layer==='engine-modal'`,'fan modal layout');
    assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.modal.layer`), 'engine-modal');
    const modalRevision = await evaluate(`haiyueMahjong.controller.revision`);
    await click('开始对局'); // The native modal must block the table controls behind it.
    assert.equal(await evaluate(`haiyueMahjong.controller.started`), false);
    await capture('fan-details.png');
    await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.modal.closeRect`));
    assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.fanDetails`), false);
    assert.equal(await evaluate(`haiyueMahjong.controller.revision`), modalRevision);
    await click('AI 模型');
    assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.modelSettings.visible`),true);
    await capture('model-settings.png');
    if(modelService) {
      await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.modelSettings.closeRect`));
      await evaluate(`haiyueMahjong.modelHub.endpoint=${JSON.stringify(modelService)}`); await click('AI 模型');
      await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.modelSettings.refreshRect`));
      await until(`haiyueMahjong.modelHub.models.filter(m=>m.available&&m.source==='http').length===4`,'pretrained model discovery');
      const select = await evaluate(`haiyueMahjong.snapshot().presentation.modelSettings.selects[1]`);
      await clickRect(select.rect);
      const popup=await evaluate(`haiyueMahjong.snapshot().presentation.modelSettings.selects[1].popupRect`);
      await capture('model-options.png');
      await clickRect({x:popup.x,y:popup.y+30,width:popup.width,height:30});
      assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.modelSettings.selects[1].value`),'kd-s0');
      await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.modelSettings.temperatureRect`));
      await capture('model-settings-connected.png');
      await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.modelSettings.applyRect`));
      if(await evaluate(`haiyueMahjong.modelHub.assignments[1]`)!=='kd-s0') { await capture('model-apply-failure.png'); throw new Error('Apply failed '+JSON.stringify(await evaluate(`({hub:haiyueMahjong.modelHub.snapshot(),ui:haiyueMahjong.snapshot().presentation.modelSettings,viewport:haiyueMahjong.snapshot().hud})`))); }
      assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.modelSettings.visible`),false);
      assert.equal(await evaluate(`haiyueMahjong.snapshot().observation.players[1].name`),'KD Student 0');
      await click('AI 模型');
      await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(300);await capture('model-settings-portrait.png');
      await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.modelSettings.closeRect`));
      assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.modelSettings.visible`),false);
      await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await delay(300);

      const prediction = await evaluate(`(async()=>{const o=haiyueMahjong.controller.observation(0);const a=await haiyueMahjong.httpAgent('KD',${JSON.stringify((modelService??'').replace(/\/$/,'')+'/agent/kd-s0')},{parameters:haiyueMahjong.modelHub.parameters}).decide(o,{requestId:'browser-real-model',signal:new AbortController().signal});return{legal:o.legalActions.some(b=>JSON.stringify(b)===JSON.stringify(a)),action:a}})()`);
      assert.ok(prediction.legal);
      await evaluate(`haiyueMahjong.modelHub.apply(['builtin','builtin','builtin','builtin'],{temperature:0,seed:20261105})`);
    } else await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.modelSettings.closeRect`));
    await click('开始对局');
    const hand = await evaluate(`haiyueMahjong.snapshot().hud.nodes.filter(n=>n.type==='GuiButton'&&n.id.startsWith('tile-hand-')&&!n.disabled)`);
    assert.equal(hand.length, 14); const revision = await evaluate(`haiyueMahjong.controller.revision`);
    await clickRect(hand[0].rect); await clickRect(hand[0].rect,0);
    await until(`haiyueMahjong.controller.revision>${revision}`, 'human discard');
    await until(`haiyueMahjong.snapshot().presentation.scene.animations.flights.some(f=>f.kind==='discard')`,'first discard frame',8);
    assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.scene.sharedAtlasMaterial`),true);
    await capture('motion-discard-early.png');
    await until(`haiyueMahjong.snapshot().presentation.scene.animations.flights.some(f=>f.kind==='discard'&&f.progress>0&&f.progress<1)`,'discard arc');
    await capture('motion-discard.png');
    await evaluate(`haiyueMahjong.controller.pause(true)`); const paused = await evaluate(`haiyueMahjong.controller.revision`), frozen=await evaluate(`haiyueMahjong.snapshot().presentation.scene.animations.elapsed`);
    await delay(300); assert.equal(await evaluate(`haiyueMahjong.controller.revision`), paused);assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.scene.animations.elapsed`),frozen);
    await evaluate(`haiyueMahjong.controller.reset(20261105)`); await delay(150);
    await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.controls.settings.rect`));
    const select = await evaluate(`haiyueMahjong.snapshot().hud.nodes.find(n=>n.type==='GuiSelect'&&n.id==='seat-select'&&n.visible).rect`);
    await clickRect(select); await clickRect({ x: select.x, y: select.y + select.height + 4 * 28, width: select.width, height: 28 });
    assert.equal(await evaluate(`haiyueMahjong.controller.human`), null);
    const slider = await evaluate(`haiyueMahjong.snapshot().hud.nodes.find(n=>n.type==='GuiSlider'&&n.id==='ai-delay'&&n.visible).rect`);
    await clickRect(slider); assert.ok(await evaluate(`haiyueMahjong.controller.delayMs>=2000&&haiyueMahjong.controller.delayMs<=3000`));
    await clickRect(await evaluate(`haiyueMahjong.snapshot().presentation.drawer.closeRect`));
    await evaluate(`haiyueMahjong.controller.setDelay(1500);haiyueMahjong.controller.start()`);
    await until(`haiyueMahjong.snapshot().waitingMs>1000`, 'worker calculation and presentation delay');
    const concealed = await evaluate(`haiyueMahjong.snapshot().presentation.tiles.filter(t=>t.role==='revealed'&&t.seat===0)`);
    assert.equal(concealed.at(-1).drawn, true); assert.notEqual(concealed.at(-1).tile, null);
    assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.tiles.some(t=>t.role==='concealed')`), false);
    assert.equal(await evaluate(`haiyueMahjong.controller.observation(1).players.some(p=>'hand' in p)`), false);
    assert.ok(concealed.at(-1).rect.x - concealed.at(-2).rect.x - concealed.at(-2).rect.width > 6);
    assert.equal(await evaluate(`haiyueMahjong.controller.revision`), 0);
    await evaluate(`haiyueMahjong.controller.pause(true)`); await delay(250); assert.equal(await evaluate(`haiyueMahjong.controller.revision`), 0);
    await click('单步'); assert.equal(await evaluate(`haiyueMahjong.controller.revision`), 1);
    await evaluate(`window.__mahjongSavedFixture=haiyueMahjong.controller.save();haiyueMahjong.controller.reset(9);haiyueMahjong.controller.restore(window.__mahjongSavedFixture)`);
    assert.equal(await evaluate(`haiyueMahjong.controller.revision`), 1);
    assert.equal(await evaluate(`haiyueMahjong.controller.paused`), true);
    assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.scene.wall.remaining`),await evaluate(`haiyueMahjong.snapshot().observation.wallRemaining`));
    await capture('spectator.png');
    await evaluate(`(async()=>{const r=await fetch('../../games/test/fixtures/mahjong-ui-melds.json');if(!r.ok)throw new Error('Missing meld fixture');await haiyueMahjong.controller.restore(await r.json())})()`);
    await until(`!!haiyueMahjong.snapshot().handAnalysis`, 'meld fan analysis'); await delay(200);
    const meldSnapshot = await evaluate(`haiyueMahjong.snapshot()`), groups = meldSnapshot.presentation.tiles.filter(t => t.role === 'meld' && t.seat === meldSnapshot.observation.seat);
    checkRows(meldSnapshot.presentation);
    meldSnapshot.presentation.tiles.filter(t=>t.role==='river').forEach(t=>{
      const relative=(t.seat-meldSnapshot.observation.seat+4)%4,r=t.surfaceRect;
      const near=relative===0?r.y-500:relative===2?500-r.y-r.height:relative===1?r.x-500:500-r.x-r.width;
      assert.ok(near>=145-1e-8,'river leaves space around the compass');
    });
    assert.ok(new Set(groups.map(t => t.group)).size >= 3);
    const groupIds = [...new Set(groups.map(t => t.group))].sort();
    for (let i = 1; i < groupIds.length; i++) { const left = groups.filter(t => t.group === groupIds[i - 1]), right = groups.filter(t => t.group === groupIds[i]); assert.ok(right[0].rect.x - left.at(-1).rect.x - left.at(-1).rect.width > 4); }
    assert.ok(groups.some(t => t.emphasis === 'called'));
    const flowers = meldSnapshot.presentation.tiles.filter(t => t.role === 'flower');
    assert.equal(flowers.length, meldSnapshot.observation.players.reduce((sum,p) => sum+p.flowers.length,0));
    assert.ok(flowers.every(t=>t.tile>=34&&t.tile<=41));
    for(let who=0;who<4;who++){
      const row=meldSnapshot.presentation.tiles.filter(t=>t.seat===who&&['flower','meld','hand','revealed','concealed'].includes(t.role));
      const along=t=>t.pose.x*Math.cos(t.pose.yaw)-t.pose.z*Math.sin(t.pose.yaw);
      const fs=row.filter(t=>t.role==='flower'),rest=row.filter(t=>t.role!=='flower');
      if(fs.length&&rest.length)assert.ok(Math.max(...fs.map(t=>along(t)+t.surfaceRect.width/2))<Math.min(...rest.map(t=>along(t)-t.surfaceRect.width/2)),'flowers are left of melds and hands');
    }
    assert.equal(meldSnapshot.presentation.scene.surface.beast,['青龙','朱雀','白虎','玄武'][meldSnapshot.observation.roundWind]);
    assert.equal(meldSnapshot.presentation.compass.length, 4);
    await until(`(()=>{const a=haiyueMahjong.snapshot().handAnalysis;return a&&a.revision===haiyueMahjong.controller.revision})()`,'meld fan analysis');
    assert.ok(await evaluate(`haiyueMahjong.snapshot().handAnalysis.items.some(f=>f.name==='无字'&&f.value*f.count===1)`));
    assert.ok(await evaluate(`haiyueMahjong.snapshot().hud.nodes.some(n=>n.type==='GuiLabel'&&n.text.includes('无字 1'))`));
    await capture('melds.png');
    await evaluate(`(async()=>{await haiyueMahjong.controller.restore(await (await fetch('../../games/test/fixtures/mahjong-ui-claim.json')).json())})()`);
    await delay(200); assert.ok(await evaluate(`haiyueMahjong.snapshot().presentation.tiles.filter(t=>t.emphasis==='eligible').length>=2`));
    await until(`haiyueMahjong.snapshot().presentation.actions.buttons.length>0`, 'persistent claim notification');
    const opportunity = await evaluate(`haiyueMahjong.snapshot().presentation.actions.buttons`);
    assert.ok(opportunity.some(b=>b.text==='吃'));assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.notifications.opportunity`),null);
    await delay(240); await capture('claim.png');
    await click('吃');await until(`!!haiyueMahjong.snapshot().presentation.actions.choice`,'chow choice panel');
    const choices=await evaluate(`haiyueMahjong.snapshot().presentation.actions.choice`);
    assert.ok(choices.options.length>0);for(const option of choices.options){assert.equal(option.tiles.length,3);assert.equal(option.tiles.filter(t=>t.called).length,1);assert.equal(option.tiles.find(t=>t.called).tile,option.action.tile)}
    await capture('chow-combinations.png');await clickRect(choices.closeRect);

    await delay(500);
    assert.deepEqual(await evaluate(`haiyueMahjong.snapshot().presentation.actions.buttons`),opportunity);
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await delay(220); await capture('notification-human-portrait.png');
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await delay(200);
    // The notification must leave the existing action buttons clickable.
    const beforePass=await evaluate(`haiyueMahjong.controller.revision`);
    await click('过');
    assert.ok(await evaluate(`haiyueMahjong.controller.revision>${beforePass}`), 'pass button accepts input below the notification');
    await until(`haiyueMahjong.snapshot().presentation.actions.buttons.length===0`, 'claim prompt dismissed after choice');
    await evaluate(`(async()=>{await haiyueMahjong.controller.restore(await(await fetch('../../games/test/fixtures/mahjong-ui-chow-options.json')).json())})()`);await delay(200);
    await click('吃');await until(`!!haiyueMahjong.snapshot().presentation.actions.choice`,'multi-chow options');
    const multi=await evaluate(`haiyueMahjong.snapshot().presentation.actions.choice`);assert.equal(multi.options.length,3);await capture('chow-three-options.png');
    await cdp.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(180);await capture('chow-three-options-portrait.png');
    const portraitChoices=await evaluate(`haiyueMahjong.snapshot().presentation.actions.choice`);assert.ok(portraitChoices.options.every(r=>r.rect.x>=0&&r.rect.x+r.rect.width<=390));
    const selected=portraitChoices.options[1].action,beforeChoice=await evaluate(`haiyueMahjong.controller.revision`);await clickRect(portraitChoices.options[1].rect);
    assert.equal(await evaluate(`haiyueMahjong.controller.revision`),beforeChoice+1);assert.deepEqual(await evaluate(`haiyueMahjong.controller.save().replay.actions.at(-1).action`),selected);assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.actions.choice`),null);
    await cdp.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await delay(180);
    await evaluate(`(async()=>{await haiyueMahjong.controller.restore(await(await fetch('../../games/test/fixtures/mahjong-ui-chow-options.json')).json())})()`);await delay(180);await click('吃');
    await until(`!!haiyueMahjong.snapshot().presentation.actions.choice`,'chow options reopen');await evaluate(`haiyueMahjong.controller.reset(20261105)`);await until(`!haiyueMahjong.snapshot().presentation.actions.choice`,'stale choices dismissed on reset');assert.equal(await evaluate(`haiyueMahjong.controller.revision`),0);
    await evaluate(`(async()=>{window.__actionFixture=await (await fetch('../../games/test/fixtures/mahjong-ui-melds.json')).json()})()`);
    const demonstrate = async type => {
      await evaluate(`(async()=>{
        const source=window.__actionFixture, actions=source.replay.actions, i=actions.findIndex(a=>a.action.type===${JSON.stringify(type)});
        if(i<0)throw Error('Missing action fixture');
        const prefix={...source,human:null,replay:{...source.replay,handIndex:actions[i].hand,actions:actions.slice(0,i)}};
        await haiyueMahjong.controller.restore(prefix);
        for(let seat=0;seat<4;seat++)haiyueMahjong.controller.setAgent(seat,{name:['玄玉 AI','青竹 AI','白露 AI','听雨 AI'][seat],decide(o){
          const recorded=actions.find(a=>a.revision===o.revision&&a.seat===o.seat);
          if(!recorded)throw Error('Missing scripted decision'); return recorded.action;
        }});
      })()`);
      await delay(150); // Let the loaded table establish its event cursor.
      assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.notifications.event`), null);
      for(let step=0;step<5;step++) {
        await evaluate(`haiyueMahjong.controller.step()`); await delay(60);
        if(await evaluate(`!!haiyueMahjong.snapshot().presentation.notifications.event`)) break;
      }
      await until(`!!haiyueMahjong.snapshot().presentation.notifications.event`, `AI ${type} notification`);
      await delay(220);
      const animation=await evaluate(`haiyueMahjong.snapshot().presentation.scene.animations`);
      assert.ok(animation.flights.some(f=>f.kind===type&&f.progress>0&&f.progress<1),type+' tile flight');
      const notices=await evaluate(`haiyueMahjong.snapshot().presentation.notifications`);
      assert.equal(notices.renderer,'engine-gui-toast');
      assert.equal(notices.event.pointerFilter,'ignore'); assert.ok(notices.event.progress>.9);
      assert.ok(notices.effects.some(e=>e.seat===notices.event.seat&&e.text===notices.event.badge));
      assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.notifications.opportunity`),null);
      await capture(`notification-ai-${type}.png`);
      return notices;
    };
    // The last pass before the next recorded discard resolves an ordinary wall draw.
    await evaluate(`(async()=>{const source=window.__actionFixture,a=source.replay.actions,i=a.findIndex((v,j)=>v.action.type==='pass'&&a[j+1]?.action.type==='discard');
      if(i<0)throw Error('Missing wall draw');await haiyueMahjong.controller.restore({...source,human:null,replay:{...source.replay,handIndex:a[i].hand,actions:a.slice(0,i)}});
      for(let seat=0;seat<4;seat++)haiyueMahjong.controller.setAgent(seat,{name:'青竹 AI',decide(o){return a.find(v=>v.revision===o.revision&&v.hand===o.handIndex&&v.seat===o.seat).action}});
    })()`);await delay(150);
    const wallBefore=await evaluate(`haiyueMahjong.snapshot().presentation.scene.wall`);
    await evaluate(`haiyueMahjong.controller.step()`);
    await until(`haiyueMahjong.snapshot().presentation.scene.animations.flights.some(f=>f.kind==='draw'&&f.progress>0&&f.progress<1)`,'wall draw arc');
    const drawFlight=await evaluate(`haiyueMahjong.snapshot().presentation.scene.animations.flights.find(f=>f.kind==='draw')`);
    const wallSource=wallBefore.tiles.find(t=>t.index===drawFlight.wallIndex);assert.ok(wallSource);
    assert.equal(drawFlight.from.x,wallSource.x);assert.equal(drawFlight.from.z,wallSource.z);
    assert.equal(drawFlight.from.y,1+15.8*Math.max(...wallBefore.tiles.filter(t=>t.side===wallSource.side&&t.stack===wallSource.stack).map(t=>t.layer)));
    await capture('motion-draw.png');
    const chowNotice=await demonstrate('chow'); assert.equal(chowNotice.event.badge,'吃');
    const pungNotice=await demonstrate('pung'); assert.equal(pungNotice.event.badge,'碰');
    const concealedNotice=await demonstrate('concealed-kong'); assert.match(concealedNotice.event.text,/暗杠$/);
    const kongNotice=await demonstrate('add-kong'); assert.match(kongNotice.event.text,/加杠/);
    const huNotice=await demonstrate('hu'); assert.equal(huNotice.event.badge,'胡'); assert.match(huNotice.event.text,/番/);
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await delay(220); await capture('notification-ai-hu-portrait.png');
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await delay(4200); assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.notifications.event`),null);
    assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.notifications.effects.length`),0);
    await evaluate(`(async()=>{
      const source=window.__actionFixture, actions=source.replay.actions, i=actions.findIndex(a=>a.action.type==='hu');
      await haiyueMahjong.controller.restore({...source,human:actions[i].seat,replay:{...source.replay,handIndex:actions[i].hand,actions:actions.slice(0,i)}});
    })()`);
    await until(`haiyueMahjong.snapshot().presentation.actions.buttons.length>0`, 'legal human hu notification');
    assert.ok(await evaluate(`haiyueMahjong.snapshot().presentation.actions.buttons.some(b=>b.text==='胡')`));
    await delay(220); await capture('notification-human-hu.png');
    await click('胡');
    await until(`haiyueMahjong.snapshot().presentation.actions.buttons.length===0`, 'hu prompt cleared after choice');
    for(let i=0;i<3;i++) { if(await evaluate(`haiyueMahjong.snapshot().observation.phase.endsWith('over')`))break; await evaluate(`haiyueMahjong.controller.step()`); await delay(80); }
    await until(`haiyueMahjong.snapshot().presentation.notifications.event?.winning`, 'human hu effect');
    await delay(220); await capture('notification-human-win.png');
    assert.equal(await evaluate(`haiyueMahjong.snapshot().hud.nodes.filter(n=>n.type==='GuiToast').length`),5);
    await evaluate(`haiyueMahjong.controller.reset(900)`); await delay(160);
    const cleared=await evaluate(`haiyueMahjong.snapshot().presentation.notifications`);
    assert.equal(cleared.event,null); assert.equal(cleared.opportunity,null); assert.equal(cleared.effects.length,0); assert.equal(cleared.queued,0);

    await evaluate(`(()=>{const c=haiyueMahjong.controller;c.reset(20261105);c.setHuman(null);for(let seat=0;seat<4;seat++)c.setAgent(seat,{name:'青竹 AI',decide:o=>o.legalActions.find(a=>a.type==='pass')??o.legalActions.find(a=>a.type==='discard')??o.legalActions[0]});c.start();c.pause(true)})()`);
    await evaluate(`haiyueMahjong.controller.step()`);
    // The rules resolve before the next rendered frame. An idle animation flag alone
    // can still belong to the old table, so wait for the new discard and hand counts.
    await until(`(()=>{const s=haiyueMahjong.snapshot(),p=s.presentation;return !p.scene.animations.active&&p.tiles.filter(t=>t.role==='river').length===s.observation.players.reduce((n,v)=>n+v.river.length,0)&&s.observation.players.every((v,seat)=>p.tiles.filter(t=>t.seat===seat&&['hand','revealed'].includes(t.role)).length===v.handCount)})()`,'scripted discard rendered and landed');
    const beforePassMesh=await evaluate(`haiyueMahjong.snapshot()`);
    await evaluate(`haiyueMahjong.controller.step()`);await delay(150);
    const afterPassMesh=await evaluate(`haiyueMahjong.snapshot()`);
    assert.equal(beforePassMesh.observation.phase,'response');assert.equal(afterPassMesh.observation.phase,'response');
    assert.equal(afterPassMesh.observation.revision,beforePassMesh.observation.revision+1);
    assert.equal(afterPassMesh.presentation.scene.work.staticBuilds,beforePassMesh.presentation.scene.work.staticBuilds,'a pass with unchanged tile positions reuses static meshes');

    await evaluate(`(async()=>{await haiyueMahjong.controller.restore(await (await fetch('../../games/test/fixtures/mahjong-ui-settled.json')).json())})()`);
    await delay(250);
    const settled = await evaluate(`haiyueMahjong.snapshot()`);
    assert.equal(settled.observation.phase, 'hand-over');
    assert.equal(settled.presentation.controls.next.visible,true);assert.ok(Math.abs(settled.presentation.controls.next.rect.x+settled.presentation.controls.next.rect.width/2-720)<1);
    assert.equal(settled.presentation.tiles.some(t=>t.role==='concealed'),false);
    assert.equal(settled.hud.nodes.filter(n=>n.type==='GuiButton'&&n.id.startsWith('tile-hand-')).length,0,'settled tiles have no input targets');
    checkRows(settled.presentation);
    settled.observation.results.at(-1).hands.forEach((hand,seat)=>{
      const faces=settled.presentation.tiles.filter(t=>['hand','revealed'].includes(t.role)&&t.seat===seat);
      assert.equal(faces.length,hand.length); assert.deepEqual(faces.map(t=>t.tile).sort((a,b)=>a-b),[...hand].sort((a,b)=>a-b));
      assert.ok(faces.every(t=>t.flat&&t.pose.angle===0&&t.pose.y===1),'all four hands lie face up at settlement');
    });
    await capture('settled.png');
    const dealer = settled.observation.dealer;
    await click('下一局'); await delay(250);
    assert.equal(await evaluate(`haiyueMahjong.snapshot().observation.dealer`), (dealer + 1) % 4);
    assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.scene.dealer.relative`), (dealer + 1) % 4);
    assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.scene.wall.remaining`), await evaluate(`haiyueMahjong.snapshot().observation.wallRemaining`));
    await capture('dealer-rotation.png');
    for(let wind=1;wind<4;wind++){
      await evaluate(`(async()=>{const s=await(await fetch('../../games/test/fixtures/mahjong-ui-melds.json')).json();s.human=null;s.replay={...s.replay,handIndex:${wind*4},actions:s.replay.actions.filter(a=>a.hand<${wind*4})};await haiyueMahjong.controller.restore(s)})()`);await delay(180);
      assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.scene.surface.beast`),['青龙','朱雀','白虎','玄武'][wind]);
      assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.scene.surface.textureBakes`),1);
      await capture(['wind-east.png','wind-south.png','wind-west.png','wind-north.png'][wind]);
    }
    await evaluate(`(async()=>{await haiyueMahjong.controller.restore(await (await fetch('../../games/test/fixtures/mahjong-ui-settled.json')).json())})()`);
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await delay(300); await capture('portrait.png');
    const portrait = await evaluate(`haiyueMahjong.snapshot().presentation`);
    assert.ok(portrait.table.x >= 0 && portrait.table.x + portrait.table.width <= 390);
    assert.equal(portrait.scene.elevationDegrees, 30);checkRows(portrait);
    assert.deepEqual(errors, []);
    await evaluate(`haiyueMahjong.dispose();(()=>{const r=document.createElement('pre');r.id='result';r.dataset.status='passed';r.textContent=JSON.stringify({status:'passed',nativeGui:true,atlas:true,drawnSeparation:true,meldGroups:true,fanAnalysis:true,humanDiscard:true,workerDelay:true,pauseAndStep:true,portrait:true,modalLayer:true,flowers:true,compass:true,claimHighlights:true,settlementReveal:true,spectatorReveal:true,actionNotifications:true,aiActionEffects:true,notificationLifecycle:true,table3D:true,tableHeight95:true,camera30:true,alignedRacks:true,standingHands:true,spaciousRivers:true,perspectiveCamera:true,parabolicAnimations:true,correctWallPickup:true,physicalWall:true,dealerRotation:true,largerCompass:true,nativeDrawers:true,centeredTable:true,tableZoom15:true,thickerTiles:true,playerIcons:true,chowChoiceFaces:true,chowClaimHighlight:true,centeredNextHand:true,modelSettings:true,modelSwitching:${!!modelService}});document.body.appendChild(r)})()`);
  } });
const fingerprints = Object.fromEntries(['games/guobiao-mahjong/ui/CoachPanel.ts','games/guobiao-mahjong/ui/coachText.ts','games/guobiao-mahjong/ui/coachChars.ts','games/guobiao-mahjong/ai/analysisCache.ts','games/guobiao-mahjong/ai/coaching/types.ts','games/guobiao-mahjong/ai/coaching/publicAnalysis.ts','games/guobiao-mahjong/ai/coaching/forecast.ts','games/guobiao-mahjong/ai/coaching/CoachSystem.ts','games/guobiao-mahjong/ai/coach.worker.ts','games/guobiao-mahjong/ai/coach.worker.js','games/guobiao-mahjong/ui/UiArt.ts','games/guobiao-mahjong/ui/ClaimControls.ts','games/guobiao-mahjong/ui/claimPresentation.ts','games/guobiao-mahjong/ui/MahjongDrawer.ts','games/guobiao-mahjong/assets/ui-backdrop-v1.png','games/guobiao-mahjong/assets/ui-drawer-v1.png','games/guobiao-mahjong/assets/ui-ranking-v1.png','games/guobiao-mahjong/rendering/TableSurface.ts','games/guobiao-mahjong/rendering/RoundedTileBodies.ts','games/guobiao-mahjong/assets/tablecloth-emerald-v1.png','games/guobiao-mahjong/assets/wind-beasts-v1.png','games/guobiao-mahjong/assets/tiles-normal-v1.png','games/gamepad/sampler.ts','games/gamepad/runtime.ts','games/gamepad/connectionMonitor.ts','games/guobiao-mahjong/rendering/TableBatch.ts','games/guobiao-mahjong/rendering/tileAnimations.ts','games/guobiao-mahjong/rendering/MahjongTable3D.ts','games/guobiao-mahjong/rendering/tableModel.ts','games/guobiao-mahjong/main.ts','games/guobiao-mahjong/ui/MahjongHud.ts','games/guobiao-mahjong/ui/layout.ts','games/guobiao-mahjong/ui/tileLayout.ts','games/guobiao-mahjong/ui/TileAtlas.ts','games/guobiao-mahjong/ui/tablePresentation.ts','games/guobiao-mahjong/ui/actionNotifications.ts','games/guobiao-mahjong/ui/MahjongNotifications.ts','games/guobiao-mahjong/ui/ModelSettings.ts','games/guobiao-mahjong/api/ModelHub.ts','games/guobiao-mahjong/api/agents.ts','games/guobiao-mahjong/app/MatchController.ts','games/guobiao-mahjong/rules/match.ts','games/guobiao-mahjong/rules/handAnalysis.ts','games/guobiao-mahjong/ai/strategy.ts','games/guobiao-mahjong/bundle.js','games/guobiao-mahjong/ai/mahjong.worker.js','games/guobiao-mahjong/assets/mcr.wasm','games/guobiao-mahjong/assets/tiles-atlas.png','games/guobiao-mahjong/assets/tiles-atlas.json','games/test/fixtures/mahjong-ui-melds.json','games/test/fixtures/mahjong-ui-chow-options.json','games/test/fixtures/mahjong-ui-claim.json','games/test/fixtures/mahjong-ui-settled.json','rollup.config.js'].map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]));
writeFileSync(resolve(output, 'browser.json'), JSON.stringify({ schemaVersion: 1, verificationMode: root === sourceRoot ? 'workspace' : 'isolated-game-snapshot', generatedAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim(), dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: sourceRoot, encoding: 'utf8' }).trim(), fingerprints, ...result }, null, 2));
console.log('Mahjong browser checks passed; screenshots in artifacts/guobiao-mahjong/');
