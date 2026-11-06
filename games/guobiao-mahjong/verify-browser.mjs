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
    const until = async (condition, label) => { for (let n = 0; n < 300; n++) { if (await evaluate(condition)) return; await delay(100); } throw new Error(`Timed out: ${label}`); };
    const capture = async name => { const r = await cdp.call('Page.captureScreenshot', { format: 'png' }); writeFileSync(resolve(output, name), Buffer.from(r.result.data, 'base64')); };
    const clickRect = async r => {
      const viewport=await evaluate(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect(),h=haiyueMahjong.snapshot().hud;return{x:r.x,y:r.y,width:r.width,height:r.height,guiWidth:h.width,guiHeight:h.height}})()`);
      const point={x:viewport.x+(r.x+r.width/2)/viewport.guiWidth*viewport.width,y:viewport.y+(r.y+r.height/2)/viewport.guiHeight*viewport.height};
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point }); await delay(150);
    };
    const click = async text => { const r = await evaluate(`haiyueMahjong.snapshot().hud.nodes.find(n=>n.type==='GuiButton'&&n.text===${JSON.stringify(text)}).rect`); await clickRect(r); };
    await until(`!!window.haiyueMahjong || document.body?.dataset.renderStatus==='failed'`, 'engine ready');
    assert.equal(await evaluate(`document.body.dataset.renderStatus`), 'ready'); await delay(300);
    assert.equal(await evaluate(`document.querySelectorAll('canvas').length`), 1);
    await until(`!!haiyueMahjong.snapshot().handAnalysis`, 'current fan analysis');
    const presentation = await evaluate(`haiyueMahjong.snapshot().presentation`);
    assert.equal(presentation.atlas, 'mahjong:reference-atlas:v2');
    assert.equal(presentation.table.width, presentation.table.height); assert.ok(presentation.table.height>634);
    assert.equal(presentation.compassRect.width,145);
    assert.ok(!await evaluate(`haiyueMahjong.snapshot().hud.nodes.some(n=>n.text.includes('八番起胡')||n.text.includes('8 番起胡'))`));
    assert.ok(presentation.tiles.every(t => t.sourceKey === presentation.atlas && t.uv.length === 4));
    const own = presentation.tiles.filter(t => t.role === 'hand'), drawn = own.find(t => t.drawn);
    assert.ok(drawn); assert.equal(drawn.rect.x, Math.max(...own.map(t => t.rect.x)));
    const ordinaryGap = own[1].rect.x - own[0].rect.x - own[0].rect.width;
    const drawGap = drawn.rect.x - own.at(-2).rect.x - own.at(-2).rect.width;
    assert.ok(drawGap > ordinaryGap * 3);
    await capture('desktop.png');
    await click('番型明细');
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
      await until(`haiyueMahjong.modelHub.models.filter(m=>m.available).length===4`,'pretrained model discovery');
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
    const hand = await evaluate(`haiyueMahjong.snapshot().hud.nodes.filter(n=>n.type==='GuiButton'&&n.text===''&&!n.disabled&&n.rect.y>700)`);
    assert.equal(hand.length, 14); const revision = await evaluate(`haiyueMahjong.controller.revision`);
    await clickRect(hand[0].rect); await clickRect(hand[0].rect);
    await until(`haiyueMahjong.controller.revision>${revision}`, 'human discard');
    await evaluate(`haiyueMahjong.controller.pause(true)`); const paused = await evaluate(`haiyueMahjong.controller.revision`); await delay(300); assert.equal(await evaluate(`haiyueMahjong.controller.revision`), paused);
    await evaluate(`haiyueMahjong.controller.reset(20261105)`); await delay(150);
    const select = await evaluate(`haiyueMahjong.snapshot().hud.nodes.find(n=>n.type==='GuiSelect').rect`);
    await clickRect(select); await clickRect({ x: select.x, y: select.y + select.height + 4 * 28, width: select.width, height: 28 });
    assert.equal(await evaluate(`haiyueMahjong.controller.human`), null);
    const slider = await evaluate(`haiyueMahjong.snapshot().hud.nodes.find(n=>n.type==='GuiSlider').rect`);
    await clickRect(slider); assert.ok(await evaluate(`haiyueMahjong.controller.delayMs>=2000&&haiyueMahjong.controller.delayMs<=3000`));
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
    await capture('spectator.png');
    await evaluate(`(async()=>{const r=await fetch('../../games/test/fixtures/mahjong-ui-melds.json');if(!r.ok)throw new Error('Missing meld fixture');await haiyueMahjong.controller.restore(await r.json())})()`);
    await until(`!!haiyueMahjong.snapshot().handAnalysis`, 'meld fan analysis'); await delay(200);
    const meldSnapshot = await evaluate(`haiyueMahjong.snapshot()`), groups = meldSnapshot.presentation.tiles.filter(t => t.role === 'meld' && t.seat === meldSnapshot.observation.seat);
    assert.ok(new Set(groups.map(t => t.group)).size >= 3);
    const groupIds = [...new Set(groups.map(t => t.group))].sort();
    for (let i = 1; i < groupIds.length; i++) { const left = groups.filter(t => t.group === groupIds[i - 1]), right = groups.filter(t => t.group === groupIds[i]); assert.ok(right[0].rect.x - left.at(-1).rect.x - left.at(-1).rect.width > 4); }
    assert.ok(groups.some(t => t.emphasis === 'called'));
    const flowers = meldSnapshot.presentation.tiles.filter(t => t.role === 'flower');
    assert.equal(flowers.length, meldSnapshot.observation.players.reduce((sum,p) => sum+p.flowers.length,0));
    assert.ok(flowers.every(t=>t.tile>=34&&t.tile<=41));
    assert.equal(meldSnapshot.presentation.compass.length, 4);
    await capture('melds.png');
    await evaluate(`(async()=>{await haiyueMahjong.controller.restore(await (await fetch('../../games/test/fixtures/mahjong-ui-claim.json')).json())})()`);
    await delay(200); assert.ok(await evaluate(`haiyueMahjong.snapshot().presentation.tiles.filter(t=>t.emphasis==='eligible').length>=2`));
    await until(`!!haiyueMahjong.snapshot().presentation.notifications.opportunity`, 'persistent claim notification');
    const opportunity = await evaluate(`haiyueMahjong.snapshot().presentation.notifications.opportunity`);
    assert.match(opportunity.text, /吃/); assert.equal(opportunity.pointerFilter, 'ignore');
    await delay(240); await capture('claim.png');
    await delay(500);
    assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.notifications.opportunity.text`), opportunity.text);
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await delay(220); await capture('notification-human-portrait.png');
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }); await delay(200);
    // The notification must leave the existing action buttons clickable.
    const beforePass=await evaluate(`haiyueMahjong.controller.revision`);
    await click('过');
    assert.ok(await evaluate(`haiyueMahjong.controller.revision>${beforePass}`), 'pass button accepts input below the notification');
    await until(`!haiyueMahjong.snapshot().presentation.notifications.opportunity`, 'claim prompt dismissed after choice');
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
      const notices=await evaluate(`haiyueMahjong.snapshot().presentation.notifications`);
      assert.equal(notices.renderer,'engine-gui-toast');
      assert.equal(notices.event.pointerFilter,'ignore'); assert.ok(notices.event.progress>.9);
      assert.ok(notices.effects.some(e=>e.seat===notices.event.seat&&e.text===notices.event.badge));
      assert.equal(await evaluate(`haiyueMahjong.snapshot().presentation.notifications.opportunity`),null);
      await capture(`notification-ai-${type}.png`);
      return notices;
    };
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
    await until(`!!haiyueMahjong.snapshot().presentation.notifications.opportunity`, 'legal human hu notification');
    assert.match(await evaluate(`haiyueMahjong.snapshot().presentation.notifications.opportunity.text`),/胡/);
    await delay(220); await capture('notification-human-hu.png');
    await click('和牌');
    await until(`!haiyueMahjong.snapshot().presentation.notifications.opportunity`, 'hu prompt cleared after choice');
    for(let i=0;i<3;i++) { if(await evaluate(`haiyueMahjong.snapshot().observation.phase.endsWith('over')`))break; await evaluate(`haiyueMahjong.controller.step()`); await delay(80); }
    await until(`haiyueMahjong.snapshot().presentation.notifications.event?.winning`, 'human hu effect');
    await delay(220); await capture('notification-human-win.png');
    assert.equal(await evaluate(`haiyueMahjong.snapshot().hud.nodes.filter(n=>n.type==='GuiToast').length`),6);
    await evaluate(`haiyueMahjong.controller.reset(900)`); await delay(160);
    const cleared=await evaluate(`haiyueMahjong.snapshot().presentation.notifications`);
    assert.equal(cleared.event,null); assert.equal(cleared.opportunity,null); assert.equal(cleared.effects.length,0); assert.equal(cleared.queued,0);

    await evaluate(`(async()=>{await haiyueMahjong.controller.restore(await (await fetch('../../games/test/fixtures/mahjong-ui-settled.json')).json())})()`);
    await delay(250);
    const settled = await evaluate(`haiyueMahjong.snapshot()`);
    assert.equal(settled.observation.phase, 'hand-over');
    assert.equal(settled.presentation.tiles.some(t=>t.role==='concealed'),false);
    settled.observation.results.at(-1).hands.forEach((hand,seat)=>{
      const faces=settled.presentation.tiles.filter(t=>['hand','revealed'].includes(t.role)&&t.seat===seat);
      assert.equal(faces.length,hand.length); assert.deepEqual(faces.map(t=>t.tile).sort((a,b)=>a-b),[...hand].sort((a,b)=>a-b));
    });
    await capture('settled.png');
    await cdp.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }); await delay(300); await capture('portrait.png');
    assert.deepEqual(errors, []);
    await evaluate(`haiyueMahjong.dispose();(()=>{const r=document.createElement('pre');r.id='result';r.dataset.status='passed';r.textContent=JSON.stringify({status:'passed',nativeGui:true,atlas:true,drawnSeparation:true,meldGroups:true,fanAnalysis:true,humanDiscard:true,workerDelay:true,pauseAndStep:true,portrait:true,modalLayer:true,flowers:true,compass:true,claimHighlights:true,settlementReveal:true,spectatorReveal:true,actionNotifications:true,aiActionEffects:true,notificationLifecycle:true,squareTable:true,largerCompass:true,modelSettings:true,modelSwitching:${!!modelService}});document.body.appendChild(r)})()`);
  } });
