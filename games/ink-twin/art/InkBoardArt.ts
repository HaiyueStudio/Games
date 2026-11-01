import { twin, type GameState } from '../rules/model';

interface FontMetrics { common: { scaleW: number; scaleH: number }; chars: { id: number; x: number; y: number; width: number; height: number }[] }
export interface Point { x: number; y: number }
const noise = (seed: number): number => { const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function surface(width: number, height = width): HTMLCanvasElement {
  const result = document.createElement('canvas'); result.width = width; result.height = height; return result;
}
async function loadImage(url: string): Promise<HTMLImageElement> { const image = new Image(); image.src = url; await image.decode(); return image; }

/** Product-specific board painting. Glyphs are sampled exclusively from the generated bitmap atlas. */
export class InkBoardArt {
  private readonly black: HTMLCanvasElement;
  private readonly white: HTMLCanvasElement;
  bitmapDraws = 0;
  private constructor(readonly paper: HTMLImageElement, digits: HTMLImageElement, private readonly font: FontMetrics) {
    const tint = (color: string): HTMLCanvasElement => {
      const target = surface(digits.naturalWidth, digits.naturalHeight), context = target.getContext('2d')!;
      context.drawImage(digits, 0, 0); context.globalCompositeOperation = 'source-in'; context.fillStyle = color; context.fillRect(0, 0, target.width, target.height); return target;
    };
    this.black = tint('#181c19'); this.white = tint('#fffdf4');
  }
  static async load(): Promise<InkBoardArt> {
    const [paper, digits, font] = await Promise.all([loadImage('./assets/xuan-paper.png'), loadImage('./assets/brush-digits.png'), fetch('./assets/brush-digits.fnt.json').then(async response => { if (!response.ok) throw Error('水墨数字字体未能加载'); return await response.json() as FontMetrics; })]);
    if (digits.naturalWidth !== font.common.scaleW || digits.naturalHeight !== font.common.scaleH) throw Error('水墨字体图集与字形坐标不匹配');
    return new InkBoardArt(paper, digits, font);
  }
  point(cell: number, size: number, width: number): Point { const step = width / size; return { x: (cell % size + .5) * step, y: (Math.floor(cell / size) + .5) * step }; }

  draw(canvas: HTMLCanvasElement, state: GameState, active: 'black' | 'white'): void {
    const context = canvas.getContext('2d')!, width = canvas.width, size = state.puzzle.size, step = width / size;
    context.clearRect(0, 0, width, width); context.drawImage(this.paper, 0, 0, width, width);
    context.fillStyle = '#424a3d13'; context.fillRect(0, 0, width, width);
    this.grid(context, size, width);
    const black = state.path.map(cell => this.point(cell, size, width)), white = state.path.map(cell => this.point(twin(cell, size), size, width));
    this.stroke(context, black, step, false); this.stroke(context, white, step, true);
    for (const clue of state.puzzle.clues) for (const isWhite of [false, true]) {
      const cell = isWhite ? twin(clue.cell, size) : clue.cell, point = this.point(cell, size, width);
      const visited = state.path.includes(clue.cell);
      if (visited) {
        context.save(); context.beginPath(); context.arc(point.x, point.y, step * .27, 0, Math.PI * 2); context.clip();
        context.globalAlpha = .97; context.drawImage(this.paper, 0, 0, width, width); context.fillStyle = '#424a3d13'; context.fillRect(0, 0, width, width); context.restore();
      }
      this.digit(context, clue.number, point.x, point.y, step * .57, isWhite);
      if (clue.number === 1 && state.path.length === 1) {
        context.save(); context.strokeStyle = isWhite ? '#fffdf483' : '#292e2883'; context.lineWidth = step * .012;
        context.setLineDash([step * .035, step * .07]); context.beginPath(); context.arc(point.x, point.y, step * .35, 0, Math.PI * 2); context.stroke(); context.restore();
      }
    }
    if (state.path.length > 1 && !state.won) {
      const tip = (active === 'white' ? white : black).at(-1)!;
      context.strokeStyle = active === 'white' ? '#fffdf4a0' : '#232c22a0'; context.lineWidth = step * .014;
      context.beginPath(); context.arc(tip.x, tip.y, step * .23, 0, Math.PI * 2); context.stroke();
    }
  }
  private grid(context: CanvasRenderingContext2D, size: number, width: number): void {
    const step = width / size;
    context.lineWidth = Math.max(1, width / 1500); context.strokeStyle = '#30392e33';
    for (let line = 1; line < size; line++) {
      for (const horizontal of [false, true]) {
        context.beginPath();
        for (let i = 0; i <= 36; i++) {
          const t = width * i / 36, v = line * step + (noise(i * 7 + line * 31) - .5) * width * .0009;
          const x = horizontal ? t : v, y = horizontal ? v : t;
          if (!i) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.stroke();
      }
    }
    context.fillStyle = '#323c2c38';
    for (let y = 1; y < size; y++) for (let x = 1; x < size; x++) { context.beginPath(); context.arc(x * step, y * step, width / 1000, 0, Math.PI * 2); context.fill(); }
  }
  private stroke(context: CanvasRenderingContext2D, points: Point[], step: number, white: boolean): void {
    if (points.length < 2) return;
    const color = white ? '255,253,243' : '23,30,24';
    context.save(); context.lineCap = 'round'; context.lineJoin = 'round';
    // Diluted bleed surrounds a dense core; individual bristles keep the path tactile.
    for (const [thickness, alpha] of [[.34,.035],[.3,.065],[.265,.1]] as const) {
      context.strokeStyle = `rgba(${color},${alpha})`; context.lineWidth = step * thickness;
      context.beginPath(); points.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y)); context.stroke();
    }
    for (let segment = 1; segment < points.length; segment++) {
      const a = points[segment - 1]!, b = points[segment]!, dx = b.x - a.x, dy = b.y - a.y, nx = -dy / step, ny = dx / step;
      context.fillStyle = `rgba(${color},.9)`; context.beginPath();
      for (const side of [-1, 1]) for (let sample = 0; sample <= 20; sample++) {
        const t = side === -1 ? sample / 20 : 1 - sample / 20;
        const radius = step * (.103 + (noise(segment * 417 + sample * 33 + side * 79) - .5) * .027);
        const x = a.x + dx * t + nx * radius * side, y = a.y + dy * t + ny * radius * side;
        if (side === -1 && !sample) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.closePath(); context.fill();
      for (const point of [a, b]) {
        context.beginPath();
        for (let sample = 0; sample <= 24; sample++) {
          const angle = sample / 24 * Math.PI * 2, radius = step * (.1 + noise(segment * 59 + sample * 71) * .013);
          const x = point.x + Math.cos(angle) * radius, y = point.y + Math.sin(angle) * radius;
          if (!sample) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.fill();
      }
      for (let strand = 0; strand < 17; strand++) {
        const offset = (strand / 16 - .5) * step * .24, seed = segment * 991 + strand * 73;
        context.strokeStyle = `rgba(${color},${.16 + noise(seed) * .38})`; context.lineWidth = step * (.003 + noise(seed + 1) * .012);
        context.beginPath();
        const start = noise(seed + 2) * .15, end = .8 + noise(seed + 3) * .2;
        for (let j = 0; j <= 6; j++) {
          const t = start + (end - start) * j / 6, drift = (noise(seed + j * 19) - .5) * step * .022;
          const x = a.x + dx * t + nx * (offset + drift), y = a.y + dy * t + ny * (offset + drift);
          if (!j) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.stroke();
      }
      // Small islands of paper show through like a brush running dry.
      for (let fleck = 0; fleck < 7; fleck++) {
        const t = noise(segment * 97 + fleck * 29), offset = (noise(segment * 131 + fleck * 53) - .5) * step * .16;
        context.fillStyle = white ? '#a7a99e32' : '#a7a99e49'; context.beginPath();
        context.ellipse(a.x + dx * t + nx * offset, a.y + dy * t + ny * offset, step * .018, step * .004, Math.atan2(dy, dx), 0, Math.PI * 2); context.fill();
      }
    }
    context.restore();
  }
  private digit(context: CanvasRenderingContext2D, number: number, x: number, y: number, height: number, white: boolean): void {
    const glyph = this.font.chars.find(char => char.id === 48 + number); if (!glyph) throw Error(`缺少数字字形 ${number}`);
    const width = height * glyph.width / glyph.height;
    context.drawImage(white ? this.white : this.black, glyph.x, glyph.y, glyph.width, glyph.height, x - width / 2, y - height / 2, width, height); this.bitmapDraws++;
  }
}
