import { BasicMaterial, Camera3D, CartesianTransform3D, Entity, HaiyueEngine, Mesh3D, World, createPlane3D } from '@haiyue/engine';
import { BitmapText } from '@haiyue/engine/components';
import { BitmapTextRenderSystem, Render3DSystem } from '@haiyue/engine/systems';
import { type ColorLike } from '@haiyue/engine/color';
import { buildSdfBitmapFont, RenderIntegration } from '@haiyue/engine/experimental';
import type { BitmapFontData } from '@haiyue/engine/font';

interface PointerPoint {
  x: number;
  y: number;
}

interface CalendarCell extends Rect {
  date: Date;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type TextAlign = 'left' | 'center' | 'right';

const WIDTH = 1024;
const HEIGHT = 1458;
const PIXELS_PER_UNIT = 100;
const HALF_WORLD_WIDTH = WIDTH / PIXELS_PER_UNIT / 2;
const HALF_WORLD_HEIGHT = HEIGHT / PIXELS_PER_UNIT / 2;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const GRID_X = 50;
const GRID_Y = 382;
const CELL_W = 132;
const CELL_H = 108;
const SWIPE_DISTANCE = 90;
const TAP_DISTANCE = 24;
const FONT_CHARACTERS = [
  ' 0123456789<>·?',
  '万年历公农节日回到今天星期左右滑动切换月份信息不可用',
  '一二三四五六七八九十初廿冬腊正闰〇',
  '甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥',
  '元旦春节宵端中秋重阳情人妇女劳动儿童教师国庆',
].join('');

const PREVIOUS_YEAR: Rect = { x: 50, y: 252, width: 156, height: 62 };
const PREVIOUS_MONTH: Rect = { x: 218, y: 252, width: 156, height: 62 };
const TODAY: Rect = { x: 386, y: 252, width: 252, height: 62 };
const NEXT_MONTH: Rect = { x: 650, y: 252, width: 156, height: 62 };
const NEXT_YEAR: Rect = { x: 818, y: 252, width: 156, height: 62 };

const COLORS = {
  background: [0.929, 0.953, 0.984, 1] as const,
  backgroundTop: [0.973, 0.984, 1, 1] as const,
  card: [1, 1, 1, 1] as const,
  cardMuted: [0.965, 0.975, 0.989, 1] as const,
  primary: [0.145, 0.388, 0.922, 1] as const,
  primarySoft: [0.576, 0.773, 0.992, 1] as const,
  ink: [0.09, 0.125, 0.2, 1] as const,
  body: [0.141, 0.196, 0.278, 1] as const,
  muted: [0.4, 0.455, 0.545, 1] as const,
  faint: [0.68, 0.72, 0.78, 1] as const,
  red: [0.88, 0.31, 0.31, 1] as const,
  white: [1, 1, 1, 1] as const,
  detail: [0.09, 0.125, 0.2, 1] as const,
} satisfies Record<string, ColorLike>;

const SOLAR_FESTIVALS = new Map([
  ['1-1', '元旦'],
  ['2-14', '情人节'],
  ['3-8', '妇女节'],
  ['5-1', '劳动节'],
  ['6-1', '儿童节'],
  ['9-10', '教师节'],
  ['10-1', '国庆节'],
]);

function sameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function contains(rect: Rect, point: PointerPoint): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function lunarDayLabel(day: number): string {
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (day <= 0 || day > 30) return '';
  if (day <= 10) return `初${digits[day] ?? ''}`;
  if (day < 20) return `十${digits[day - 10] ?? ''}`;
  if (day === 20) return '二十';
  if (day < 30) return `廿${digits[day - 20] ?? ''}`;
  return '三十';
}

/** PadOS adapter. The visible surface is produced by a child WebGPU engine. */
export class PerpetualCalendarPadApp {
  private readonly gameCanvas = document.createElement('canvas');
  private readonly statusCanvas = document.createElement('canvas');
  private game: PerpetualCalendarGpuScene | null = null;
  private disposed = false;

