import { createCarouselArrow } from './CarouselArrow';
import { AI_DIFFICULTIES, type AiDifficulty, type RaceMode, type RaceWinner } from './RaceOpponent';
import { WindshieldDamage, type ImpactSide } from './WindshieldDamage';
import { WindshieldGlass } from './WindshieldGlass';
import { windshieldStage, type CameraMode } from './CameraMode';
import { LANGUAGES, LANGUAGE_NAMES, TEXT, LOCALE_GLYPHS, localizeCourse, type Language, type CopyKey } from './NeonLocale';
import { browserNeonRaster, uploadNeonCanvas, type NeonRaster } from './NeonRaster';
import { Entity, type World } from '@haiyue/engine';
import { GuiButton, GuiElement, GuiImage, GuiLabel, GuiModal, GuiRoot, type GuiRect, type GuiPointerEvent } from '@haiyue/engine/gui';
import { CircuitCarousel } from './CircuitCarousel';
import { carouselMetrics, carouselOffset, projectCard, hitCarousel, carouselRelease, swipeStep } from './CarouselMath';
import { HudMapTexture } from './HudMapTexture';
import { raceHudLayout } from './HudMapMath';
import { HudDialTexture } from './HudDialTexture';
import { HudSpriteTexture } from './HudSpriteTexture';
import { healthRingColor } from './RacerEffects';
import { CIRCUITS, circuitTrack, type RacePose } from './RaceRules';

export type RacePhase = 'home' | 'countdown' | 'racing' | 'paused' | 'finished' | 'destroyed';
export interface RaceGuiState {
  raceMode?: RaceMode; position?: number; winner?: RaceWinner; opponentPose?: RacePose;
  phase: RacePhase; speed: string; lap: string; time: string; best: string;
  cameraMode: CameraMode; health: number; damageSide: ImpactSide; countdown: number; announcement: string; impact: number;
  newRecord: boolean; throttle: boolean; brake: boolean; pose: RacePose;
}
interface Actions {
  raceSetup(mode: RaceMode, difficulty: AiDifficulty): void;
  camera(value: CameraMode): void; stamp(): void; click(): void; language(value: Language): void; select(id: string): void; start(mode: RaceMode): void; restart(): void; pause(): void; home(): void;
  press(key: string, pointer: number): void; release(pointer: number): void;
}
const CYAN = '#55eaff', MUTED = '#91a9c3', WHITE = '#edf8ff';
type Skin = 'button' | 'panel' | 'dial' | 'title' | 'timing' | 'pause' | 'gear' | 'settings';
const COPY = ['选择你的赛道，驶入霓虹之夜。', '控制方向切入弯心，提前刹车，守住车体耐久。',
  'W / ↑ 加速   S / ↓ 刹车   A D / ← → 转向', 'P 暂停 / 继续   R 重开   方向键亦可驾驶',
  '赛道选择', '重开', '暂停', '继续', '开始竞速', '赛车损毁', '重试', '正在加载赛车…', '启动失败，请刷新页面重试。',
  '耐久', '车体起火', '车体冒烟', '准备出发', '入弯前减速并主动转向', '键盘方向键选择 · Enter 开始', '加速', '刹车',
  '比赛暂停', '继续游戏', '返回首页', '再次挑战', '比赛完成', '左右滑动 / A D / ← → 切换赛道'];
