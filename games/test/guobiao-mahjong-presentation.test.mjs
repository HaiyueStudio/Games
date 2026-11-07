import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({ resolve(s, c, next) { return next(/^\.{1,2}\//.test(s) && !/\.[a-z0-9]+$/i.test(s) ? s + '.ts' : s, c); } });
const { handTiles, handTileRects, meldTileRects, playerRowTiles, riverTileRects, seatPlacement, PLAYER_ROW_EDGE, PLAYER_ROW_SPAN, RIVER_OFFSET } = await import('../guobiao-mahjong/ui/tileLayout.ts');
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
  assert.ok(fans.some(f => f.name === '清一色')); assert.equal(fans.find(f=>f.name==='门前清').value,2);assert.ok(!fans.some(f => ['无字', '自摸', '不求人', '花牌'].includes(f.name)));
});
test('no-honors preview counts one fan across hand and melds and stays visible in the HUD summary', async () => {
  const { fanPreviewItems } = await import('../guobiao-mahjong/ui/tablePresentation.ts');
  const hand = [0, 0, 4, 9, 13, 18, 22, 26], melds = [kong(9, false)];
  const fans = formedFans(hand, melds, 0, 0, scorer.catalog);
  assert.equal(fans.find(f=>f.name==='无字').value, 1);
  assert.equal(fans.find(f=>f.name==='无字').count, 1);
  for (const honor of [27, 31, 33]) {
    assert.ok(!formedFans([...hand,honor],melds,0,0,scorer.catalog).some(f=>f.name==='无字'));
    assert.ok(!formedFans(hand,[kong(honor,false)],0,0,scorer.catalog).some(f=>f.name==='无字'));
  }
  const busy = ['三色三同顺','门前清','幺九刻','无字'].map(name=>({...scorer.catalog.find(f=>f.name===name),count:1}));
  assert.ok(fanPreviewItems(busy).some(f=>f.name==='无字')); assert.equal(busy.length,4);
});
test('closed-hand preview retains concealed kongs, loses status on exposed calls and defers self-draw exclusions to the scorer',()=>{
  const hand=[0,2,4,9,12,15,18,22,26,27,28,31,32];
  const has=melds=>formedFans(hand,melds,0,0,scorer.catalog).find(f=>f.name==='门前清');
  assert.equal(has([]).value,2);assert.equal(has([kong(30,true)]).count,1);
  for(const m of [chow(0),{...chow(9),kind:'pung',tiles:[9,9,9]},kong(30,false),{...kong(30,false),promoted:true}])assert.equal(has([m]),undefined);
  const four=formedFans([0,0,0,9,9,9,18,18,18,27,27,27,31],[],0,0,scorer.catalog);
  assert.ok(four.some(f=>f.name==='四暗刻'));assert.ok(!four.some(f=>f.name==='门前清'));
  const ready=[0,1,2,9,10,11,18,19,20,24,25,26,31];
  const ron=scorer.score(ready,[],31,0,0,0,0),self=scorer.score(ready,[],31,0,1,0,0);
  assert.equal(ron.items.find(f=>f.name==='门前清').value,2);assert.ok(self.items.some(f=>f.name==='不求人'));assert.ok(!self.items.some(f=>f.name==='门前清'));
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

const { TILE_THICKNESS, WALL_TILE_PITCH, TABLE_ZOOM, CAMERA_ELEVATION, CAMERA_FOV, HAND_STAND_ANGLE, OPPONENT_STAND_ANGLE, WALL_RADIUS, tilePose, tableFrame, projectPoint, tileScreenRect, wallTiles, dealerPosition } = await import('../guobiao-mahjong/rendering/tableModel.ts');
const { surfaceLayout } = await import('../guobiao-mahjong/ui/layout.ts');
const { TileAnimationTimeline, flightAt, wallPickup } = await import('../guobiao-mahjong/rendering/tileAnimations.ts');
const { nextHand } = await import('../guobiao-mahjong/rules/match.ts');
const { mat4 } = await import('wgpu-matrix');
test('picking projection agrees with the perspective camera matrix at every viewport size', () => {
  for(const [w,h] of [[1440,900],[1920,1080],[3500,734],[390,844]]) {
    const f=tableFrame(w,h), a=CAMERA_ELEVATION;
    const view=mat4.lookAt([f.cameraX,f.cameraY,f.cameraZ],[f.cameraX,f.targetUp*Math.cos(a),-f.targetUp*Math.sin(a)],[0,1,0]);
    const vp=mat4.multiply(mat4.perspective(CAMERA_FOV,w/h,1,f.distance+5000),view);
    for(const [x,y,z] of [[0,0,0],[-400,15,-450],[400,80,450],[0,160,0]]) {
      const q=projectPoint(f,x,y,z), d=vp[3]*x+vp[7]*y+vp[11]*z+vp[15];
      const sx=((vp[0]*x+vp[4]*y+vp[8]*z+vp[12])/d+1)*w/2;
      const sy=(1-(vp[1]*x+vp[5]*y+vp[9]*z+vp[13])/d)*h/2;
      assert.ok(Math.abs(q.x-sx)<.002&&Math.abs(q.y-sy)<.002);
    }
  }
});
test('wall sequence crosses adjacent corners and both ends pick the physical upper tile',()=>{
  const all=wallTiles({head:0,tail:143}).filter(t=>t.index%2===0);
  for(let i=1;i<all.length;i++)assert.ok(Math.hypot(all[i].x-all[i-1].x,all[i].z-all[i-1].z)<=Math.SQRT2*(WALL_RADIUS-255)+1e-9);
  assert.ok(all.reduce((sum,t,i)=>{const n=all[(i+1)%all.length];return sum+t.x*n.z-n.x*t.z},0)>0,'clockwise in screen/table coordinates');
  assert.equal(wallPickup({head:0,tail:143},0,false).pose.y,1+WALL_TILE_PITCH);
  assert.equal(wallPickup({head:0,tail:143},0,true).pose.y,1+WALL_TILE_PITCH);
  assert.equal(wallPickup({head:0,tail:142},0,true).pose.y,1);
  assert.equal(wallPickup({head:144,tail:143},0,false),null);
});
function animationBoard(s, privateHands=false, epoch=1) {
  const observation=observe(s,0,scorer), tiles=[];
  const push=(tile,role,who,index,group=-1,drawn=false)=>tiles.push({tile,role,seat:who,sourceIndex:index,group,drawn,emphasis:'',rect:{x:100+index*40,y:100+who*220,width:30,height:41.25}});
  s.players.forEach((p,who)=>{
    const drawn=s.phase==='turn'&&s.turn===who?s.drawn:null;
    handTiles(p.hand,drawn).forEach(t=>push(privateHands&&who!==0?null:t.tile,who===0?'hand':privateHands?'concealed':'revealed',who,t.index,-1,t.drawn));
    p.river.forEach((t,i)=>push(t,'river',who,i));
    observation.players[who].melds.forEach((m,g)=>m.tiles.forEach((t,i)=>push(t,'meld',who,i,g)));
    p.flowers.forEach((t,i)=>push(t,'flower',who,i));
  });
  const result=s.results.at(-1), winningTile=s.phase.endsWith('over')&&result?.winner!==null?(result?.selfDrawn?s.drawn:s.last?.tile??null):null;
  return {observation,tiles,wall:{head:s.head,tail:s.tail},view:0,epoch,winningTile};
}
test('actual replay actions animate draws, discards, claims and winning tiles with exact endpoints',()=>{
  const replay=JSON.parse(readFileSync(new URL('./fixtures/mahjong-ui-melds.json',import.meta.url))).replay;
  const s=createMatch(replay.seed,replay.players), timeline=new TileAnimationTimeline(), kinds=new Set();
  timeline.sync(animationBoard(s),false);
  for(const record of replay.actions) {
    if(record.hand===s.handIndex+1)nextHand(s);
    applyAction(s,record.seat,record.action,scorer,record.revision);
    timeline.sync(animationBoard(s),false);
    for(const f of timeline.flights) {
      kinds.add(f.kind);assert.deepEqual(flightAt(f,f.delay).pose,f.from);
      assert.deepEqual(flightAt(f,f.delay+f.duration).pose,f.to);
      const middle=flightAt(f,f.delay+f.duration/2).pose;
      assert.ok(middle.y>(f.from.y+f.to.y)/2);
      if(f.kind==='draw'||f.kind==='flower')assert.ok(Number.isInteger(f.wallIndex));
    }
  }
  for(const kind of ['draw','discard','chow','pung','concealed-kong','add-kong','hu'])assert.ok(kinds.has(kind),kind);
});
test('draw privacy, paused playback, single-step playback and restore reset are deterministic',()=>{
  const s=createMatch(88), t=new TileAnimationTimeline();s.turn=0;s.phase='turn';s.drawn=s.players[0].hand.at(-1);
  t.sync(animationBoard(s,true),false);
  applyAction(s,0,{type:'discard',tile:s.players[0].hand[0]},scorer);
  t.sync(animationBoard(s,true),false);assert.ok(t.active);
  t.advance(100,true);assert.equal(t.elapsed,0);t.advance(100,false);assert.equal(t.elapsed,100);
  t.sync(animationBoard(s,true,2),false);assert.equal(t.active,false);
  // An explicit step starts its presentation even though the controller stays paused.
  const o=animationBoard(s,true,2);o.observation.revision++;
  o.observation.events.push({index:o.observation.events.at(-1).index+1,hand:0,type:'draw',seat:1,text:'摸牌'});
  o.wall.head++;const target=o.tiles.filter(t=>t.seat===1&&t.role==='concealed').at(-1);target.drawn=true;
  t.sync(o,true);assert.ok(t.active);t.advance(100,true);assert.equal(t.elapsed,100);
  t.advance(100,true,true);assert.equal(t.elapsed,100);
  assert.ok(t.flights.filter(f=>f.kind==='draw').every(f=>flightAt(f,9999).tile===null));
});
test('exposed kong moves four tiles before replacement; flower chains pick front then back in order',()=>{
  const prepare=()=>{const s=createMatch(91);s.phase='response';s.turn=0;s.last={seat:0,tile:0,robKong:false};s.responses={};s.players[0].river.push(0);s.players[0].hand=s.players[0].hand.slice(0,13);s.drawn=null;return s};
  const s=prepare(), timeline=new TileAnimationTimeline();
  s.players[1].hand=[0,0,0,1,3,5,9,11,13,18,20,22,31];
  timeline.sync(animationBoard(s),false);
  applyAction(s,1,{type:'kong',tile:0},scorer);applyAction(s,2,{type:'pass'},scorer);applyAction(s,3,{type:'pass'},scorer);
  timeline.sync(animationBoard(s),false);
  assert.equal(timeline.flights.filter(f=>f.kind==='kong').length,4);
  assert.ok(timeline.flights.find(f=>f.kind==='draw').delay>=850);
  const f=prepare(), chain=new TileAnimationTimeline(), head=f.head, tail=f.tail;
  f.wall[head]=34;f.wall[tail]=35;f.wall[tail-1]=2;
  chain.sync(animationBoard(f,true),false);
  for(const seat of [1,2,3])applyAction(f,seat,{type:'pass'},scorer);
  chain.sync(animationBoard(f,true),false);
  const flights=chain.flights.filter(v=>['flower','draw'].includes(v.kind));
  assert.deepEqual(flights.map(v=>v.wallIndex),[head,tail,tail-1]);
  assert.deepEqual(flights.map(v=>v.tile),[34,35,null]);
  assert.ok(flights[2].delay>flights[1].delay&&flights[1].delay>flights[0].delay);
});
test('settlement hands lie flat face up on all four aligned racks, including a previously selected tile', () => {
  for(let relative=0;relative<4;relative++) {
    const row=playerRowTiles(handTiles([0,1,2,9,10,11,18,19,20,27,27,27,31],null),[],relative,0);
    for(const t of row.hands) {
      const p=tilePose({...t,role:'revealed',emphasis:'selected',flat:true});
      assert.equal(p.angle,0);assert.equal(p.y,1);
      assert.ok(Math.abs(p.x*Math.sin(p.yaw)+p.z*Math.cos(p.yaw)+t.rect.height/2-PLAYER_ROW_EDGE)<1e-8);
    }
  }
});
test('all eight flowers precede melds and hands on the same aligned rack without overflowing any seat',()=>{
  for(let relative=0;relative<4;relative++)for(let groups=0;groups<=4;groups++){
    const melds=Array.from({length:groups},()=>kong(1,false)),tiles=handTiles(Array.from({length:14-groups*3},(_,i)=>i),13-groups*3);
    const row=playerRowTiles(tiles,melds,relative,HAND_STAND_ANGLE,[34,35,36,37,38,39,40,41]);
    const along=t=>{const p=tilePose({...t,role:'flower',emphasis:''});return p.x*Math.cos(t.yaw)-p.z*Math.sin(t.yaw)};
    assert.equal(row.flowers.length,8);assert.deepEqual(row.flowers.map(t=>t.tile),[34,35,36,37,38,39,40,41]);
    assert.ok(along(row.flowers.at(-1))+row.flowers.at(-1).rect.width/2<along([...row.melds,...row.hands][0])-[...row.melds,...row.hands][0].rect.width/2);
    for(const t of row.flowers){const p=tilePose({...t,role:'flower',emphasis:''});assert.ok(Math.abs(p.x*Math.sin(p.yaw)+p.z*Math.cos(p.yaw)+t.rect.height/2-PLAYER_ROW_EDGE)<1e-8);}
    const all=[...row.flowers,...row.melds,...row.hands];
    assert.ok(Math.max(...all.map(t=>along(t)+t.rect.width/2))-Math.min(...all.map(t=>along(t)-t.rect.width/2))<=PLAYER_ROW_SPAN+1e-8);
  }
});
test('native rounded PBR instances preserve static transforms while flying instances update and remain bounded',async()=>{
  const {World}=await import('@haiyue/engine'),{RoundedTileBodies,TILE_BODY_CAPACITY}=await import('../guobiao-mahjong/rendering/RoundedTileBodies.ts');
  const world=new World('rounded tile instances'),bodies=new RoundedTileBodies(world),pose={x:14,y:35,z:120,angle:HAND_STAND_ANGLE,yaw:Math.PI/2};
  try{
    bodies.beginStatic();bodies.add(pose,40,55,false);bodies.beginMoving();bodies.add({...pose,x:210},28,38,true,true);bodies.commit();
    assert.equal(bodies.material.type,'instanced-pbr');assert.equal(bodies.material.activeInstanceCount,4);
    const fixed=bodies.material.transforms.slice(0,32);bodies.material.clearTransformsDirty();
    bodies.beginMoving();bodies.add({...pose,x:250,y:90},30,42,true,true);bodies.commit();
    assert.deepEqual(bodies.material.transforms.slice(0,32),fixed);assert.ok(Math.abs(bodies.material.transforms[44]-(250+TILE_THICKNESS*.15*Math.sin(pose.angle)))<1e-5);
    const normals=bodies.geometry.normals;assert.ok(new Set(Array.from({length:normals.length/3},(_,i)=>Array.from(normals.subarray(i*3,i*3+3)).join(','))).size>6,'rounded edges have smooth intermediate normals');
    bodies.beginStatic();for(let i=0;i<144;i++)bodies.add(pose,28,38,false);bodies.beginMoving();for(let i=0;i<32;i++)bodies.add(pose,28,38,false,true);bodies.commit();
    assert.equal(bodies.material.activeInstanceCount,TILE_BODY_CAPACITY);assert.throws(()=>bodies.add(pose,28,38,false,true),/capacity/);
  }finally{world.destroy();}
});
test('retained table batches preserve rotated faces, normals and indices when reused, shrunk and hidden', async () => {
  const { World,BasicMaterial }=await import('@haiyue/engine');
  const { TableBatch }=await import('../guobiao-mahjong/rendering/TableBatch.ts');
  const world=new World('batch regression'),solid=new TableBatch(world,'solid',new BasicMaterial(),128);
  const textured=new TableBatch(world,'face',new BasicMaterial(),16,true);
  try {
    const pose={x:31,y:72,z:-140,angle:Math.PI/3,yaw:Math.PI/2};
    solid.slab(pose,40,55,3,7);solid.commit();
    const g=solid.geometry,positions=g.positions.buffer,indices=g.indices.buffer;
    assert.equal(g.vertexCount,56);assert.equal(g.indexCount,72);
    assert.ok([...g.indices].every(i=>i<g.vertexCount));
    for(let i=0;i<g.normals.length;i+=3)assert.ok(Math.abs(Math.hypot(...g.normals.subarray(i,i+3))-1)<1e-6);
    const local=[-18,10,-27.5],y=local[1]*Math.cos(pose.angle)-local[2]*Math.sin(pose.angle),z=local[1]*Math.sin(pose.angle)+local[2]*Math.cos(pose.angle);
    const expected=[local[0]*Math.cos(pose.yaw)+z*Math.sin(pose.yaw)+pose.x,y+pose.y,-local[0]*Math.sin(pose.yaw)+z*Math.cos(pose.yaw)+pose.z];
    g.positions.subarray(0,3).forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-5));
    solid.clear();solid.face({x:0,y:1,z:0},40,55,0);solid.commit();
    assert.equal(g.vertexCount,4);assert.equal(g.normals.length,12);assert.equal(g.indexCount,6);
    assert.equal(g.positions.buffer,positions);assert.equal(g.indices.buffer,indices);
    const uv=tileUv(31);textured.face(pose,40,55,10.15,uv);textured.commit();
    assert.equal(textured.geometry.getTextureCoordinates(0).length,textured.geometry.vertexCount*2);
    assert.ok(Math.abs(textured.geometry.getTextureCoordinates(0)[0]-uv[0])<1e-7);
    textured.clear();textured.face({x:0,y:0,z:0},40,55,-.12,uv,true);textured.commit();
    assert.equal(textured.geometry.normals[1],-1);
    const ps=textured.geometry.positions,is=textured.geometry.indices;
    const a=Array.from(ps.subarray(is[0]*3,is[0]*3+3)),b=Array.from(ps.subarray(is[1]*3,is[1]*3+3)),c=Array.from(ps.subarray(is[2]*3,is[2]*3+3));
    assert.ok((b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2])<0,'back surface winding agrees with its outward PBR normal');
    const version=g.version;solid.clear();solid.commit();assert.equal(solid.entity.disabled,true);assert.equal(g.version,version);
    assert.throws(()=>{for(let i=0;i<3;i++)solid.slab(pose,40,55,0,10);},/capacity/);
  } finally {world.destroy();}
});
test('the 30-degree perspective camera fits both the table and upright hands without clipping', () => {
  for (const [w,h] of [[1440,900],[1920,1080],[3500,734],[390,844],[390,700],[844,390]]) {
    const f=tableFrame(w,h), r=f.table;
    assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=w&&r.y+r.height<=h);
    assert.ok(Math.abs(f.viewport.height-(h<600?h-92:h)*.95)<1e-6);
    if(h<600)assert.ok(r.y+r.height<h-80);
    assert.ok(r.height/h<=.950001);
    for(let relative=0;relative<4;relative++)for(const t of playerRowTiles(handTiles(Array.from({length:14},(_,i)=>i),13),[],relative).hands) {
      const box=tileScreenRect(f,{rect:t.rect,yaw:t.yaw,role:'revealed',emphasis:''});
      assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=w&&box.y+box.height<=h,JSON.stringify({w,h,relative,box}));
    }
    assert.ok(projectPoint(f,100,0,400).scale>projectPoint(f,100,0,-400).scale, 'near tiles are larger');
  }
  const l=surfaceLayout(), rects=sideHandRects(l.table,14,true,true);
  assert.ok(rects.at(-1).y-rects.at(-2).y-rects.at(-2).height>3);
  const own=playerRowTiles(handTiles(Array.from({length:14},(_,i)=>i),13),[],0).hands[0];
  assert.ok(tileScreenRect(tableFrame(1440,900),{...own,role:'hand',emphasis:''}).width>40);
});
test('each player has one aligned row for upright hands and separate exposed groups, even with four kongs',()=>{
  for(let relative=0;relative<4;relative++)for(let groups=0;groups<=4;groups++) {
    const melds=Array.from({length:groups},()=>kong(1,false)), count=14-groups*3;
    const ordered=handTiles(Array.from({length:count},(_,i)=>i),count-1), row=playerRowTiles(ordered,melds,relative);
    const all=[...row.melds.map(t=>({...t,role:'meld'})),...row.hands.map(t=>({...t,role:'revealed'}))];
    let min=Infinity,max=-Infinity;
    for(const t of all) {
      const p=tilePose({...t,emphasis:''}), outward=p.x*Math.sin(t.yaw)+p.z*Math.cos(t.yaw);
      const extent=t.role==='meld'?t.rect.height/2:Math.cos(HAND_STAND_ANGLE)*t.rect.height/2+Math.sin(HAND_STAND_ANGLE)*TILE_THICKNESS;
      assert.ok(Math.abs(outward+extent-PLAYER_ROW_EDGE)<1e-8);
      const along=p.x*Math.cos(t.yaw)-p.z*Math.sin(t.yaw);
      min=Math.min(min,along-t.rect.width/2);max=Math.max(max,along+t.rect.width/2);
      assert.equal(p.angle,t.role==='meld'?0:HAND_STAND_ANGLE);
    }
    assert.ok(max-min<=PLAYER_ROW_SPAN+1e-8);
    assert.deepEqual(row.hands.map(t=>t.index),ordered.map(t=>t.index));assert.ok(row.hands.at(-1).drawn);
    for(const role of ['hand','concealed','revealed'])assert.equal(tilePose({rect:row.hands[0].rect,role,emphasis:''}).angle,role==='concealed'?OPPONENT_STAND_ANGLE:HAND_STAND_ANGLE);
    for(let g=1;g<groups;g++) {
      const before=row.melds.filter(t=>t.group===g-1).at(-1), after=row.melds.find(t=>t.group===g);
      const a=tilePose({...before,role:'meld',emphasis:''}),b=tilePose({...after,role:'meld',emphasis:''});
      const gap=(b.x-a.x)*Math.cos(b.yaw)-(b.z-a.z)*Math.sin(b.yaw)-(after.rect.width+before.rect.width)/2;
      assert.ok(gap>10);
    }
  }
});
test('concealed opponent racks stand exactly vertical and remain aligned with their exposed tiles',()=>{
  for(let relative=1;relative<4;relative++) {
    const row=playerRowTiles(handTiles([0,1,2,9,10,11,18,19,20,27,31],31),[chow(3)],relative,OPPONENT_STAND_ANGLE);
    for(const t of row.hands) {
      const p=tilePose({...t,role:'concealed',emphasis:''});assert.equal(p.angle,Math.PI/2);
      assert.ok(Math.abs(p.x*Math.sin(p.yaw)+p.z*Math.cos(p.yaw)+TILE_THICKNESS-PLAYER_ROW_EDGE)<1e-8);
    }
  }
});
test('rivers leave a wider central gap, do not overlap one another, and stay inside the expanded wall',()=>{
  const all=[];
  for(let relative=0;relative<4;relative++) {
    const rects=riverTileRects(36,relative);all.push(...rects);
    for(const r of rects) {
      const near=relative===0?r.y-500:relative===2?500-r.y-r.height:relative===1?r.x-500:500-r.x-r.width;
      const far=near+(relative%2?r.width:r.height);
      assert.ok(near>=RIVER_OFFSET-1e-9&&far<WALL_RADIUS-19);
    }
  }
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++) {
    const a=all[i],b=all[j];assert.ok(a.x+a.width<=b.x+1e-8||b.x+b.width<=a.x+1e-8||a.y+a.height<=b.y+1e-8||b.y+b.height<=a.y+1e-8);
  }
});
test('screen hit areas follow the raised 3D hand and preserve the separated draw', () => {
  const l=surfaceLayout(), ordered=handTiles(Array.from({length:14},(_,i)=>i),13);
  const plan=handTileRects(ordered,{x:0,y:l.handY,width:1000,height:80},l.tile);
  for(const [w,h] of [[1440,900],[390,844]]) {
    const f=tableFrame(w,h), rects=plan.map(rect=>tileScreenRect(f,{rect,role:'hand',emphasis:''}));
    rects.forEach(r=>{assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=w&&r.y+r.height<=h)});
    assert.ok(rects.at(-1).x-rects.at(-2).x-rects.at(-2).width>3*(rects[1].x-rects[0].x-rects[0].width));
    const raised=tileScreenRect(f,{rect:plan[0],role:'hand',emphasis:'selected'});
    assert.ok(raised.y<rects[0].y); assert.ok(raised.width>rects[0].width);
  }
});
test('wall stacks reflect front and replacement draws exactly without floating upper tiles or hidden identities', () => {
  for(const head of [0,1,2,53,87,143,144]) for(const back of [0,1,2,7,30]) for(let dealer=0;dealer<4;dealer++) {
    const tail=143-back, tiles=wallTiles({head,tail},dealer);
    assert.equal(tiles.length,Math.max(0,tail-head+1));
    assert.equal(new Set(tiles.map(t=>t.index)).size,tiles.length);
    for(const t of tiles) {
      assert.ok(!('tile' in t));assert.ok(t.index>=head&&t.index<=tail);
      if(t.layer===1)assert.ok(tiles.some(b=>b.side===t.side&&b.stack===t.stack&&b.layer===0));
    }
  }
  const c=new MatchController(scorer,{},91), wall=c.presentationWall();
  assert.equal(wallTiles(wall).length,c.observation().wallRemaining);
  wall.head=144;assert.notEqual(c.presentationWall().head,144);c.dispose();
  for(let relative=0;relative<4;relative++)assert.ok(dealerPosition(relative).width>0);
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
    await hub.refresh(); assert.equal(hub.models.filter(m=>m.source==='http').length,1); assert.equal(hub.models.filter(m=>m.source==='browser').length,9); assert.equal(hub.backend,'webgpu');
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

test('closed drawers center a 15-percent wider table and docked layouts keep the entire table in its own viewport',()=>{
  const closed=tableFrame(1440,900);assert.equal(closed.zoom,TABLE_ZOOM);assert.ok(Math.abs(closed.table.width/(1440-32-246)-1.15)<1e-8);assert.ok(Math.abs(closed.table.x+closed.table.width/2-720)<1e-8);
  for(const dock of ['left','right']){const f=tableFrame(1440,900,dock);assert.ok(f.table.x>=f.viewport.x);assert.ok(f.table.x+f.table.width<=f.viewport.x+f.viewport.width);assert.ok(dock==='left'?f.cx>720:f.cx<720);}
  const recentered=tableFrame(1440,900);assert.deepEqual(recentered,closed);assert.equal(TILE_THICKNESS,15);assert.equal(WALL_TILE_PITCH,15.8);
});
test('claim family controls retain distinct chow/kong choices and mark only the incoming tile in each pictured chow',async()=>{
  const {claimGroups,choiceTiles}=await import('../guobiao-mahjong/ui/claimPresentation.ts');
  const actions=[{type:'pass'},{type:'chow',tile:6,tiles:[4,5,6]},{type:'chow',tile:6,tiles:[5,6,7]},{type:'chow',tile:6,tiles:[6,7,8]},{type:'pung',tile:6},{type:'kong',tile:6},{type:'concealed-kong',tile:3},{type:'hu'}],before=JSON.stringify(actions);
  const groups=claimGroups(actions);assert.deepEqual(groups.map(g=>g.label),['胡','杠','碰','吃']);assert.equal(groups.find(g=>g.kind==='chow').options.length,3);assert.equal(groups.find(g=>g.kind==='kong').options.length,2);
  for(const a of groups.find(g=>g.kind==='chow').options){const t=choiceTiles(a);assert.deepEqual(t.map(v=>v.tile),a.tiles);assert.equal(t.filter(v=>v.called).length,1);assert.equal(t.find(v=>v.called).tile,6);}
  assert.deepEqual(choiceTiles({type:'pass'}),[]);assert.equal(JSON.stringify(actions),before);
});
test('the recorded multi-chow fixture reconstructs three legal alternatives and each remains independently playable',async()=>{
  const {replayMatch}=await import('../guobiao-mahjong/rules/replay.ts'),{legalActions}=await import('../guobiao-mahjong/rules/match.ts');
  const saved=JSON.parse(readFileSync(new URL('./fixtures/mahjong-ui-chow-options.json',import.meta.url))),s=replayMatch(saved.replay,scorer),options=legalActions(s,saved.human,scorer).filter(a=>a.type==='chow');assert.equal(options.length,3);
  for(const action of options){const copy=structuredClone(s);applyAction(copy,saved.human,action,scorer,s.revision);assert.equal(copy.revision,s.revision+1);}
});
