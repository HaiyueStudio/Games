import { GuiButton, GuiElement, GuiImage, GuiInput, GuiLabel, GuiRoot, GuiScrollView } from '@haiyue/engine/gui';
import { desktopLayout, type DesktopRect } from './layout';
import type { ConnectionNotice } from '../gamepad/connections';

export interface DesktopGame { id: string; title: string; description: string; genre: string; thumbnail: string; favorite: boolean; threeD: boolean }
export interface DesktopState { games: DesktopGame[]; selected: DesktopGame | null; view: string; category: string; search: string; total: number; favorites: number; error: string }
export interface DesktopActions { select(id: string): void; launch(id: string): void; view(value: string): void; category(value: string): void; search(value: string): void; favorite(): void; external(id: string): void }
const fill = { width: '100%' as const, height: '100%' as const };
const views = [['all', '▦  游戏库'], ['recent', '◷  最近游玩'], ['favorites', '♡  我的收藏']] as const;
const categories = [['all', '全部'], ['puzzle', '益智'], ['3d', '立体世界'], ['physics', '物理'], ['arcade', '街机'], ['audio', '音乐']] as const;
export const DESKTOP_TEXT = 'HAIYUE GAME OS游戏空间你的下一场冒险全部游戏最近游玩我的收藏开始游戏独立打开收藏取消没有找到匹配的游戏还没有收藏还没有游玩记录浏览全部游戏搜索手柄键鼠触屏已连接已断开正在载入暂时无法载入重试即刻游玩支持手柄立体世界本机玩家按开始进入切换分类返回选择探索益智街机物理音乐沙盒纸牌准备就绪刷新页面确认取消▦◷♡♥⌕＋→↗◇…款';

