import type { HaiyueEngine } from '@haiyue/engine';
import { GuiButton, GuiDirtyFlags, GuiElement, GuiImage, GuiInput, GuiLabel, GuiModal, GuiRoot, GuiSwitch, type GuiPointerEvent } from '@haiyue/engine/gui';
import { CARD_GAP, SHELF_INSET, desktopLayout, type DesktopRect } from './layout';
import { MomentumScrollView } from './MomentumScrollView';
import { CARD_CORNER_RADIUS, CARD_GLOW_PADDING, CARD_TEXTURE_HEIGHT, CARD_TEXTURE_WIDTH, cardTextures } from './cardTextures';
import { artworkWindow } from './artworkWindow';
import { CarouselArtwork } from './CarouselArtwork';
import { advanceCardHover, cardHoverPose } from './cardHoverMotion';
import type { HoverCard } from './CardHover';
import { GENRE_COLORS, inputIcon } from './cardBadges';
import type { GameProgress } from '../host/types';
import type { ConnectionNotice } from '../gamepad/connections';
import { ConnectionNotifications } from '../gamepad/ui/ConnectionNotifications';
import { OS_BUTTON_HOVER_MS, osButtonSnapshot, osButtonTheme } from './buttonStyle';
import { GameBackdrop } from './GameBackdrop';
import { backdropShade, carouselNavigationArt, haiyueBrand, navigationIcon, navigationTooltipArt } from './brandArt';