  constructor() {
    this.gameCanvas.width = WIDTH;
    this.gameCanvas.height = HEIGHT;
    Object.assign(this.gameCanvas.style, {
      position: 'fixed',
      left: '-20000px',
      top: '0',
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      pointerEvents: 'none',
    });
    document.body.appendChild(this.gameCanvas);
    this.statusCanvas.width = WIDTH;
    this.statusCanvas.height = HEIGHT;
    this.drawStatus('正在启动 WebGPU 万年历…');
    void this.initialize();
  }

  get canvas(): HTMLCanvasElement {
    return this.game ? this.gameCanvas : this.statusCanvas;
  }

  update(): void {}

  pointerDown(event: PointerPoint): void {
    this.game?.pointerDown(event);
  }

  pointerMove(event: PointerPoint): void {
    this.game?.pointerMove(event);
  }

  pointerUp(event: PointerPoint): void {
    this.game?.pointerUp(event);
  }

  stop(): void {
    this.disposed = true;
    this.game?.stop();
    this.game = null;
    this.gameCanvas.remove();
  }

  private async initialize(): Promise<void> {
    const game = new PerpetualCalendarGpuScene();
    try {
      await game.init(this.gameCanvas);
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (this.disposed) {
        game.stop();
        return;
      }
      this.game = game;
    } catch (error) {
      game.stop();
      this.gameCanvas.remove();
      const message = error instanceof Error ? error.message : '万年历启动失败';
      this.drawStatus(message);
      console.error('[PadOS] Failed to start the WebGPU perpetual calendar.', error);
    }
  }

  private drawStatus(message: string): void {
    const context = this.statusCanvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#edf3fb';
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = '#172033';
    context.font = '700 36px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(message, WIDTH / 2, HEIGHT / 2);
  }
}

class PerpetualCalendarGpuScene {
  private engine!: HaiyueEngine;
  private world!: World;
  private font!: BitmapFontData;
  private canvas: HTMLCanvasElement | null = null;
  private readonly today = new Date();
  private readonly lunarCache = new Map<string, { full: string; day: string; festival: string }>();
  private readonly lunarFormatter: Intl.DateTimeFormat | null;
  private readonly dynamicEntities: Entity[] = [];
  private readonly planeGeometry = new Map<string, ReturnType<typeof createPlane3D>>();
  private visibleYear = this.today.getFullYear();
  private visibleMonth = this.today.getMonth();
  private selectedDate = new Date(this.today.getFullYear(), this.today.getMonth(), this.today.getDate());
  private cells: CalendarCell[] = [];
  private pointerStart: PointerPoint | null = null;
  private renderFramesRemaining = 0;

  constructor() {
    try {
      this.lunarFormatter = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      this.lunarFormatter = null;
    }
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    this.engine = new HaiyueEngine({
      canvas,
      clearColor: { r: COLORS.background[0], g: COLORS.background[1], b: COLORS.background[2], a: 1 },
      msaaSamples: 4,
    });
    await this.engine.init();
    this.font = buildSdfBitmapFont({
      chars: FONT_CHARACTERS,
      fontSize: 56,
      fontFamily: 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
      fontWeight: '700',
      padding: 10,
      spread: 8,
      atlasSize: 1024,
    }).data;
    this.world = new World('PerpetualCalendar');
    this.setupRenderer();
    this.buildStaticScene();
    this.rebuildDynamicScene();
    this.engine.on('update', ({ detail: { time, delta } }) => {
      if (this.renderFramesRemaining <= 0) return;
      this.world.update(time, delta);
      this.renderFramesRemaining--;
    });
    this.requestRender(12);
    this.engine.run();
  }

  pointerDown(event: PointerPoint): void {
    this.pointerStart = { x: event.x, y: event.y };
  }

  pointerMove(_event: PointerPoint): void {}