export class DesktopGui {
  readonly root = new GuiRoot({ style: { fontFamily: 'Microsoft YaHei, Segoe UI, sans-serif', fontSize: 14 }, theme: { fontFamily: 'Microsoft YaHei, Segoe UI, sans-serif', fontSize: 14,
    colors: { text: '#edf7ff', textMuted: '#b5c7db', primary: '#b9f5a8', background: '#0d2135', surface: '#142c46', border: '#507589', hover: '#294d66', active: '#20495c', disabled: '#64748b', danger: '#e58386' } } });
  readonly search: GuiInput;
  readonly shelf: GuiScrollView;
  private readonly nodes = new Map<string, GuiElement>();
  private readonly rectangles = new Map<GuiElement, DesktopRect>();
  private readonly cards = new Map<string, GuiButton>();
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly imageUrls = new Map<GuiImage, string>();
  private state: DesktopState = { games: [], selected: null, view: 'all', category: 'all', search: '', total: 0, favorites: 0, error: '' };
  private layout = desktopLayout(1040, 600);
  private notices: readonly ConnectionNotice[] = [];
  private connected = false;
  constructor(private readonly actions: DesktopActions) {
    this.panel('header', 'rgba(5,16,31,.48)');
    this.label('brand', 'HAIYUE', 22, '#d7ffb9'); this.label('edition', 'GAME OS / 01', 10, '#b3c7db');
    this.label('context', '你的游戏空间', 13, '#b0c9dc'); this.label('clock', '', 16); this.label('status', 'WEBGPU  /  P1', 11, '#b7e9d8');
    this.panel('sidebar', 'rgba(5,16,31,.46)'); this.label('nav-caption', '你的空间', 11, '#8fb1cb');
    for (const [value, title] of views) this.button(`view-${value}`, title, () => actions.view(value));
    this.label('sidebar-note', '按下开始\n进入游戏', 18); this.label('sidebar-help', '手柄 / 键鼠 / 触屏', 11, '#acc4d7');
    this.panel('hero-panel', 'rgba(11,31,48,.35)', 16); this.image('hero-image');
    const shade = document.createElement('canvas'); shade.width = 256; shade.height = 1;
    const context = shade.getContext('2d')!, gradient = context.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, 'rgba(3,14,28,.97)'); gradient.addColorStop(.48, 'rgba(3,14,28,.75)'); gradient.addColorStop(1, 'rgba(3,14,28,.05)');
    context.fillStyle = gradient; context.fillRect(0, 0, 256, 1);
    this.add(new GuiImage({ ...fill, id: 'hero-shade', source: shade, pointerFilter: 'ignore' }));
    this.label('hero-kicker', '准备就绪 · 即刻游玩', 11, '#c5f3ac'); this.label('hero-tags', '', 11, '#c2dded');
    this.label('hero-title', '你的下一场冒险', 32); this.label('hero-description', '正在载入游戏库…', 14, '#c1d3e0');
    this.button('play', 'A  开始游戏  →', () => { if (this.state.selected) actions.launch(this.state.selected.id); }, true);
    this.button('favorite', '♡', actions.favorite);
    this.button('external', '↗', () => { if (this.state.selected) actions.external(this.state.selected.id); });
    this.label('collection-title', '全部游戏', 20); this.label('visible-count', '', 12, '#bad3e3');
    this.search = this.add(new GuiInput({ ...fill, id: 'search', placeholder: '⌕  搜索游戏', maxLength: 80, onChange: value => actions.search(value), style: { backgroundColor: 'rgba(8,23,42,.68)', borderColor: '#477187', radius: 8, padding: 10 } }));
    for (const [value, title] of categories) this.button(`category-${value}`, title, () => actions.category(value));
    this.shelf = this.add(new GuiScrollView({ ...fill, id: 'shelf', inertia: true, style: { backgroundColor: 'transparent', borderColor: 'transparent', padding: 0 } }));
    this.label('empty-title', '', 20); this.label('empty-description', '', 12, '#b6ccde'); this.button('empty-reset', '浏览全部游戏  →', () => actions.view('all'));
    this.panel('footer', 'rgba(5,16,31,.6)'); this.label('hints', '', 11, '#c1d4e4'); this.label('input-status', '手柄 / 键鼠 / 触屏', 11, '#b4d4df');
    for (let index = 0; index < 4; index++) this.label(`notice-${index}`, '', 14, '#e7ffe0', 'rgba(13,49,52,.96)');
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
    Object.assign(this.rectangles.get(node)!, rectangle); node.markDirty();
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
    for (const card of this.cards.values()) card.setVisible(false);
    for (const game of state.games) {
      let card = this.cards.get(game.id);
      if (!card) {
        card = this.button(`game-${game.id}`, '', () => this.actions.launch(game.id), false, this.shelf);
        card.on('pointerenter', () => this.actions.select(game.id)); this.cards.set(game.id, card);
        this.useImage(this.image(`cover-${game.id}`, card), game.thumbnail);
        this.panel(`caption-${game.id}`, 'rgba(5,17,30,.82)', 0, card);
        this.label(`title-${game.id}`, game.title, 15, '#f1f8ff', 'transparent', card);
        this.label(`genre-${game.id}`, game.genre, 11, '#b2cddd', 'transparent', card);
        this.label(`heart-${game.id}`, '', 17, '#d8f7b5', 'transparent', card);
      }
      card.setVisible(true); card.setStyle({ borderColor: game.id === state.selected?.id ? '#d2ffaf' : '#467083', backgroundColor: '#16374b' });
      this.text(`heart-${game.id}`, game.favorite ? '♥' : '');
    }
    const selected = state.selected;
    this.text('hero-title', selected?.title ?? (state.error ? '游戏库暂时无法载入' : '你的下一场冒险'));
    this.text('hero-tags', selected ? `${selected.genre}    ${selected.threeD ? '3D 世界' : '2D 游戏'}    支持手柄` : '');
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
      this.place(card, { x: index % layout.columns * (layout.cardWidth + 14), y: Math.floor(index / layout.columns) * (layout.cardHeight + 14), width: layout.cardWidth, height: layout.cardHeight });
      this.place(`cover-${game.id}`, { x: 2, y: 2, width: layout.cardWidth - 4, height: layout.cardHeight - 52 });
      this.place(`caption-${game.id}`, { x: 2, y: layout.cardHeight - 50, width: layout.cardWidth - 4, height: 48 });
      this.place(`title-${game.id}`, { x: 11, y: layout.cardHeight - 47, width: layout.cardWidth - 30, height: 25 }); this.text(`title-${game.id}`, this.wrap(game.title, layout.cardWidth - 30, 15, 1));
      this.place(`genre-${game.id}`, { x: 11, y: layout.cardHeight - 22, width: layout.cardWidth - 35, height: 17 }); this.place(`heart-${game.id}`, { x: layout.cardWidth - 29, y: 8, width: 22, height: 24 });
    });
    this.shelf.setContentHeight(Math.ceil(this.state.games.length / layout.columns) * (layout.cardHeight + 14));
    const shortShelf = shelf.height < 140;
    this.place('empty-title', { x: shelf.x, y: shelf.y + (shortShelf ? 0 : 14), width: shelf.width, height: 32 });
    (this.nodes.get('empty-title') as GuiLabel).setFontSize(shortShelf ? 16 : 20);
    this.place('empty-description', { x: shelf.x, y: shelf.y + 49, width: shelf.width, height: 28 }); this.visible('empty-description', !this.state.games.length && !shortShelf);
    this.place('empty-reset', { x: shelf.x, y: shelf.y + (shortShelf ? 36 : 85), width: Math.min(180, shelf.width), height: 32 });
    this.place('footer', { x: 0, y: height - layout.footer, width, height: layout.footer }); this.place('hints', { x: gap, y: height - 28, width: width - gap * 2, height: 22 });
    this.text('hints', width < 600 ? '点击进入 · 滑动浏览 · Esc 返回' : '↑↓←→ 选择    Enter / A 开始    F / X 收藏    LB / RB 分类    Esc 返回');
    this.place('input-status', { x: width - 210, y: height - 28, width: 190, height: 22 }); this.visible('input-status', width > 980);
    this.updateNotices(this.notices, this.connected); this.root.root.markDirty();
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
  card(id: string) { return this.cards.get(id); }
  reveal(id: string): void {
    const index = this.state.games.findIndex(game => game.id === id); if (index < 0) return;
    const top = Math.floor(index / this.layout.columns) * (this.layout.cardHeight + 14), bottom = top + this.layout.cardHeight;
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
      columns: this.layout.columns, shelf: { ...this.shelf.rect, scrollY: this.shelf.scrollY, contentHeight: this.shelf.contentHeight }, hero: { ...this.layout.hero }, images: this.images.size, notices: this.notices.map(notice => ({ ...notice })) };
  }
  destroy(): void { for (const image of this.images.values()) { image.onload = null; image.onerror = null; } this.images.clear(); this.imageUrls.clear(); }
}
