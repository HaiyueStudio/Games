import type { HaiyueEngine, World } from '@haiyue/engine';
import { GuiButton, GuiElement, GuiImage, GuiLabel, GuiModal, GuiTooltip } from '@haiyue/engine/gui';
import { GameHud } from '../../shared/ui/GameHud';
import { ModelSettings, MODEL_SETTINGS_CHARS } from './ModelSettings';
import type { ModelHub } from '../api/ModelHub';
import type { MatchController } from '../app/MatchController';
import { seat, TILE_NAMES, WINDS, type Observation, type Scorer } from '../rules/types';
import { type Rect } from './layout';
import { tileUv, type TileAtlas } from './TileAtlas';
import { handTiles, playerRowTiles, riverTileRects } from './tileLayout';
import { MahjongNotifications, ACTION_NOTICE_CHARS } from './MahjongNotifications';
import { directionMarkers, claimHandIndices, meldAccent } from './tablePresentation';
import { MahjongTable3D } from '../rendering/MahjongTable3D';
import { HAND_STAND_ANGLE, OPPONENT_STAND_ANGLE, tilePose, type TableTile } from '../rendering/tableModel';
import { CoachPanel } from './CoachPanel';
import type { CoachSystem } from '../ai/coaching/CoachSystem';
import { COACH_CHARS } from './coachChars';
import { ClaimControls } from './ClaimControls';
import { MahjongDrawer } from './MahjongDrawer';
import { iconUv, panelSkin, type UiArt, type UiIcon } from './UiArt';
import { fanPreviewItems } from './tablePresentation';

