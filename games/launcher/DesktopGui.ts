import { GuiButton, GuiElement, GuiImage, GuiInput, GuiLabel, GuiRoot, type GuiPointerEvent } from '@haiyue/engine/gui';
import { CARD_GAP, SHELF_INSET, desktopLayout, type DesktopRect } from './layout';
import { MomentumScrollView } from './MomentumScrollView';
import { CARD_GLOW_PADDING, CARD_TEXTURE_HEIGHT, CARD_TEXTURE_WIDTH, cardTextures } from './cardTextures';
import { advanceCardHover, cardHoverPose } from './cardHoverMotion';
import type { HoverCard } from './CardHover';
import { GENRE_COLORS, inputIcon } from './cardBadges';
import type { GameProgress } from '../host/types';
import type { ConnectionNotice } from '../gamepad/connections';

export interface DesktopGame { id: string; title: string; description: string; genre: string; thumbnail: string; favorite: boolean; threeD: boolean; gamepad: boolean; mobile: boolean }
export interface DesktopState { games: DesktopGame[]; selected: DesktopGame | null; selectionActive: boolean; view: string; category: string; search: string; total: number; favorites: number; error: string }
export interface DesktopActions { select(id: string): void; launch(id: string): void; view(value: string): void; category(value: string): void; search(value: string): void; favorite(): void; external(id: string): void; home(): void; retry(): void; simulator(mode: 'pad' | 'phone' | null): void }
const fill = { width: '100%' as const, height: '100%' as const };
const views = [['all', '▦  游戏库'], ['recent', '◷  最近游玩'], ['favorites', '♡  我的收藏']] as const;
const categories = [['all', '全部'], ['puzzle', '益智'], ['3d', '立体世界'], ['physics', '物理'], ['arcade', '街机'], ['audio', '音乐']] as const;
export const DESKTOP_TEXT = 'HAIYUE GAME OS游戏空间你的下一场冒险全部游戏最近游玩我的收藏开始游戏独立打开收藏取消没有找到匹配的游戏还没有收藏还没有游玩记录浏览全部游戏搜索手柄键鼠触屏已连接已断开正在载入暂时无法载入重试即刻游玩支持手柄立体世界本机玩家按开始进入切换分类返回选择探索益智街机物理音乐沙盒纸牌准备就绪刷新页面确认取消▦◷♡♥⌕＋→↗◇…款';

