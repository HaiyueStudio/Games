import type { HaiyueEngine, World } from '@haiyue/engine';
import { GuiButton, GuiElement, GuiImage, GuiLabel, GuiModal, GuiSelect, GuiSlider } from '@haiyue/engine/gui';
import { GameHud } from '../../shared/ui/GameHud';
import { ModelSettings, MODEL_SETTINGS_CHARS } from './ModelSettings';
import type { ModelHub } from '../api/ModelHub';
import type { MatchController } from '../app/MatchController';
import { seat, TILE_NAMES, WINDS, type Action, type Observation, type Scorer, type Seat } from '../rules/types';
import { tableLayout, sideHandRects, type Rect } from './layout';
import { tileUv, type TileAtlas } from './TileAtlas';
import { handTiles, handTileRects, meldTileRects } from './tileLayout';
import { MahjongNotifications, ACTION_NOTICE_CHARS } from './MahjongNotifications';
import { directionMarkers, compassRects, claimHandIndices, meldAccent, flowerRects } from './tablePresentation';

type Layout = (w: number, h: number) => Rect;
const INK = '#e8ede0', MUTED = '#98b7ab', GOLD = '#e8c17c';
const CHARS = '国标雀局东南西北风圈第剩余张玩家观战自动对局开始暂停继续下一新比赛和牌自摸补花流吃碰明暗杠过提示计算完成思考中轮到你点击手出牌分累计番胜排名记录算法接口等待时间秒调整单步回放导出八起胡不计入花番数四圈十六公平信息座位选择智能评估进有效兼顾型与安全满足已本局结束结果尚无番种分析请先毫从返当前设定接第三方模型只收到己手和公共请查看支持参与练习均可规则两次点击确认没有可执行的动作异常取消模型终局标题快慢复盘强策略青竹白露玄玉听雨春夏秋冬梅兰菊中发白万条筒●·—→＋负≥，：、。' + TILE_NAMES.join('');
export class MahjongHud {
  readonly hud: GameHud;
  private dynamic: GuiElement[] = [];
  private previous = '';
  private selected: number | null = null;
  private summary: GuiLabel;
  private status: GuiLabel;
  private delay: GuiLabel;
  private play: GuiButton;
  private next: GuiButton;
  private hint: GuiButton;
  private seats: GuiSelect<number>;
  private slider: GuiSlider;
  private showFanDetails = false;
  private modal: GuiModal | null = null;
  private modalResume: { running: boolean; generation: number } | null = null;
  private inspectionKey = '';
  private tileViews: Array<{ node: GuiButton; image: GuiImage; tile: number | null; role: string; sourceIndex: number; group: number; seat: number; drawn: boolean; emphasis: string }> = [];
  private fanSummary: GuiLabel;
  private fanHint: GuiLabel;
  private readonly notifications: MahjongNotifications;
  private readonly modelSettings: ModelSettings;
  constructor(private readonly engine: HaiyueEngine, world: World, private readonly game: MatchController, private readonly scorer: Scorer, private readonly download: () => void, private readonly atlas: TileAtlas, models: ModelHub) {
    this.hud = new GameHud(engine, world, MODEL_SETTINGS_CHARS + ACTION_NOTICE_CHARS + CHARS + '存档无法恢复就绪最高无人原样加载失败返回非法动作取消对局进行鼠标本场有空格外部未连接重新后已有参考预估明细成未公开关闭统计现识别余点特殊共同完整裁判须达到不同张准另差×…' + '亮明高亮来源风位观战全手公开查看' + scorer.catalog.map(f => f.name).join(''), 1440, 900, 'clear');
    Object.assign(this.hud.root.theme.colors, { primary: GOLD, background: '#10231e', surface: '#1a332b', hover: '#36594a', border: '#466153', text: INK });
    this.hud.root.theme.fontSize = 15;
    this.pin(new GuiElement({ style: { backgroundColor: '#0c1d18' } }), (w, h) => ({ x: 0, y: 0, width: w, height: h }));
    this.label('国标雀局', (w) => ({ x: 28, y: 18, width: 240, height: 39 }), 30, INK);
    this.label('HAIYUE / MCR · AI ARENA', () => ({ x: 29, y: 59, width: 280, height: 20 }), 11, GOLD);
    this.summary = this.label('', (w) => ({ x: w < 900 ? 106 : 270, y: w < 900 ? 84 : 27, width: w < 900 ? w - 118 : w - 760, height: 24 }), 15, MUTED, 'center');
    this.seats = this.pin(new GuiSelect<number>({ id: 'seat-select', value: 0, options: [{ label: '东位 · 玩家', value: 0 }, { label: '南位 · 玩家', value: 1 }, { label: '西位 · 玩家', value: 2 }, { label: '北位 · 玩家', value: 3 }, { label: '四家 AI · 观战', value: -1 }], onChange: value => { game.setHuman(value < 0 ? null : value as Seat); this.selected = null; }, style: { backgroundColor: '#243e32', borderColor: '#506c56', radius: 9 } }), w => ({ x: w - (w < 900 ? 171 : 324), y: 24, width: w < 900 ? 156 : 168, height: 38 }));
    this.button('导出回放', w => ({ x: w < 900 ? -200 : w - 145, y: 24, width: 117, height: 38 }), download);
    this.pin(new GuiElement({ style: { backgroundColor: '#172d25', borderColor: '#48604b', radius: 24 } }), (w, h) => tableLayout(w, h).table);
    this.pin(new GuiElement({ style: { backgroundColor: '#1c3e31', borderColor: '#355a43', radius: 18 } }), (w, h) => { const r = tableLayout(w, h).table; return { x: r.x + 8, y: r.y + 8, width: r.width - 16, height: r.height - 16 }; });
    this.status = this.label('', (w, h) => { const l = tableLayout(w, h); return { x: l.table.x, y: l.statusY, width: l.table.width, height: 24 }; }, 13, GOLD, 'center');
    this.play = this.button('开始对局', (w, h) => ({ x: 24, y: tableLayout(w, h).controlsY, width: w < 900 ? 102 : 130, height: 36 }), () => { if (!game.started) game.start(); else game.pause(); }, true);
    this.button('单步', (w, h) => ({ x: w < 900 ? 134 : 166, y: tableLayout(w, h).controlsY, width: 66, height: 36 }), () => { void game.step(); });
    this.hint = this.button('提示', (w, h) => ({ x: w < 900 ? 208 : 244, y: tableLayout(w, h).controlsY, width: 66, height: 36 }), () => { void game.hint().catch(e => { game.status = String(e); }); });
    this.next = this.button('下一局', (w, h) => ({ x: w < 900 ? 282 : 322, y: tableLayout(w, h).controlsY, width: 86, height: 36 }), () => { game.next(); });
    this.button('新比赛', (w, h) => ({ x: w < 900 ? 12 : 420, y: w < 900 ? h - 220 : tableLayout(w, h).controlsY, width: 86, height: 36 }), () => { game.reset(Date.now() >>> 0); });
    this.delay = this.label('', (w, h) => ({ x: w < 900 ? 110 : w - 300, y: w < 900 ? h - 218 : h - 70, width: w < 900 ? w - 130 : 270, height: 23 }), 12, MUTED, 'center');
    this.slider = this.pin(new GuiSlider({ id: 'ai-delay', min: 0, max: 5000, step: 100, value: game.delayMs, onChange: v => game.setDelay(v), style: { backgroundColor: '#2e4d3d', color: GOLD } }), (w, h) => ({ x: w < 900 ? 114 : w - 294, y: w < 900 ? h - 191 : h - 40, width: w < 900 ? w - 138 : 264, height: 18 }));
    this.fanSummary = this.label('', (w, h) => { const p = tableLayout(w, h).panel; return { x: w < 900 ? 14 : p.x + 6, y: w < 900 ? h - 89 : h - 271, width: w < 900 ? w - 119 : p.width - 8, height: 22 }; }, 14, GOLD);
    this.fanHint = this.label('', (w, h) => { const p = tableLayout(w, h).panel; return { x: w < 900 ? -2000 : p.x + 6, y: h - 244, width: w < 900 ? 1 : p.width - 8, height: 20 }; }, 11, MUTED);
    this.button('番型明细', (w, h) => { const p = tableLayout(w, h).panel; return { x: w < 900 ? w - 100 : p.x + 6, y: w < 900 ? h - 91 : h - 218, width: 86, height: 26 }; }, () => { this.openFanDetails(); });
    this.modelSettings = new ModelSettings(this.hud.root, engine.canvas!, game, models);
    this.button('AI 模型', (w) => ({ x: w < 900 ? 12 : w - 454, y: w < 900 ? 82 : 24, width: w < 900 ? 82 : 118, height: w < 900 ? 26 : 38 }), () => { if (!this.showFanDetails) this.modelSettings.open(); });
    this.notifications = new MahjongNotifications(this.hud.root, engine.canvas!);
  }
  private pin<T extends GuiElement>(node: T, rect: Layout, dynamic = false): T {
    node.layout = p => {
      const scale = p.width / Math.max(1, this.engine.canvas!.clientWidth), r = rect(p.width / scale, p.height / scale);
      Object.assign(node.rect, { x: p.x + r.x * scale, y: p.y + r.y * scale, width: r.width * scale, height: r.height * scale });
      if (node instanceof GuiLabel) node.setFontSize(Number((node as GuiLabel & { baseFont?: number }).baseFont ?? 14) * scale);
      for (const child of node.children) child.layout(node.rect);
    };
    this.hud.root.add(node); if (dynamic) this.dynamic.push(node); return node;
  }
  private label(text: string, rect: Layout, font = 14, color = INK, align: 'left' | 'center' | 'right' = 'left', dynamic = false): GuiLabel {
    const label = new GuiLabel({ text, fontSize: font, textAlign: align, style: { color, padding: 0 } });
    Object.assign(label, { baseFont: font }); return this.pin(label, rect, dynamic);
  }
  private button(text: string, rect: Layout, onClick: () => void, primary = false, dynamic = false): GuiButton {
    return this.pin(new GuiButton({ text, onClick, style: { backgroundColor: primary ? GOLD : '#233e31', hoverBackgroundColor: primary ? '#f4d297' : '#365640', color: primary ? '#18251a' : INK, borderColor: primary ? '#f0d49e' : '#4b6752', radius: 8, padding: 2 } }), rect, dynamic);
  }
  private tile(t: number | null, rect: Layout, click?: () => void, highlight = false, metadata: { role?: string; sourceIndex?: number; group?: number; seat?: number; drawn?: boolean; emphasis?: string } = {}): void {
    const box = new GuiButton({ text: '', ...(click ? { onClick: click } : {}), disabled: !click,
      style: { backgroundColor: highlight ? metadata.emphasis === 'meld' ? '#739d82' : GOLD : 'transparent', hoverBackgroundColor: '#e8c17c', borderColor: 'transparent', radius: 5, padding: 0 } });
    this.pin(box, rect, true);
    const image = box.add(new GuiImage({ source: this.atlas.source, sourceKey: this.atlas.sourceKey, uv: tileUv(t), pointerFilter: 'ignore', tint: metadata.emphasis === 'called' || metadata.emphasis === 'eligible' ? '#ffe6ac' : '#ffffff' }));
    image.layout = p => { const inset = highlight ? Math.max(1, p.width * .04) : 0; Object.assign(image.rect, { x: p.x + inset, y: p.y + inset, width: p.width - inset * 2, height: p.height - inset * 2 }); };
    this.tileViews.push({ node: box, image, tile: t, role: metadata.role ?? 'table', sourceIndex: metadata.sourceIndex ?? -1, group: metadata.group ?? -1, seat: metadata.seat ?? -1, drawn: metadata.drawn ?? false, emphasis: metadata.emphasis ?? (highlight ? 'selected' : '') });
  }
  sync(): void {
    const o = this.game.observation(), canvas = this.engine.canvas!;
    this.notifications.sync(o, this.game.human, this.game.started, this.game.presentationEpoch, this.modalOpen);
    this.summary.setText(canvas.clientWidth < 900 ? `${WINDS[o.roundWind]}风圈 · ${o.handIndex + 1}/16 · 余${o.wallRemaining}张` : `${WINDS[o.roundWind]}风圈 · ${WINDS[o.handIndex % 4]}风局   /   ${o.handIndex + 1} / 16   ·   余 ${o.wallRemaining} 张`);
    const ended = o.phase.endsWith('over'), result = ended ? o.results.at(-1) : null;
    const status = result ? result.winner === null ? '本局流局 · 四家亮牌' : `${result.winner === this.game.human ? '你' : o.players[result.winner]!.name} ${result.selfDrawn ? '自摸' : '和牌'} · ${result.win!.fan} 番 + ${result.win!.flowers} 花` : this.game.status;
    this.status.setText(status + (this.game.waitingMs > 0 ? ` · 等待 ${(this.game.waitingMs / 1000).toFixed(1)} 秒` : ''));
    this.delay.setText(`AI 计算后等待 ${(this.game.delayMs / 1000).toFixed(1)} 秒`);
    this.play.setText(!this.game.started ? '开始对局' : this.game.paused ? '继续' : '暂停');
    this.next.setDisabled(o.phase !== 'hand-over');
    this.hint.setDisabled(this.game.human === null || !o.legalActions.length || !this.game.started);
    this.seats.setDisabled(this.game.thinking);
    this.seats.setValue(this.game.human ?? -1);
    this.slider.setValue(Math.min(5000, this.game.delayMs));
    const inspectionKey = `${o.revision}:${this.game.human}:${this.game.viewRevision}`;
    if (inspectionKey !== this.inspectionKey) { this.inspectionKey = inspectionKey; if (this.game.human !== null) void this.game.inspectHand().catch(() => {}); }
    const a = this.game.handAnalysis?.revision === o.revision ? this.game.handAnalysis : null;
    this.fanSummary.setText(this.game.human === null ? '观战 · 四家手牌已公开' : !a ? '当前番型分析中…' : a.kind === 'complete' ? ended ? `本局和牌 ${a.fan} 番` : `当前和牌 ${a.fan} 番${a.fan >= 8 ? ' · 可和' : ` · 差 ${8 - a.fan} 番`}` : a.kind === 'waiting' ? `${a.discard === null ? '听牌' : `打${TILE_NAMES[a.discard]}后`} ${a.minFan === a.maxFan ? a.minFan : `${a.minFan}–${a.maxFan}`} 番（预估）` : `已有番型 ${a.fan} 番（参考）`);
    this.fanHint.setText(a ? `${a.items.slice(0, 2).map(f => `${f.name} ${f.value * f.count}`).join(' · ') || '尚无已识别番型'} · 花 +${a.flowers} 另计` : '花牌另计 · 最终以成和结算为准');
    const key = `${inspectionKey}:${canvas.clientWidth}:${canvas.clientHeight}:${this.selected}:${this.game.started}:${this.game.analysis?.action.tile}:${a?.revision}:${this.showFanDetails}`;
    if (key === this.previous) return; this.previous = key;
    for (const n of this.dynamic) this.hud.root.root.remove(n); this.dynamic = []; this.tileViews = []; this.modal = null;
    this.drawCompass(o); this.drawPlayers(o); this.drawHand(o); this.drawPanel(o);
    if (['hand-over', 'match-over'].includes(o.phase)) this.drawResult(o);
    if (this.showFanDetails) this.drawFanDetails(o);
  }
  private drawCompass(o: Observation): void {
    const rect = (w: number, h: number) => { const l = tableLayout(w, h); return compassRects(l.center, l.table); };
    this.pin(new GuiElement({ pointerFilter: 'ignore', style: { backgroundColor: '#142d25', borderColor: '#778468', radius: 15 } }), (w, h) => rect(w, h).panel, true);
    this.pin(new GuiElement({ pointerFilter: 'ignore', style: { backgroundColor: '#244537', borderColor: '#3b624c', radius: 10 } }), (w, h) => rect(w, h).inner, true);
    this.label(`${WINDS[o.roundWind]}风圈`, (w, h) => rect(w, h).round, 20, GOLD, 'center', true);

    for (const marker of directionMarkers(o, this.game.human ?? 0)) {
      this.pin(new GuiElement({ pointerFilter: 'ignore', style: { backgroundColor: marker.active ? '#e8c17c' : '#19372b', borderColor: '#668264', radius: 5 } }), (w, h) => rect(w, h).markers[marker.position], true);
      this.label(WINDS[marker.wind]!, (w, h) => rect(w, h).markers[marker.position], 20, marker.active ? '#19372b' : INK, 'center', true);
    }
  }
  private drawPlayers(o: Observation): void {
    const view = this.game.human ?? 0, faces = this.game.presentationHands();
    for (let relative = 0; relative < 4; relative++) {
      const who = seat(view + relative), p = o.players[who]!, active = o.turn === who && o.phase === 'turn';
      const melds = faces?.melds[who] ?? p.melds;
      this.label(`${WINDS[seat(who - o.dealer)]}  ${who === this.game.human ? '你' : p.name}  ${active ? '●' : ''}`, (w, h) => {
        const { table: r, meldTile } = tableLayout(w, h);
        return relative === 0 ? { x: r.x + 20, y: r.y + r.height - (w < 900 ? 35 : 108), width: r.width - 40, height: 22 } : relative === 2 ? { x: r.x + 20, y: r.y + 14, width: r.width - 40, height: 22 } : { x: relative === 1 ? r.x + r.width - (w < 900 ? 82 : 170) : r.x + (w < 900 ? 30 : 58), y: r.y + (w < 900 ? 84 : 90) + melds.length * meldTile * 1.825, width: w < 900 ? 66 : 112, height: 22 };
      }, relative % 2 !== 0 && this.engine.canvas!.clientWidth < 900 ? 10 : 13, active ? GOLD : MUTED, relative % 2 === 0 ? 'center' : 'left', true);
      const river = p.river;
      const lastEvent = o.events.at(-1), hasDrawn = o.phase === 'turn' && o.turn === who && lastEvent?.type === 'draw' && lastEvent.seat === who;
      for (let i = 0; i < river.length; i++) this.tile(river[i]!, (w, h) => {
        const { table: r, center: c } = tableLayout(w, h), rows = Math.max(1, Math.ceil(river.length / 6));
        const tw = Math.min(28, r.width * .035, Math.max(8, (r.height / 2 - 170) / rows - 3) / 1.375), th = tw * 1.375, gap = w < 900 ? 2 : 3;
        const col = i % 6, row = Math.floor(i / 6), rw = 6 * (tw + gap);
        if (relative === 0) return { x: c.x - rw / 2 + col * (tw + gap), y: c.y + 90 + row * (th + gap), width: tw, height: th };
        if (relative === 2) return { x: c.x - rw / 2 + (5 - col) * (tw + gap), y: c.y - 90 - th - row * (th + gap), width: tw, height: th };
        return { x: relative === 1 ? c.x + 90 + row * (tw + gap) : c.x - 90 - tw - row * (tw + gap), y: c.y - 3 * (th + gap) + col * (th + gap), width: tw, height: th };
      }, undefined, o.last?.seat === who && i === river.length - 1, { role: 'river', seat: who, sourceIndex: i });
      const hand = faces?.hands[who] ?? Array(p.handCount).fill(0);
      const ordered = handTiles(hand, hasDrawn ? faces?.drawn ?? 0 : null);
      if (relative !== 0 || this.game.human === null) ordered.forEach(({ tile, index, drawn }, display) => this.tile(faces ? tile : null, (w, h) => {
        const { table: r, topTile: tw } = tableLayout(w, h), th = tw * 1.375;
        if (relative === 0 || relative === 2) return handTileRects(ordered, { x: r.x, y: relative === 0 ? r.y + r.height - (w < 900 ? 62 : 74) : r.y + 40, width: r.width, height: th }, tw)[display]!;
        return sideHandRects(r, ordered.length, relative === 1, hasDrawn)[display]!;
      }, undefined, false, { role: faces ? 'revealed' : 'concealed', sourceIndex: index, seat: who, drawn }));
      melds.forEach((meld, group) => {
        const accent = meldAccent(o, who, group);
        meld.tiles.forEach((tile, index) => this.tile(tile, (w, h) => {
          const { table: r, meldTile } = tableLayout(w, h), vertical = relative % 2 !== 0;
          const area = { x: relative === 1 ? r.x + r.width - (w < 900 ? 82 : 170) : relative === 3 ? r.x + (w < 900 ? 30 : 58) : r.x + 22, y: relative === 0 ? r.y + r.height - (w < 900 ? 77 : 149) : relative === 2 ? r.y + 90 : r.y + (w < 900 ? 66 : 86), width: vertical ? (w < 900 ? 50 : 110) : r.width * .58, height: vertical ? r.height - 180 : 36 };
          return meldTileRects(melds, area, meldTile, vertical).find(t => t.group === group && t.index === index)!.rect;
        }, undefined, true, { role: 'meld', group, sourceIndex: index, seat: who, emphasis: accent.calledIndex === index ? 'called' : accent.latest ? 'latest-meld' : 'meld' }));
      });
      p.flowers.forEach((tile, index) => this.tile(tile, (w, h) => {
        const { table: r, meldTile } = tableLayout(w, h), vertical = relative % 2 !== 0;
        const area = relative === 0 ? { x: r.x + 22, y: r.y + r.height - (w < 900 ? 111 : 181), width: r.width * .38, height: 29 }
          : relative === 2 ? { x: r.x + r.width - 14 - r.width * .27, y: r.y + 12, width: r.width * .27, height: 24 }
          : { x: relative === 1 ? r.x + r.width - (w < 900 ? 82 : 170) : r.x + (w < 900 ? 30 : 58), y: r.y + (w < 900 ? 111 : 118) + melds.length * meldTile * 1.825, width: w < 900 ? 50 : 110, height: 54 };
        return flowerRects(p.flowers.length, area, 20, vertical)[index]!;
      }, undefined, false, { role: 'flower', seat: who, sourceIndex: index }));
    }
  }
  private drawHand(o: Observation): void {
    const canDiscard = this.game.started && o.phase === 'turn' && o.turn === this.game.human;
    const tiles = handTiles(o.hand, o.drawn), eligible = claimHandIndices(o.hand, o.legalActions, null);
    if (this.game.human !== null) for (let display = 0; display < tiles.length; display++) {
      const { tile: t, index, drawn } = tiles[display]!, suggested = this.game.analysis?.action.type === 'discard' && this.game.analysis.action.tile === t;
      this.tile(t, (w, h) => { const l = tableLayout(w, h), r = handTileRects(tiles, { x: l.table.x, y: l.handY, width: l.table.width, height: 80 }, l.tile)[display]!; return { ...r, y: r.y - (this.selected === index || suggested ? 9 : 0) }; }, canDiscard ? () => {
        if (this.selected === index) { this.game.act({ type: 'discard', tile: t }); this.selected = null; }
        else this.selected = index;
      } : undefined, suggested || this.selected === index || eligible.has(index), { emphasis: eligible.has(index) ? 'eligible' : '', role: 'hand', sourceIndex: index, seat: o.seat, drawn });
    }
    const actions = this.game.human !== null ? o.legalActions.filter(a => a.type !== 'discard') : [];
    if (this.game.started) actions.forEach((action, i) => this.button(actionLabel(action), (w, h) => { const l = tableLayout(w, h), r = l.table, columns = Math.min(actions.length, w < 900 ? 4 : 7), cell = Math.min(94, (r.width - 24) / Math.max(1, columns)); return { x: r.x + (r.width - columns * cell) / 2 + i % columns * cell, y: l.actionY + Math.floor(i / columns) * 38, width: cell - 6, height: 34 }; }, () => { this.game.act(action); this.selected = null; }, action.type === 'hu', true));
    this.label(this.game.analysis?.explanation ?? (this.game.human === null ? '四家 AI 手牌公开 · 可暂停或单步分析' : '点击选牌，再次点击出牌'), (w, h) => { const l = tableLayout(w, h); return { x: l.table.x, y: l.handY + l.tile * 1.42 + 1, width: l.table.width, height: 14 }; }, 10, MUTED, 'center', true);
  }
  private drawPanel(o: Observation): void {
    const desktop = (layout: Layout): Layout => (w, h) => w < 900 ? { x: -2000, y: 0, width: 1, height: 1 } : layout(w, h);
    this.label('本场排名', desktop((w, h) => { const p = tableLayout(w, h).panel; return { x: p.x + 4, y: p.y + 3, width: p.width, height: 26 }; }), 19, INK, 'left', true);
    this.label('累计和牌番数 / 比赛分', desktop((w, h) => { const p = tableLayout(w, h).panel; return { x: p.x + 4, y: p.y + 33, width: p.width, height: 22 }; }), 11, MUTED, 'left', true);
    const ranking = o.players.map((p, i) => ({ ...p, seat: i })).sort((a, b) => b.fan - a.fan || b.score - a.score);
    o.players.forEach((p, i) => this.label(`${WINDS[i]} ${p.fan} 番`, (w, h) => ({ x: w < 900 && !o.legalActions.some(a => !['discard', 'pass'].includes(a.type)) ? 14 + i * (w - 28) / 4 : -2000, y: h - 245, width: (w - 28) / 4, height: 20 }), 12, i === this.game.human ? GOLD : MUTED, 'center', true));
    ranking.forEach((p, i) => {
      this.label(`${i + 1}   ${p.seat === this.game.human ? '你' : p.name}`, desktop((w, h) => { const r = tableLayout(w, h).panel; return { x: r.x + 6, y: r.y + 76 + i * 43, width: r.width - 107, height: 28 }; }), 14, i === 0 ? GOLD : INK, 'left', true);
      this.label(`${p.fan} 番  /  ${p.score > 0 ? '+' : ''}${p.score}`, desktop((w, h) => { const r = tableLayout(w, h).panel; return { x: r.x + r.width - 116, y: r.y + 76 + i * 43, width: 112, height: 28 }; }), 13, MUTED, 'right', true);
    });
    if (!o.phase.endsWith('over')) {
    this.label('牌局记录', desktop((w, h) => { const p = tableLayout(w, h).panel; return { x: p.x + 4, y: p.y + 272, width: p.width, height: 26 }; }), 17, INK, 'left', true);
    const events = o.events.filter(e => !['draw'].includes(e.type)).slice(-6);
    events.forEach((e, i) => this.label(`${WINDS[seat(e.seat - o.dealer)]}  ${e.text}`, desktop((w, h) => { const r = tableLayout(w, h).panel; return { x: r.x + 6, y: r.y + 310 + i * 28, width: r.width - 4, height: 22 }; }), 12, i === events.length - 1 ? GOLD : MUTED, 'left', true));
    }
    this.label('AI / AGENT READY', desktop((w, h) => { const r = tableLayout(w, h).panel; return { x: r.x + 6, y: h - 191, width: r.width, height: 24 }; }), 12, GOLD, 'left', true);
    this.label('向听 · 进张 · 番型 · 防守', desktop((w, h) => { const r = tableLayout(w, h).panel; return { x: r.x + 6, y: h - 159, width: r.width, height: 23 }; }), 12, MUTED, 'left', true);
    this.label('16 局 · 东南西北四圈', desktop((w, h) => { const r = tableLayout(w, h).panel; return { x: r.x + 6, y: h - 132, width: r.width, height: 22 }; }), 11, MUTED, 'left', true);
  }
  get modalOpen(): boolean { return this.showFanDetails || this.modelSettings.visible; }
  closeModal(): void { if (this.modelSettings.visible) this.modelSettings.close(); else this.closeFanDetails(); }
  private openFanDetails(): void {
    if (this.showFanDetails) { this.closeFanDetails(); return; }
    this.modalResume = { running: this.game.started && !this.game.paused, generation: this.game.viewRevision };
    this.game.pause(true); this.showFanDetails = true;
  }
  closeFanDetails(): void {
    this.showFanDetails = false; this.modal?.hide();
    if (this.modalResume?.running && this.modalResume.generation === this.game.viewRevision) this.game.pause(false);
    this.modalResume = null;
  }
  private drawFanDetails(o: Observation): void {
    const a = this.game.human !== null && this.game.handAnalysis?.revision === o.revision ? this.game.handAnalysis : null;
    const modal = this.modal = new GuiModal({ visible: true, width: 600, height: 460, showCloseButton: false, showConfirmButton: true, showCancelButton: false, confirmText: '关闭', closeOnBackdrop: false,
      onClose: () => this.closeFanDetails(), style: { backgroundColor: '#10271f', borderColor: GOLD, color: INK, radius: 14 } });
    this.hud.root.add(modal); this.dynamic.push(modal);
    modal.setTitle(a?.kind === 'complete' ? `当前和牌 ${a.fan} 番` : a?.kind === 'waiting' ? `成和预估 ${a.minFan}–${a.maxFan} 番` : `当前番型参考 ${a?.fan ?? 0} 番`);
    modal.setMessage(this.game.human === null ? '观战时手牌已公开，可暂停分析四家牌面' : a?.kind === 'forming' ? '未和牌：仅统计已有牌张与面子番型' : a?.kind === 'waiting' ? '按可见余牌估算点和番数，自摸与特殊和牌另计' : '完整裁判计分 · 花牌另计');
    const rows = a?.items ?? [], labels: GuiLabel[] = [];
    const add = (text: string, color = INK) => { const n = modal.add(new GuiLabel({ text, pointerFilter: 'ignore', style: { color, padding: 0 } })); labels.push(n); };
    rows.slice(0, 16).forEach(f => add(`${f.name}  ${f.value} × ${f.count} = ${f.value * f.count} 番`));
    if (!rows.length) add(a?.kind === 'waiting' ? '不同和张的番型不同，当前无共同番型' : '尚无已识别番型', MUTED);
    const foot = modal.add(new GuiLabel({ text: `花牌 +${a?.flowers ?? 0} · 不计起胡 · 最终以成和结算为准`, pointerFilter: 'ignore', style: { color: MUTED, padding: 0 } }));
    Object.assign(modal.confirmButton.style, { backgroundColor: GOLD, color: '#18251a', hoverBackgroundColor: '#f4d297', borderColor: GOLD, radius: 8 });
    modal.layout = p => {
      const scale = p.width / Math.max(1, this.engine.canvas!.clientWidth), w = p.width / scale, h = p.height / scale;
      Object.assign(modal.rect, p);
      const width = Math.min(600, w - 24), height = Math.min(460, h - 100);
      Object.assign(modal.dialogRect, { x: p.x + (w - width) / 2 * scale, y: p.y + (h - height) / 2 * scale, width: width * scale, height: height * scale });
      const r = modal.dialogRect;
      const place = (n: GuiElement, x: number, y: number, ww: number, hh: number, font = 13) => { Object.assign(n.rect, { x: r.x + x * scale, y: r.y + y * scale, width: ww * scale, height: hh * scale }); if (n instanceof GuiLabel) n.setFontSize(font * scale); };
      modal.titleLabel.setTextAlign('center'); modal.messageLabel.setTextAlign('center');
      place(modal.titleLabel, 12, 19, width - 24, 32, 22);
      place(modal.messageLabel, 12, 60, width - 24, 42, w < 500 ? 10 : 11);
      labels.forEach((n, i) => place(n, 20 + i % 2 * (width - 40) / 2, 112 + Math.floor(i / 2) * 31, (width - 40) / 2, 25, w < 500 ? 11 : 13));
      foot.setTextAlign('center'); place(foot, 12, height - 99, width - 24, 26, w < 500 ? 10 : 11);
      place(modal.confirmButton, (width - 100) / 2, height - 57, 100, 36);
    };
  }
  private drawResult(o: Observation): void {
    const result = o.results.at(-1)!;
    const rect: Layout = (w, h) => { const r = tableLayout(w, h).panel; return w < 900 ? { x: -2000, y: 0, width: 1, height: 1 } : { x: r.x, y: r.y + 274, width: r.width, height: 216 }; };
    this.pin(new GuiElement({ style: { backgroundColor: '#11271f', borderColor: GOLD, radius: 15 } }), rect, true);
    const text = o.phase === 'match-over' ? '四圈比赛结束' : result.winner === null ? '本局流局' : `${result.winner === this.game.human ? '你' : o.players[result.winner]!.name} ${result.selfDrawn ? '自摸' : '和牌'}`;
    this.label(text, (w, h) => { const r = rect(w, h); return { x: r.x + 12, y: r.y + 13, width: r.width - 24, height: 34 }; }, 20, GOLD, 'center', true);
    const details = result.win ? `${result.win.fan} 番 + ${result.win.flowers} 花 · 得分 +${result.deltas[result.winner!]}` : '无人和牌 · 比赛分不变';
    this.label(details, (w, h) => { const r = rect(w, h); return { x: r.x + 12, y: r.y + 52, width: r.width - 24, height: 25 }; }, 14, INK, 'center', true);
    (result.win?.items ?? []).slice(0, 4).forEach((f, i) => this.label(`${f.name}  ${f.value * f.count} 番`, (w, h) => { const r = rect(w, h); if (w < 900) return { x: -2000, y: 0, width: 1, height: 1 }; return { x: r.x + 24 + i % 2 * (r.width / 2 - 12), y: r.y + 83 + Math.floor(i / 2) * 25, width: r.width / 2 - 30, height: 23 }; }, 11, MUTED, 'center', true));
    if (o.phase === 'match-over') {
      const leader = [...o.players].sort((a, b) => b.fan - a.fan || b.score - a.score)[0]!;
      this.label(`累计最高：${leader.name} · ${leader.fan} 番`, (w, h) => { const r = rect(w, h); return { x: r.x + 12, y: r.y + r.height + 4, width: r.width - 24, height: 28 }; }, 17, GOLD, 'center', true);
    }
  }
  snapshot() { return this.hud.snapshot(); }
  presentationSnapshot() { const l = tableLayout(this.engine.canvas!.clientWidth, this.engine.canvas!.clientHeight); return { table: { ...l.table }, compassRect: compassRects(l.center, l.table).panel, atlas: this.atlas.sourceKey, notifications: this.notifications.snapshot(), modelSettings: this.modelSettings.snapshot(), fanDetails: this.showFanDetails, modal: this.modal ? { layer: 'engine-modal', rect: { ...this.modal.dialogRect }, closeRect: { ...this.modal.confirmButton.rect } } : null, compass: directionMarkers(this.game.observation(), this.game.human ?? 0), allHandsVisible: this.game.human === null || this.game.observation().phase.endsWith('over'), tiles: this.tileViews.map(({ node, image, ...metadata }) => ({ ...metadata, rect: { ...node.rect }, uv: [...image.uv], sourceKey: image.sourceKey })) }; }
}
export function actionLabel(a: Action): string {
  return ({ hu: '和牌', pass: '过', pung: '碰', kong: '明杠', 'concealed-kong': `暗杠 ${TILE_NAMES[a.tile!]}`, 'add-kong': `加杠 ${TILE_NAMES[a.tile!]}`, chow: `吃 ${a.tiles?.map(t => t % 9 + 1).join('')}`, discard: `打 ${TILE_NAMES[a.tile!]}` })[a.type];
}