export const NEON_GUI_GLYPHS = [...new Set(Array.from(
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('')
  + LOCALE_GLYPHS + COPY.join('') + CIRCUITS.map(c => c.name + c.subtitle + c.description + c.difficulty).join('') + '·→←↑↓↗↻—●○Ⅱ新纪录！陀螺仪虚拟摇杆油门左右倾斜控制方向自动校准'
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
  // Engine caches each root independently. These labels change every race frame.
  private readonly readouts = new GuiRoot({ id: 'race-readouts', disabled: true, visible: false });
  private readonly cacheWork = { staticLayouts: 0, readoutLayouts: 0 };
  readonly root = new GuiRoot({ theme: { fontSize: 14, radius: 5, colors: {
    primary: CYAN, text: WHITE, textMuted: MUTED, background: '#050b1b', surface: '#0a1730',
    border: '#28516c', hover: '#123451', active: '#164b63', disabled: '#304354', danger: '#ff704c',
  } } });
  private readonly fractures = new WindshieldDamage();
  private glass: WindshieldGlass | null = null;
  private readonly createGlass: () => WindshieldGlass;
  private readonly glassImage: GuiImage;
  private cameraMode: CameraMode = 'chase';
  private readonly arrows: {button:GuiButton;image:GuiImage}[] = [];
  private arrowClock = 0;
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
  private readonly images: GPUTexture[] = [];
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
  private readonly countdownFrames = new Map<string, GPUTexture>();
  private readonly dial: HudDialTexture;
  private readonly minimap: HudMapTexture;
  private readonly instruments: GuiElement;
  private readonly instrumentsArt: GuiImage;
  private readonly compassPanel: GuiElement;
  private readonly compassArt: GuiImage;
  private readonly mapImage: GuiImage;
  private readonly skins: { image: GuiImage; kind: Skin }[] = [];
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
  private nativeControls = false;
  private language: Language = 'zh';
  private mode: 'joystick' | 'gyro' = 'joystick';
  private readonly translations: { label: GuiLabel; key: CopyKey }[] = [];
  private raceMode: RaceMode = 'time-trial';
  private difficulty: AiDifficulty = 'normal';
  private readonly settingsLayer: GuiElement;
  private readonly settingsPanel: GuiElement;
  private readonly controlHint: GuiLabel;
  private readonly courseName: GuiLabel;
  private readonly activate = new Map<string, () => void>();
  private readonly raceCircuitId: string;
  private skinTextures: Record<Skin, GPUTexture> | null = null;
  private readonly pedals = new Map<string, { sprite: HudSpriteTexture; image: GuiImage; label: GuiLabel; amount: number }>();
  private readonly stampSprite: HudSpriteTexture;
  private readonly stamp: GuiImage;
  private stampArt: GPUTexture | null = null;
  private stampAge = 0;
  private readonly wheelSprite: HudSpriteTexture;
  private readonly wheel: GuiImage;
  private readonly lapArt: GuiImage;
  private wheelOpacity = 0.36;
  private wheelArt: GPUTexture | null = null;
  private wheelState = { active: false, x: 0, y: 0, angle: 0 };

  constructor(world: World, device: GPUDevice, circuitId: string, private readonly actions: Actions, coarsePointer = false, raster: NeonRaster = browserNeonRaster, safeInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 })) {
    this.createGlass = () => new WindshieldGlass(device,raster);
    this.glassImage = this.root.add(new GuiImage({id:'windshield-glass',width:'100%',height:'100%',disabled:true,visible:false}));
    this.dial = new HudDialTexture(device);
    const circuit = CIRCUITS.find(c => c.id === circuitId)!;
    this.minimap = new HudMapTexture(device, circuitTrack(circuit), circuit.color);
    this.stampSprite = new HudSpriteTexture(device);
    this.wheelSprite = new HudSpriteTexture(device);
    this.carousel = new CircuitCarousel(device, raster);
    this.carouselPosition = this.carouselTarget = CIRCUITS.findIndex(c => c.id === circuitId);
    this.raceCircuitId = circuitId; this.selected = circuitId; this.coarsePointer = coarsePointer;
    this.home = this.root.add(new GuiElement({ id: 'home', width: '100%', height: '100%', style: { backgroundColor: '#050b1bf5', radius: 0 } }));
    const safeHome = this.home.add(new GuiElement());
    const content = safeHome.add(new GuiElement());
    box(content, p => {
      const compact = p.width < 760, baseWidth = compact ? 358 : 1080, baseHeight = compact ? 820 : p.height < 550 ? 480 : 660;
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
    homeBox(this.translate(homeText(content, '', 11, CYAN), 'league'), [760,64,320,22],[0,0,358,22],[760,28,320,22]);
    homeBox(this.translate(homeText(content, '', 54), 'title'), [760,96,320,72],[0,38,358,58],[760,60,320,58]);
    // Mobile title size is handled in this label's layout to retain a readable single line.
    const title = this.homeLabels[1]!.label;
    const titleLayout = title.layout.bind(title);
    title.layout = rect => { title.setFontSize((this.root.viewport.width < 760 ? (this.language === 'en' ? 32 : 37) : this.language==='en'?32:this.language==='ja'?37:48) * this.homeScale); titleLayout(rect); };
    homeBox(homeText(content, TEXT[this.language].intro, 15, MUTED), [760,184,320,24],[0,106,358,24],[760,128,320,24]);
    homeBox(homeText(content, TEXT[this.language].advice, 13, MUTED), [760,226,320,22],[0,132,358,22],[760,162,320,22]);
    this.carouselStage = content.add(new GuiElement({ id: 'course-carousel',
      onPointerDown: e => this.beginSwipe(e), onPointerMove: e => this.moveSwipe(e), onPointerUp: e => this.endSwipe(e) }));
    homeBox(this.carouselStage, [0,25,740,380*1.5],[0,154,358,438],[0,60,740,250*1.5]);
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
        return this.home.visible && !this.settingsLayer?.visible && hitCarousel(this.carouselPosition,p.width,p.height,x-p.x,y-p.y,CIRCUITS.length) === i ? card : null;
      };
    }
    for (const [id, text, step] of [['previous-course','←',-1],['next-course','→',1]] as const) {
      const button = this.carouselStage.add(this.button(id,'',() => this.shiftCourse(step),null));
      const art=createCarouselArrow(device,raster,step as -1|1);this.images.push(art);
      const image=button.add(new GuiImage({source:art,width:'100%',height:'100%',disabled:true}));
      this.arrows.push({button,image});
      box(button,p => [step<0?4:p.width-60,(p.height-76)/2,56,76]);
    }
    this.carouselHint = homeText(content, '', 12, MUTED);
    homeBox(this.carouselHint,[0,604,740,24],[0,600,358,26],[0,438,740,24]);
    this.carouselHint.textAlign = 'center';
    this.start = content.add(this.button('start-race', '', () => this.actions.start('time-trial')));
    homeBox(this.start, [760,350,320,56],[0,636,358,48],[760,270,320,62]);
    const duel=content.add(this.button('start-duel','',()=>this.actions.start('duel')));
    homeBox(duel,[760,420,210,56],[0,694,242,48],[760,342,210,62]);
    const difficulty=content.add(this.button('cycle-difficulty','',()=> {
      const next=AI_DIFFICULTIES[(AI_DIFFICULTIES.indexOf(this.difficulty)+1)%AI_DIFFICULTIES.length]!;
      this.actions.raceSetup(this.raceMode,next);
    }));
    homeBox(difficulty,[976,420,104,56],[248,694,110,48],[976,342,104,62]);
    homeBox(homeText(content, TEXT[this.language].keys, 13, MUTED), [760,552,320,24],[0,758,358,22],[760,414,320,24]);
    homeBox(homeText(content, TEXT[this.language].keysMore, 12, MUTED), [760,585,320,24],[0,788,358,18],[760,444,320,24]);

    for (const [i, key] of (['intro', 'advice', 'keys', 'keysMore'] as const).entries()) this.translate(this.homeLabels[[2,3,5,6][i]!]!.label, key);

    this.hud = this.root.add(new GuiElement({ id: 'hud', width: '100%', height: '100%', visible: false }));
    for (let edge = 0; edge < 4; edge++) {
      const pane = this.hud.add(new GuiElement({ disabled: true })); this.impactEdges.push(pane);
      box(pane, p => edge === 0 ? [0, 0, p.width, 10] : edge === 1 ? [0, p.height - 10, p.width, 10]
        : edge === 2 ? [0, 0, 10, p.height] : [p.width - 10, 0, 10, p.height]);
    }
    const brand = this.courseHeader = this.hud.add(new GuiElement({ id: 'course-title', disabled: true }));
    box(brand, p => {
      const width = p.width < 600 ? 128 : Math.min(260, Math.max(130, p.width - 600));
      return [(p.width - width) / 2, 0, width, 30];
    });
    this.skin(brand, 'title');
    const course = this.courseName = label(brand, CIRCUITS.find(c => c.id === circuitId)!.name, 21, WHITE, 'center');
    box(course, p => { course.setFontSize(p.width < 180 ? 12 : 14); return [12, 3, p.width - 24, 22]; });
    const instrumentMetrics = (p: GuiRect) => raceHudLayout(p, this.mobile(p));
    const instruments = this.instruments = this.hud.add(new GuiElement({ id: 'instrument-cluster', disabled: true }));
    box(instruments, p => { const r = instrumentMetrics(p).instruments; return [r.x,r.y,r.width,r.height]; });
    this.instrumentsArt = instruments.add(new GuiImage({ width:'100%', height:'100%', disabled:true }));
    const stats = this.stats = this.hud.add(new GuiElement({ id: 'race-timing', disabled: true }));
    box(stats, p => { const r = instrumentMetrics(p).stats; return [r.x,r.y,r.width,r.height]; });
    const stat = (name: CopyKey, index: number) => {
      const caption = this.translate(label(stats, '', 9, MUTED), name);
      box(caption, p => { caption.setFontSize(p.height < 50 ? 7 : 9); return [3,index*p.height/2,p.width*.32,p.height/2]; });
      const value = label(stats, '', 12, WHITE, 'right');
      box(value, p => { value.setFontSize(p.height < 50 ? 9 : 12); return [p.width*.30,index*p.height/2,p.width*.58,p.height/2]; });
      return value;
    };
    this.time = stat('time', 0); this.best = stat('best', 1);
    const compass = this.compassPanel = this.hud.add(new GuiElement({ id:'compass-cluster' }));
    box(compass, p => { const r = instrumentMetrics(p).compass; return [r.x,r.y,r.width,r.height]; });
    this.mapImage = compass.add(new GuiImage({ source:this.minimap.texture, disabled:true }));
    box(this.mapImage, p => { const size=p.height*.808; return [p.width*.394-size/2,p.height*.49-size/2,size,size]; });
    this.compassArt = compass.add(new GuiImage({ width:'100%',height:'100%',disabled:true }));
    this.lap = label(compass,'',9,WHITE,'center');
    this.lap.disabled = true;
    box(this.lap,p => {this.lap.setFontSize(p.height<120?7:9);return [p.width*.243,p.height*.86,p.width*.302,p.height*.10];});
    const pause = compass.add(this.button('pause', '', () => this.actions.pause(), null));
    box(pause, p => [p.width*.845-22,Math.max(0,p.height*.178-22),44,44]);
    const pauseSymbol = label(pause, 'Ⅱ', 22, WHITE, 'center');
    pauseSymbol.disabled = true;
    box(pauseSymbol, p => [0, 8, p.width, 28]);
    pause.on('pointerdown', () => pauseSymbol.setStyle({ color:CYAN }));
    pause.on('pointerup', () => pauseSymbol.setStyle({ color:WHITE }));
    pause.on('pointerleave', () => pauseSymbol.setStyle({ color:WHITE }));
    const speedPanel = this.speedPanel = this.hud.add(new GuiElement({ id: 'speed-hull-dial', disabled: true }));
    box(speedPanel, p => { const r = instrumentMetrics(p).dial; return [r.x,r.y,r.width,r.height]; });
    speedPanel.add(new GuiImage({ source: this.dial.texture, width: '100%', height: '100%', disabled: true }));
    this.speed = label(speedPanel, '000', 50, WHITE, 'center');
    box(this.speed, p => { this.speed.setFontSize(p.width < 150 ? 24 : 35.2); return [0, p.height * 0.25, p.width, p.height * 0.3]; });
    box(label(speedPanel, 'KM / H', 11 * 0.85, CYAN, 'center'), p => [0, p.height * 0.52, p.width, 14]);
    this.healthValue = label(speedPanel, 'HULL 100%', 11 * 0.85, '#81edb0', 'center');
    box(this.healthValue, p => [0, p.height * 0.64 - 4, p.width, 14]);
    for (const text of ['3', '2', '1', 'GO']) {
      const canvas = raster.canvas(640, 420), ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 260px "Arial Black", Arial, sans-serif';
      ctx.fillStyle = '#f5ffff'; ctx.strokeStyle = '#f5ffff'; ctx.lineWidth = 7;
      ctx.shadowColor = '#35dfff'; ctx.shadowBlur = 38;
      ctx.strokeText(text, 320, 224); ctx.fillText(text, 320, 224);
      const image = uploadNeonCanvas(device, raster, canvas); this.images.push(image); this.countdownFrames.set(text, image);
    }
    this.countdownImage = this.hud.add(new GuiImage({ id: 'countdown', visible: false, disabled: true }));
    box(this.countdownImage, p => {
      const age = 1 - ((this.current?.countdown ?? 1) - 0.4) % 1;
      const pulse = 1 + Math.exp(-Math.max(0, age) * 8) * 0.10;
      const width = Math.min(p.width * 0.82, p.height * 0.9, 520) * pulse, height = width * 420 / 640;
      return [(p.width - width) / 2, p.height * 0.39 - height / 2, width, height];
    });
    this.announcement = label(this.hud, '', 38, WHITE, 'center');
    this.announcement.setStyle({ backgroundColor: '#00000000', radius: 0 });
    this.lapArt=this.announcement.add(new GuiImage({width:'100%',height:'100%',disabled:true,uv:[0,0.35,1,0.3]}));
    box(this.announcement, p => { this.announcement.setFontSize(p.width < 760 ? 18 : 28); const width = Math.min(p.width - 32, 600); return [(p.width - width) / 2, p.height * 0.25, width, p.width < 760 ? 64 : 84]; });
    this.touch = this.hud.add(new GuiElement({ id: 'touch-controls' }));
    box(this.touch, p => { this.touch.setVisible(this.mobile(p) && this.canDrive()); return [16, p.height - 78, p.width - 32, 58]; });
    for (const [i, [key, text]] of [['a', '←'], ['d', '→'], ['s', '刹车'], ['w', '加速']].entries()) {
      const pedal = key === 's' || key === 'w';
      const button = this.touch.add(new GuiButton({ id: `control-${key}`, text: pedal ? '' : text!, onPointerDown: e => this.actions.press(key!, e.pointerId),
        onPointerUp: e => this.actions.release(e.pointerId), style: { backgroundColor: '#0b263ce8', hoverBackgroundColor: '#195775', borderColor: '#367c98' } }));
      this.buttons.set(button.id, button);
      if (pedal) {
        button.setStyle({ backgroundColor: '#00000000', hoverBackgroundColor: '#00000000', borderColor: '#00000000', radius: 0 });
        const sprite = new HudSpriteTexture(device, 256, 208);
        const image = button.add(new GuiImage({ source: sprite.texture, width: '100%', height: '100%', disabled: true }));
        const caption = label(button, text!, 12, WHITE, 'center'); caption.disabled = true;
        const entry = { sprite, image, label: caption, amount: 0 }; this.pedals.set(key!, entry);
        box(caption, p => { caption.setFontSize(12 - entry.amount); return [0, p.height * (0.31 + entry.amount * 0.12), p.width, 22]; });
      } else this.skin(button, 'button');
      box(button, p => { const width = Math.min(72, (p.width - 42) / 4); return [i < 2 ? i * (width + 10) : p.width - (4 - i) * width - (3 - i) * 10, 0, width, 58]; });
    }
    // Transparent input blocker: gameplay stays visible outside the panel.
    this.modal = this.hud.add(new GuiElement({ id: 'race-modal', width: '100%', height: '100%', visible: false,
      style: { backgroundColor: '#00000000', radius: 0 } }));
    const panel = this.modal.add(new GuiElement({ id: 'pause-panel' }));
    box(panel, p => { const width = Math.min(520, p.width - 32), height = Math.min(360, p.height - 32);
      const impact = this.stampAge - 0.5, shake = this.current?.newRecord && impact > 0 && impact < 0.3 ? Math.sin(impact * 65) * 3 * Math.exp(-impact * 18) : 0;
      return [(p.width - width) / 2, (p.height - height) / 2 + shake, width, height]; });
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
    this.stamp = panel.add(new GuiImage({ source: this.stampSprite.texture, disabled: true, visible: false }));
    box(this.stamp, p => { const size = p.width < 400 ? 108 : 132; return [p.width - size + 10, -22, size, size]; });
    this.wheel = this.root.add(new GuiImage({ source: this.wheelSprite.texture, disabled: true, visible: false }));
    box(this.wheel, p => { const i=safeInsets(); return [i.left+24,p.height-i.bottom-166,148,148]; });
    const gear = safeHome.add(this.button('settings', '', () => this.openSettings(true), 'gear'));
    box(gear, p => [p.width - 52, 6, 46, 46]);
    // GuiModal uses the renderer's separate overlay batches, so its skin and
    // buttons are composited after the home labels and shared button texture.
    this.settingsLayer = this.root.add(new GuiModal({ id: 'settings-modal', visible: false,
      showCloseButton:false, showConfirmButton:false, showCancelButton:false, backdropColor:'#020617a6',
      style: { backgroundColor: '#00000000', borderColor:'#00000000', radius: 0 } }));
    box(this.settingsLayer,p => [0,0,p.width,p.height]);
    this.settingsPanel = this.settingsLayer.add(new GuiElement({ id: 'settings-panel' }));
    box(this.settingsPanel, p => { const i = safeInsets(), width = Math.min(620, p.width-i.left-i.right-24), height = Math.min(380,p.height-i.top-i.bottom-20);
      return [i.left+(p.width-i.left-i.right-width)/2,i.top+(p.height-i.top-i.bottom-height)/2,width,height]; });
    this.skin(this.settingsPanel, 'settings');
    box(this.translate(label(this.settingsPanel, '', 25, WHITE, 'center'), 'settings'), p => [30,p.height*.09,p.width-60,32]);
    box(this.translate(label(this.settingsPanel, '', 12, CYAN), 'language'), p => [p.width*.10,p.height*.21,p.width*.80,20]);
    for (const [index, language] of LANGUAGES.entries()) {
      const button = this.settingsPanel.add(this.button(`language-${language}`, LANGUAGE_NAMES[language], () => this.actions.language(language)));
      box(button,p => [p.width*(.09+index*.28),p.height*.27,p.width*.26,36]);
    }
    box(this.translate(label(this.settingsPanel, '', 12, CYAN), 'controls'), p => [p.width*.10,p.height*.39,p.width*.80,20]);
    this.controlHint = this.translate(label(this.settingsPanel, '', 12, MUTED, 'center'), 'desktopControls');
    box(this.controlHint,p => [p.width*.08,p.height*.45,p.width*.84,32]);
    box(this.translate(label(this.settingsPanel,'',12,CYAN),'camera'),p=>[p.width*.10,p.height*.57,p.width*.80,20]);
    for (const [index,mode] of (['chase','first-person'] as const).entries()) {
      const button=this.settingsPanel.add(this.button(`camera-${mode}`,'',()=>this.actions.camera(mode)));
      box(button,p=>[p.width*(.09+index*.42),p.height*.63,p.width*.40,36]);
    }
    const done = this.settingsPanel.add(this.button('settings-done', '', () => this.openSettings(false)));
    box(done,p => [p.width*.28,p.height*.81,p.width*.44,36]);
    for (const layer of [safeHome, this.hud]) box(layer, p => { const i = safeInsets(); return [i.left, i.top, p.width - i.left - i.right, p.height - i.top - i.bottom]; });
    const entity = new Entity('Neon Circuit GUI'); entity.addComponent(this.root); world.addEntity(entity);
    this.readouts.theme = this.root.theme;
    for (const item of [this.time, this.best, this.speed, this.healthValue, this.lap]) {
      const anchor = item.parent!, layout = item.layout.bind(item);
      this.readouts.add(item);
      // Static root is laid out first, preserving the original HUD anchor geometry.
      item.layout = () => layout(anchor.rect);
    }
    const readoutEntity = new Entity('Neon Circuit readouts'); readoutEntity.addComponent(this.readouts); world.addEntity(readoutEntity);
    const staticLayout = this.root.root.layout.bind(this.root.root), readoutLayout = this.readouts.root.layout.bind(this.readouts.root);
    this.root.root.layout = rect => { this.cacheWork.staticLayouts++; staticLayout(rect); this.readouts.root.markDirty(); };
    this.readouts.root.layout = rect => { this.cacheWork.readoutLayouts++; readoutLayout(rect); };
    this.setLanguage(this.language);
  }

  private translate(item: GuiLabel, key: CopyKey): GuiLabel {
    this.translations.push({label:item,key}); item.setText(TEXT[this.language][key]); return item;
  }
  setLanguage(language: Language): void {
    this.language = language;
    for (const item of this.translations) item.label.setText(TEXT[language][item.key]);
    for (const [id,key] of Object.entries({resume:'resume',restart:'retry','home-button':'home','settings-done':'done'})) this.buttons.get(id)?.setText(TEXT[language][key as CopyKey]);
    for (const lang of LANGUAGES) this.buttons.get(`language-${lang}`)?.setText(`${language === lang ? '●' : '○'} ${LANGUAGE_NAMES[lang]}`);
    this.pedals.get('s')!.label.setText(TEXT[language].brake);
    this.pedals.get('w')!.label.setText(TEXT[language].throttle);
    this.courseName.setText(localizeCourse(CIRCUITS.find(c => c.id === this.raceCircuitId)!,language).name);
    this.setRaceSetup(this.raceMode,this.difficulty); this.setCameraMode(this.cameraMode); this.carousel.setLanguage(language); this.updateMobileMode(this.mode); this.select(this.selected,false);
    if(this.current) this.update(this.current);
    this.home.markDirty(); this.settingsLayer.markDirty();
  }
  setRaceSetup(mode:RaceMode,difficulty:AiDifficulty):void {
    this.raceMode=mode;this.difficulty=difficulty;
    const t=TEXT[this.language];
    this.start.setText(t.timeTrial);
    this.buttons.get('start-duel')?.setText(t.duel);
    this.buttons.get('cycle-difficulty')?.setText(`${t[difficulty]} ↻`);
  }
  setCameraMode(mode: CameraMode): void {
    this.cameraMode=mode;
    for(const value of ['chase','first-person'] as const) this.buttons.get(`camera-${value}`)?.setText(`${mode===value?'●':'○'} ${TEXT[this.language][value==='chase'?'chase':'firstPerson']}`);
  }
  private openSettings(open: boolean): void {
    if(open && this.current?.phase !== 'home') return;
    this.cancelCarouselPointer(); this.settingsLayer.setVisible(open);
    this.buttons.get(this.focusId)?.handleBlur(); this.focusId = open ? `language-${this.language}` : 'settings';
    this.home.markDirty(); this.settingsLayer.markDirty();
  }
  configureMobileControls(mode: 'joystick' | 'gyro', choose: (mode: 'joystick' | 'gyro') => void, gyroAvailable = true): void {
    this.nativeControls = true;
    this.buttons.get('control-a')!.setVisible(false); this.buttons.get('control-d')!.setVisible(false);
    this.controlHint.setVisible(false);
    for (const [index,value] of (['joystick','gyro'] as const).entries()) {
      const button = this.settingsPanel.add(this.button(`steering-${value}`, '', () => {if(value !== 'gyro' || gyroAvailable) choose(value);}));
      button.disabled = value === 'gyro' && !gyroAvailable;
      box(button,p => [p.width*(.09+index*.42),p.height*.45,p.width*.40,36]);
    }
    this.updateMobileMode(mode); this.select(this.selected,false);
  }
  updateMobileMode(mode: 'joystick' | 'gyro'): void {
    this.mode=mode;
    for(const value of ['joystick','gyro'] as const) this.buttons.get(`steering-${value}`)?.setText(`${mode === value ? '●' : '○'} ${TEXT[this.language][value]}`);
    if(this.nativeControls) {
      this.homeLabels[5]!.label.setText(TEXT[this.language][mode === 'gyro' ? 'gyroHint' : 'touchHint']);
      this.homeLabels[6]!.label.setText('');
    }
  }

  private mobile(rect: GuiRect): boolean { return rect.width < 760 || this.coarsePointer; }
  private shiftCourse(step: number): void {
    const index = CIRCUITS.findIndex(c => c.id === this.selected);
    this.select(CIRCUITS[(index + step + CIRCUITS.length) % CIRCUITS.length]!.id);
  }
  private beginSwipe(event: GuiPointerEvent): void {
    if (this.settingsLayer.visible || this.current?.phase !== 'home' || this.gesture || event.button !== 0) return;
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
  animate(seconds: number, commands?: () => GPUCommandEncoder): void {
    for (const [key, pedal] of this.pedals) {
      if (!this.touch.visible) continue;
      const down = this.canDrive() && (key === 'w' ? this.current?.throttle : this.current?.brake);
      const previous = pedal.amount;
      const target = down ? 1 : 0;
      pedal.amount += (target - pedal.amount) * (1 - Math.exp(-seconds * 22));
      if (Math.abs(target - pedal.amount) < 0.0001) pedal.amount = target;
      if (this.skinTextures) pedal.sprite.render(this.skinTextures.button, { uv: [0,0.1,1,0.8], tilt: pedal.amount * 0.66, scale: 1 - pedal.amount * 0.07,
        y: pedal.amount * 0.035, pivot: 0.42, brightness: 1 - pedal.amount * 0.23 }, commands);
      if (pedal.amount !== previous) pedal.label.markDirty();
    }
    if (this.stamp.visible && this.stampArt) {
      const oldAge=this.stampAge;this.stampAge += seconds;
      if(oldAge<.5 && this.stampAge>=.5)this.actions.stamp();
      const t = Math.max(0, Math.min(1, (this.stampAge - 0.18) / 0.32)), after = Math.max(0, this.stampAge - 0.5);
      this.stampSprite.render(this.stampArt, { rotation: -0.18 - (1-t)*0.12, scale: 0.80 + (1-t)**3*0.6 + Math.sin(after*32)*Math.exp(-after*18)*0.06,
        y: -(1-t)*0.2, opacity: Math.min(1,t*3), brightness: 1 + Math.exp(-after*22)*0.15*t }, commands);
      this.modal.markDirty();
    }
    this.wheelOpacity += ((this.wheelState.active ? 1 : 0.36)-this.wheelOpacity)*(1-Math.exp(-seconds*18));
    if (this.wheel.visible && this.wheelArt) this.wheelSprite.render(this.wheelArt, { rotation: this.wheelState.angle, scale: 0.94, opacity:this.wheelOpacity }, commands);
    for (const skin of this.skins) if (skin.image.parent instanceof GuiButton) {
      const button = skin.image.parent;
      skin.image.setTint(button.pressed ? '#80bed5' : button.focused || button.hovered ? '#ffffff' : '#d4e8f2');
    }
    if (this.current?.phase !== 'home') return;
    this.arrowClock+=seconds;
    for(const {button,image} of this.arrows) image.setTint(`rgba(255,255,255,${button.pressed?1:(button.hovered||button.focused)?0.95:.7+Math.sin(this.arrowClock*2)*.08})`);
    if (!this.gesture) {
      this.carouselPosition += (this.carouselTarget - this.carouselPosition) * (1 - Math.exp(-Math.max(0,seconds) * 7));
      if (Math.abs(this.carouselTarget - this.carouselPosition) < 0.001) this.carouselPosition = this.carouselTarget;
    }
    const p = this.carouselStage.rect;
    this.carousel.render(p.width,p.height,this.carouselPosition, commands);
    this.carouselImage.setSource(this.carousel.texture);
    this.carouselStage.markDirty();
  }
  private canDrive(): boolean { return this.current?.phase === 'racing' || this.current?.phase === 'countdown'; }
  private button(id: string, text: string, action: () => void, skin: Skin | null = 'button'): GuiButton {
    const activate = () => {action();if(id !== 'previous-course' && id !== 'next-course') this.actions.click();};
    const button = new GuiButton({ id, text, onClick: activate, style: { backgroundColor: '#00000000',
      hoverBackgroundColor: '#00000000', borderColor: '#00000000', color: WHITE, radius: 0 } });
    this.buttons.set(id, button); this.activate.set(id,activate); if (skin) this.skin(button, skin); return button;
  }
  private skin(parent: GuiElement, kind: Skin): void {
    const image = parent.add(new GuiImage({ width: '100%', height: '100%', disabled: true,
      uv: kind === 'timing' ? [0, 0, 1, 0.425] : kind === 'button' ? [0, 0.1, 1, 0.8] : kind === 'title' ? [0, 0.355, 1, 0.155] : kind === 'pause' ? [0.02, 0.02, 0.96, 0.96] : [0, 0, 1, 1], tint: kind === 'panel' ? '#d4e8f2b8' : '#d4e8f2' }));
    this.skins.push({ image, kind });
    if (this.skinTextures) image.setSource(this.skinTextures[kind]);
    // Keep the native GUI hit target and focus outline around the image skin.
    if (parent instanceof GuiButton) {
      parent.setStyle({ color: WHITE, hoverColor: '#ffffff', backgroundColor: '#00000000', hoverBackgroundColor: '#00000000', borderColor: '#00000000', radius: 0 });
      parent.on('pointerenter', () => image.setTint('#ffffff'));
      parent.on('pointerleave', () => image.setTint('#d4e8f2'));
      parent.on('pointerdown', () => image.setTint('#80bed5'));
      parent.on('pointerup', () => image.setTint('#ffffff'));
    }
  }
  setSkins(button: GPUTexture, panel: GPUTexture, dial: GPUTexture, title: GPUTexture, timing: GPUTexture, pause: GPUTexture, gear: GPUTexture, settings: GPUTexture): void {
    this.carousel.setPanel(panel);
    const textures = this.skinTextures = { button, panel, dial, title, timing, pause, gear, settings };
    for (const skin of this.skins) skin.image.setSource(textures[skin.kind]);
  }
  setCompositeHudArt(instruments:GPUTexture, compass:GPUTexture):void {
    this.instrumentsArt.setSource(instruments); this.compassArt.setSource(compass);
  }
  setInteractiveArt(record: GPUTexture, wheel: GPUTexture): void { this.stampArt = record; this.wheelArt = wheel; }
  setLapArt(texture:GPUTexture):void {this.lapArt.setSource(texture);}
  updateWheel(active: boolean, x: number, y: number, steering: number, available = active): void {
    this.wheelState = { active, x, y, angle: -steering * 1.05 };
    // The wheel stays anchored; rotating its existing texture does not need GUI layout.
    this.wheel.setVisible(available && this.canDrive());
  }
  select(id: string, notify = true, destination?: number): void {
    this.selected = id;
    const index = CIRCUITS.findIndex(c => c.id === id);
    this.carouselTarget = destination ?? this.carouselTarget + carouselOffset(index, this.carouselTarget, CIRCUITS.length);
    this.carouselHint.setText(`0${index + 1} / ${String(CIRCUITS.length).padStart(2, '0')}    ${TEXT[this.language][this.nativeControls ? 'swipe' : 'swipeKeys']}`);
    this.start.setText(TEXT[this.language].timeTrial);
    if (notify) this.actions.select(id);
  }
  update(state: RaceGuiState, commands?: () => GPUCommandEncoder): void {
    const changedPhase = this.current?.phase !== state.phase;
    this.current = state;
    if (changedPhase) this.stampAge = 0;
    this.stamp.setVisible(state.phase === 'finished' && state.newRecord);
    if (!this.canDrive()) this.wheel.setVisible(false);
    if (changedPhase) { this.cancelCarouselPointer(); if(state.phase !== 'home') {this.settingsLayer.setVisible(false);} }
    this.home.setVisible(state.phase === 'home'); this.hud.setVisible(state.phase !== 'home');
    this.speed.setText(state.speed); this.lap.setText(`${TEXT[this.language].lap} ${state.lap}`); this.time.setText(state.time); this.best.setText(state.best);
    this.fractures.update(state.health,state.damageSide);
    if(state.cameraMode==='first-person' && !this.glass) this.glass=this.createGlass();
    const cracks=state.cameraMode==='first-person'?windshieldStage(state.health):0;
    this.glassImage.setVisible(cracks>0 && state.phase!=='home');
    if(cracks) {this.glass!.update(this.fractures);this.glassImage.setSource(this.glass!.texture);}
    this.dial.update(state.health, commands);
    if(this.canDrive()) this.minimap.update(state.pose,state.opponentPose,commands);
    this.healthValue.setText(state.raceMode==='duel'?`${TEXT[this.language].position} ${state.position} / 2`:`${TEXT[this.language].hull} ${Math.ceil(state.health)}%`);
    const tint = healthRingColor(state.health);
    this.healthValue.setStyle({ color: `rgb(${Math.round(tint[0] * 255)},${Math.round(tint[1] * 255)},${Math.round(tint[2] * 255)})` });
    const digit = state.phase === 'countdown' ? this.countdownFrames.get(state.announcement) : undefined;
    this.countdownImage.setVisible(!!digit);
    if (digit) { this.countdownImage.setSource(digit); this.countdownImage.markDirty(); }
    this.announcement.setText(state.announcement);
    const paused = state.phase === 'paused', ended = state.phase === 'finished' || state.phase === 'destroyed';
    this.readouts.root.setVisible(state.phase !== 'home' && !paused && !ended);
    this.modal.setVisible(paused || ended);
    this.courseHeader.setVisible(!paused && !ended);
    this.speedPanel.setVisible(!paused && !ended);
    this.stats.setVisible(!paused && !ended);
    this.instruments.setVisible(!paused && !ended); this.compassPanel.setVisible(!paused && !ended);
    this.modalTitle.setText(TEXT[this.language][paused ? 'paused' : state.phase === 'finished' ? state.newRecord ? 'record' : 'finished' : 'destroyed']);
    if(state.phase==='finished' && state.raceMode==='duel') this.modalTitle.setText(TEXT[this.language][state.winner==='player'?'playerWin':state.winner==='opponent'?'opponentWin':'tie']);
    this.modalTitle.setStyle({ color: state.phase === 'finished' && state.newRecord ? '#ffdb75' : WHITE });
    this.modalDetail.setText(state.phase === 'finished' ? state.announcement : localizeCourse(CIRCUITS.find(c => c.id === this.selected)!,this.language).name);
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
    if (this.settingsLayer.visible) return [...LANGUAGES.map(l => `language-${l}`),...(this.nativeControls ? ['steering-joystick','steering-gyro'].filter(id => !this.buttons.get(id)?.disabled) : []),'camera-chase','camera-first-person','settings-done'];
    if (this.current?.phase === 'home') return ['start-race', 'start-duel', 'cycle-difficulty', 'previous-course', 'next-course', 'settings'];
    if (this.current?.phase === 'paused') return ['resume', 'home-button'];
    if (this.current?.phase === 'finished' || this.current?.phase === 'destroyed') return ['restart', 'home-button'];
    return ['pause'];
  }
  keyboard(key: string, shift = false): boolean {
    const home = this.current?.phase === 'home' && !this.settingsLayer.visible;
    if(this.settingsLayer.visible && key === 'escape') {this.openSettings(false);return true;}
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
    if (key === 'enter' || key === ' ') {
      if(!this.activeButtonIds().includes(this.focusId)) return false;
      this.activate.get(this.focusId)?.(); return true;
    }
    if(this.settingsLayer.visible) return true;
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
  async inspectMapMarkers() {return this.minimap.inspectMarkers();}
  get snapshot() { return { cacheWork: {...this.cacheWork}, readoutsVisible: this.readouts.root.visible, carouselCardSize:carouselMetrics(this.carouselStage.rect.width,this.carouselStage.rect.height),carouselZoom:this.root.viewport.width>=760?1.5:'fit-width',arrowStyle:'translucent-glow',homeActions: {solo:{text:this.start.text,...this.start.rect},duel:{text:this.buttons.get('start-duel')!.text,...this.buttons.get('start-duel')!.rect},difficulty:{text:this.buttons.get('cycle-difficulty')!.text,...this.buttons.get('cycle-difficulty')!.rect}},raceMode:this.raceMode,difficulty:this.difficulty,resultTitle:this.modalTitle.text, language:this.language,title:TEXT[this.language].title,courseName:this.courseName.text,settingsVisible:this.settingsLayer.visible,settingsBackdrop:(this.settingsLayer as GuiModal).backdropColor,settingsBounds:{...this.settingsPanel.rect}, renderer: 'engine-gui', homeVisible: this.home.visible, selected: this.selected, routeCount: this.cards.length, carouselPosition: this.carouselPosition, carouselTarget: this.carouselTarget, carouselBounds: { ...this.carouselStage.rect },
    recordStamp: { visible: this.stamp.visible, age: this.stampAge }, cameraMode:this.cameraMode, windshield:{...this.fractures.snapshot,stage:this.current?.cameraMode==='first-person'?windshieldStage(this.current.health):0,visible:this.glassImage.visible}, wheel: { bounds:{...this.wheel.rect}, ...this.wheelState, opacity:this.wheelOpacity, visible: this.wheel.visible }, pedalPress: Object.fromEntries([...this.pedals].map(([key,p]) => [key,p.amount])), modalBackdrop: this.modal.style.backgroundColor, announcementSkin: {text:this.announcement.text,visible:this.announcement.visible,background:this.announcement.style.backgroundColor},
    skinnedButtonsTransparent: [...this.buttons.values()].every(b => b.style.borderColor === '#00000000' && b.style.backgroundColor === '#00000000'),
    modalVisible: this.modal.visible, activeButtons: this.activeButtonIds(), courseBounds: { ...this.courseHeader.rect }, timingBounds: { ...this.stats.rect }, dialBounds: { ...this.speedPanel.rect },
    minimap: { ...this.minimap.snapshot, visible:this.hud.visible && this.compassPanel.visible, bounds:{...this.mapImage.rect}, frameBounds:{...this.compassPanel.rect}, trackId:this.raceCircuitId }, instrumentsBounds:{...this.instruments.rect},
    timingRows:2, lapReadout:{text:this.lap.text,bounds:{...this.lap.rect}},
    instrumentsVisible: this.courseHeader.visible || this.speedPanel.visible || this.stats.visible,
    displaySpeed: this.speed.text, health: this.current?.health ?? 100, healthColor: healthRingColor(this.current?.health ?? 100), countdownVisible: this.countdownImage.visible, announcement: this.announcement.text, touchVisible: this.touch.visible,
    bounds: this.cards.map(card => ({ ...card.rect })), start: this.buttonRect('start-race'), buttons: Object.fromEntries([...this.buttons].map(([id, button]) => [id, { ...button.rect }])), viewport: { ...this.root.viewport } }; }
  dispose(): void { this.glass?.destroy(); this.carousel.destroy(); this.dial.destroy(); this.minimap.destroy(); this.stampSprite.destroy(); this.wheelSprite.destroy(); for (const pedal of this.pedals.values()) pedal.sprite.destroy(); for (const image of this.images) image.destroy(); this.images.length = 0; }
}