const fingerprints = Object.fromEntries(['games/guobiao-mahjong/main.ts','games/guobiao-mahjong/ui/MahjongHud.ts','games/guobiao-mahjong/ui/layout.ts','games/guobiao-mahjong/ui/tileLayout.ts','games/guobiao-mahjong/ui/TileAtlas.ts','games/guobiao-mahjong/ui/tablePresentation.ts','games/guobiao-mahjong/ui/actionNotifications.ts','games/guobiao-mahjong/ui/MahjongNotifications.ts','games/guobiao-mahjong/ui/ModelSettings.ts','games/guobiao-mahjong/api/ModelHub.ts','games/guobiao-mahjong/api/agents.ts','games/guobiao-mahjong/app/MatchController.ts','games/guobiao-mahjong/rules/match.ts','games/guobiao-mahjong/rules/handAnalysis.ts','games/guobiao-mahjong/ai/strategy.ts','games/guobiao-mahjong/bundle.js','games/guobiao-mahjong/ai/mahjong.worker.js','games/guobiao-mahjong/assets/mcr.wasm','games/guobiao-mahjong/assets/tiles-atlas.png','games/guobiao-mahjong/assets/tiles-atlas.json','games/test/fixtures/mahjong-ui-melds.json','games/test/fixtures/mahjong-ui-claim.json','games/test/fixtures/mahjong-ui-settled.json','rollup.config.js'].map(path => [path, createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')]));
writeFileSync(resolve(output, 'browser.json'), JSON.stringify({ schemaVersion: 1, verificationMode: root === sourceRoot ? 'workspace' : 'isolated-game-snapshot', generatedAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim(), dirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: sourceRoot, encoding: 'utf8' }).trim(), fingerprints, ...result }, null, 2));
console.log('Mahjong browser checks passed; screenshots in artifacts/guobiao-mahjong/');
