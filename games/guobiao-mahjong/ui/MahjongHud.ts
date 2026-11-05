import type { HaiyueEngine, World } from '@haiyue/engine';
import { GuiButton, GuiElement, GuiLabel, GuiSelect, GuiSlider, type GuiRect } from '@haiyue/engine/gui';
import { GameHud } from '../../shared/ui/GameHud';
import type { MatchController } from '../app/MatchController';
import { seat, TILE_NAMES, WINDS, type Action, type Observation, type Scorer, type Seat } from '../rules/types';
import { tableLayout, type Rect } from './layout';

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
  private revealResults = false;
  constructor(private readonly engine: HaiyueEngine, world: World, private readonly game: MatchController, private readonly scorer: Scorer, private readonly download: () => void) {
    this.hud = new GameHud(engine, world, CHARS + '存档无法恢复就绪最高无人原样加载失败返回非法动作取消对局进行鼠标本场有空格外部未连接重新后' + scorer.catalog.map(f => f.name).join(''), 1440, 900, 'clear');
    Object.assign(this.hud.root.theme.colors, { primary: GOLD, background: '#10231e', surface: '#1a332b', hover: '#36594a', border: '#466153', text: INK });
    this.hud.root.theme.fontSize = 15;
    this.pin(new GuiElement({ style: { backgroundColor: '#0c1d18' } }), (w, h) => ({ x: 0, y: 0, width: w, height: h }));
    this.label('国标雀局', (w) => ({ x: 28, y: 18, width: 240, height: 39 }), 30, INK);
    this.label('HAIYUE / MCR · AI ARENA', () => ({ x: 29, y: 59, width: 280, height: 20 }), 11, GOLD);
    this.summary = this.label('', (w) => ({ x: w < 900 ? 12 : 340, y: w < 900 ? 89 : 27, width: w < 900 ? w - 24 : w - 700, height: 24 }), 15, MUTED, 'center');
    this.seats = this.pin(new GuiSelect<number>({ id: 'seat-select', value: 0, options: [{ label: '东位 · 玩家', value: 0 }, { label: '南位 · 玩家', value: 1 }, { label: '西位 · 玩家', value: 2 }, { label: '北位 · 玩家', value: 3 }, { label: '四家 AI · 观战', value: -1 }], onChange: value => { game.setHuman(value < 0 ? null : value as Seat); this.selected = null; }, style: { backgroundColor: '#243e32', borderColor: '#506c56', radius: 9 } }), w => ({ x: w - (w < 900 ? 171 : 324), y: 24, width: w < 900 ? 156 : 168, height: 38 }));
    this.button('导出回放', w => ({ x: w < 900 ? -200 : w - 145, y: 24, width: 117, height: 38 }), download);
    this.pin(new GuiElement({ style: { backgroundColor: '#172d25', borderColor: '#48604b', radius: 24 } }), (w, h) => tableLayout(w, h).table);
    this.pin(new GuiElement({ style: { backgroundColor: '#1c3e31', borderColor: '#355a43', radius: 18 } }), (w, h) => { const r = tableLayout(w, h).table; return { x: r.x + 8, y: r.y + 8, width: r.width - 16, height: r.height - 16 }; });
    this.label('八 番 起 胡', (w, h) => { const c = tableLayout(w, h).center; return { x: c.x - 75, y: c.y - 28, width: 150, height: 28 }; }, 19, '#749c79', 'center');
    this.label('M A H J O N G', (w, h) => { const c = tableLayout(w, h).center; return { x: c.x - 65, y: c.y + 6, width: 130, height: 18 }; }, 10, '#60866a', 'center');
    this.status = this.label('', (w, h) => { const l = tableLayout(w, h); return { x: l.table.x, y: l.compact ? h - 118 : l.handY - 34, width: l.table.width, height: 24 }; }, 13, GOLD, 'center');
    this.play = this.button('开始对局', (w, h) => ({ x: 24, y: h - 61, width: w < 900 ? 102 : 130, height: 40 }), () => { if (!game.started) game.start(); else game.pause(); }, true);
    this.button('单步', (w, h) => ({ x: w < 900 ? 134 : 166, y: h - 61, width: 66, height: 40 }), () => { void game.step(); });
    this.hint = this.button('提示', (w, h) => ({ x: w < 900 ? 208 : 244, y: h - 61, width: 66, height: 40 }), () => { void game.hint().catch(e => { game.status = String(e); }); });
    this.next = this.button('下一局', (w, h) => ({ x: w < 900 ? 282 : 322, y: h - 61, width: 86, height: 40 }), () => { game.next(); this.revealResults = false; });
    this.button('新比赛', (w, h) => ({ x: w < 900 ? 12 : 420, y: w < 900 ? h - 220 : h - 61, width: 86, height: 40 }), () => { game.reset(Date.now() >>> 0); this.revealResults = false; });
    this.delay = this.label('', (w, h) => ({ x: w < 900 ? 110 : w - 300, y: w < 900 ? h - 218 : h - 70, width: w < 900 ? w - 130 : 270, height: 23 }), 12, MUTED, 'center');
    this.slider = this.pin(new GuiSlider({ id: 'ai-delay', min: 0, max: 5000, step: 100, value: game.delayMs, onChange: v => game.setDelay(v), style: { backgroundColor: '#2e4d3d', color: GOLD } }), (w, h) => ({ x: w < 900 ? 114 : w - 294, y: w < 900 ? h - 191 : h - 40, width: w < 900 ? w - 138 : 264, height: 18 }));
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
  private tile(t: number | null, rect: Layout, click?: () => void, highlight = false): void {
    const color = t === null ? '#7b9b7c' : t >= 27 ? t === 31 ? '#bd453b' : t === 32 ? '#2b7751' : '#263d37' : ['#b94435', '#297756', '#345f9c'][Math.floor(t / 9)]!;
    const box = new GuiButton({ text: '', ...(click ? { onClick: click } : {}), disabled: !click,
      style: { backgroundColor: t === null ? '#315746' : '#eee9d8', hoverBackgroundColor: '#fff8db', borderColor: highlight ? GOLD : t === null ? '#5c8164' : '#c9c4ad', radius: 4, padding: 0 } });
    this.pin(box, rect, true);
    const face = box.add(new GuiLabel({ text: t === null ? '·' : t < 27 ? String(t % 9 + 1) : TILE_NAMES[t]!, textAlign: 'center', style: { color, padding: 0 } }));
    face.layout = p => { Object.assign(face.rect, { x: p.x, y: p.y + p.height * .03, width: p.width, height: p.height * (t !== null && t < 27 ? .57 : .88) }); face.setFontSize(Math.min(p.width * .64, p.height * .48)); };
    if (t !== null && t < 27) {
      const suit = box.add(new GuiLabel({ text: ['万', '条', '筒'][Math.floor(t / 9)]!, textAlign: 'center', style: { color, padding: 0 } }));
      suit.layout = p => { Object.assign(suit.rect, { x: p.x, y: p.y + p.height * .58, width: p.width, height: p.height * .31 }); suit.setFontSize(p.width * .34); };
    }
  }
  sync(): void {
    const o = this.game.observation(), canvas = this.engine.canvas!;
    this.summary.setText(`${WINDS[o.roundWind]}风圈 · ${WINDS[o.handIndex % 4]}风局   /   ${o.handIndex + 1} / 16   ·   余 ${o.wallRemaining} 张`);
    this.status.setText(this.game.status + (this.game.waitingMs > 0 ? ` · 等待 ${(this.game.waitingMs / 1000).toFixed(1)} 秒` : ''));
    this.delay.setText(`AI 计算后等待 ${(this.game.delayMs / 1000).toFixed(1)} 秒`);
    this.play.setText(!this.game.started ? '开始对局' : this.game.paused ? '继续' : '暂停');
    this.next.setDisabled(o.phase !== 'hand-over');
    this.hint.setDisabled(this.game.human === null || !o.legalActions.length || !this.game.started);
    this.seats.setDisabled(this.game.thinking);
    this.seats.setValue(this.game.human ?? -1);
    this.slider.setValue(Math.min(5000, this.game.delayMs));
    const key = `${o.revision}:${this.game.human}:${canvas.clientWidth}:${canvas.clientHeight}:${this.selected}:${this.game.started}:${this.game.analysis?.action.tile}:${this.revealResults}`;
    if (key === this.previous) return; this.previous = key;
    for (const n of this.dynamic) this.hud.root.root.remove(n); this.dynamic = [];
    this.drawPlayers(o); this.drawHand(o); this.drawPanel(o);
    if (['hand-over', 'match-over'].includes(o.phase)) this.drawResult(o);
  }
  private drawPlayers(o: Observation): void {
    const view = this.game.human ?? 0;
    for (let relative = 0; relative < 4; relative++) {
      const who = seat(view + relative), p = o.players[who]!, active = o.turn === who;
      this.label(`${WINDS[seat(who - o.dealer)]}  ${who === this.game.human ? '你' : p.name}  ${active ? '●' : ''}`, (w, h) => {
        const { table: r } = tableLayout(w, h);
        return relative === 0 ? { x: r.x + 20, y: r.y + r.height - 35, width: r.width - 40, height: 22 } : relative === 2 ? { x: r.x + 20, y: r.y + 14, width: r.width - 40, height: 22 } : { x: relative === 1 ? r.x + r.width - 135 : r.x + 14, y: r.y + 55, width: 122, height: 22 };
      }, 13, active ? GOLD : MUTED, relative % 2 === 0 ? 'center' : 'left', true);
      const river = p.river;
      for (let i = 0; i < river.length; i++) this.tile(river[i]!, (w, h) => {
        const { table: r, center: c } = tableLayout(w, h), rows = Math.max(1, Math.ceil(river.length / 6));
        const tw = Math.min(29, r.width * .035, r.height * .068, Math.max(10, (r.height / 2 - 150) / rows - 3) / 1.34), th = tw * 1.34, gap = 3;
        const col = i % 6, row = Math.floor(i / 6), rw = 6 * (tw + gap);
        if (relative === 0) return { x: c.x - rw / 2 + col * (tw + gap), y: c.y + 64 + row * (th + gap), width: tw, height: th };
        if (relative === 2) return { x: c.x - rw / 2 + (5 - col) * (tw + gap), y: c.y - 64 - th - row * (th + gap), width: tw, height: th };
        return { x: relative === 1 ? c.x + rw / 2 + 24 + row * (tw + gap) : c.x - rw / 2 - 24 - tw - row * (tw + gap), y: c.y - 3 * (th + gap) + col * (th + gap), width: tw, height: th };
      }, undefined, o.last?.seat === who && i === river.length - 1);
      if (relative !== 0 || this.game.human === null) for (let i = 0; i < p.handCount; i++) this.tile(null, (w, h) => {
        const { table: r } = tableLayout(w, h), tw = Math.min(22, r.width * .024), th = tw * 1.38;
        if (relative === 2) return { x: r.x + r.width / 2 - p.handCount * (tw + 2) / 2 + i * (tw + 2), y: r.y + 44, width: tw, height: th };
        if (relative === 0) return { x: r.x + r.width / 2 - p.handCount * (tw + 2) / 2 + i * (tw + 2), y: r.y + r.height - 74, width: tw, height: th };
        return { x: relative === 1 ? r.x + r.width - tw - 17 : r.x + 17, y: r.y + 89 + i * Math.min(th + 2, (r.height - 137) / 14), width: tw, height: Math.min(th, (r.height - 137) / 14 - 1) };
      });
      let index = 0;
      for (const meld of p.melds) for (const tile of meld.tiles) {
        const j = index++;
        this.tile(tile, (w, h) => { const { table: r } = tableLayout(w, h), tw = Math.min(20, r.width * .023); return { x: relative % 2 === 0 ? r.x + 22 + j * (tw + 2) : relative === 1 ? r.x + r.width - 112 + j % 4 * (tw + 2) : r.x + 52 + j % 4 * (tw + 2), y: relative === 0 ? r.y + r.height - 70 : relative === 2 ? r.y + 44 : r.y + 98 + Math.floor(j / 4) * (tw * 1.4 + 3), width: tw, height: tw * 1.4 }; });
      }
      if (p.flowers.length) this.label(`花 ${p.flowers.length}`, (w, h) => { const r = tableLayout(w, h).table; return { x: relative === 1 ? r.x + r.width - 114 : r.x + 54, y: relative === 0 ? r.y + r.height - 31 : relative === 2 ? r.y + 16 : r.y + 78, width: 55, height: 18 }; }, 11, GOLD, 'left', true);
    }
  }
  private drawHand(o: Observation): void {
    const canDiscard = this.game.started && o.phase === 'turn' && o.turn === this.game.human;
    if (this.game.human !== null) for (let i = 0; i < o.hand.length; i++) {
      const t = o.hand[i]!, suggested = this.game.analysis?.action.type === 'discard' && this.game.analysis.action.tile === t;
      this.tile(t, (w, h) => { const l = tableLayout(w, h), tw = l.tile, total = o.hand.length * (tw + 4); return { x: l.table.x + (l.table.width - total) / 2 + i * (tw + 4), y: l.handY - (this.selected === i || suggested ? 9 : 0), width: tw, height: tw * 1.42 }; }, canDiscard ? () => {
        if (this.selected === i) { this.game.act({ type: 'discard', tile: t }); this.selected = null; }
        else this.selected = i;
      } : undefined, suggested || this.selected === i);
    }
    const actions = this.game.human !== null ? o.legalActions.filter(a => a.type !== 'discard') : [];
    if (this.game.started) actions.forEach((action, i) => this.button(actionLabel(action), (w, h) => { const r = tableLayout(w, h).table; const total = actions.length * 94; return { x: r.x + (r.width - total) / 2 + i * 94, y: r.y + r.height - 113, width: 88, height: 34 }; }, () => { this.game.act(action); this.selected = null; }, action.type === 'hu', true));
    this.label(this.game.analysis?.explanation ?? (this.game.human === null ? '四家 AI 自动对局 · 可暂停或单步分析' : '点击选牌，再次点击出牌 · 花牌不计入 8 番起胡'), (w, h) => { const l = tableLayout(w, h); return { x: l.table.x, y: l.handY + l.tile * 1.42 + 1, width: l.table.width, height: 14 }; }, 10, MUTED, 'center', true);
  }
  private drawPanel(o: Observation): void {
    const desktop = (layout: Layout): Layout => (w, h) => w < 900 ? { x: -2000, y: 0, width: 1, height: 1 } : layout(w, h);
    this.label('本场排名', desktop((w, h) => { const p = tableLayout(w, h).panel; return { x: p.x + 4, y: p.y + 3, width: p.width, height: 26 }; }), 19, INK, 'left', true);
    this.label('累计和牌番数 / 比赛分', desktop((w, h) => { const p = tableLayout(w, h).panel; return { x: p.x + 4, y: p.y + 33, width: p.width, height: 22 }; }), 11, MUTED, 'left', true);
    const ranking = o.players.map((p, i) => ({ ...p, seat: i })).sort((a, b) => b.fan - a.fan || b.score - a.score);
    o.players.forEach((p, i) => this.label(`${WINDS[i]} ${p.fan} 番`, (w, h) => ({ x: w < 900 ? 14 + i * (w - 28) / 4 : -200, y: h - 245, width: (w - 28) / 4, height: 20 }), 12, i === this.game.human ? GOLD : MUTED, 'center', true));
    ranking.forEach((p, i) => {
      this.label(`${i + 1}   ${p.seat === this.game.human ? '你' : p.name}`, desktop((w, h) => { const r = tableLayout(w, h).panel; return { x: r.x + 6, y: r.y + 76 + i * 43, width: r.width - 107, height: 28 }; }), 14, i === 0 ? GOLD : INK, 'left', true);
      this.label(`${p.fan} 番  /  ${p.score > 0 ? '+' : ''}${p.score}`, desktop((w, h) => { const r = tableLayout(w, h).panel; return { x: r.x + r.width - 116, y: r.y + 76 + i * 43, width: 112, height: 28 }; }), 13, MUTED, 'right', true);
    });
    this.label('牌局记录', desktop((w, h) => { const p = tableLayout(w, h).panel; return { x: p.x + 4, y: p.y + 272, width: p.width, height: 26 }; }), 17, INK, 'left', true);
    const events = o.events.filter(e => !['draw'].includes(e.type)).slice(-7);
    events.forEach((e, i) => this.label(`${WINDS[seat(e.seat - o.dealer)]}  ${e.text}`, desktop((w, h) => { const r = tableLayout(w, h).panel; return { x: r.x + 6, y: r.y + 310 + i * 28, width: r.width - 4, height: 22 }; }), 12, i === events.length - 1 ? GOLD : MUTED, 'left', true));
    this.label('AI / AGENT READY', desktop((w, h) => { const r = tableLayout(w, h).panel; return { x: r.x + 6, y: h - 191, width: r.width, height: 24 }; }), 12, GOLD, 'left', true);
    this.label('向听 · 进张 · 番型 · 防守', desktop((w, h) => { const r = tableLayout(w, h).panel; return { x: r.x + 6, y: h - 159, width: r.width, height: 23 }; }), 12, MUTED, 'left', true);
    this.label('16 局 · 东南西北四圈 · 8 番起胡', desktop((w, h) => { const r = tableLayout(w, h).panel; return { x: r.x + 6, y: h - 132, width: r.width, height: 22 }; }), 11, MUTED, 'left', true);
  }
  private drawResult(o: Observation): void {
    const result = o.results.at(-1)!;
    const rect: Layout = (w, h) => { const r = tableLayout(w, h).table; return { x: r.x + 18, y: r.y + 84, width: r.width - 36, height: Math.max(180, r.height - 152) }; };
    this.pin(new GuiElement({ style: { backgroundColor: '#11271f', borderColor: GOLD, radius: 15 } }), rect, true);
    const text = o.phase === 'match-over' ? '四圈比赛结束' : result.winner === null ? '本局流局' : `${result.winner === this.game.human ? '你' : o.players[result.winner]!.name} ${result.selfDrawn ? '自摸' : '和牌'}`;
    this.label(text, (w, h) => { const r = rect(w, h); return { x: r.x + 12, y: r.y + 13, width: r.width - 24, height: 34 }; }, 24, GOLD, 'center', true);
    const details = result.win ? `${result.win.fan} 番 + ${result.win.flowers} 花 · 得分 +${result.deltas[result.winner!]}` : '无人和牌 · 比赛分不变';
    this.label(details, (w, h) => { const r = rect(w, h); return { x: r.x + 12, y: r.y + 52, width: r.width - 24, height: 25 }; }, 14, INK, 'center', true);
    (result.win?.items ?? []).slice(0, 8).forEach((f, i) => this.label(`${f.name}  ${f.value * f.count} 番`, (w, h) => { const r = rect(w, h); return { x: r.x + 24 + i % 2 * (r.width / 2 - 12), y: r.y + 91 + Math.floor(i / 2) * 25, width: r.width / 2 - 30, height: 23 }; }, 13, MUTED, 'center', true));
    if (o.phase === 'match-over') {
      const leader = [...o.players].sort((a, b) => b.fan - a.fan || b.score - a.score)[0]!;
      this.label(`累计最高：${leader.name} · ${leader.fan} 番`, (w, h) => { const r = rect(w, h); return { x: r.x + 12, y: r.y + r.height - 41, width: r.width - 24, height: 28 }; }, 17, GOLD, 'center', true);
    }
  }
  snapshot() { return this.hud.snapshot(); }
}
export function actionLabel(a: Action): string {
  return ({ hu: '和牌', pass: '过', pung: '碰', kong: '明杠', 'concealed-kong': `暗杠 ${TILE_NAMES[a.tile!]}`, 'add-kong': `加杠 ${TILE_NAMES[a.tile!]}`, chow: `吃 ${a.tiles?.map(t => t % 9 + 1).join('')}`, discard: `打 ${TILE_NAMES[a.tile!]}` })[a.type];
}
