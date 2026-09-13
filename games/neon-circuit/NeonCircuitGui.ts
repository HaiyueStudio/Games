import { Entity, type World } from '@haiyue/engine';
import { GuiButton, GuiElement, GuiImage, GuiLabel, GuiRoot, type GuiRect, type GuiPointerEvent } from '@haiyue/engine/gui';
import { CircuitCarousel } from './CircuitCarousel';
import { carouselMetrics, carouselOffset, projectCard, hitCarousel, carouselRelease, swipeStep } from './CarouselMath';
import { HudDialTexture } from './HudDialTexture';
import { healthRingColor } from './RacerEffects';
import { CIRCUITS } from './RaceRules';

export type RacePhase = 'home' | 'countdown' | 'racing' | 'paused' | 'finished' | 'destroyed';
export interface RaceGuiState {
  phase: RacePhase; speed: string; lap: string; time: string; best: string;
  health: number; countdown: number; announcement: string; impact: number;
}
interface Actions {
  select(id: string): void; start(): void; restart(): void; pause(): void; home(): void;
  press(key: string, pointer: number): void; release(pointer: number): void;
}
const CYAN = '#55eaff', MUTED = '#91a9c3', WHITE = '#edf8ff';
const COPY = ['选择你的赛道，驶入霓虹之夜。', '控制方向切入弯心，提前刹车，守住车体耐久。',
  'W / ↑ 加速   S / ↓ 刹车   A D / ← → 转向', 'P 暂停 / 继续   R 重开   方向键亦可驾驶',
  '赛道选择', '重开', '暂停', '继续', '开始竞速', '赛车损毁', '重试', '正在加载赛车…', '启动失败，请刷新页面重试。',
  '耐久', '车体起火', '车体冒烟', '准备出发', '入弯前减速并主动转向', '键盘方向键选择 · Enter 开始', '加速', '刹车',
  '比赛暂停', '继续游戏', '返回首页', '再次挑战', '比赛完成', '左右滑动 / A D / ← → 切换赛道'];
export const NEON_GUI_GLYPHS = [...new Set(Array.from(
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('')
  + COPY.join('') + CIRCUITS.map(c => c.name + c.subtitle + c.description + c.difficulty).join('') + '·→←↑↓↗—'
))].join('');

function place(element: GuiElement, rect: GuiRect): void {
  element.rect = rect;
  for (const child of element.children) child.layout(rect);
}
function box(element: GuiElement, compute: (parent: GuiRect) => [number, number, number, number]): void {
  element.layout = parent => {
    const [x, y, width, height] = compute(parent);
    place(element, { x: parent.x + x, y: parent.y + y, width, height });
  };
}
function label(parent: GuiElement, text: string, size = 14, color = WHITE, align: 'left' | 'center' | 'right' = 'left'): GuiLabel {
  return parent.add(new GuiLabel({ text, fontSize: size, textAlign: align, style: { color } }));
}