type Layout = (w: number, h: number) => Rect;
const INK = '#e8ede0', MUTED = '#98b7ab', GOLD = '#e8c17c';
const CHARS = '国标雀局东南西北风圈第剩余张玩家观战自动对局开始暂停继续下一新比赛和牌自摸补花流吃碰明暗杠过提示计算完成思考中轮到你点击手出牌分累计番胜排名记录算法接口等待时间秒调整单步回放导出八起胡不计入花番数四圈十六公平信息座位选择智能评估进有效兼顾型与安全满足已本局结束结果尚无番种分析请先毫从返当前设定接第三方模型只收到己手和公共请查看支持参与练习均可规则两次点击确认没有可执行的动作异常取消模型终局标题快慢复盘强策略青竹白露玄玉听雨春夏秋冬梅兰菊中发白万条筒●·—→＋负≥，：、。' + TILE_NAMES.join('');
export class MahjongHud {
  readonly hud: GameHud;
  private dynamic: GuiElement[] = [];
  private previous = '';
  private selected: number | null = null;
  private readonly title:GuiLabel;
  private status: GuiLabel;
  private play: GuiButton;
  private step: GuiButton;
  private next: GuiButton;
  private hint: GuiButton;
  private showFanDetails = false;
  private modal: GuiModal | null = null;
  private modalResume: { running: boolean; generation: number } | null = null;
  private inspectionKey = '';
  private observationKey = '';
  private observed: Observation | null = null;
  private tileViews: Array<Omit<TableTile, 'rect'> & { node: GuiButton | null; plan: Layout }> = [];
  private fanSummary: GuiLabel;
  private fanHint: GuiLabel;
  private readonly notifications: MahjongNotifications;
  private readonly modelSettings: ModelSettings;
  private readonly claims: ClaimControls;
  private readonly drawer: MahjongDrawer;
  private readonly coachPanel:CoachPanel;
  private readonly coachBrief:GuiLabel;
  private readonly playIcon: GuiImage;
  private readonly transportDock: GuiElement;
  private readonly tooltips: GuiTooltip[] = [];
  private readonly rankingButton: GuiButton;
  private readonly drawerButton: GuiButton;
  constructor(private readonly engine: HaiyueEngine, world: World, private readonly game: MatchController, private readonly scorer: Scorer, private readonly download: () => void, private readonly atlas: TileAtlas, private readonly models: ModelHub, private readonly table3d: MahjongTable3D, private readonly art: UiArt, private readonly coach:CoachSystem) {
    this.hud = new GameHud(engine, world, COACH_CHARS + MODEL_SETTINGS_CHARS + ACTION_NOTICE_CHARS + CHARS + '存档无法恢复就绪最高无人原样加载失败返回非法动作取消对局进行鼠标本场有空格外部未连接重新后已有参考预估明细成未公开关闭统计现识别余点特殊共同完整裁判须达到不同张准另差×…' + '庄家亮明高亮来源风位观战全手公开查看门前清按点和参考自摸以不求人结算' + scorer.catalog.map(f => f.name).join('')+'牌局设置位与模式金色边框为吃入的牌整组确认返回选择组合播放器打开操作面板关闭本场排名', 1440, 900, 'load', true);
    Object.assign(this.hud.root.theme.colors, { primary: GOLD, background: '#10231e', surface: '#1a332b', hover: '#36594a', border: '#466153', text: INK });
    this.hud.root.theme.fontSize = 15;
    this.title=this.label('国标雀局', (w) => ({ x: w/2-90, y: 17, width: 180, height: 28 }), 21, '#d7c79b', 'center');
    this.status = this.label('', (w) => ({x:Math.max(72,w/2-360),y:52,width:Math.min(720,w-144),height:24}), 12, GOLD, 'center');
    this.transportDock=this.pin(new GuiElement({pointerFilter:'ignore',style:{backgroundColor:'#071e17ed',borderColor:'#6e7853',radius:32}}), (w,h)=>({x:w/2-118,y:h-80,width:236,height:66}));
    this.play = this.iconButton('transport-play','play',(w,h)=>({x:w/2-29,y:h-76,width:58,height:58}),()=>{if(!game.started)game.start();else game.pause()},'继续 / 暂停',true);
    this.playIcon = this.play.children[0] as GuiImage;
    this.step = this.iconButton('transport-step','step',(w,h)=>({x:w/2+49,y:h-69,width:44,height:44}),()=>{if(!this.table3d.animating)void game.step()},'单步');
    this.hint = this.iconButton('transport-hint','hint',(w,h)=>({x:w/2-93,y:h-69,width:44,height:44}),()=>this.openCoach(),'策略分析');
    this.next=this.button('下一局',(w,h)=>({x:w/2-78,y:h/2+20,width:156,height:48}),()=>{if(this.observed?.phase==='match-over')this.drawer.open('ranking');else game.next()},true);
    this.next.setVisible(false);
    this.fanSummary = this.label('',(w,h)=>({x:w<900?14:24,y:w<900?h-111:h-66,width:w<900?w-125:Math.min(390,w/2-150),height:24}),13,GOLD);
    this.fanHint = this.label('',(w,h)=>({x:140,y:w<900?-2000:h-35,width:Math.min(350,w/2-260),height:20}),10,MUTED);
    this.button('番型明细',(w,h)=>({x:w<900?w-101:24,y:w<900?h-110:h-38,width:87,height:26}),()=>this.openFanDetails());
    this.claims = new ClaimControls(this.hud.root,engine.canvas!,game,atlas,art);
    this.modelSettings = new ModelSettings(this.hud.root, engine.canvas!, game, models, art);
    this.drawer = new MahjongDrawer(this.hud.root,engine.canvas!,game,art,()=>this.modelSettings.open(),download,()=>this.openCoach());
    this.coachPanel=new CoachPanel(this.hud.root,engine.canvas!,coach,art);
    this.coachBrief=this.label('',(w,h)=>({x:w/2-Math.min(230,(w-32)/2),y:w<900?h-145:h-108,width:Math.min(460,w-32),height:22}),12,MUTED,'center');
    this.rankingButton=this.iconButton('ranking-toggle',null,()=>({x:18,y:16,width:46,height:46}),()=>this.drawer.open('ranking'),'本场排名');
    this.drawerButton=this.iconButton('drawer-toggle','menu',(w)=>({x:w-64,y:16,width:46,height:46}),()=>this.drawer.open('settings'),'牌局设置');
    this.notifications = new MahjongNotifications(this.hud.root, engine.canvas!);
  }
  private iconButton(id:string,icon:UiIcon|null,rect:Layout,onClick:()=>void,tooltip:string,primary=false):GuiButton{
    const button=this.pin(new GuiButton({id,text:'',onClick,style:{backgroundColor:primary?GOLD:'#0b2c22df',hoverBackgroundColor:primary?'#f6d99b':'#31563e',borderColor:primary?'#ffdfa0':'#677756',radius:32,padding:0}}),rect);
    const image=button.add(new GuiImage({source:icon?this.art.icons:this.art.ranking,sourceKey:icon?'mahjong:ui-icons:v1':'mahjong:ui-ranking:v1',uv:icon?iconUv(icon):[0,0,1,1],tint:primary?'#173325':icon?'#f0d49a':'#ffffff',pointerFilter:'ignore'}));
    image.layout=p=>{const inset=p.width*(icon ? .24 : .09);Object.assign(image.rect,{x:p.x+inset,y:p.y+inset,width:p.width-inset*2,height:p.height-inset*2})};
    this.tooltips.push(this.hud.root.add(new GuiTooltip({target:button,content:tooltip,placement:'top',delay:300,style:{backgroundColor:'#0b251d',color:INK,padding:7,radius:7}})));return button;
  }
  private pin<T extends GuiElement>(node: T, rect: Layout, dynamic = false): T {
    let previousLayout = '';
    node.layout = p => {
      const canvas = this.engine.canvas!, scale = p.width / Math.max(1, canvas.clientWidth);
      const font = Number((node as GuiElement & { baseFont?: number }).baseFont ?? 14);
      const key = `${p.x}:${p.y}:${p.width}:${p.height}:${canvas.clientWidth}:${canvas.clientHeight}:${font}`;
      if (key !== previousLayout) {
        previousLayout = key;
        const r = rect(p.width / scale, p.height / scale);
        Object.assign(node.rect, { x: p.x + r.x * scale, y: p.y + r.y * scale, width: r.width * scale, height: r.height * scale });
        if (node instanceof GuiLabel) node.setFontSize(font * scale);
      }
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
  private tile(t: number | null, rect: Layout, click?: () => void, highlight = false, metadata: Partial<Omit<TableTile, 'tile' | 'rect'>> = {}): void {
    const role = metadata.role ?? 'table', emphasis = metadata.emphasis || (highlight ? 'selected' : ''), yaw=metadata.yaw??0;
    // Only playable cards need native hit targets; all card artwork belongs to the 3D batches.
    const box = click ? new GuiButton({ id: `tile-hand-${metadata.seat}-${metadata.sourceIndex}`, text: '', onClick: click,
      style: { backgroundColor: 'transparent', hoverBackgroundColor: 'transparent', borderColor: 'transparent', padding: 0 } }) : null;
    if (box) this.pin(box, (w, h) => this.table3d.tileRect({ rect: rect(w, h), role, emphasis, yaw, flat: metadata.flat ?? false }), true);
    this.tileViews.push({ node: box, plan: rect, tile: t, role, sourceIndex: metadata.sourceIndex ?? -1, group: metadata.group ?? -1, seat: metadata.seat ?? -1, drawn: metadata.drawn ?? false, emphasis, yaw, flat: metadata.flat ?? false });
  }
  sync(): void {
    this.modelSettings.sync();
    const observationKey = `${this.game.revision}:${this.game.human}:${this.game.viewRevision}`;
    if (observationKey !== this.observationKey || !this.observed) {
      this.observationKey = observationKey; this.observed = this.game.observation();
    }
    const o = this.observed, canvas = this.engine.canvas!;
    for(const tooltip of this.tooltips)tooltip.setVisible(canvas.clientWidth>=900&&!this.modalOpen&&!o.phase.endsWith('over'));
    this.title.setVisible(canvas.clientHeight>=600);this.status.setVisible(canvas.clientHeight>=600);this.fanSummary.setVisible(canvas.clientHeight>=600);this.fanHint.setVisible(canvas.clientWidth>=900&&canvas.clientHeight>=600);
    this.coach.sync(o,this.game.presentationEpoch);
    this.coachPanel.sync(this.drawer.visible||this.modelSettings.visible||this.showFanDetails||this.claims.visible);
    const advice=this.coach.report,candidate=advice?.candidates[0];
    this.coachBrief.setVisible(!!advice?.recommendation&&!this.coachPanel.visible&&!this.modalOpen&&canvas.clientHeight>=600);
    this.coachBrief.setText(advice?.recommendation?.type==='hu'?'建议立即胡牌':candidate?`${candidate.action.type==='discard'?'建议打'+TILE_NAMES[candidate.action.tile!]:candidate.action.type==='pass'?'建议过':'建议副露'} · ${candidate.shanten===0?'听牌':candidate.shanten+'向听'} · 相对风险${candidate.risk}分`:'');
    const dock=this.drawer.visible?this.drawer.dock:this.coachPanel.visible&&canvas.clientWidth>=1100?'right':'none';
    this.table3d.setDock(dock);
    this.table3d.resize();
    this.drawer.sync(o,this.table3d.animating);
    this.claims.sync(o,this.showFanDetails||this.modelSettings.visible||this.drawer.visible,this.table3d.animating);
    this.notifications.sync(o, this.game.human, this.game.started, this.game.presentationEpoch, this.modalOpen);
    const ended = o.phase.endsWith('over'), result = ended ? o.results.at(-1) : null;
    const status = result ? result.winner === null ? '本局流局 · 四家亮牌' : `${result.winner === this.game.human ? '你' : o.players[result.winner]!.name} ${result.selfDrawn ? '自摸' : '和牌'} · ${result.win!.fan} 番 + ${result.win!.flowers} 花` : this.game.thinking && this.models.browser.busy ? this.models.browser.message : this.game.status;
    this.status.setText(status + (this.game.waitingMs > 0 ? ` · 等待 ${(this.game.waitingMs / 1000).toFixed(1)} 秒` : ''));
    const playUv=iconUv(this.game.started&&!this.game.paused?'pause':'play');if(this.playIcon.uv[0]!==playUv[0])this.playIcon.setUv(playUv);
    this.transportDock.setVisible(!ended);this.play.setVisible(!ended);this.step.setVisible(!ended);this.hint.setVisible(!ended);
    this.play.setDisabled(ended);
    this.next.setVisible(ended);this.next.setText(o.phase==='match-over'?'本场排名':'下一局');
    this.next.setDisabled(!ended || this.table3d.animating);
    this.step.setDisabled(ended || this.game.thinking || this.table3d.animating);
    this.hint.setDisabled(false);
    const inspectionKey = `${o.revision}:${this.game.human}:${this.game.viewRevision}`;
    if (inspectionKey !== this.inspectionKey) { this.inspectionKey = inspectionKey; if (this.game.human !== null) void this.game.inspectHand().catch(() => {}); }
    const a = this.game.handAnalysis?.revision === o.revision ? this.game.handAnalysis : null;
    this.fanSummary.setText(this.game.human === null ? '观战 · 四家手牌已公开' : !a ? '当前番型分析中…' : a.kind === 'complete' ? ended ? `本局和牌 ${a.fan} 番` : `当前和牌 ${a.fan} 番${a.fan >= 8 ? ' · 可和' : ` · 差 ${8 - a.fan} 番`}` : a.kind === 'waiting' ? `${a.discard === null ? '听牌' : `打${TILE_NAMES[a.discard]}后`} ${a.minFan === a.maxFan ? a.minFan : `${a.minFan}–${a.maxFan}`} 番（预估）` : `已有番型 ${a.fan} 番（参考）`);
    this.fanHint.setText(a ? `${fanPreviewItems(a.items).map(f => `${f.name} ${f.value * f.count}`).join(' · ') || '尚无已识别番型'} · 花 +${a.flowers} 另计` : '花牌另计 · 最终以成和结算为准');
    const key = `${inspectionKey}:${canvas.clientWidth}:${canvas.clientHeight}:${this.selected}:${this.game.started}:${this.game.analysis?.action.tile}:${a?.revision}:${this.showFanDetails}:${this.table3d.animating}:${dock}:${this.claims.previewKey}`;
    if (key === this.previous) return; this.previous = key;
    for (const n of this.dynamic) this.hud.root.root.remove(n); this.dynamic = []; this.tileViews = []; this.modal = null;
    const faces = this.game.presentationHands();
    this.drawPlayers(o,faces); this.drawHand(o,faces);
    this.table3d.sync(this.tileViews.map(({ node:_node, plan, ...metadata }) => ({ ...metadata, rect: plan(canvas.clientWidth, canvas.clientHeight) })), o, this.game.human ?? 0, this.game.presentationWall(), this.game.presentationEpoch, this.game.paused, this.game.presentationWinningTile());
    if (['hand-over', 'match-over'].includes(o.phase)) this.drawResult(o);
    if (this.showFanDetails) this.drawFanDetails(o);
    this.coachPanel.raise();
  }
  private drawPlayers(o: Observation, faces: ReturnType<MatchController['presentationHands']>): void {
    const view = this.game.human ?? 0, flat = o.phase.endsWith('over');
    for (let relative = 0; relative < 4; relative++) {
      const who = seat(view + relative), p = o.players[who]!, active = o.turn === who && o.phase === 'turn';
      const melds = faces?.melds[who] ?? p.melds, last = o.events.at(-1);
      const hasDrawn = o.phase === 'turn' && o.turn === who && last?.type === 'draw' && last.seat === who;
      const hand = faces?.hands[who] ?? (who === this.game.human ? o.hand : Array(p.handCount).fill(0));
      const ordered = handTiles(hand, hasDrawn ? faces?.drawn ?? (who === o.seat ? o.drawn : 0) : null);
      const role=faces?'revealed':who===this.game.human?'hand':'concealed';
      const row = playerRowTiles(ordered, melds, relative, flat ? 0 : role==='concealed'?OPPONENT_STAND_ANGLE:HAND_STAND_ANGLE,p.flowers);
      const name = this.engine.canvas!.clientWidth < 900 ? `${WINDS[seat(who - o.dealer)]} ${who === this.game.human ? '你' : ''} ${active ? '●' : ''}` : `${WINDS[seat(who - o.dealer)]}  ${who === this.game.human ? '你' : p.name}  ${active ? '●' : ''}`;
      this.label(name, (w) => {
        const boxes=[...row.hands.map(t=>this.table3d.tileRect({rect:t.rect,role,emphasis:'',yaw:t.yaw,flat})),...row.melds.map(t=>this.table3d.tileRect({rect:t.rect,role:'meld',emphasis:'',yaw:t.yaw})),...row.flowers.map(t=>this.table3d.tileRect({rect:t.rect,role:'flower',emphasis:'',yaw:t.yaw}))];
        const left=Math.min(...boxes.map(r=>r.x)),right=Math.max(...boxes.map(r=>r.x+r.width));
        const top=Math.min(...boxes.map(r=>r.y)),bottom=Math.max(...boxes.map(r=>r.y+r.height));
        const width=relative%2?120:200;
        return {x:Math.max(8,Math.min(w-width-8,(left+right-width)/2)),y:relative===2?Math.max(8,top-25):bottom+8,width,height:20};
      }, this.engine.canvas!.clientWidth < 900 ? 10 : 13, active ? GOLD : MUTED, 'center', true);
      const river=riverTileRects(p.river.length,relative);
      p.river.forEach((tile,index)=>this.tile(tile,()=>river[index]!,undefined,o.last?.seat===who&&index===p.river.length-1,{role:'river',seat:who,sourceIndex:index}));
      if(relative!==0 || this.game.human===null) row.hands.forEach(t=>this.tile(faces?t.tile:null,()=>t.rect,undefined,false,{role:faces?'revealed':'concealed',seat:who,sourceIndex:t.index,drawn:t.drawn,yaw:t.yaw,flat}));
      row.melds.forEach(t=>{
        const accent=meldAccent(o,who,t.group);
        this.tile(t.tile,()=>t.rect,undefined,true,{role:'meld',group:t.group,sourceIndex:t.index,seat:who,yaw:t.yaw,emphasis:accent.calledIndex===t.index?'called':accent.latest?'latest-meld':'meld'});
      });
      row.flowers.forEach(t=>this.tile(t.tile,()=>t.rect,undefined,false,{role:'flower',seat:who,sourceIndex:t.index,yaw:t.yaw}));
    }
  }
  private drawHand(o: Observation, faces: ReturnType<MatchController['presentationHands']>): void {
    const canDiscard = !this.table3d.animating && this.game.started && o.phase === 'turn' && o.turn === this.game.human;
    const tiles = handTiles(o.hand, o.drawn), eligible = claimHandIndices(o.hand, o.legalActions, this.claims.previewKey);
    const flat = o.phase.endsWith('over');
    const row=playerRowTiles(tiles,faces?.melds[o.seat]??o.players[o.seat]!.melds,0,flat ? 0 : HAND_STAND_ANGLE,o.players[o.seat]!.flowers);
    if (this.game.human !== null) for (let display = 0; display < tiles.length; display++) {
      const { tile: t, index, drawn } = tiles[display]!, placed=row.hands[display]!, suggested = this.game.analysis?.action.type === 'discard' && this.game.analysis.action.tile === t;
      this.tile(t, () => placed.rect, canDiscard ? () => {
        if (this.selected === index) { this.game.act({ type: 'discard', tile: t }); this.selected = null; }
        else this.selected = index;
      } : undefined, !flat && (suggested || this.selected === index || eligible.has(index)), { emphasis: flat ? '' : eligible.has(index) ? 'eligible' : this.selected === index || suggested ? 'selected' : '', role: 'hand', sourceIndex: index, seat: o.seat, drawn, yaw:placed.yaw,flat });
    }
  }
  openCoach():void { this.coachPanel.open(); }
  get modalOpen(): boolean { return this.showFanDetails || this.modelSettings.visible || this.claims.visible || this.drawer.visible; }
  closeModal(): void { if(this.modelSettings.visible)this.modelSettings.close();else if(this.claims.visible)this.claims.close();else if(this.showFanDetails)this.closeFanDetails();else this.drawer.close(); }
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
      onClose: () => this.closeFanDetails(), style: panelSkin(this.art) });
    this.hud.root.add(modal); this.dynamic.push(modal);
    modal.setTitle(a?.kind === 'complete' ? `当前和牌 ${a.fan} 番` : a?.kind === 'waiting' ? `成和预估 ${a.minFan}–${a.maxFan} 番` : `当前番型参考 ${a?.fan ?? 0} 番`);
    modal.setMessage(this.game.human === null ? '观战时手牌已公开，可暂停分析四家牌面' : a?.kind === 'forming' ? a.items.some(f=>f.name==='门前清')?'未和牌：门前清按点和参考，自摸以不求人结算':'未和牌：仅统计已有牌张与面子番型' : a?.kind === 'waiting' ? '按可见余牌估算点和番数，自摸与特殊和牌另计' : '完整裁判计分 · 花牌另计');
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
    const rect: Layout=(w,h)=>({x:w/2-Math.min(290,(w-28)/2),y:h/2-95,width:Math.min(580,w-28),height:100});
    this.pin(new GuiElement({pointerFilter:'ignore',style:{...panelSkin(this.art),radius:16}}),rect,true);
    const text = o.phase === 'match-over' ? '四圈比赛结束' : result.winner === null ? '本局流局' : `${result.winner === this.game.human ? '你' : o.players[result.winner]!.name} ${result.selfDrawn ? '自摸' : '和牌'}`;
    this.label(text, (w, h) => { const r = rect(w, h); return { x: r.x + 12, y: r.y + 13, width: r.width - 24, height: 34 }; }, 20, GOLD, 'center', true);
    const details = result.win ? `${result.win.fan} 番 + ${result.win.flowers} 花 · 得分 +${result.deltas[result.winner!]}` : '无人和牌 · 比赛分不变';
    this.label(details, (w, h) => { const r = rect(w, h); return { x: r.x + 12, y: r.y + 52, width: r.width - 24, height: 25 }; }, 14, INK, 'center', true);
    if(o.phase==='match-over'){
      const leader=[...o.players].sort((a,b)=>b.fan-a.fan||b.score-a.score)[0]!;
      this.label(`累计最高：${leader.name} · ${leader.fan} 番`,(w,h)=>({x:w/2-240,y:h/2+81,width:480,height:28}),15,GOLD,'center',true);
    }
  }
  snapshot() {
    const nodes: Array<{id:string;type:string;text:string;visible:boolean;disabled:boolean;value:unknown;rect:Rect}>=[];
    const visit=(node:GuiElement,parentVisible=true)=>{const visible=parentVisible&&node.visible;nodes.push({id:node.id,type:node.constructor.name,text:'text' in node?String(node.text):'',visible,disabled:node.disabled,value:'value' in node?node.value:null,rect:{...node.rect}});for(const child of node.children)visit(child,visible)};
    for(const child of this.hud.root.root.children)visit(child);
    return {width:this.hud.root.viewport.width,height:this.hud.root.viewport.height,nodes};
  }
  presentationSnapshot(observation: Observation) {
    const scene = this.table3d.snapshot();
    return { table: scene.table, scene, compassRect: scene.surface.compassRect,
      atlas: this.atlas.sourceKey, coachPanel:this.coachPanel.snapshot(), drawer: this.drawer.snapshot(), actions: this.claims.snapshot(), controls: { play:{id:this.play.id,label:!this.game.started?'开始对局':this.game.paused?'继续':'暂停',rect:{...this.play.rect}}, step:{id:this.step.id,rect:{...this.step.rect}}, hint:{id:this.hint.id,rect:{...this.hint.rect}}, ranking:{rect:{...this.rankingButton.rect}}, settings:{rect:{...this.drawerButton.rect}}, next:{visible:this.next.visible,rect:{...this.next.rect}} }, notifications: this.notifications.snapshot(), modelSettings: this.modelSettings.snapshot(),
      fanDetails: this.showFanDetails, modal: this.modal ? { layer: 'engine-modal', rect: { ...this.modal.dialogRect }, closeRect: { ...this.modal.confirmButton.rect } } : null,
      compass: directionMarkers(observation, this.game.human ?? 0), allHandsVisible: this.game.human === null || observation.phase.endsWith('over'),
      tiles: this.tileViews.map(({node,plan,...metadata})=>{
        const canvas=this.engine.canvas!, surfaceRect=plan(canvas.clientWidth,canvas.clientHeight), screenRect=this.table3d.tileRect({...metadata,rect:surfaceRect});
        const viewport=this.hud.root.root.rect, scale=viewport.width/Math.max(1,canvas.clientWidth);
        const rect=node?{...node.rect}:{x:viewport.x+screenRect.x*scale,y:viewport.y+screenRect.y*scale,width:screenRect.width*scale,height:screenRect.height*scale};
        return{...metadata,rect,surfaceRect,pose:tilePose({...metadata,rect:surfaceRect}),uv:tileUv(metadata.tile),sourceKey:this.atlas.sourceKey};
      }) };
  }
}
