import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(/^\.{1,2}\//.test(s) && !/\.[a-z0-9]+$/i.test(s) ? s + '.ts' : s, c); } });
const { handTiles, handTileRects, meldTileRects } = await import('../guobiao-mahjong/ui/tileLayout.ts');
const { tileUv } = await import('../guobiao-mahjong/ui/TileAtlas.ts');
const { formedFans, analyzeHand } = await import('../guobiao-mahjong/rules/handAnalysis.ts');
const { createScorer } = await import('../guobiao-mahjong/rules/scorer.ts');
const { createMatch, observe, evaluateWin } = await import('../guobiao-mahjong/rules/match.ts');
const { MatchController } = await import('../guobiao-mahjong/app/MatchController.ts');
const scorer = await createScorer(readFileSync(new URL('../guobiao-mahjong/assets/mcr.wasm', import.meta.url)));
const chow = start => ({ kind: 'chow', tiles: [start, start + 1, start + 2], from: 1, concealed: false, promoted: false });
const kong = (tile, concealed) => ({ kind: 'kong', tiles: Array(4).fill(tile), from: 1, concealed, promoted: false });

test('drawn duplicate moves to the far right while source indices and the remaining sorted hand stay intact', () => {
  const hand = [0, 1, 3, 3, 3, 7, 9, 10, 14, 18, 20, 24, 27, 31], before = [...hand];
  const tiles = handTiles(hand, 3); assert.equal(tiles.at(-1).tile, 3); assert.equal(tiles.at(-1).index, 4);
  assert.equal(tiles.filter(t => t.drawn).length, 1); assert.deepEqual(tiles.slice(0, -1).map(t => t.tile), [...hand.slice(0, 4), ...hand.slice(5)]);
  assert.equal(new Set(tiles.map(t => t.index)).size, 14); assert.deepEqual(hand, before);
  assert.ok(handTiles(hand, null).every(t => !t.drawn));
});
test('drawn tile has a visibly larger gap and fits the same row at desktop and portrait widths', () => {
  for (const [areaWidth, tileWidth] of [[1040, 46], [366, 21]]) {
    const tiles = handTiles(Array.from({ length: 14 }, (_, i) => i), 3), rects = handTileRects(tiles, { x: 12, y: 500, width: areaWidth, height: 70 }, tileWidth);
    const gap = (i) => rects[i].x - rects[i - 1].x - rects[i - 1].width;
    assert.ok(gap(13) > gap(12) * 3); assert.ok(rects[0].x >= 12); assert.ok(rects.at(-1).x + tileWidth <= areaWidth + 12);
  }
});
test('three- and four-tile melds remain separate and atomic in both horizontal and vertical layouts', () => {
  const melds = [chow(0), { ...chow(9), kind: 'pung', tiles: [9, 9, 9] }, kong(18, false), kong(31, true)];
  for (const vertical of [false, true]) {
    const tiles = meldTileRects(melds, { x: 20, y: 40, width: vertical ? 92 : 460, height: vertical ? 260 : 40 }, 22, vertical);
    for (let group = 0; group < melds.length; group++) {
      const current = tiles.filter(t => t.group === group); assert.equal(current.length, melds[group].tiles.length);
      assert.ok(current.every(t => t.rect.y === current[0].rect.y));
      if (group) { const previous = tiles.filter(t => t.group === group - 1); const separation = vertical ? current[0].rect.y - previous[0].rect.y - previous[0].rect.height : current[0].rect.x - previous.at(-1).rect.x - previous.at(-1).rect.width; assert.ok(separation > 4); }
    }
  }
});
test('all 42 faces and the back share one PNG atlas with padded, distinct, bounded UVs', () => {
  const root = new URL('../guobiao-mahjong/assets/', import.meta.url), metadata = JSON.parse(readFileSync(new URL('tiles-atlas.json', root)));
  const png = readFileSync(new URL('tiles-atlas.png', root)); assert.equal(png.subarray(1, 4).toString(), 'PNG'); assert.equal(png.readUInt32BE(16), metadata.width); assert.equal(png.readUInt32BE(20), metadata.height);
  assert.equal(metadata.frames.length, 43); const uv = metadata.frames.map(f => tileUv(f.id)); assert.equal(new Set(uv.map(String)).size, 43);
  for (const [x, y, w, h] of uv) assert.ok(x > 0 && y > 0 && w > 0 && h > 0 && x + w < 1 && y + h < 1);
  assert.deepEqual(tileUv(null), tileUv(42)); assert.throws(() => tileUv(43));
});
test('formed fan preview recognizes seat/prevalent winds once each and consolidates mixed kongs', () => {
  const melds = [{ kind: 'pung', tiles: [27, 27, 27], from: 1, concealed: false, promoted: false }, kong(31, true), kong(9, false)];
  const fans = formedFans([1, 4, 18, 23], melds, 0, 0, scorer.catalog);
  assert.equal(fans.find(f => f.name === '圈风刻').count, 1); assert.equal(fans.find(f => f.name === '门风刻').count, 1);
  assert.ok(!fans.some(f => ['暗杠', '明杠', '双暗杠', '双明杠'].includes(f.name))); assert.equal(fans.find(f => f.name === '明暗杠').value, 5);
});
test('formed preview avoids adding no-honors to a full flush and never invents self-draw or wait points', () => {
  const fans = formedFans([0, 0, 1, 2, 3, 3, 4, 5, 6, 6, 7, 8, 8], [], 0, 0, scorer.catalog);
  assert.ok(fans.some(f => f.name === '清一色')); assert.ok(!fans.some(f => ['无字', '自摸', '门前清', '不求人', '花牌'].includes(f.name)));
});
test('a complete but sub-eight hand displays its real fan separately from eight flowers', () => {
  const s = createMatch(1); s.players[0].melds = [chow(1), chow(12), chow(24)]; s.players[0].hand = [19, 20, 21, 23, 23]; s.players[0].flowers = [34, 35, 36, 37, 38, 39, 40, 41]; s.drawn = 23;
  const a = analyzeHand(observe(s, 0, scorer), scorer); assert.equal(a.kind, 'complete'); assert.ok(a.fan < 8); assert.equal(a.flowers, 8); assert.ok(!a.items.some(f => f.name === '花牌')); assert.equal(evaluateWin(s, 0, scorer), null);
});
test('complete preview matches the referee including special winning context; waiting estimates use the full scorer', () => {
  const s = createMatch(4); s.players[0].hand = [0, 0, 0, 1, 2, 3, 4, 4, 5, 6, 7, 8, 8, 8]; s.drawn = 4;
  const a = analyzeHand(observe(s, 0, scorer), scorer); assert.equal(a.kind, 'complete'); assert.equal(a.fan, evaluateWin(s, 0, scorer).fan);
  s.players[0].hand = [0, 1, 2, 9, 10, 11, 18, 19, 20, 22, 24, 25, 26]; s.turn = 1; s.drawn = 12;
  const waiting = analyzeHand(observe(s, 0, scorer), scorer); assert.equal(waiting.kind, 'waiting'); assert.ok(waiting.waits.length); assert.equal(waiting.fan, Math.min(...waiting.waits.map(w => w.fan)));
  for (const w of waiting.waits) assert.equal(w.fan, scorer.score(s.players[0].hand, [], w.tile, 0, 0, 0, 0).fan);
});
test('fan inspections do not expose opponent hands and an older response cannot overwrite a reset position', async () => {
  const s = createMatch(90), before = analyzeHand(observe(s, 0, scorer), scorer); s.players[1].hand = Array(13).fill(31);
  assert.deepEqual(analyzeHand(observe(s, 0, scorer), scorer), before);
  let resolve; const c = new MatchController(scorer, { inspect: () => new Promise(r => { resolve = r; }) }, 90);
  const pending = c.inspectHand(); c.reset(91); resolve(before); await pending; assert.equal(c.handAnalysis, null); c.dispose();
});

const { directionMarkers, claimHandIndices, meldAccent, flowerRects } = await import('../guobiao-mahjong/ui/tablePresentation.ts');
const { applyAction } = await import('../guobiao-mahjong/rules/match.ts');
test('the reported partial hand includes 五门齐 across exposed and concealed tiles, worth six fan', () => {
  const s = createMatch(1);
  s.players[0].melds = [4, 23].map(tile => ({ kind: 'pung', tiles: [tile, tile, tile], from: 1, concealed: false, promoted: false }));
  s.players[0].hand = [10, 10, 27, 28, 30, 32, 32, 15]; s.drawn = 15;
  const a = analyzeHand(observe(s, 0, scorer), scorer);
  assert.equal(a.kind, 'forming'); assert.equal(a.fan, 6); assert.equal(a.items.find(f => f.name === '五门齐').value, 6);
  for (const category of [t => t < 9, t => t >= 9 && t < 18, t => t >= 18 && t < 27, t => t >= 27 && t <= 30, t => t >= 31]) {
    const hand = s.players[0].hand.filter(t => !category(t)), melds = s.players[0].melds.filter(m => !category(m.tiles[0]));
    assert.ok(!formedFans(hand, melds, 0, 0, scorer.catalog).some(f => f.name === '五门齐'));
  }
  assert.deepEqual(formedFans([], [], 0, 0, scorer.catalog), []);
});
test('table directions follow both the human viewpoint and the current dealer', () => {
  const o = observe(createMatch(1), 0, scorer);
  for (let dealer = 0; dealer < 4; dealer++) for (let view = 0; view < 4; view++) {
    o.dealer = dealer; o.turn = (view + 1) % 4;
    const markers = directionMarkers(o, view);
    assert.deepEqual(markers.map(m => m.position), ['bottom', 'right', 'top', 'left']);
    markers.forEach((m, i) => { assert.equal(m.seat, (view + i) % 4); assert.equal(m.wind, (m.seat - dealer + 4) % 4); });
    assert.equal(markers.filter(m => m.active).length, 1); assert.equal(markers[1].active, true);
  }
  o.phase = 'hand-over'; assert.ok(directionMarkers(o, 0).every(m => !m.active));
});
test('claim highlighting respects the exact tiles and multiplicity for all five meld actions', () => {
  const hand = [0, 0, 0, 0, 1, 2, 2, 9];
  const indices = a => [...claimHandIndices(hand, [a], null)];
  assert.deepEqual(indices({ type: 'chow', tile: 0, tiles: [0, 1, 2] }), [4, 5]);
  assert.deepEqual(indices({ type: 'pung', tile: 0 }), [0, 1]);
  assert.deepEqual(indices({ type: 'kong', tile: 0 }), [0, 1, 2]);
  assert.deepEqual(indices({ type: 'concealed-kong', tile: 0 }), [0, 1, 2, 3]);
  assert.deepEqual(indices({ type: 'add-kong', tile: 9 }), [7]);
  assert.deepEqual(indices({ type: 'hu' }), []);
});
test('claimed chow tile and promoted kong tile are marked, with only the latest completed meld accented', () => {
  const o = observe(createMatch(1), 0, scorer);
  o.players[0].melds = [chow(0), { ...kong(31, false), promoted: true }];
  o.events = [{ index: 0, seat: 0, type: 'chow', tile: 1 }, { index: 1, seat: 0, type: 'pung', tile: 31 }, { index: 2, seat: 0, type: 'add-kong', tile: 31 }];
  assert.deepEqual(meldAccent(o, 0, 0), { calledIndex: 1, latest: false, action: '吃' });
  assert.deepEqual(meldAccent(o, 0, 1), { calledIndex: 3, latest: true, action: '加杠' });
  o.players[0].melds[1].concealed = true; assert.equal(meldAccent(o, 0, 1).calledIndex, null);
});
test('all eight flower sprites fit inside their allocated horizontal and vertical bands', () => {
  for (const vertical of [false, true]) {
    const area = { x: 12, y: 33, width: vertical ? 86 : 180, height: vertical ? 54 : 29 };
    const tiles = flowerRects(8, area, 20, vertical); assert.equal(tiles.length, 8);
    for (const r of tiles) { assert.ok(r.width > 10); assert.ok(r.x >= area.x && r.y >= area.y); assert.ok(r.x + r.width <= area.x + area.width + .001); assert.ok(r.y + r.height <= area.y + area.height + .001); }
  }
});
test('spectator face data is display-only, cloned, and disabled when a human joins; settlement reveals all four', async () => {
  const c = new MatchController(scorer, {}, 8); assert.equal(c.presentationHands(), null);
  c.setHuman(null); const visible = c.presentationHands(); assert.equal(visible.hands.length, 4);
  for (let i = 0; i < 4; i++) { assert.deepEqual(visible.hands[i], c.observation(i).hand); assert.ok(c.observation(i).players.every(p => !('hand' in p))); }
  visible.hands[1][0] = 99; assert.ok(!c.presentationHands().hands[1].includes(99));
  c.setHuman(2); assert.equal(c.presentationHands(), null); c.dispose();
  const s = createMatch(8); s.players[0].hand = [0, 0, 0, 1, 2, 3, 4, 4, 5, 6, 7, 8, 8, 8]; s.drawn = 4;
  applyAction(s, 0, { type: 'hu' }, scorer); assert.equal(s.phase, 'hand-over');
  const settled = new MatchController(scorer, { replay: async () => s }); const saved = settled.save();
  await settled.restore(saved); assert.deepEqual(settled.presentationHands().hands, s.results[0].hands);
  assert.equal(settled.presentationHands().hands.length, 4); settled.dispose();
});

const { ActionNoticeFeed, actionOpportunity, NOTICE_QUEUE_LIMIT, notificationRects } = await import('../guobiao-mahjong/ui/actionNotifications.ts');
const { tableLayout, sideHandRects } = await import('../guobiao-mahjong/ui/layout.ts');
const noticeObservation = () => { const o = observe(createMatch(88), 0, scorer); o.events = []; return o; };
const addNoticeEvent = (o, type, seat = 1, extra = {}) => o.events.push({ index: o.events.length, hand: o.handIndex, type, seat, text: type, ...extra });
test('action opportunity shows only the human legal actions, with hu prominent and duplicate kong options merged', () => {
  const o = noticeObservation(); o.phase = 'response'; o.last = { seat: 3, tile: 4, robKong: false };
  o.legalActions = [{ type: 'pass' }, { type: 'hu' }, { type: 'pung', tile: 4 }, { type: 'kong', tile: 4 }, { type: 'chow', tile: 4, tiles: [3, 4, 5] }];
  const prompt = actionOpportunity(o, 0, true); assert.ok(prompt.winning); assert.match(prompt.text, /胡 \/ 杠 \/ 碰 \/ 吃/); assert.match(prompt.text, /5万/);
  o.revision += 3; o.legalActions.reverse(); assert.equal(actionOpportunity(o, 0, true).id, prompt.id);
  for (const [human, started] of [[null, true], [1, true], [0, false]]) assert.equal(actionOpportunity(o, human, started), null);
  o.legalActions = [{ type: 'pass' }, { type: 'discard', tile: 4 }]; assert.equal(actionOpportunity(o, 0, true), null);
  o.legalActions = [{ type: 'concealed-kong', tile: 0 }, { type: 'concealed-kong', tile: 1 }, { type: 'add-kong', tile: 2 }];
  assert.equal((actionOpportunity(o, 0, true).text.match(/杠/g) ?? []).length, 1);
});
test('notification feed ignores restored history and emits each new completed action once across repaints', () => {
  const o = noticeObservation(), feed = new ActionNoticeFeed();
  addNoticeEvent(o, 'pung', 2, { tile: 4 }); assert.ok(feed.sync(o, 0, true, 1).reset); assert.equal(feed.pending, 0);
  addNoticeEvent(o, 'chow', 1, { tile: 5 }); feed.sync(o, 0, true, 1);
  assert.equal(feed.pending, 1); const notice = feed.take(); assert.equal(notice.badge, '吃'); assert.match(notice.text, /南.*青竹 AI.*6万/);
  for (let i = 0; i < 5; i++) { o.revision++; feed.sync(o, 0, true, 1); }
  assert.equal(feed.take(), null);
  addNoticeEvent(o, 'kong', 3, { tile: 9 }); assert.ok(feed.sync(o, 0, true, 2).reset); assert.equal(feed.pending, 0);
  addNoticeEvent(o, 'pung', 0, { tile: 9 }); feed.sync(o, 0, true, 2); assert.match(feed.take().text, /东 · 你.*碰 1条/);
});
test('kong effects wait for confirmation and concealed-kong notifications never expose their tile', () => {
  const o = noticeObservation(), feed = new ActionNoticeFeed(); feed.sync(o, null, true, 0);
  addNoticeEvent(o, 'kong-offer', 1, { tile: 31 }); feed.sync(o, null, true, 0); assert.equal(feed.pending, 0);
  addNoticeEvent(o, 'add-kong', 1, { tile: 31 }); feed.sync(o, null, true, 0); assert.match(feed.take().text, /加杠 中/);
  addNoticeEvent(o, 'concealed-kong', 2, { tile: 33, text: '暗杠 白' }); feed.sync(o, null, true, 0);
  const hidden = feed.take(); assert.equal(hidden.badge, '杠'); assert.match(hidden.text, /暗杠$/); assert.ok(!hidden.text.includes('暗杠 白')); assert.ok(!('tile' in hidden));
});
test('fast AI actions have a bounded queue and hu immediately replaces older pending effects with the actual fan', () => {
  const o = noticeObservation(), feed = new ActionNoticeFeed(); feed.sync(o, null, true, 0);
  for (let i = 0; i < 20; i++) addNoticeEvent(o, 'pung', i % 4, { tile: i % 27 });
  const batch = feed.sync(o, null, true, 0); assert.equal(feed.pending, NOTICE_QUEUE_LIMIT);
  assert.equal(batch.added.length, 20); assert.deepEqual(batch.added.map(n => n.seat), Array.from({ length: 20 }, (_, i) => i % 4));
  o.results = [{ hand: 0, winner: 2, selfDrawn: true, win: { fan: 16, flowers: 2 } }];
  addNoticeEvent(o, 'hu', 2); const update = feed.sync(o, null, true, 0); assert.ok(update.urgent); assert.equal(feed.pending, 1);
  const win = feed.take(); assert.equal(win.badge, '胡'); assert.ok(win.winning); assert.match(win.text, /自摸 · 16 番 \+ 2 花/);
  o.handIndex++; o.events = [{ index: 30, hand: 1, type: 'start', seat: 1, text: '下一局' }]; feed.sync(o, null, true, 0); assert.equal(feed.pending, 0);
});
test('notification locations fit desktop and portrait viewports and leave action buttons accessible', () => {
  for (const [w, h] of [[1440, 900], [390, 844]]) for (let relative = 0; relative < 4; relative++) {
    const r = notificationRects(w, h, relative);
    for (const rect of Object.values(r)) { assert.ok(rect.x >= 0 && rect.y >= 0); assert.ok(rect.x + rect.width <= w); assert.ok(rect.y + rect.height <= h); }
    const table = tableLayout(w, h).table; assert.ok(r.opportunity.y + r.opportunity.height < tableLayout(w, h).actionY);
  }
});
test('presentation epoch changes for resets, restores and viewing seats but ordinary human decisions keep it stable', async () => {
  const c = new MatchController(scorer, { replay: async () => createMatch(90) }, 90), initial = c.presentationEpoch;
  c.start(); c.act(c.observation().legalActions.find(a => a.type === 'discard')); assert.equal(c.presentationEpoch, initial);
  c.setHuman(null); const spectator = c.presentationEpoch; assert.ok(spectator > initial);
  c.reset(91); const fresh = c.presentationEpoch; assert.ok(fresh > spectator);
  await c.restore(c.save()); assert.ok(c.presentationEpoch > fresh); c.dispose();
});

const awaitCompass = await import('../guobiao-mahjong/ui/tablePresentation.ts');
test('square tables use the available height, larger side faces and a 25-percent larger compass', () => {
  for (const [w,h] of [[1440,900],[1920,1080],[390,844],[390,700]]) {
    const l=tableLayout(w,h); assert.equal(l.table.width,l.table.height);
    assert.ok(l.table.x>=0&&l.table.y>=0&&l.table.x+l.table.width<=w);
    const rects=sideHandRects(l.table,14,true,true);
    rects.forEach(r=>{assert.ok(r.y>=l.table.y);assert.ok(r.y+r.height<l.table.y+l.table.height);assert.ok(Math.abs(r.height/r.width-1.375)<.001)});
    assert.ok(rects.at(-1).y-rects.at(-2).y-rects.at(-2).height>3);
  }
  const l=tableLayout(1440,900);assert.ok(l.table.height>634);assert.ok(sideHandRects(l.table,13,false,false)[0].width>32);
  const { compassRects }=awaitCompass; assert.equal(compassRects(l.center,l.table).panel.width,145);
});

const {ModelHub}=await import('../guobiao-mahjong/api/ModelHub.ts');
const {httpAgent}=await import('../guobiao-mahjong/api/agents.ts');
test('model discovery and seat assignments validate the whole change and pass explicit model parameters', async()=>{
  const original=globalThis.fetch,c=new MatchController(scorer,{},42);c.setHuman(null);
  const hub=new ModelHub(c),o=c.observation(),action=o.legalActions[0],requests=[];
  globalThis.fetch=async(url,options)=>{
    if(String(url).endsWith('/models'))return new Response(JSON.stringify({protocol:'haiyue.mcr/1',models:[{id:'kd-s0',name:'KD Student 0',rules:'MCR',available:true,license:'MIT'}]}));
    const request=JSON.parse(options.body);requests.push(request);
    return new Response(JSON.stringify({requestId:request.requestId,revision:request.observation.revision,action}));
  };
  try{
    await hub.refresh(); assert.equal(hub.models.length,1);
    assert.throws(()=>hub.apply(['kd-s0','unknown','builtin','builtin'],{temperature:0,seed:42}));
    assert.deepEqual(hub.assignments,['builtin','builtin','builtin','builtin']);
    hub.apply(['kd-s0','builtin','builtin','builtin'],{temperature:.5,seed:42});assert.equal(hub.assignments[0],'kd-s0');
    const agent=httpAgent('KD','http://localhost:8787/agent/kd-s0',{parameters:()=>({...hub.parameters})});
    const reply=await agent.decide(o,{signal:new AbortController().signal,requestId:'model-test'});assert.deepEqual(reply,action);
    assert.deepEqual(requests[0].parameters,{temperature:.5,seed:42});assert.deepEqual(requests[0].observation,o);
    assert.throws(()=>hub.apply(['builtin','builtin','builtin','builtin'],{temperature:3,seed:1}));
    hub.dispose();
  }finally{globalThis.fetch=original;c.dispose()}
});