/** Native engine GUI only: live labels/buttons, scene-independent layout, cached route images. */
export class NeonCircuitGui {
  readonly root = new GuiRoot({ theme: { fontSize: 14, radius: 5, colors: {
    primary: CYAN, text: WHITE, textMuted: MUTED, background: '#050b1b', surface: '#0a1730',
    border: '#28516c', hover: '#123451', active: '#164b63', disabled: '#304354', danger: '#ff704c',
  } } });
  private readonly carousel: CircuitCarousel;
  private readonly carouselStage: GuiElement;
  private readonly carouselImage: GuiImage;
  private readonly carouselHint: GuiLabel;
  private carouselPosition = 0;
  private carouselTarget = 0;
  private gesture: { pointer: number; startedAt: number; x: number; y: number; position: number; dx: number; dy: number;
    samples: { x: number; time: number }[] } | null = null;
  private readonly captureLosses = new Map<number, number>();
  private suppressCardClick = false;
  private readonly home: GuiElement;
  private readonly hud: GuiElement;
  private readonly cards: GuiButton[] = [];
  private readonly images: ImageBitmap[] = [];
  private readonly buttons = new Map<string, GuiButton>();
  private readonly homeLabels: { label: GuiLabel; size: number }[] = [];
  private readonly start: GuiButton;
  private readonly speed: GuiLabel;
  private readonly lap: GuiLabel;
  private readonly time: GuiLabel;
  private readonly best: GuiLabel;
  private readonly healthValue: GuiLabel;
  private readonly announcement: GuiLabel;
  private readonly countdownImage: GuiImage;
  private readonly countdownFrames = new Map<string, ImageBitmap>();
  private readonly dial: HudDialTexture;
  private readonly skins: { image: GuiImage; kind: 'button' | 'panel' | 'dial' | 'title' | 'timing' }[] = [];
  private readonly courseHeader: GuiElement;
  private readonly speedPanel: GuiElement;
  private readonly stats: GuiElement;
  private readonly modal: GuiElement;
  private readonly modalTitle: GuiLabel;
  private readonly modalDetail: GuiLabel;
  private readonly touch: GuiElement;
  private readonly impactEdges: GuiElement[] = [];
  private readonly coarsePointer: boolean;
  private current: RaceGuiState | null = null;
  private selected: string;
  private focusId = 'start-race';
  private homeScale = 1;