  pointerUp(event: PointerPoint): void {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!start) return;
    const dx = event.x - start.x;
    const dy = event.y - start.y;
    if (Math.abs(dx) >= SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy)) {
      this.changeMonth(dx < 0 ? 1 : -1);
      return;
    }
    if (Math.hypot(dx, dy) > TAP_DISTANCE) return;
    this.handleTap(event);
  }

  stop(): void {
    this.pointerStart = null;
    this.world?.destroy();
    this.engine?.stop();
    this.canvas = null;
  }

  private setupRenderer(): void {
    const camera = new Entity('CalendarCamera');
    camera.addComponent(new Camera3D({
      type: 'orthographic',
      near: 0.1,
      far: 100,
      left: -HALF_WORLD_WIDTH,
      right: HALF_WORLD_WIDTH,
      top: HALF_WORLD_HEIGHT,
      bottom: -HALF_WORLD_HEIGHT,
    }));
    camera.addComponent(new CartesianTransform3D({ position: [0, 0, 10] }));
    this.world.addEntity(camera);

    const integration = new RenderIntegration(this.engine, { label: 'PerpetualCalendar.render' });
    this.world.addRuntimeIntegration(integration);
    const shapes = new Render3DSystem(this.engine, camera, { priority: 0, loadOp: 'clear', msaaSamples: 4 });
    const text = new BitmapTextRenderSystem(this.engine, camera, { loadOp: 'load', msaaSamples: 4 });
    text.priority = 10;
    this.world.addSystem(shapes);
    this.world.addSystem(text);
    integration.registerAll(this.world, () => ({ pass: 'shared' }));
  }

  private buildStaticScene(): void {
    this.addRect({ x: 0, y: 0, width: WIDTH, height: HEIGHT }, COLORS.background, 0);
    this.addRect({ x: 0, y: 0, width: WIDTH, height: 230 }, COLORS.backgroundTop, 0.02);
    this.addText('万年历', 54, 50, 46, COLORS.ink, 'left', false, 0.6);
    this.addText('公历 · 农历 · 节日', 54, 112, 22, COLORS.muted, 'left', false, 0.6);
    this.addControl(PREVIOUS_YEAR, '< 年');
    this.addControl(PREVIOUS_MONTH, '< 月');
    this.addControl(TODAY, '回到今天', true);
    this.addControl(NEXT_MONTH, '月 >');
    this.addControl(NEXT_YEAR, '年 >');
    for (let column = 0; column < WEEKDAYS.length; column++) {
      this.addText(
        WEEKDAYS[column] ?? '',
        GRID_X + column * CELL_W + CELL_W / 2,
        338,
        24,
        column === 0 || column === 6 ? COLORS.red : COLORS.muted,
        'center',
        false,
        0.6,
      );
    }
    this.addText('左右滑动切换月份', WIDTH / 2, 1396, 19, COLORS.faint, 'center', false, 0.6);
  }

  private rebuildDynamicScene(): void {
    for (const entity of this.dynamicEntities) this.world.removeEntity(entity);
    this.dynamicEntities.length = 0;

    this.addText(`${this.visibleYear} 年 ${this.visibleMonth + 1} 月`, WIDTH / 2, 174, 54, COLORS.ink, 'center', true, 0.7);
    this.cells = [];
    const first = new Date(this.visibleYear, this.visibleMonth, 1);
    const start = new Date(this.visibleYear, this.visibleMonth, 1 - first.getDay());
    for (let index = 0; index < 42; index++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const column = index % 7;
      const row = Math.floor(index / 7);
      const cell: CalendarCell = {
        date,
        x: GRID_X + column * CELL_W + 5,
        y: GRID_Y + row * CELL_H + 5,
        width: CELL_W - 10,
        height: CELL_H - 10,
      };
      this.cells.push(cell);
      this.addCell(cell, date.getMonth() === this.visibleMonth, column);
    }
    this.addDetailCard();
    this.requestRender();
  }

  private addControl(rect: Rect, label: string, primary = false): void {
    if (!primary) this.addRect({ x: rect.x - 2, y: rect.y - 2, width: rect.width + 4, height: rect.height + 4 }, [0.84, 0.88, 0.94, 1], 0.08);
    this.addRect(rect, primary ? COLORS.primary : COLORS.card, 0.1);
    this.addText(label, rect.x + rect.width / 2, rect.y + 18, 22, primary ? COLORS.white : COLORS.body, 'center', false, 0.6);
  }

  private addCell(cell: CalendarCell, inMonth: boolean, column: number): void {
    const selected = sameDate(cell.date, this.selectedDate);
    const isToday = sameDate(cell.date, this.today);
    if (isToday && !selected) {
      this.addRect({ x: cell.x - 3, y: cell.y - 3, width: cell.width + 6, height: cell.height + 6 }, COLORS.primary, 0.12, true);
    }
    this.addRect(cell, selected ? COLORS.primary : inMonth ? COLORS.card : COLORS.cardMuted, 0.14, true);
    const lunar = this.lunarInfo(cell.date);
    const festival = this.solarFestival(cell.date) || lunar.festival;
    const dayColor = selected ? COLORS.white
      : !inMonth ? COLORS.faint
        : column === 0 || column === 6 ? COLORS.red : COLORS.body;
    const secondaryColor = selected ? [0.78, 0.87, 1, 1] as const
      : festival ? COLORS.red : inMonth ? COLORS.muted : COLORS.faint;
    this.addText(String(cell.date.getDate()), cell.x + cell.width / 2, cell.y + 20, 31, dayColor, 'center', true, 0.7);
    this.addText(festival || lunar.day, cell.x + cell.width / 2, cell.y + 62, 17, secondaryColor, 'center', true, 0.7);
  }

  private addDetailCard(): void {
    const card = { x: 54, y: 1080, width: 916, height: 260 };
    this.addRect(card, COLORS.detail, 0.12, true);
    const date = this.selectedDate;
    const lunar = this.lunarInfo(date);
    const festival = this.solarFestival(date) || lunar.festival;
    this.addText(String(date.getDate()).padStart(2, '0'), 92, 1132, 68, COLORS.white, 'left', true, 0.7);
    this.addText(`${date.getFullYear()} 年 ${date.getMonth() + 1} 月`, 230, 1124, 28, COLORS.white, 'left', true, 0.7);
    this.addText(`星期${WEEKDAYS[date.getDay()] ?? ''}`, 230, 1170, 24, COLORS.primarySoft, 'left', true, 0.7);
    this.addText(lunar.full || '农历信息不可用', 92, 1236, 22, [0.8, 0.84, 0.89, 1], 'left', true, 0.7);
    if (festival) {
      const badgeWidth = Math.max(120, this.measureText(festival, 19) + 48);
      this.addRect({ x: 92, y: 1282, width: badgeWidth, height: 40 }, COLORS.red, 0.18, true);
      this.addText(festival, 92 + badgeWidth / 2, 1292, 19, COLORS.white, 'center', true, 0.75);
    }
  }

  private addRect(rect: Rect, color: ColorLike, z: number, dynamic = false): Entity {
    const worldWidth = rect.width / PIXELS_PER_UNIT;
    const worldHeight = rect.height / PIXELS_PER_UNIT;
    const key = `${worldWidth}:${worldHeight}`;
    let geometry = this.planeGeometry.get(key);
    if (!geometry) {
      geometry = createPlane3D({ width: worldWidth, height: worldHeight, normal: 'z' });
      this.planeGeometry.set(key, geometry);
    }
    const entity = new Entity('CalendarRect');
    entity.addComponent(new CartesianTransform3D({
      position: [this.worldX(rect.x + rect.width / 2), this.worldY(rect.y + rect.height / 2), z],
    }));
    entity.addComponent(new Mesh3D(geometry, new BasicMaterial({ color, cullMode: 'none' })));
    this.world.addEntity(entity);
    if (dynamic) this.dynamicEntities.push(entity);
    return entity;
  }

  private addText(
    value: string,
    x: number,
    y: number,
    fontSize: number,
    color: ColorLike,
    align: TextAlign,
    dynamic: boolean,
    z: number,
  ): Entity {
    const width = this.measureText(value, fontSize);
    const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
    const entity = new Entity(`CalendarText:${value}`);
    entity.addComponent(new CartesianTransform3D({ position: [this.worldX(left), this.worldY(y), z] }));
    entity.addComponent(new BitmapText(this.font, value, {
      mode: 'sdf',
      fontSize: fontSize / PIXELS_PER_UNIT,
      color,
      threshold: 0.5,
      smoothing: 0.075,
    }));
    this.world.addEntity(entity);
    if (dynamic) this.dynamicEntities.push(entity);
    return entity;
  }

  private measureText(value: string, fontSize: number): number {
    let units = 0;
    for (const char of value) units += this.font.chars.get(char.codePointAt(0) ?? 63)?.xadvance ?? this.font.size * 0.55;
    return units * fontSize / this.font.size;
  }

  private worldX(pixelX: number): number {
    return pixelX / PIXELS_PER_UNIT - HALF_WORLD_WIDTH;
  }

  private worldY(pixelY: number): number {
    return HALF_WORLD_HEIGHT - pixelY / PIXELS_PER_UNIT;
  }

  private requestRender(frames = 8): void {
    this.renderFramesRemaining = Math.max(this.renderFramesRemaining, frames);
  }

  private handleTap(point: PointerPoint): void {
    if (contains(PREVIOUS_YEAR, point)) return this.changeYear(-1);
    if (contains(PREVIOUS_MONTH, point)) return this.changeMonth(-1);
    if (contains(TODAY, point)) return this.selectToday();
    if (contains(NEXT_MONTH, point)) return this.changeMonth(1);
    if (contains(NEXT_YEAR, point)) return this.changeYear(1);
    const cell = this.cells.find(candidate => contains(candidate, point));
    if (!cell) return;
    this.selectedDate = new Date(cell.date);
    this.visibleYear = cell.date.getFullYear();
    this.visibleMonth = cell.date.getMonth();
    this.rebuildDynamicScene();
  }

  private changeMonth(offset: number): void {
    const target = new Date(this.visibleYear, this.visibleMonth + offset, 1);
    this.visibleYear = target.getFullYear();
    this.visibleMonth = target.getMonth();
    const day = Math.min(this.selectedDate.getDate(), daysInMonth(this.visibleYear, this.visibleMonth));
    this.selectedDate = new Date(this.visibleYear, this.visibleMonth, day);
    this.rebuildDynamicScene();
  }

  private changeYear(offset: number): void {
    this.visibleYear += offset;
    const day = Math.min(this.selectedDate.getDate(), daysInMonth(this.visibleYear, this.visibleMonth));
    this.selectedDate = new Date(this.visibleYear, this.visibleMonth, day);
    this.rebuildDynamicScene();
  }

  private selectToday(): void {
    const now = new Date();
    this.today.setTime(now.getTime());
    this.visibleYear = now.getFullYear();
    this.visibleMonth = now.getMonth();
    this.selectedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    this.rebuildDynamicScene();
  }

  private solarFestival(date: Date): string {
    return SOLAR_FESTIVALS.get(`${date.getMonth() + 1}-${date.getDate()}`) ?? '';
  }

  private lunarInfo(date: Date): { full: string; day: string; festival: string } {
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const cached = this.lunarCache.get(key);
    if (cached) return cached;
    if (!this.lunarFormatter) return { full: '', day: '', festival: '' };
    try {
      const parts = this.lunarFormatter.formatToParts(date) as Array<{ type: string; value: string }>;
      const relatedYear = parts.find(part => part.type === 'relatedYear')?.value ?? '';
      const yearName = parts.find(part => part.type === 'yearName')?.value ?? '';
      const month = parts.find(part => part.type === 'month')?.value ?? '';
      const rawDay = parts.find(part => part.type === 'day')?.value ?? '';
      const lunarDay = Number.parseInt(rawDay, 10);
      const day = lunarDayLabel(lunarDay) || rawDay;
      const full = [relatedYear, yearName ? `${yearName}年` : '', `${month}${day}`].filter(Boolean).join(' ');
      const regularMonth = month.startsWith('闰') ? '' : month;
      const festival = regularMonth === '正月' && lunarDay === 1 ? '春节'
        : regularMonth === '正月' && lunarDay === 15 ? '元宵节'
          : regularMonth === '五月' && lunarDay === 5 ? '端午节'
            : regularMonth === '八月' && lunarDay === 15 ? '中秋节'
              : regularMonth === '九月' && lunarDay === 9 ? '重阳节'
                : '';
      const result = { full, day, festival };
      this.lunarCache.set(key, result);
      return result;
    } catch {
      return { full: '', day: '', festival: '' };
    }
  }
}