export interface DesktopGame { id: string; title: string; description: string; genre: string; thumbnail: string; favorite: boolean; threeD: boolean; gamepad: boolean; mobile: boolean }
export interface DesktopState { games: DesktopGame[]; selected: DesktopGame | null; selectionActive: boolean; view: string; category: string; search: string; total: number; favorites: number; error: string }
export interface DesktopActions { select(id: string): void; launch(id: string): void; view(value: string): void; category(value: string): void; search(value: string): void; favorite(): void; external(id: string): void; home(): void; retry(): void; simulator(mode: 'pad' | 'phone' | null): void; sound?(cue: 'click' | 'select', key?: string): void; toggleSound?(): void; settings?(): void; settingsClosed?(): void; focusSearch?(): void; setEffects?(enabled: boolean): void; setMusic?(enabled: boolean): void }
const fill = { width: '100%' as const, height: '100%' as const };
const views = [['all', 'library'], ['favorites', 'favorites']] as const;
const TOPBAR_BUTTONS = new Set(['view-all', 'view-favorites', 'devices', 'search-toggle', 'settings']);
const CAROUSEL_BUTTONS = ['carousel-prev', 'carousel-next'] as const;
export const DESKTOP_TEXT = '滚轮拖动浏览设置音效点击与选中时的空灵提示背景音乐平静的环境音乐设置会自动保存HAIYUE GAME OS游戏空间你的下一场冒险全部游戏最近游玩我的收藏开始游戏独立打开收藏取消没有找到匹配的游戏还没有收藏还没有游玩记录浏览全部游戏搜索手柄键鼠触屏已连接已断开正在载入暂时无法载入重试即刻游玩支持手柄立体世界本机玩家按开始进入切换分类返回选择探索益智街机物理音乐沙盒纸牌准备就绪刷新页面确认取消声音开关静音♪×▦◷♡♥⌕＋→↗◇…款';

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
  private readonly artwork = new CarouselArtwork((url, image) => this.backdrop.ready(url, image));
  private readonly backdrop: GameBackdrop;
  private readonly settingsModal: GuiModal;
  private state: DesktopState = { games: [], selected: null, selectionActive: false, view: 'all', category: 'all', search: '', total: 0, favorites: 0, error: '' };
  private layout = desktopLayout(1040, 600);
  private notices: readonly ConnectionNotice[] = [];
  private readonly notifications: ConnectionNotifications;
  private loading: GameProgress | null = null;
  private loadingTime = 0;
  private searchExpanded = false;
  private searchReveal = 0;
  private searchExitDelay = 0;
  private previewId: string | null = null;
  private previewExitDelay = 0;
  private backdropDirty = false;
  private clockMinute = -1;
  private tooltipId = '';
  private tooltipWait = 0;
  private tooltipOpacity = 0;
  private readonly carouselGlow = [0, 0];
  constructor(private readonly actions: DesktopActions) {
    this.panel('wallpaper-base', '#050d1b');
    this.backdrop = new GameBackdrop(this.image('wallpaper-a'), this.image('wallpaper-b'), backdropShade());
    this.add(new GuiImage({ ...fill, id: 'wallpaper-shade', pointerFilter: 'ignore' }));
    this.panel('header', 'rgba(5,12,24,.42)');
    const brand = haiyueBrand();
    const logo = this.image('brand-logo'), logoUrl = document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href;
    if (logoUrl) this.useImage(logo, logoUrl);
    this.add(new GuiImage({ ...fill, id: 'brand', source: brand.wordmark, pointerFilter: 'ignore' }));
    this.label('clock', '', 16);
    const searchToggle = this.button('search-toggle', '', () => actions.focusSearch?.());
    searchToggle.setStyle({ icon: navigationIcon('search'), iconSize: 21, iconGap: 0 });
    searchToggle.on('pointerenter', event => { if ((event.detail as GuiPointerEvent).nativeEvent.pointerType !== 'touch') this.expandSearch(); });
    this.button('settings', '', () => actions.settings?.()).setStyle({ icon: navigationIcon('settings'), iconSize: 21, iconGap: 0 });
    for (const [value, icon] of views) this.button(`view-${value}`, '', () => actions.view(value)).setStyle({ icon: navigationIcon(icon), iconSize: 21, iconGap: 0 });
    this.button('devices', '', () => actions.simulator('pad')).setStyle({ icon: navigationIcon('devices'), iconSize: 21, iconGap: 0 });
    const tooltipArt = navigationTooltipArt();
    this.label('nav-tooltip', '', 13, '#e1f5ff').setStyle({
      contentInsets: Object.freeze({ top: 8, bottom: 8, left: 20, right: 20 }),
      nineSlice: Object.freeze({ source: tooltipArt.panel, sourceWidth: tooltipArt.panel.width, sourceHeight: tooltipArt.panel.height, cuts: [60, 60, 60, 60] as const, pixelRatio: 3 }),
    });
    (this.nodes.get('nav-tooltip') as GuiLabel).setTextAlign('center');
    this.image('nav-tooltip-arrow').setSource(tooltipArt.arrow);
    this.visible('nav-tooltip', false); this.visible('nav-tooltip-arrow', false);
    this.label('hero-kicker', '准备就绪 · 即刻游玩', 11, '#c5f3ac'); this.label('hero-tags', '', 11, '#c2dded');
    for (const kind of ['gamepad', 'mobile', 'keyboard'] as const) this.add(new GuiImage({ ...fill, id: 'hero-' + kind, source: this.icons[kind], pointerFilter: 'ignore' }));
    this.label('hero-title', '你的下一场冒险', 32); this.label('hero-description', '正在载入游戏库…', 14, '#c1d3e0');
    this.button('play', 'A  开始游戏  →', () => { if (this.state.selected) actions.launch(this.state.selected.id); }, true);
    this.button('favorite', '♡', actions.favorite);
    this.button('external', '↗', () => { if (this.state.selected) actions.external(this.state.selected.id); });
    const carouselArt = carouselNavigationArt();
    for (const [index, id] of CAROUSEL_BUTTONS.entries()) {
      this.image(`${id}-halo`).setSource(carouselArt.halo); this.visible(`${id}-halo`, false);
      this.button(id, '', () => this.browse(index ? 1 : -1)).setStyle({ icon: index ? carouselArt.next : carouselArt.previous, iconSize: 20, iconGap: 0 });
    }
    this.search = this.add(new GuiInput({ ...fill, id: 'search', placeholder: '搜索游戏', onChange: value => actions.search(value), style: { backgroundColor: 'transparent', borderColor: 'transparent', radius: 0, padding: 0, contentInsets: Object.freeze({ top: 0, bottom: 0, left: 8, right: 8 }) } }));
    this.shelf = this.add(new MomentumScrollView({ ...fill, id: 'shelf', axis: 'horizontal', showScrollbar: false, inertia: true, inertiaStrength: 1.2, style: { backgroundColor: 'transparent', borderColor: 'transparent', padding: 0 } }));
    this.shelf.on('pointerenter', () => { this.previewExitDelay = 0; });
    this.shelf.on('pointerleave', event => this.queuePreviewExit(event.detail as GuiPointerEvent));
    this.label('empty-title', '', 20); this.label('empty-description', '', 12, '#b6ccde'); this.button('empty-reset', '浏览全部游戏  →', () => actions.view('all'));
    this.panel('footer', 'rgba(5,16,31,.6)'); this.label('hints', '', 11, '#c1d4e4');
    this.add(new GuiElement({ ...fill, id: 'load-shade', visible: false, pointerFilter: 'stop', style: { backgroundColor: 'rgba(3,10,24,.95)', borderColor: 'transparent' } }));
    this.label('load-title', '', 26, '#e7ffe0'); this.label('load-stage', '', 16, '#a4b5ff'); this.label('load-resources', '', 13, '#b9d1e8');
    this.panel('load-track', '#162d48', 4); this.panel('load-bar', '#9f77ff', 4);
    this.button('load-cancel', '返回游戏库', actions.home); this.button('load-retry', '重新加载', actions.retry, true);
    this.settingsModal = this.add(new GuiModal({ id: 'settings-panel', title: '设置', width: 448, height: 300,
      showCloseButton: false, showConfirmButton: false, showCancelButton: false, closeOnBackdrop: true, backdropColor: 'rgba(2,8,18,.74)',
      style: { backgroundColor: '#101f31', borderColor: '#527287', color: '#effbff', radius: 22 },
      onClose: () => { this.nodes.get('settings')!.setThemeResource(osButtonTheme('topbar')); actions.settingsClosed?.(); } }));
    this.button('settings-close', '×', () => this.settingsModal.close('close'), false, this.settingsModal);
    for (const [kind, title, description] of [['effects', '音效', '点击与选中时的空灵提示'], ['music', '背景音乐', '平静的环境音乐']] as const) {
      this.panel(`settings-${kind}-row`, '#1a3044', 14, this.settingsModal);
      this.label(`settings-${kind}-title`, title, 16, '#edfaff', 'transparent', this.settingsModal);
      this.label(`settings-${kind}-description`, description, 12, '#9bb5c7', 'transparent', this.settingsModal);
      this.add(new GuiSwitch({ ...fill, id: `settings-${kind}`, checked: true, thumbTransitionMs: 180, colorTransitionMs: 180,
        onChange: enabled => kind === 'effects' ? actions.setEffects?.(enabled) : actions.setMusic?.(enabled),
        style: { borderColor: '#52758a', padding: 0 } }), this.settingsModal);
    }
    this.label('settings-note', '设置会自动保存', 12, '#97b6c8', 'transparent', this.settingsModal);
    const modalLayout = this.settingsModal.layout.bind(this.settingsModal);
    this.settingsModal.layout = area => { modalLayout(area); for (const node of this.settingsModal.children) if (this.rectangles.has(node)) node.layout(this.settingsModal.dialogRect); };
    this.showLoading(null);
    this.notifications = new ConnectionNotifications(this.root, undefined, 'notice-');
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
    const card = id.startsWith('game-'), variant = id.startsWith('carousel-') ? 'carousel' : TOPBAR_BUTTONS.has(id) ? 'topbar' : primary ? 'primary' : ['favorite', 'external', 'settings-close'].includes(id) ? 'icon' : 'secondary';
    return this.add(new GuiButton({ ...fill, id, text, onClick: () => { if (id !== 'audio-toggle') this.actions.sound?.('click', id); onClick(); }, hoverTransition: true, hoverTransitionMs: OS_BUTTON_HOVER_MS,
      ...(card ? { style: { padding: 0, radius: CARD_CORNER_RADIUS, backgroundColor: 'rgba(18,42,63,.65)', color: '#d7eaf5', borderColor: '#426478' } } : { themeResource: osButtonTheme(variant) }) }), parent);
  }
  private place(id: string | GuiElement, rectangle: DesktopRect): void {
    const node = typeof id === 'string' ? this.nodes.get(id)! : id;
    if (TOPBAR_BUTTONS.has(node.id) || node.id === 'carousel-prev' || node.id === 'carousel-next') {
      const inset = (rectangle.width - (TOPBAR_BUTTONS.has(node.id) ? 21 : 20)) / 2;
      if (node.style.contentInsets?.left !== inset) node.setStyle({ contentInsets: Object.freeze({ top: 0, right: inset, bottom: 0, left: inset }) });
    }
    const previous = this.rectangles.get(node)!;
    if (previous.x === rectangle.x && previous.y === rectangle.y && previous.width === rectangle.width && previous.height === rectangle.height) return;
    Object.assign(previous, rectangle); node.markDirty(GuiDirtyFlags.Layout | GuiDirtyFlags.Visual);
    if (node instanceof GuiImage) this.fitImage(node);
  }
  private text(id: string, text: string): void { (this.nodes.get(id) as GuiLabel).setText(text); }
  private visible(id: string, value: boolean): void { this.nodes.get(id)!.setVisible(value); }
  private fitImage(node: GuiImage): void {
    if (node.id.startsWith('cover-')) { node.setUv([0, 0, 1, 1]); return; }
    const source = this.images.get(this.imageUrls.get(node) ?? ''), rectangle = this.rectangles.get(node)!;
    if (!source?.naturalWidth || !rectangle.height) return;
    const aspect = rectangle.width / rectangle.height, ratio = source.naturalWidth / source.naturalHeight;
    const cropWidth = Math.min(1, aspect / ratio), cropHeight = Math.min(1, ratio / aspect);
    node.setUv([(1 - cropWidth) / 2, (1 - cropHeight) / 2, cropWidth, cropHeight]);
  }
  private loadImage(url: string): HTMLImageElement {
    let image = this.images.get(url);
    if (!image) {
      image = new Image(); image.decoding = 'async';
      image.onload = () => {
        for (const [target, key] of this.imageUrls) if (key === url) { target.setSource(image!); this.fitImage(target); }
      };
      this.images.set(url, image); image.src = url;
    }
    return image;
  }
  private useImage(node: GuiImage, url: string): void {
    this.imageUrls.set(node, url);
    const image = this.loadImage(url);
    node.setSource(image.complete && image.naturalWidth ? image : null); this.fitImage(node);
  }
  setState(state: DesktopState, resetScroll = false): void {
    if (resetScroll || state.selected?.id !== this.state.selected?.id || !state.games.some(game => game.id === this.previewId)) { this.previewId = null; this.previewExitDelay = 0; }
    this.state = state; this.search.setValue(state.search);
    for (const [value] of views) this.nodes.get(`view-${value}`)!.setThemeResource(osButtonTheme('topbar', value === 'all' ? state.view !== 'favorites' : state.view === value));
    const visible = new Set(state.games.map(game => game.id));
    for (const [id, card] of this.cards) {
      card.setVisible(visible.has(id));
      if (!visible.has(id)) this.cardMotion.get(id)!.hover = 0;
    }
    for (const game of state.games) {
      let card = this.cards.get(game.id);
      if (!card) {
        card = this.button(`game-${game.id}`, '', () => this.actions.launch(game.id), false, this.shelf);
        this.cards.set(game.id, card);
        const animation = { info: 0, glow: 0, hover: 0, hoverable: false }; this.cardMotion.set(game.id, animation);
        card.on('pointerenter', event => {
          animation.hoverable = (event.detail as GuiPointerEvent).nativeEvent.pointerType !== 'touch';
          if (animation.hoverable) { this.previewExitDelay = 0; this.actions.sound?.('select', game.id); this.previewId = game.id; this.backdropDirty = true; }
        });
        card.on('pointerleave', event => { if (this.previewId === game.id) this.queuePreviewExit(event.detail as GuiPointerEvent); });
        this.image(`cover-${game.id}`, card);
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
    this.refreshBackdrop();
    (this.nodes.get('favorite') as GuiButton).setText(selected?.favorite ? '♥' : '♡');
    this.nodes.get('favorite')!.setThemeResource(osButtonTheme('icon', !!selected?.favorite));
    for (const id of ['play', 'favorite', 'external']) this.nodes.get(id)!.setDisabled(!selected);
    this.text('empty-title', state.error ? '游戏库暂时无法载入' : state.search ? '没有找到匹配的游戏' : state.view === 'favorites' ? '还没有收藏' : '还没有游玩记录');
    this.text('empty-description', state.error || (state.search ? '试试其他游戏名称。' : '回到游戏库，开启下一场游戏。'));
    for (const id of ['empty-title', 'empty-description', 'empty-reset']) this.visible(id, !state.games.length);
    if (resetScroll) this.shelf.scrollTo(0);
    this.resize(this.layout.width, this.layout.height);
    if (state.selectionActive && state.selected) this.reveal(state.selected.id);
  }
  resize(width: number, height: number): void {
    const layout = this.layout = desktopLayout(width, height), { hero, shelf, gap } = layout;
    for (const id of ['wallpaper-base', 'wallpaper-a', 'wallpaper-b', 'wallpaper-shade']) this.place(id, { x: 0, y: 0, width, height });
    this.backdrop.resize(width, height, layout.header, layout.shelf);
    this.place('header', { x: 0, y: 0, width, height: layout.header });
    const small = width < 600, centerY = small ? 31 : layout.header / 2;
    this.place('brand-logo', { x: gap, y: centerY - (small ? 17 : 24), width: small ? 34 : 48, height: small ? 34 : 48 });
    this.place('brand', { x: gap + (small ? 34 : 50), y: centerY - (small ? 14 : 21), width: small ? 86 : 130, height: small ? 28 : 42 });
    const showClock = width >= 1300, toolsRight = width - gap - (showClock ? 82 : 0), toolSize = small ? 36 : 40;
    this.place('clock', { x: width - gap - 70, y: centerY - 12, width: 70, height: 24 }); this.visible('clock', showClock);
    this.place('settings', { x: toolsRight - toolSize, y: centerY - toolSize / 2, width: toolSize, height: toolSize });
    this.place('search-toggle', { x: toolsRight - toolSize * 2 - 10, y: centerY - toolSize / 2, width: toolSize, height: toolSize });
    this.layoutSearch();
    const iconSize = 42, navGap = 10, navWidth = iconSize * 3 + navGap * 2, navX = (width - navWidth) / 2, navY = small ? 62 : centerY - iconSize / 2;
    ['view-all', 'view-favorites', 'devices'].forEach((id, index) => this.place(id, { x: navX + index * (iconSize + navGap), y: navY, width: iconSize, height: iconSize }));
    const inset = Math.min(28, hero.width * .065), heroTextWidth = hero.width - inset * 2;
    const tightHero = hero.height < 126;
    this.place('hero-kicker', { x: hero.x + inset, y: hero.y + 13, width: heroTextWidth, height: 20 });
    this.visible('hero-kicker', !tightHero);
    this.place('hero-tags', { x: hero.x + inset, y: hero.y + 35, width: heroTextWidth, height: 20 }); this.visible('hero-tags', hero.height > 160);
    for (const [index, kind] of (['gamepad', 'mobile', 'keyboard'] as const).entries()) {
      this.place('hero-' + kind, { x: hero.x + inset + 118 + index * 23, y: hero.y + 35, width: 18, height: 18 });
      this.visible('hero-' + kind, hero.height > 160 && !!this.state.selected && (kind === 'keyboard' || this.state.selected[kind]));
    }
    this.place('hero-title', { x: hero.x + inset, y: hero.y + (tightHero ? 4 : hero.height > 160 ? 60 : 36), width: heroTextWidth, height: tightHero ? 30 : hero.height < 160 ? 36 : 44 });
    (this.nodes.get('hero-title') as GuiLabel).setFontSize(tightHero ? 24 : layout.compact || layout.shallow ? 26 : 34);
    const descriptionWidth = layout.shallow ? heroTextWidth : hero.width * .62;
    this.place('hero-description', { x: hero.x + inset, y: hero.y + 111, width: descriptionWidth, height: 52 }); this.visible('hero-description', hero.height > 210);
    this.text('hero-description', this.wrap(this.state.selected?.description ?? this.state.error, descriptionWidth, 14, 2));
    const playWidth = Math.min(184, heroTextWidth - 92), playTop = hero.y + hero.height - (tightHero ? 38 : 54), playHeight = tightHero ? 32 : 38;
    this.place('play', { x: hero.x + inset, y: playTop, width: playWidth, height: playHeight });
    this.place('favorite', { x: hero.x + inset + playWidth + 8, y: playTop, width: 36, height: playHeight });
    this.place('external', { x: hero.x + inset + playWidth + 50, y: playTop, width: 36, height: playHeight });
    for (const [index, id] of CAROUSEL_BUTTONS.entries()) {
      const rect = small ? { x: width - gap - 80 + index * 44, y: shelf.y - 44, width: 36, height: 36 }
        : { x: index ? width - gap - 37 : gap - 3, y: shelf.y + (shelf.height - 40) / 2, width: 40, height: 40 };
      this.place(id, rect);
      this.place(`${id}-halo`, { x: rect.x - 10, y: rect.y - 10, width: rect.width + 20, height: rect.height + 20 });
    }
    const selectionIndex = this.state.games.findIndex(game => game.id === this.state.selected?.id);
    this.nodes.get('carousel-prev')!.setDisabled(selectionIndex <= 0); this.nodes.get('carousel-next')!.setDisabled(selectionIndex < 0 || selectionIndex >= this.state.games.length - 1);
    this.place(this.shelf, shelf);
    this.state.games.forEach((game, index) => {
      const card = this.cards.get(game.id)!;
      card.setStyle({ radius: layout.cardWidth / CARD_TEXTURE_WIDTH * CARD_CORNER_RADIUS });
      this.place(card, { x: SHELF_INSET + index * (layout.cardWidth + CARD_GAP), y: Math.max(SHELF_INSET, (shelf.height - layout.cardHeight) / 2), width: layout.cardWidth, height: layout.cardHeight });
      this.place(`cover-${game.id}`, { x: 1, y: 1, width: layout.cardWidth - 2, height: layout.cardHeight - 2 });
      this.place(`caption-${game.id}`, { x: 1, y: 1, width: layout.cardWidth - 2, height: layout.cardHeight - 2 });
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
    this.shelf.setContentWidth(SHELF_INSET * 2 + Math.max(0, this.state.games.length * (layout.cardWidth + CARD_GAP) - CARD_GAP));
    const shortShelf = shelf.height < 140;
    this.place('empty-title', { x: shelf.x, y: shelf.y + (shortShelf ? 0 : 14), width: shelf.width, height: 32 });
    (this.nodes.get('empty-title') as GuiLabel).setFontSize(shortShelf ? 16 : 20);
    this.place('empty-description', { x: shelf.x, y: shelf.y + 49, width: shelf.width, height: 28 }); this.visible('empty-description', !this.state.games.length && !shortShelf);
    this.place('empty-reset', { x: shelf.x, y: shelf.y + (shortShelf ? 36 : 85), width: Math.min(180, shelf.width), height: 32 });
    this.place('footer', { x: 0, y: height - layout.footer, width, height: layout.footer }); this.place('hints', { x: gap, y: height - 28, width: width - gap * 2, height: 22 });
    this.text('hints', width < 600 ? '点击进入 · 左右滑动浏览 · Esc 返回' : '←→ / LB / RB 选择    滚轮 / 拖动 浏览    Enter / A 开始    F / X 收藏    Esc 返回');
    this.updateNotices(this.notices);
    const loadWidth = Math.min(420, width - 48), loadX = (width - loadWidth) / 2, loadY = Math.max(70, height / 2 - 110);
    this.place('load-shade', { x: 0, y: 0, width, height }); this.place('load-title', { x: loadX, y: loadY, width: loadWidth, height: 44 });
    this.place('load-stage', { x: loadX, y: loadY + 58, width: loadWidth, height: 32 }); this.place('load-resources', { x: loadX, y: loadY + 96, width: loadWidth, height: 28 });
    this.place('load-track', { x: loadX, y: loadY + 138, width: loadWidth, height: 6 });
    this.place('load-cancel', { x: loadX, y: loadY + 178, width: Math.min(150, loadWidth / 2 - 8), height: 40 });
    this.place('load-retry', { x: loadX + loadWidth / 2, y: loadY + 178, width: Math.min(150, loadWidth / 2 - 8), height: 40 });
    this.place('settings-panel', { x: 0, y: 0, width, height });
    const modalWidth = Math.min(448, width - 32);
    this.place('settings-close', { x: modalWidth - 54, y: 18, width: 32, height: 32 });
    for (const [index, kind] of ['effects', 'music'].entries()) {
      const y = 82 + index * 80;
      this.place(`settings-${kind}-row`, { x: 20, y, width: modalWidth - 40, height: 70 });
      this.place(`settings-${kind}-title`, { x: 34, y: y + 10, width: modalWidth - 136, height: 25 });
      this.place(`settings-${kind}-description`, { x: 34, y: y + 38, width: modalWidth - 136, height: 20 });
      this.place(`settings-${kind}`, { x: modalWidth - 86, y: y + 21, width: 46, height: 28 });
    }
    this.place('settings-note', { x: 24, y: 258, width: modalWidth - 48, height: 22 });
  }
  updateNotices(notices: readonly ConnectionNotice[]): void {
    this.notices = notices;
    this.notifications.setInsets(this.layout.header + 8, this.layout.gap);
    this.notifications.setNotices(notices);
  }
  updateClock(): void { const minute = Math.floor(Date.now() / 60000); if (minute === this.clockMinute) return; this.clockMinute = minute; this.text('clock', new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })); }
  get columns(): number { return this.layout.columns; }
  showLoading(progress: GameProgress | null, title = ''): void {
    this.loading = progress;
    for (const id of ['load-shade', 'load-title', 'load-stage', 'load-resources', 'load-track', 'load-bar', 'load-cancel']) this.visible(id, !!progress);
    this.visible('load-retry', progress?.phase === 'error');
    if (!progress) return;
    this.text('load-title', progress.phase === 'error' ? '游戏加载失败' : title || '正在加载游戏');
    this.text('load-stage', progress.message); this.text('load-resources', progress.total ? `资源 ${progress.completed} / ${progress.total}  ·  ${(progress.loaded / 1024).toFixed(0)} KB` : '代码与资源按需载入，不会下载整个游戏库');
  }
  animate(delta: number, motion: boolean): void {
    this.notifications.update(performance.now());
    if (this.previewExitDelay > 0) {
      this.previewExitDelay = Math.max(0, this.previewExitDelay - delta);
      if (!this.previewExitDelay) { this.previewId = null; this.backdropDirty = true; }
    }
    if (this.previewId && (this.loading || this.settingsOpen || this.shelf.animating || !this.root.root.visible)) { this.previewId = null; this.previewExitDelay = 0; this.backdropDirty = true; }
    if (this.backdropDirty) this.refreshBackdrop();
    this.backdrop.advance(delta, motion && this.root.root.visible);
    this.syncArtwork();
    if (this.searchExpanded) {
      const retained = this.search.focused || !!this.search.value || this.search.hovered || (this.nodes.get('search-toggle') as GuiButton).hovered;
      this.searchExitDelay = retained ? .2 : Math.max(0, this.searchExitDelay - delta);
      if (!this.searchExitDelay) this.searchExpanded = false;
    }
    const searchTarget = this.searchExpanded ? 1 : 0;
    if (this.searchReveal !== searchTarget) {
      this.searchReveal += (searchTarget - this.searchReveal) * (motion ? 1 - Math.exp(-delta / .055) : 1);
      if (Math.abs(this.searchReveal - searchTarget) < .005) this.searchReveal = searchTarget;
      this.layoutSearch();
    }
    const hint = [['view-all', '游戏库'], ['view-favorites', '我的收藏'], ['devices', '设备模拟器'], ['search-toggle', '搜索游戏'], ['settings', '设置']].find(([id]) => (id !== 'search-toggle' || !this.searchExpanded) && (this.nodes.get(id!) as GuiButton).hovered);
    const tooltipAllowed = !this.loading && !this.settingsOpen && this.root.root.visible;
    if (hint && tooltipAllowed) {
      if (this.tooltipId !== hint[0]) { this.tooltipId = hint[0]!; this.tooltipWait = 0; this.tooltipOpacity = 0; this.text('nav-tooltip', hint[1]!); }
      this.tooltipWait += delta;
    } else this.tooltipWait = 0;
    const tooltipTarget = hint && tooltipAllowed && this.tooltipWait >= .14 ? 1 : 0;
    this.tooltipOpacity += (tooltipTarget - this.tooltipOpacity) * (motion ? 1 - Math.exp(-delta / .05) : 1);
    if (!tooltipAllowed || Math.abs(this.tooltipOpacity - tooltipTarget) < .005) this.tooltipOpacity = tooltipAllowed ? tooltipTarget : 0;
    if (this.tooltipOpacity > 0) {
      const label = this.nodes.get('nav-tooltip') as GuiLabel, rect = this.rectangles.get(this.nodes.get(this.tooltipId)!)!;
      const width = Math.max(64, label.text.length * 13 + 28) + 16, center = rect.x + rect.width / 2;
      const top = rect.y + rect.height + (this.layout.width < 600 ? 4 : 8) + (motion ? (1 - this.tooltipOpacity) * 3 : 0);
      this.place(label, { x: Math.max(4, Math.min(this.layout.width - width - 4, center - width / 2)), y: top - 8, width, height: 48 });
      this.place('nav-tooltip-arrow', { x: center - 7, y: top - 6, width: 14, height: 7 });
    }
    for (const id of ['nav-tooltip', 'nav-tooltip-arrow']) { this.visible(id, this.tooltipOpacity > 0); this.nodes.get(id)!.setStyle({ opacity: Math.round(this.tooltipOpacity * 255) / 255 }); }
    if (!hint && !this.tooltipOpacity) this.tooltipId = '';
    const duration = motion ? OS_BUTTON_HOVER_MS : 0;
    for (const node of this.nodes.values()) if (node instanceof GuiButton && node.hoverTransitionMs !== duration) node.hoverTransitionMs = duration;
    for (const kind of ['effects', 'music']) { const node = this.nodes.get(`settings-${kind}`) as GuiSwitch; node.thumbTransitionMs = motion ? 180 : 0; node.colorTransitionMs = motion ? 180 : 0; }
    if (this.loading) {
      this.loadingTime += delta;
      const track = this.rectangles.get(this.nodes.get('load-track')!)!, progress = this.loading;
      const known = progress.phase === 'resources' && progress.total > 0, width = known ? track.width * progress.completed / progress.total : track.width * .24;
      this.place('load-bar', { x: track.x + (known || !motion ? 0 : (track.width - width) * (.5 + .5 * Math.sin(this.loadingTime * 2.5))), y: track.y, width, height: 6 });
    }
    if (this.shelf.inertia !== motion) { this.shelf.inertia = motion; this.shelf.stopInertia(); }
    const blend = motion ? 1 - Math.exp(-Math.max(0, delta) / .075) : 1;
    for (const [index, id] of CAROUSEL_BUTTONS.entries()) {
      const button = this.nodes.get(id) as GuiButton;
      const target = !button.disabled && !this.loading && !this.settingsOpen && (button.hovered || button.focused) ? button.pressed ? .5 : 1 : 0;
      let amount = this.carouselGlow[index]! + (target - this.carouselGlow[index]!) * blend;
      if (Math.abs(amount - target) < .002) amount = target;
      this.carouselGlow[index] = amount;
      const halo = this.nodes.get(`${id}-halo`)!;
      halo.setVisible(amount > 0); halo.setStyle({ opacity: Math.round(amount * 255) / 255 });
    }
    for (const game of this.state.games) {
      const card = this.cards.get(game.id)!, state = this.cardMotion.get(game.id)!;
      const selected = this.state.selectionActive && game.id === this.state.selected?.id;
      const hovered = card.hovered && state.hoverable && !this.shelf.animating && !this.settingsOpen && !this.loading;
      state.hover = advanceCardHover(state.hover, hovered, delta, motion);
      const infoTarget = card.hovered || selected ? 1 : 0, glowTarget = selected ? 1 : hovered ? .32 : 0;
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
    if (!this.root.root.visible || this.loading || this.settingsOpen) return [];
    return this.state.games.flatMap(game => {
      const amount = this.cardMotion.get(game.id)!.hover, rect = this.cards.get(game.id)!.rect;
      return amount > 0 && rect.x + rect.width > this.shelf.rect.x && rect.x < this.shelf.rect.x + this.shelf.rect.width && rect.y + rect.height > this.shelf.rect.y && rect.y < this.shelf.rect.y + this.shelf.rect.height ? [{ id: game.id, rect: { ...rect }, amount }] : [];
    });
  }
  card(id: string) { return this.cards.get(id); }
  notificationBounds(): DesktopRect[] { return this.root.root.visible ? this.notifications.snapshot().map(notice => notice.rect) : []; }
  get backdropTexture(): GPUTexture | null { return this.backdrop.compositedTexture; }
  get carouselVisible(): boolean { return this.root.root.visible && !this.loading && !this.settingsOpen && !!this.state.games.length; }
  async initializeBackdrop(engine: HaiyueEngine): Promise<GameBackdrop> { this.artwork.initialize(engine.device); await this.backdrop.initialize(engine); return this.backdrop; }
  private syncArtwork(): void {
    const { cardWidth, shelf } = this.layout;
    const window = artworkWindow(this.root.root.visible ? this.state.games.length : 0, this.shelf.scrollX, shelf.width, cardWidth, CARD_GAP, SHELF_INSET);
    const visible = new Set(window.visible);
    this.artwork.sync(window.indices.map(index => {
      const game = this.state.games[index]!;
      return { id: game.id, url: game.thumbnail, node: this.nodes.get(`cover-${game.id}`) as GuiImage, visible: visible.has(index) };
    }), window.capacity, this.backdrop.retainedUrls, this.backdrop.requestedUrl);
  }
  private queuePreviewExit(event: GuiPointerEvent): void {
    const shelf = this.shelf.rect;
    const inside = event.x >= shelf.x && event.x <= shelf.x + shelf.width && event.y >= shelf.y && event.y <= shelf.y + shelf.height;
    this.previewExitDelay = inside && event.nativeEvent.type !== 'pointercancel' ? 0 : .14;
  }
  private refreshBackdrop(): void {
    const game = this.state.games.find(game => game.id === this.previewId) ?? this.state.selected;
    if (game) this.backdrop.request(game.thumbnail, this.artwork.get(game.thumbnail));
    this.backdropDirty = false;
  }
  reveal(id: string): void {
    const index = this.state.games.findIndex(game => game.id === id); if (index < 0) return;
    const center = SHELF_INSET + index * (this.layout.cardWidth + CARD_GAP) + this.layout.cardWidth / 2;
    const target = Math.max(0, Math.min(this.shelf.maxScrollX, center - this.layout.shelf.width / 2));
    if (Math.abs(target - this.shelf.scrollX) > .5) this.shelf.easeTo(target);
  }
  private browse(direction: number): void {
    const index = this.state.games.findIndex(game => game.id === this.state.selected?.id);
    const game = this.state.games[Math.max(0, Math.min(this.state.games.length - 1, index + direction))];
    if (game) { this.actions.select(game.id); this.reveal(game.id); }
  }
  get settingsOpen(): boolean { return this.settingsModal.visible; }
  showSettings(): void { this.collapseSearch(true); this.shelf.stopInertia(); this.settingsModal.show(); this.nodes.get('settings')!.setThemeResource(osButtonTheme('topbar', true)); }
  closeSettings(): void { this.settingsModal.close('cancel'); }
  expandSearch(immediate = false): void {
    this.searchExpanded = true; this.searchExitDelay = .2;
    if (immediate) { this.searchReveal = 1; this.layoutSearch(); }
  }
  collapseSearch(force = false): void {
    if (!force && this.search.value) return;
    this.searchExpanded = false; this.searchExitDelay = 0;
  }
  private layoutSearch(): void {
    const { width, header, gap } = this.layout, icon = this.rectangles.get(this.nodes.get('search-toggle')!)!;
    const right = width >= 1000 ? icon.x - 6 : width - gap;
    const inputWidth = (width >= 1000 ? 220 : Math.min(width - gap * 2, 320)) * this.searchReveal;
    this.visible('search', this.searchReveal > .005);
    this.search.setStyle({ opacity: Math.round(this.searchReveal * 255) / 255 });
    this.place(this.search, { x: right - inputWidth, y: width >= 1000 ? icon.y + icon.height / 2 - 17 : header + 4, width: inputWidth, height: width >= 1000 ? 34 : 38 });
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
    return { renderer: 'engine-gui', settingsOpen: this.settingsOpen, searchExpanded: this.searchExpanded, searchReveal: this.searchReveal, notifications: this.notifications.snapshot(), nodes: [...this.nodes.values(), ...this.notifications.elements].filter(visible).map(node => ({ id: node.id, type: node.constructor.name, text: node instanceof GuiLabel || node instanceof GuiButton ? node.text : '', rect: { ...node.rect }, ...(node.id.startsWith('glow-') || node.id.startsWith('nav-tooltip') || node === this.search ? { opacity: node.style.opacity ?? 1, backgroundColor: node.style.backgroundColor, borderColor: node.style.borderColor } : {}), ...(node instanceof GuiButton ? { button: osButtonSnapshot(node) } : {}), ...(node instanceof GuiSwitch ? { checked: node.checked } : {}) })),
      logo: { url: this.imageUrls.get(this.nodes.get('brand-logo') as GuiImage) ?? '', loaded: !!(this.nodes.get('brand-logo') as GuiImage).source },
      previewGame: this.previewId ?? '', backdrop: this.backdrop.snapshot(), artwork: this.artwork.snapshot(), columns: this.layout.columns, hoverCards: this.hoverCards().map(card => ({ ...card, ...cardHoverPose(card.amount) })), shelf: { ...this.shelf.rect, axis: this.shelf.axis, scrollX: this.shelf.scrollX, scrollY: this.shelf.scrollY, contentWidth: this.shelf.contentWidth, contentHeight: this.shelf.contentHeight, animating: this.shelf.animating }, hero: { ...this.layout.hero }, images: this.images.size + this.artwork.snapshot().sourceCount, notices: this.notices.map(notice => ({ ...notice })) };
  }
  setSoundPreferences(preferences: { effects: boolean; music: boolean }): void {
    (this.nodes.get('settings-effects') as GuiSwitch).setChecked(preferences.effects);
    (this.nodes.get('settings-music') as GuiSwitch).setChecked(preferences.music);
  }
  destroy(): void { this.artwork.destroy(); this.backdrop.destroy(); for (const image of this.images.values()) { image.onload = null; image.onerror = null; } this.images.clear(); this.imageUrls.clear(); }
}