  constructor(world: World, device: GPUDevice, circuitId: string, private readonly actions: Actions, coarsePointer = false) {
    this.dial = new HudDialTexture(device);
    this.carousel = new CircuitCarousel(device);
    this.carouselPosition = this.carouselTarget = CIRCUITS.findIndex(c => c.id === circuitId);
    this.selected = circuitId; this.coarsePointer = coarsePointer;
    this.home = this.root.add(new GuiElement({ id: 'home', width: '100%', height: '100%', style: { backgroundColor: '#050b1bf5', radius: 0 } }));
    const content = this.home.add(new GuiElement());
    box(content, p => {
      const compact = p.width < 760, baseWidth = compact ? 358 : 1080, baseHeight = compact ? 770 : p.height < 550 ? 480 : 660;
      const scale = Math.min((p.width - 32) / baseWidth, (p.height - 32) / baseHeight, compact ? 1.1 : 1.2);
      this.homeScale = scale;
      this.root.theme.fontSize = 14 * Math.min(1, scale);
      for (const item of this.homeLabels) item.label.setFontSize(Math.max(10, item.size * scale));
      return [(p.width - baseWidth * scale) / 2, (p.height - baseHeight * scale) / 2, baseWidth * scale, baseHeight * scale];
    });
    const homeBox = (element: GuiElement, wide: number[], narrow = wide, landscape = wide): void => box(element, () => {
      const v = this.root.viewport.width < 760 ? narrow : this.root.viewport.height < 550 ? landscape : wide;
      return v.map(n => n * this.homeScale) as [number, number, number, number];
    });
    const homeText = (parent: GuiElement, text: string, size: number, color = WHITE): GuiLabel => {
      const item = label(parent, text, size, color); this.homeLabels.push({ label: item, size }); return item;
    };
    homeBox(homeText(content, 'HAIYUE / ANTI-GRAVITY LEAGUE', 11, CYAN), [0, 0, 800, 22]);
    homeBox(homeText(content, 'NEON CIRCUIT', 54), [0, 42, 900, 72], [0, 38, 358, 58], [0, 22, 900, 58]);
    // Mobile title size is handled in this label's layout to retain a readable single line.
    const title = this.homeLabels[1]!.label;
    const titleLayout = title.layout.bind(title);
    title.layout = rect => { title.setFontSize((this.root.viewport.width < 760 ? 37 : 54) * this.homeScale); titleLayout(rect); };
    homeBox(homeText(content, COPY[0]!, 15, MUTED), [0, 126, 900, 25], [0, 106, 358, 24], [0, 82, 900, 24]);
    homeBox(homeText(content, COPY[1]!, 13, MUTED), [0, 153, 1000, 22], [0, 132, 358, 22], [0, 109, 1000, 22]);
    this.carouselStage = content.add(new GuiElement({ id: 'course-carousel',
      onPointerDown: e => this.beginSwipe(e), onPointerMove: e => this.moveSwipe(e), onPointerUp: e => this.endSwipe(e) }));
    homeBox(this.carouselStage, [0, 184, 1080, 380], [0, 177, 358, 420], [0, 130, 1080, 250]);
    this.carouselImage = this.carouselStage.add(new GuiImage({ source: this.carousel.texture, width: '100%', height: '100%', disabled: true }));
    for (const [i, circuit] of CIRCUITS.entries()) {
      const card = this.carouselStage.add(new GuiButton({ id: `track-${circuit.id}`, text: '',
        onClick: () => { if (!this.suppressCardClick) this.select(circuit.id, true,
          Math.round(this.carouselPosition + carouselOffset(i, this.carouselPosition, CIRCUITS.length))); },
        onPointerDown: e => this.beginSwipe(e), onPointerMove: e => this.moveSwipe(e), onPointerUp: e => this.endSwipe(e),
        style: { backgroundColor: '#00000000', hoverBackgroundColor: '#00000000', borderColor: '#00000000', radius: 0 } }));
      this.buttons.set(card.id, card); this.cards.push(card);
      card.layout = p => {
        const corners = [[0,0],[1,0],[1,1],[0,1]].map(([u,v]) => projectCard(i,this.carouselPosition,p.width,p.height,u!,v!,CIRCUITS.length));
        const left = Math.min(p.width,Math.max(0, Math.min(...corners.map(v => v.x)))), top = Math.min(p.height,Math.max(0, Math.min(...corners.map(v => v.y))));
        const right = Math.max(0,Math.min(p.width, Math.max(...corners.map(v => v.x)))), bottom = Math.max(0,Math.min(p.height, Math.max(...corners.map(v => v.y))));
        place(card,{ x:p.x+left,y:p.y+top,width:Math.max(0,right-left),height:Math.max(0,bottom-top) });
      };
      card.hitTest = (x,y) => {
        const p = this.carouselStage.rect;
        return this.home.visible && hitCarousel(this.carouselPosition,p.width,p.height,x-p.x,y-p.y,CIRCUITS.length) === i ? card : null;
      };
    }
    for (const [id, text, step] of [['previous-course','←',-1],['next-course','→',1]] as const) {
      const button = this.carouselStage.add(this.button(id,text,() => this.shiftCourse(step)));
      box(button,p => { const width = p.width < 600 ? 36 : 52;
        const inset = Math.max(0,p.width/2-carouselMetrics(p.width,p.height).cardWidth*1.2-width*1.6);
        return [step < 0 ? inset : p.width-inset-width,(p.height-44)/2,width,44]; });
    }
    this.carouselHint = homeText(content, '', 12, MUTED);
    homeBox(this.carouselHint,[0,565,1080,24],[0,615,358,26],[0,383,1080,24]);
    this.carouselHint.textAlign = 'center';
    this.start = content.add(this.button('start-race', '', () => this.actions.start()));
    homeBox(this.start, [730, 600, 350, 56], [0, 659, 358, 48], [730, 412, 350, 60]);
    homeBox(homeText(content, COPY[2]!, 13, MUTED), [0, 594, 680, 24], [0, 718, 358, 22], [0, 412, 680, 24]);
    homeBox(homeText(content, COPY[3]!, 12, MUTED), [0, 625, 690, 24], [0, 742, 358, 18], [0, 444, 690, 24]);

    this.hud = this.root.add(new GuiElement({ id: 'hud', width: '100%', height: '100%', visible: false }));
    for (let edge = 0; edge < 4; edge++) {
      const pane = this.hud.add(new GuiElement({ disabled: true })); this.impactEdges.push(pane);
      box(pane, p => edge === 0 ? [0, 0, p.width, 10] : edge === 1 ? [0, p.height - 10, p.width, 10]
        : edge === 2 ? [0, 0, 10, p.height] : [p.width - 10, 0, 10, p.height]);
    }
    const brand = this.courseHeader = this.hud.add(new GuiElement({ id: 'course-title', disabled: true }));
    box(brand, p => {
      const width = p.width < 760 ? p.width - 32 : Math.min(460, p.width - 2 * (p.width >= 1100 ? 424 : p.height < 550 ? 190 : 248));
      return [(p.width - width) / 2, p.width < 1100 ? 68 : 12, width, p.width < 1100 ? 50 : 78];
    });
    this.skin(brand, 'title');
    const course = label(brand, CIRCUITS.find(c => c.id === circuitId)!.name, 21, WHITE, 'center');
    box(course, p => { course.setFontSize(p.width < 300 ? 18 : 24); return [12, (p.height - 28) / 2, p.width - 24, 28]; });
    const stats = this.stats = this.hud.add(new GuiElement({ id: 'race-timing', disabled: true }));
    box(stats, p => {
      const width = p.width < 760 ? p.width - 96 : 290;
      return [p.width - (p.width < 760 ? 72 : 110) - 12 - width, 16, width, 44];
    });
    this.skin(stats, 'timing');
    const stat = (name: string, index: number) => {
      const caption = label(stats, name, 9, MUTED, 'center');
      box(caption, p => { caption.setFontSize(p.width < 260 ? 8 : 9); return [index * p.width / 3, 5, p.width / 3, 12]; });
      const value = label(stats, '', 15, WHITE, 'center');
      box(value, p => { value.setFontSize(p.width < 260 ? 10 : 14); return [index * p.width / 3, 18, p.width / 3, 21]; });
      return value;
    };
    this.lap = stat('LAP', 0); this.time = stat('TIME', 1); this.best = stat('BEST', 2);
    const pause = this.hud.add(this.button('pause', '暂停', () => this.actions.pause()));
    box(pause, p => [p.width - (p.width < 760 ? 72 : 110), 16, p.width < 760 ? 56 : 94, 44]);
    const speedPanel = this.speedPanel = this.hud.add(new GuiElement({ id: 'speed-hull-dial', disabled: true }));
    box(speedPanel, p => { const size = p.width < 760 ? 144 : p.height < 550 ? 174 : 232; return [8, p.width < 760 ? 126 : 8, size, size]; });
    const dialFace = speedPanel.add(new GuiElement({ disabled: true }));
    box(dialFace, p => [p.width * 0.06, p.height * 0.06, p.width * 0.88, p.height * 0.88]);
    this.skin(dialFace, 'dial');
    speedPanel.add(new GuiImage({ source: this.dial.texture, width: '100%', height: '100%', disabled: true }));
    this.speed = label(speedPanel, '000', 50, WHITE, 'center');
    box(this.speed, p => { this.speed.setFontSize(p.width < 180 ? 30 : 44); return [0, p.height * 0.30, p.width, p.height * 0.3]; });
    box(label(speedPanel, 'KM / H', 11, CYAN, 'center'), p => [0, p.height * 0.58, p.width, 18]);
    this.healthValue = label(speedPanel, 'HULL 100%', 11, '#81edb0', 'center');
    box(this.healthValue, p => [0, p.height * 0.68, p.width, 18]);
    for (const text of ['3', '2', '1', 'GO']) {
      const canvas = new OffscreenCanvas(640, 420), ctx = canvas.getContext('2d')!;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 260px "Arial Black", Arial, sans-serif';
      ctx.fillStyle = '#f5ffff'; ctx.strokeStyle = '#f5ffff'; ctx.lineWidth = 7;
      ctx.shadowColor = '#35dfff'; ctx.shadowBlur = 38;
      ctx.strokeText(text, 320, 224); ctx.fillText(text, 320, 224);
      const image = canvas.transferToImageBitmap(); this.images.push(image); this.countdownFrames.set(text, image);
    }
    this.countdownImage = this.hud.add(new GuiImage({ id: 'countdown', visible: false, disabled: true }));
    box(this.countdownImage, p => {
      const age = 1 - ((this.current?.countdown ?? 1) - 0.4) % 1;
      const pulse = 1 + Math.exp(-Math.max(0, age) * 8) * 0.10;
      const width = Math.min(p.width * 0.82, p.height * 0.9, 520) * pulse, height = width * 420 / 640;
      return [(p.width - width) / 2, p.height * 0.39 - height / 2, width, height];
    });
    this.announcement = label(this.hud, '', 38, WHITE, 'center');
    this.announcement.setStyle({ backgroundColor: '#071426dc', radius: 8 });
    box(this.announcement, p => { this.announcement.setFontSize(p.width < 760 ? 22 : 38); const width = Math.min(p.width - 32, 780); return [(p.width - width) / 2, p.height * 0.3, width, 72]; });
    this.touch = this.hud.add(new GuiElement({ id: 'touch-controls' }));
    box(this.touch, p => { this.touch.setVisible(this.mobile(p) && this.canDrive()); return [16, p.height - 78, p.width - 32, 58]; });
    for (const [i, [key, text]] of [['a', '←'], ['d', '→'], ['s', '刹车'], ['w', '加速']].entries()) {
      const button = this.touch.add(new GuiButton({ id: `control-${key}`, text: text!, onPointerDown: e => this.actions.press(key!, e.pointerId),
        onPointerUp: e => this.actions.release(e.pointerId), style: { backgroundColor: '#0b263ce8', hoverBackgroundColor: '#195775', borderColor: '#367c98' } }));
      this.buttons.set(button.id, button); this.skin(button, 'button');
      box(button, p => { const width = Math.min(72, (p.width - 42) / 4); return [i < 2 ? i * (width + 10) : p.width - (4 - i) * width - (3 - i) * 10, 0, width, 58]; });
    }
    // Last child captures all input above the dimmed race, including empty space.
    this.modal = this.hud.add(new GuiElement({ id: 'race-modal', width: '100%', height: '100%', visible: false,
      style: { backgroundColor: '#020714c9', radius: 0 } }));
    const panel = this.modal.add(new GuiElement({ id: 'pause-panel' }));
    box(panel, p => { const width = Math.min(520, p.width - 32), height = Math.min(360, p.height - 32); return [(p.width - width) / 2, (p.height - height) / 2, width, height]; });
    this.skin(panel, 'panel');
    this.modalTitle = label(panel, '比赛暂停', 30, WHITE, 'center');
    box(this.modalTitle, p => { this.modalTitle.setFontSize(p.width < 400 ? 25 : 30); return [24, p.height * 0.14, p.width - 48, 40]; });
    this.modalDetail = label(panel, '', 14, MUTED, 'center');
    box(this.modalDetail, p => [24, p.height * 0.29, p.width - 48, 26]);
    for (const [id, text, action, row] of [
      ['resume', '继续游戏', () => this.actions.pause(), 0],
      ['restart', '再次挑战', () => this.actions.restart(), 0],
      ['home-button', '返回首页', () => this.actions.home(), 1],
    ] as const) {
      const button = panel.add(this.button(id, text, action));
      box(button, p => [p.width * 0.14, p.height * (0.46 + row * 0.21), p.width * 0.72, 50]);
    }
    const entity = new Entity('Neon Circuit GUI'); entity.addComponent(this.root); world.addEntity(entity);
    this.select(circuitId, false);
  }