export class DesktopGui {
  readonly root = new GuiRoot({ style: { fontFamily: 'Microsoft YaHei, Segoe UI, sans-serif', fontSize: 14 }, theme: { fontFamily: 'Microsoft YaHei, Segoe UI, sans-serif', fontSize: 14,
    colors: { text: '#edf7ff', textMuted: '#b5c7db', primary: '#b9f5a8', background: '#0d2135', surface: '#142c46', border: '#507589', hover: '#294d66', active: '#20495c', disabled: '#64748b', danger: '#e58386' } } });
  readonly search: GuiInput;
  readonly shelf: MomentumScrollView;
  private readonly nodes = new Map<string, GuiElement>();
  private readonly rectangles = new Map<GuiElement, DesktopRect>();
  private readonly cards = new Map<string, GuiButton>();
  private readonly cardMotion = new Map<string, { info: number; glow: number; hover: number; hoverable: boolean }>();
  private readonly textures = cardTextures();
  private readonly icons = { gamepad: inputIcon('gamepad'), mobile: inputIcon('mobile'), keyboard: inputIcon('keyboard') };
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly imageUrls = new Map<GuiImage, string>();
  private state: DesktopState = { games: [], selected: null, selectionActive: false, view: 'all', category: 'all', search: '', total: 0, favorites: 0, error: '' };
  private layout = desktopLayout(1040, 600);
  private notices: readonly ConnectionNotice[] = [];
  private connected = false;
  private loading: GameProgress | null = null;
  private loadingTime = 0;
  constructor(private readonly actions: DesktopActions) {
    this.panel('header', 'rgba(5,16,31,.48)');
    this.label('brand', 'HAIYUE', 22, '#d7ffb9'); this.label('edition', 'GAME OS / 01', 10, '#b3c7db');
    this.label('context', '你的游戏空间', 13, '#b0c9dc'); this.label('clock', '', 16); this.label('status', 'WEBGPU  /  P1', 11, '#b7e9d8');
    this.panel('sidebar', 'rgba(5,16,31,.46)'); this.label('nav-caption', '你的空间', 11, '#8fb1cb');
    for (const [value, title] of views) this.button(`view-${value}`, title, () => actions.view(value));
    this.label('sidebar-note', '按下开始\n进入游戏', 18); this.label('sidebar-help', '手柄 / 键鼠 / 触屏', 11, '#acc4d7');
    this.button('devices', '◇  设备模拟器', () => actions.simulator('pad'));
    this.panel('hero-panel', 'rgba(11,31,48,.35)', 16); this.image('hero-image');
    const shade = document.createElement('canvas'); shade.width = 256; shade.height = 1;
    const context = shade.getContext('2d')!, gradient = context.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, 'rgba(3,14,28,.97)'); gradient.addColorStop(.48, 'rgba(3,14,28,.75)'); gradient.addColorStop(1, 'rgba(3,14,28,.05)');
    context.fillStyle = gradient; context.fillRect(0, 0, 256, 1);
    this.add(new GuiImage({ ...fill, id: 'hero-shade', source: shade, pointerFilter: 'ignore' }));
    this.label('hero-kicker', '准备就绪 · 即刻游玩', 11, '#c5f3ac'); this.label('hero-tags', '', 11, '#c2dded');
    for (const kind of ['gamepad', 'mobile', 'keyboard'] as const) this.add(new GuiImage({ ...fill, id: 'hero-' + kind, source: this.icons[kind], pointerFilter: 'ignore' }));
    this.label('hero-title', '你的下一场冒险', 32); this.label('hero-description', '正在载入游戏库…', 14, '#c1d3e0');
    this.button('play', 'A  开始游戏  →', () => { if (this.state.selected) actions.launch(this.state.selected.id); }, true);
    this.button('favorite', '♡', actions.favorite);
    this.button('external', '↗', () => { if (this.state.selected) actions.external(this.state.selected.id); });
    this.label('collection-title', '全部游戏', 20); this.label('visible-count', '', 12, '#bad3e3');
    this.search = this.add(new GuiInput({ ...fill, id: 'search', placeholder: '⌕  搜索游戏', maxLength: 80, onChange: value => actions.search(value), style: { backgroundColor: 'rgba(8,23,42,.68)', borderColor: '#477187', radius: 8, padding: 10 } }));
    for (const [value, title] of categories) this.button(`category-${value}`, title, () => actions.category(value));
    this.shelf = this.add(new MomentumScrollView({ ...fill, id: 'shelf', inertia: true, inertiaStrength: 1.2, style: { backgroundColor: 'transparent', borderColor: 'transparent', padding: 0 } }));
    this.label('empty-title', '', 20); this.label('empty-description', '', 12, '#b6ccde'); this.button('empty-reset', '浏览全部游戏  →', () => actions.view('all'));
    this.panel('footer', 'rgba(5,16,31,.6)'); this.label('hints', '', 11, '#c1d4e4'); this.label('input-status', '手柄 / 键鼠 / 触屏', 11, '#b4d4df');
    for (let index = 0; index < 4; index++) this.label(`notice-${index}`, '', 14, '#e7ffe0', 'rgba(13,49,52,.96)');
    this.add(new GuiElement({ ...fill, id: 'load-shade', visible: false, pointerFilter: 'stop', style: { backgroundColor: 'rgba(3,10,24,.95)', borderColor: 'transparent' } }));
    this.label('load-title', '', 26, '#e7ffe0'); this.label('load-stage', '', 16, '#a4b5ff'); this.label('load-resources', '', 13, '#b9d1e8');
    this.panel('load-track', '#162d48', 4); this.panel('load-bar', '#9f77ff', 4);
    this.button('load-cancel', '返回游戏库', actions.home); this.button('load-retry', '重新加载', actions.retry, true);
    this.showLoading(null);
  }
  private add<T extends GuiElement>(node: T, parent = this.root.root): T {
    const rectangle = { x: 0, y: 0, width: 0, height: 0 }, layout = node.layout.bind(node);
    this.rectangles.set(node, rectangle); this.nodes.set(node.id, node);
    node.layout = area => layout({ x: area.x + rectangle.x, y: area.y + rectangle.y, width: rectangle.width, height: rectangle.height });
    parent.add(node); return node;
  }
  private panel(id: string, color: string, radius = 0, parent = this.root.root) {
    return this.add(new GuiElement({ ...fill, id, pointerFilter: 'ignore', style: { backgroundColor: color, borderColor: 'transparent', radius, padding: 0 } }), parent);
  }
  private label(id: string, text: string, fontSize: number, color = '#edf7ff', backgroundColor = 'transparent', parent = this.root.root) {
    return this.add(new GuiLabel({ ...fill, id, text, fontSize, pointerFilter: 'ignore', style: { color, backgroundColor, padding: 0 } }), parent);
  }
  private image(id: string, parent = this.root.root) { return this.add(new GuiImage({ ...fill, id, pointerFilter: 'ignore' }), parent); }
  private button(id: string, text: string, onClick: () => void, primary = false, parent = this.root.root) {
    return this.add(new GuiButton({ ...fill, id, text, onClick, hoverTransition: true, style: { padding: 0, radius: 8,
      backgroundColor: primary ? '#c3f1a8' : 'rgba(18,42,63,.65)', color: primary ? '#173928' : '#d7eaf5', borderColor: primary ? '#d6ffc1' : '#426478' } }), parent);
  }
  private place(id: string | GuiElement, rectangle: DesktopRect): void {
    const node = typeof id === 'string' ? this.nodes.get(id)! : id;
    const previous = this.rectangles.get(node)!;
    if (previous.x === rectangle.x && previous.y === rectangle.y && previous.width === rectangle.width && previous.height === rectangle.height) return;
    Object.assign(previous, rectangle); node.markDirty();
    if (node instanceof GuiImage) this.fitImage(node);
  }
  private text(id: string, text: string): void { (this.nodes.get(id) as GuiLabel).setText(text); }
  private visible(id: string, value: boolean): void { this.nodes.get(id)!.setVisible(value); }
  private fitImage(node: GuiImage): void {
    const source = this.images.get(this.imageUrls.get(node) ?? ''), rectangle = this.rectangles.get(node)!;
    if (!source?.naturalWidth || !rectangle.height) return;
    const aspect = rectangle.width / rectangle.height, ratio = source.naturalWidth / source.naturalHeight;
    const cropWidth = Math.min(1, aspect / ratio), cropHeight = Math.min(1, ratio / aspect);
    node.setUv([(1 - cropWidth) / 2, (1 - cropHeight) / 2, cropWidth, cropHeight]);
  }
  private useImage(node: GuiImage, url: string): void {
    this.imageUrls.set(node, url);
    let image = this.images.get(url);
    if (!image) {
      image = new Image(); image.decoding = 'async';
      image.onload = () => { for (const [target, key] of this.imageUrls) if (key === url) { target.setSource(image!); this.fitImage(target); } };
      this.images.set(url, image); image.src = url;
    }
    node.setSource(image.complete && image.naturalWidth ? image : null); this.fitImage(node);
  }
  setState(state: DesktopState, resetScroll = false): void {
    this.state = state; this.search.setValue(state.search);
    for (const [value] of views) this.nodes.get(`view-${value}`)!.setStyle({ backgroundColor: state.view === value ? '#31564e' : 'rgba(10,29,47,.35)', borderColor: state.view === value ? '#b8efa8' : 'transparent' });
    for (const [value] of categories) this.nodes.get(`category-${value}`)!.setStyle({ backgroundColor: state.category === value ? '#b9e6ac' : 'rgba(12,32,52,.45)', color: state.category === value ? '#183a2b' : '#c7dce9' });
    for (const [id, card] of this.cards) {
      card.setVisible(false);
      if (!state.games.some(game => game.id === id)) this.cardMotion.get(id)!.hover = 0;
    }
    for (const game of state.games) {
      let card = this.cards.get(game.id);
      if (!card) {
        card = this.button(`game-${game.id}`, '', () => this.actions.launch(game.id), false, this.shelf);
        this.cards.set(game.id, card);
        const animation = { info: 0, glow: 0, hover: 0, hoverable: false }; this.cardMotion.set(game.id, animation);
        card.on('pointerenter', event => { animation.hoverable = (event.detail as GuiPointerEvent).nativeEvent.pointerType !== 'touch'; });
        this.useImage(this.image(`cover-${game.id}`, card), game.thumbnail);
        this.add(new GuiImage({ ...fill, id: `caption-${game.id}`, source: this.textures.shade, visible: false, pointerFilter: 'ignore' }), card);
        this.label(`title-${game.id}`, game.title, 15, '#f1f8ff', 'transparent', card);
        for (const [tag, text, background] of [['genre', game.genre, GENRE_COLORS[game.genre] ?? '#e24ac9'], ['dimension', game.threeD ? '3D' : '2D', game.threeD ? '#8b4df0' : '#009dd1']]) {
          this.label(`${tag}-${game.id}`, text!, 10, '#ffffff', background!, card).setTextAlign('center');
        }
        for (const [prefix, kind, color] of [['input', 'gamepad', '#ef4586'], ['mobile', 'mobile', '#00ad93'], ['keyboard', 'keyboard', '#347cf4']] as const) {
          this.add(new GuiImage({ ...fill, id: `${prefix}-${game.id}`, source: this.icons[kind], pointerFilter: 'ignore', style: { backgroundColor: color, radius: 4 } }), card);
        }
        this.label(`heart-${game.id}`, '', 17, '#d8f7b5', 'transparent', card);
        this.add(new GuiImage({ ...fill, id: `glow-${game.id}`, source: this.textures.glow, visible: false, pointerFilter: 'ignore' }), card);
        for (const prefix of ['title', 'genre', 'dimension', 'input', 'mobile', 'keyboard', 'heart']) this.visible(`${prefix}-${game.id}`, false);
      }
      card.setVisible(true); card.setStyle({ borderColor: '#426476', backgroundColor: '#102c3c' });
      this.text(`heart-${game.id}`, game.favorite ? '♥' : '');
    }
    const selected = state.selected;
    this.text('hero-title', selected?.title ?? (state.error ? '游戏库暂时无法载入' : '你的下一场冒险'));
    this.text('hero-tags', selected ? `${selected.genre}    ${selected.threeD ? '3D 世界' : '2D 游戏'}` : '');
    this.visible('hero-image', !!selected);
    if (selected) this.useImage(this.nodes.get('hero-image') as GuiImage, selected.thumbnail);
    (this.nodes.get('favorite') as GuiButton).setText(selected?.favorite ? '♥' : '♡');
    for (const id of ['play', 'favorite', 'external']) this.nodes.get(id)!.setDisabled(!selected);
    this.text('collection-title', state.view === 'recent' ? '最近游玩' : state.view === 'favorites' ? '我的收藏' : '全部游戏'); this.text('visible-count', `${state.games.length} / ${state.total} 款`);
    this.text('empty-title', state.error ? '游戏库暂时无法载入' : state.search ? '没有找到匹配的游戏' : state.view === 'favorites' ? '还没有收藏' : '还没有游玩记录');
    this.text('empty-description', state.error || (state.search ? '试试其他名称，或切换分类。' : '回到游戏库，开启下一场游戏。'));
    for (const id of ['empty-title', 'empty-description', 'empty-reset']) this.visible(id, !state.games.length);
    if (resetScroll) this.shelf.scrollTo(0);
    this.resize(this.layout.width, this.layout.height);
  }
  resize(width: number, height: number): void {
    const layout = this.layout = desktopLayout(width, height), { hero, collection, shelf, gap } = layout;
    this.place('header', { x: 0, y: 0, width, height: layout.header });
    this.place('brand', { x: gap, y: 12, width: 150, height: 28 }); this.place('edition', { x: gap + 1, y: 37, width: 150, height: 16 });
    this.place('context', { x: 240, y: 22, width: 200, height: 24 }); this.visible('context', width > 900);
    this.place('clock', { x: width - 84, y: 13, width: 70, height: 24 }); this.place('status', { x: width - 180, y: 34, width: 164, height: 18 });
    this.place('sidebar', { x: 0, y: layout.header, width: layout.sidebar, height: height - layout.header - layout.footer });
    this.place('nav-caption', { x: 24, y: layout.header + 18, width: 120, height: 22 }); this.visible('nav-caption', layout.sidebar > 100);
    this.place('devices', layout.compact ? { x: width - 126, y: 16, width: 34, height: 28 } : { x: 12, y: layout.header + (layout.sidebar > 100 ? 218 : 180), width: layout.sidebar - 24, height: 42 });
    (this.nodes.get('devices') as GuiButton).setText(layout.sidebar > 100 ? '◇  设备模拟器' : '◇');
    views.forEach(([value, title], index) => {
      const node = this.nodes.get(`view-${value}`) as GuiButton;
      node.setText(layout.sidebar && layout.sidebar < 100 ? title.slice(0, 1) : title);
      this.place(node, layout.compact ? { x: gap + index * (width - gap * 2) / 3, y: layout.header + 7, width: (width - gap * 2) / 3 - 6, height: 34 }
        : { x: 12, y: layout.header + (layout.sidebar > 100 ? 56 : 18) + index * 54, width: layout.sidebar - 24, height: 42 });
    });
    for (const id of ['sidebar-note', 'sidebar-help']) this.visible(id, layout.sidebar > 100);
    this.place('sidebar-note', { x: 24, y: height - 192, width: 140, height: 60 }); this.place('sidebar-help', { x: 24, y: height - 104, width: 150, height: 24 });
    for (const id of ['hero-panel', 'hero-image', 'hero-shade']) this.place(id, hero);
    const inset = Math.min(28, hero.width * .065), heroTextWidth = hero.width - inset * 2;
    this.place('hero-kicker', { x: hero.x + inset, y: hero.y + 13, width: heroTextWidth, height: 20 });
    this.place('hero-tags', { x: hero.x + inset, y: hero.y + 35, width: heroTextWidth, height: 20 }); this.visible('hero-tags', hero.height > 160);
    for (const [index, kind] of (['gamepad', 'mobile', 'keyboard'] as const).entries()) {
      this.place('hero-' + kind, { x: hero.x + inset + 118 + index * 23, y: hero.y + 35, width: 18, height: 18 });
      this.visible('hero-' + kind, hero.height > 160 && !!this.state.selected && (kind === 'keyboard' || this.state.selected[kind]));
    }
    this.place('hero-title', { x: hero.x + inset, y: hero.y + (hero.height > 160 ? 60 : 36), width: heroTextWidth, height: hero.height < 160 ? 36 : 44 });
    (this.nodes.get('hero-title') as GuiLabel).setFontSize(layout.compact || layout.shallow ? 26 : 34);
    const descriptionWidth = layout.shallow ? heroTextWidth : hero.width * .62;
    this.place('hero-description', { x: hero.x + inset, y: hero.y + 111, width: descriptionWidth, height: 52 }); this.visible('hero-description', hero.height > 210);
    this.text('hero-description', this.wrap(this.state.selected?.description ?? this.state.error, descriptionWidth, 14, 2));
    const playWidth = Math.min(184, heroTextWidth - 92), playTop = hero.y + hero.height - 54;
    this.place('play', { x: hero.x + inset, y: playTop, width: playWidth, height: 38 });
    this.place('favorite', { x: hero.x + inset + playWidth + 8, y: playTop, width: 36, height: 38 });
    this.place('external', { x: hero.x + inset + playWidth + 50, y: playTop, width: 36, height: 38 });
    this.place('collection-title', { x: collection.x, y: collection.y, width: 144, height: 32 }); this.place('visible-count', { x: collection.x + 145, y: collection.y + 4, width: 110, height: 24 });
    this.place(this.search, { x: layout.stacked ? collection.x : collection.x + collection.width - 248, y: collection.y + (layout.stacked ? 36 : 0), width: layout.stacked ? collection.width : 248, height: 32 });
    categories.forEach(([value, title], index) => {
      const columns = 6 / layout.filterRows, cellWidth = Math.min(92, collection.width / columns);
      (this.nodes.get(`category-${value}`) as GuiButton).setText(value === '3d' && cellWidth < 65 ? '立体' : title);
      this.place(`category-${value}`, { x: collection.x + index % columns * cellWidth, y: collection.y + (layout.stacked ? 76 : 42) + Math.floor(index / columns) * 34, width: cellWidth - 5, height: 28 });
    });
    this.place(this.shelf, shelf);
    this.state.games.forEach((game, index) => {
      const card = this.cards.get(game.id)!;
      this.place(card, { x: SHELF_INSET + index % layout.columns * (layout.cardWidth + CARD_GAP), y: SHELF_INSET + Math.floor(index / layout.columns) * (layout.cardHeight + CARD_GAP), width: layout.cardWidth, height: layout.cardHeight });
      this.place(`cover-${game.id}`, { x: 1, y: 1, width: layout.cardWidth - 2, height: layout.cardHeight - 2 });
      this.place(`caption-${game.id}`, { x: 1, y: Math.max(1, layout.cardHeight - 76), width: layout.cardWidth - 2, height: Math.min(75, layout.cardHeight - 2) });
      this.place(`title-${game.id}`, { x: 10, y: layout.cardHeight - 49, width: layout.cardWidth - 22, height: 25 }); this.text(`title-${game.id}`, this.wrap(game.title, layout.cardWidth - 22, 15, 1));
      this.place(`genre-${game.id}`, { x: 10, y: layout.cardHeight - 24, width: 32, height: 17 });
      this.place(`dimension-${game.id}`, { x: 46, y: layout.cardHeight - 24, width: 24, height: 17 });
      this.place(`input-${game.id}`, { x: 74, y: layout.cardHeight - 24, width: 19, height: 19 });
      this.place(`mobile-${game.id}`, { x: 96, y: layout.cardHeight - 24, width: 19, height: 19 });
      this.place(`keyboard-${game.id}`, { x: 118, y: layout.cardHeight - 24, width: 19, height: 19 });
      this.place(`heart-${game.id}`, { x: layout.cardWidth - 29, y: 6, width: 22, height: 24 });
      const paddingX = CARD_GLOW_PADDING * layout.cardWidth / CARD_TEXTURE_WIDTH, paddingY = CARD_GLOW_PADDING * layout.cardHeight / CARD_TEXTURE_HEIGHT;
      this.place(`glow-${game.id}`, { x: -paddingX, y: -paddingY, width: layout.cardWidth + paddingX * 2, height: layout.cardHeight + paddingY * 2 });
    });
    this.shelf.setContentHeight(SHELF_INSET + Math.ceil(this.state.games.length / layout.columns) * (layout.cardHeight + CARD_GAP));
    const shortShelf = shelf.height < 140;
    this.place('empty-title', { x: shelf.x, y: shelf.y + (shortShelf ? 0 : 14), width: shelf.width, height: 32 });
    (this.nodes.get('empty-title') as GuiLabel).setFontSize(shortShelf ? 16 : 20);
    this.place('empty-description', { x: shelf.x, y: shelf.y + 49, width: shelf.width, height: 28 }); this.visible('empty-description', !this.state.games.length && !shortShelf);
    this.place('empty-reset', { x: shelf.x, y: shelf.y + (shortShelf ? 36 : 85), width: Math.min(180, shelf.width), height: 32 });
    this.place('footer', { x: 0, y: height - layout.footer, width, height: layout.footer }); this.place('hints', { x: gap, y: height - 28, width: width - gap * 2, height: 22 });
    this.text('hints', width < 600 ? '点击进入 · 滑动浏览 · Esc 返回' : '↑↓←→ 选择    Enter / A 开始    F / X 收藏    LB / RB 分类    Esc 返回');
    this.place('input-status', { x: width - 210, y: height - 28, width: 190, height: 22 }); this.visible('input-status', width > 980);
    this.updateNotices(this.notices, this.connected); this.root.root.markDirty();
    const loadWidth = Math.min(420, width - 48), loadX = (width - loadWidth) / 2, loadY = Math.max(70, height / 2 - 110);
    this.place('load-shade', { x: 0, y: 0, width, height }); this.place('load-title', { x: loadX, y: loadY, width: loadWidth, height: 44 });
    this.place('load-stage', { x: loadX, y: loadY + 58, width: loadWidth, height: 32 }); this.place('load-resources', { x: loadX, y: loadY + 96, width: loadWidth, height: 28 });
    this.place('load-track', { x: loadX, y: loadY + 138, width: loadWidth, height: 6 });
    this.place('load-cancel', { x: loadX, y: loadY + 178, width: Math.min(150, loadWidth / 2 - 8), height: 40 });
    this.place('load-retry', { x: loadX + loadWidth / 2, y: loadY + 178, width: Math.min(150, loadWidth / 2 - 8), height: 40 });
  }
  updateNotices(notices: readonly ConnectionNotice[], connected: boolean): void {
    this.notices = notices; this.connected = connected; this.text('input-status', connected ? '手柄已连接 · X 收藏 · Y 视图' : '手柄 / 键鼠 / 触屏');
    for (let index = 0; index < 4; index++) {
      const notice = notices[index], node = this.nodes.get(`notice-${index}`)!;
      node.setVisible(!!notice); this.text(node.id, notice?.message ?? '');
      if (notice) this.place(node, { x: this.layout.width - Math.min(292, this.layout.width - 28), y: this.layout.header + 10 + index * 54, width: Math.min(278, this.layout.width - 28), height: 44 });
    }
  }
  updateClock(): void { this.text('clock', new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })); }
  showLoading(progress: GameProgress | null, title = ''): void {
    this.loading = progress;
    for (const id of ['load-shade', 'load-title', 'load-stage', 'load-resources', 'load-track', 'load-bar', 'load-cancel']) this.visible(id, !!progress);
    this.visible('load-retry', progress?.phase === 'error');
    if (!progress) return;
    this.text('load-title', progress.phase === 'error' ? '游戏加载失败' : title || '正在加载游戏');
    this.text('load-stage', progress.message); this.text('load-resources', progress.total ? `资源 ${progress.completed} / ${progress.total}  ·  ${(progress.loaded / 1024).toFixed(0)} KB` : '代码与资源按需载入，不会下载整个游戏库');
  }
  animate(delta: number, motion: boolean): void {
    if (this.loading) {
      this.loadingTime += delta;
      const track = this.rectangles.get(this.nodes.get('load-track')!)!, progress = this.loading;
      const known = progress.phase === 'resources' && progress.total > 0, width = known ? track.width * progress.completed / progress.total : track.width * .24;
      this.place('load-bar', { x: track.x + (known || !motion ? 0 : (track.width - width) * (.5 + .5 * Math.sin(this.loadingTime * 2.5))), y: track.y, width, height: 6 });
    }
    if (this.shelf.inertia !== motion) { this.shelf.inertia = motion; this.shelf.stopInertia(); }
    const blend = motion ? 1 - Math.exp(-Math.max(0, delta) / .075) : 1;
    for (const game of this.state.games) {
      const card = this.cards.get(game.id)!, state = this.cardMotion.get(game.id)!;
      const selected = this.state.selectionActive && game.id === this.state.selected?.id;
      state.hover = advanceCardHover(state.hover, card.hovered && state.hoverable && !this.shelf.animating, delta, motion);
      const infoTarget = card.hovered || selected ? 1 : 0, glowTarget = selected ? 1 : 0;
      state.info += (infoTarget - state.info) * blend; state.glow += (glowTarget - state.glow) * blend;
      if (Math.abs(state.info - infoTarget) < .002) state.info = infoTarget;
      if (Math.abs(state.glow - glowTarget) < .002) state.glow = glowTarget;
      for (const prefix of ['caption', 'title', 'genre', 'dimension', 'input', 'mobile', 'keyboard', 'heart']) {
        const node = this.nodes.get(`${prefix}-${game.id}`)!;
        node.setVisible(state.info > 0 && (prefix !== 'heart' || game.favorite) && (prefix !== 'input' || game.gamepad) && (prefix !== 'mobile' || game.mobile) && (prefix !== 'keyboard' || card.rect.width >= 150)); node.setStyle({ opacity: Math.round(state.info * 255) / 255 });
      }
      const glow = this.nodes.get(`glow-${game.id}`)!;
      glow.setVisible(state.glow > 0); glow.setStyle({ opacity: Math.round(state.glow * 255) / 255 });
    }
  }
  hoverCards(): HoverCard[] {
    if (!this.root.root.visible || this.loading) return [];
    return this.state.games.flatMap(game => {
      const amount = this.cardMotion.get(game.id)!.hover, rect = this.cards.get(game.id)!.rect;
      return amount > 0 && rect.y + rect.height > this.shelf.rect.y && rect.y < this.shelf.rect.y + this.shelf.rect.height ? [{ id: game.id, rect: { ...rect }, amount }] : [];
    });
  }
  card(id: string) { return this.cards.get(id); }
  reveal(id: string): void {
    const index = this.state.games.findIndex(game => game.id === id); if (index < 0) return;
    const top = Math.floor(index / this.layout.columns) * (this.layout.cardHeight + CARD_GAP), bottom = top + this.layout.cardHeight + SHELF_INSET * 2;
    if (top < this.shelf.scrollY) this.shelf.scrollTo(top); else if (bottom > this.shelf.scrollY + this.shelf.rect.height) this.shelf.scrollTo(bottom - this.shelf.rect.height);
  }
  private wrap(text: string, width: number, fontSize: number, lines: number): string {
    const output: string[] = []; let line = '', used = 0;
    for (const character of text) {
      const advance = (character.charCodeAt(0) < 128 ? .58 : 1) * fontSize;
      if (used + advance > width) { output.push(line); if (output.length === lines) return output.join('\n').slice(0, -1) + '…'; line = ''; used = 0; }
      line += character; used += advance;
    }
    return [...output, line].join('\n');
  }
  snapshot() {
    const visible = (node: GuiElement): boolean => node.visible && (!node.parent || visible(node.parent));
    return { renderer: 'engine-gui', nodes: [...this.nodes.values()].filter(visible).map(node => ({ id: node.id, type: node.constructor.name, text: node instanceof GuiLabel || node instanceof GuiButton ? node.text : '', rect: { ...node.rect } })),
      columns: this.layout.columns, hoverCards: this.hoverCards().map(card => ({ ...card, ...cardHoverPose(card.amount) })), shelf: { ...this.shelf.rect, scrollY: this.shelf.scrollY, contentHeight: this.shelf.contentHeight, animating: this.shelf.animating }, hero: { ...this.layout.hero }, images: this.images.size, notices: this.notices.map(notice => ({ ...notice })) };
  }
  destroy(): void { for (const image of this.images.values()) { image.onload = null; image.onerror = null; } this.images.clear(); this.imageUrls.clear(); }
}