  private mobile(rect: GuiRect): boolean { return rect.width < 760 || this.coarsePointer; }
  private shiftCourse(step: number): void {
    const index = CIRCUITS.findIndex(c => c.id === this.selected);
    this.select(CIRCUITS[(index + step + CIRCUITS.length) % CIRCUITS.length]!.id);
  }
  private beginSwipe(event: GuiPointerEvent): void {
    if (this.current?.phase !== 'home' || this.gesture || event.button !== 0) return;
    this.suppressCardClick = false;
    this.gesture = { pointer: event.pointerId, startedAt: event.nativeEvent.timeStamp, x: event.x, y: event.y, position: this.carouselPosition, dx: 0, dy: 0,
      samples: [{ x: event.x, time: event.nativeEvent.timeStamp }] };
  }
  private moveSwipe(event: GuiPointerEvent): void {
    const g = this.gesture; if (!g || g.pointer !== event.pointerId) return;
    g.dx = event.x - g.x; g.dy = event.y - g.y;
    const time = event.nativeEvent.timeStamp;
    g.samples.push({ x: event.x, time });
    while (g.samples.length > 2 && g.samples[1]!.time < time - 100) g.samples.shift();
    if (swipeStep(g.dx, g.dy)) {
      this.suppressCardClick = true;
      const spacing = carouselMetrics(this.carouselStage.rect.width,this.carouselStage.rect.height).spacing;
      this.carouselPosition = g.position - g.dx / spacing;
      event.preventDefault();
    }
  }
  private endSwipe(event: GuiPointerEvent): void {
    const g = this.gesture; if (!g || g.pointer !== event.pointerId) return;
    this.moveSwipe(event); this.gesture = null;
    if (event.nativeEvent.type === 'pointercancel') { this.suppressCardClick = true; return; }
    const last = g.samples[g.samples.length - 1]!, first = g.samples[0]!;
    const elapsed = last.time - first.time;
    const velocity = elapsed >= 8 && elapsed <= 180 ? (last.x - first.x) * 1000 / elapsed : 0;
    const rect = this.carouselStage.rect;
    const target = carouselRelease(g.position, g.dx, g.dy, rect.width, rect.height, velocity);
    if (target !== null) {
      this.suppressCardClick = true;
      this.select(CIRCUITS[((target % CIRCUITS.length) + CIRCUITS.length) % CIRCUITS.length]!.id, true, target);
    }
  }
  cancelCarouselPointer(pointer?: number): void {
    if (pointer === undefined) this.captureLosses.clear();
    else this.captureLosses.delete(pointer);
    if (this.gesture && (pointer === undefined || pointer === this.gesture.pointer)) {
      this.gesture = null; this.suppressCardClick = true;
    }
  }
  carouselCaptureLost(event: PointerEvent): void {
    if (this.current?.phase === 'home') this.captureLosses.set(event.pointerId, event.timeStamp);
  }
  flushCarouselCaptureLosses(): void {
    // Native implicit release precedes the engine's queued pointerup. Let that
    // event commit a swipe/tap before cancelling a genuinely interrupted drag.
    const g = this.gesture;
    if (g && (this.captureLosses.get(g.pointer) ?? -Infinity) >= g.startedAt) this.cancelCarouselPointer(g.pointer);
    this.captureLosses.clear();
  }
  animate(seconds: number): void {
    for (const skin of this.skins) if (skin.image.parent instanceof GuiButton) {
      const button = skin.image.parent;
      skin.image.setTint(button.pressed ? '#80bed5' : button.focused || button.hovered ? '#ffffff' : '#d4e8f2');
    }
    if (this.current?.phase !== 'home') return;
    if (!this.gesture) {
      this.carouselPosition += (this.carouselTarget - this.carouselPosition) * (1 - Math.exp(-Math.max(0,seconds) * 7));
      if (Math.abs(this.carouselTarget - this.carouselPosition) < 0.001) this.carouselPosition = this.carouselTarget;
    }
    const p = this.carouselStage.rect;
    this.carousel.render(p.width,p.height,this.carouselPosition);
    this.carouselImage.setSource(this.carousel.texture);
    this.carouselStage.markDirty();
  }
  private canDrive(): boolean { return this.current?.phase === 'racing' || this.current?.phase === 'countdown'; }
  private button(id: string, text: string, action: () => void): GuiButton {
    const button = new GuiButton({ id, text, onClick: action, style: { backgroundColor: '#00000000',
      hoverBackgroundColor: '#00000000', borderColor: '#00000000', color: WHITE, radius: 0 } });
    this.buttons.set(id, button); this.skin(button, 'button'); return button;
  }
  private skin(parent: GuiElement, kind: 'button' | 'panel' | 'dial' | 'title' | 'timing'): void {
    const image = parent.add(new GuiImage({ width: '100%', height: '100%', disabled: true,
      uv: kind === 'timing' ? [0, 0.31, 1, 0.35] : kind === 'button' ? [0, 0.1, 1, 0.8] : kind === 'title' ? [0, 0.30, 1, 0.36] : [0, 0, 1, 1], tint: '#d4e8f2' }));
    this.skins.push({ image, kind });
    // Keep the native GUI hit target and focus outline around the image skin.
    if (parent instanceof GuiButton) {
      parent.setStyle({ color: WHITE, hoverColor: '#ffffff', backgroundColor: '#00000000', hoverBackgroundColor: '#00000000', borderColor: '#00000000', radius: 0 });
      parent.on('pointerenter', () => image.setTint('#ffffff'));
      parent.on('pointerleave', () => image.setTint('#d4e8f2'));
      parent.on('pointerdown', () => image.setTint('#80bed5'));
      parent.on('pointerup', () => image.setTint('#ffffff'));
    }
  }
  setSkins(button: GPUTexture, panel: GPUTexture, dial: GPUTexture, title: GPUTexture, timing: GPUTexture): void {
    this.carousel.setPanel(panel);
    const textures = { button, panel, dial, title, timing };
    for (const skin of this.skins) skin.image.setSource(textures[skin.kind]);
  }
  select(id: string, notify = true, destination?: number): void {
    this.selected = id;
    const index = CIRCUITS.findIndex(c => c.id === id);
    this.carouselTarget = destination ?? this.carouselTarget + carouselOffset(index, this.carouselTarget, CIRCUITS.length);
    this.carouselHint.setText(`0${index + 1} / ${String(CIRCUITS.length).padStart(2, '0')}    左右滑动 / A D / ← → 切换赛道`);
    this.start.setText(`开始竞速 · ${CIRCUITS.find(c => c.id === id)!.name} →`);
    if (notify) this.actions.select(id);
  }
  update(state: RaceGuiState): void {
    const changedPhase = this.current?.phase !== state.phase;
    this.current = state;
    if (changedPhase) this.cancelCarouselPointer();
    this.home.setVisible(state.phase === 'home'); this.hud.setVisible(state.phase !== 'home');
    this.speed.setText(state.speed); this.lap.setText(state.lap); this.time.setText(state.time); this.best.setText(state.best);
    this.dial.update(state.health);
    this.healthValue.setText(`HULL ${Math.ceil(state.health)}%`);
    const tint = healthRingColor(state.health);
    this.healthValue.setStyle({ color: `rgb(${Math.round(tint[0] * 255)},${Math.round(tint[1] * 255)},${Math.round(tint[2] * 255)})` });
    const digit = state.phase === 'countdown' ? this.countdownFrames.get(state.announcement) : undefined;
    this.countdownImage.setVisible(!!digit);
    if (digit) { this.countdownImage.setSource(digit); this.countdownImage.markDirty(); }
    this.announcement.setText(state.announcement);
    const paused = state.phase === 'paused', ended = state.phase === 'finished' || state.phase === 'destroyed';
    this.modal.setVisible(paused || ended);
    this.courseHeader.setVisible(!paused && !ended);
    this.speedPanel.setVisible(!paused && !ended);
    this.stats.setVisible(!paused && !ended);
    this.modalTitle.setText(paused ? '比赛暂停' : state.phase === 'finished' ? '比赛完成' : '赛车损毁');
    this.modalDetail.setText(state.phase === 'finished' ? state.announcement : CIRCUITS.find(c => c.id === this.selected)!.name);
    this.buttons.get('resume')!.setVisible(paused);
    this.buttons.get('restart')!.setVisible(ended);
    this.buttons.get('pause')!.setVisible(this.canDrive());
    this.touch.setVisible(this.mobile(this.root.viewport) && this.canDrive());
    this.announcement.setVisible(!digit && !!state.announcement && this.canDrive());
    if (changedPhase) {
      this.buttons.get(this.focusId)?.handleBlur();
      this.focusId = this.activeButtonIds()[0]!;
    }
    for (const edge of this.impactEdges) edge.setStyle({ backgroundColor: `rgba(255,72,27,${Math.min(0.6, state.impact * 0.6)})` });
  }
  private activeButtonIds(): string[] {
    if (this.current?.phase === 'home') return ['start-race', 'previous-course', 'next-course'];
    if (this.current?.phase === 'paused') return ['resume', 'home-button'];
    if (this.current?.phase === 'finished' || this.current?.phase === 'destroyed') return ['restart', 'home-button'];
    return ['pause'];
  }
  keyboard(key: string, shift = false): boolean {
    const home = this.current?.phase === 'home';
    const index = CIRCUITS.findIndex(c => c.id === this.selected);
    if (home && ['a', 'd', 'arrowleft', 'arrowup', 'arrowright', 'arrowdown'].includes(key)) {
      this.select(CIRCUITS[(index + (key === 'a' || key === 'arrowleft' || key === 'arrowup' ? CIRCUITS.length - 1 : 1)) % CIRCUITS.length]!.id);
      this.focusId = 'start-race'; return true;
    }
    if (key === 'tab') {
      const ids = this.activeButtonIds();
      this.select(this.selected, false);

      const previous = this.buttons.get(this.focusId); previous?.handleBlur();
      const index = ids.indexOf(this.focusId);
      this.focusId = ids[index < 0 ? (shift ? ids.length - 1 : 0) : (index + (shift ? ids.length - 1 : 1)) % ids.length]!;
      const next = this.buttons.get(this.focusId)!; next.handleFocus();
      return true;
    }
    if (key === 'enter' || (home && key === ' ')) {
      if (home) { if (this.focusId === 'previous-course') this.shiftCourse(-1); else if (this.focusId === 'next-course') this.shiftCourse(1); else this.actions.start(); }
      else if (!this.activeButtonIds().includes(this.focusId)) return false;
      else if (this.focusId === 'restart') this.actions.restart();
      else if (this.focusId === 'home-button') this.actions.home();
      else if (this.focusId === 'pause' || this.focusId === 'resume') this.actions.pause();
      return true;
    }
    return false;
  }
  buttonRect(id: string): GuiRect {
    const rect = this.buttons.get(id)?.rect; if (!rect) throw new Error(`Unknown GUI button ${id}`);
    if (id.startsWith('track-')) {
      // A perspective card may be partly behind its neighbour. Find a visible
      // hit point for browser interaction instead of clicking its occluded centre.
      for (const fy of [0.5,0.35,0.65,0.2,0.8]) for (const fx of [0.5,0.2,0.8,0.1,0.9,0.35,0.65]) {
        const x=rect.x+rect.width*fx, y=rect.y+rect.height*fy;
        if (this.root.hitTest(x,y)?.id === id) return {x:x-1,y:y-1,width:2,height:2};
      }
    }
    return { ...rect };
  }
  get snapshot() { return { renderer: 'engine-gui', homeVisible: this.home.visible, selected: this.selected, routeCount: this.cards.length, carouselPosition: this.carouselPosition, carouselTarget: this.carouselTarget, carouselBounds: { ...this.carouselStage.rect },
    skinnedButtonsTransparent: [...this.buttons.values()].every(b => b.style.borderColor === '#00000000' && b.style.backgroundColor === '#00000000'),
    modalVisible: this.modal.visible, activeButtons: this.activeButtonIds(), courseBounds: { ...this.courseHeader.rect }, timingBounds: { ...this.stats.rect }, dialBounds: { ...this.speedPanel.rect },
    instrumentsVisible: this.courseHeader.visible || this.speedPanel.visible || this.stats.visible,
    displaySpeed: this.speed.text, health: this.current?.health ?? 100, healthColor: healthRingColor(this.current?.health ?? 100), countdownVisible: this.countdownImage.visible, announcement: this.announcement.text, touchVisible: this.touch.visible,
    bounds: this.cards.map(card => ({ ...card.rect })), start: this.buttonRect('start-race'), buttons: Object.fromEntries([...this.buttons].map(([id, button]) => [id, { ...button.rect }])), viewport: { ...this.root.viewport } }; }
  dispose(): void { this.carousel.destroy(); this.dial.destroy(); for (const image of this.images) image.close(); this.images.length = 0; }
}
