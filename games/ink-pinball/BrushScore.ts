import { parseFntJson, type BitmapFontData } from '@haiyue/engine/font';

/** Generated BMFont atlas rendered only when digits change, never once per game frame. */
export class BrushScore {
  private font!: BitmapFontData;
  private readonly atlas = new Image();
  private readonly displays = new Map<HTMLElement, { canvas: HTMLCanvasElement; value: string }>();
  async init(): Promise<void> {
    this.atlas.src = './assets/brush-digits.png';
    const [json] = await Promise.all([fetch('./assets/brush-digits.fnt.json').then(response => {
      if (!response.ok) throw new Error('Brush score font could not load'); return response.json();
    }), this.atlas.decode()]);
    this.font = parseFntJson(json);
  }
  set(element: HTMLElement, score: number): void {
    const value = String(score).padStart(6, '0');
    let display = this.displays.get(element);
    if (!display) {
      const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
      element.replaceChildren(canvas); display = { canvas, value: '' }; this.displays.set(element, display);
    }
    if (display.value === value) return;
    display.value = value;
    element.dataset.value = value; element.setAttribute('role', 'img'); element.setAttribute('aria-label', `${score} 分`);
    const height = element.id === 'score' ? 48 : 17;
    const advance = height * .68, dpr = Math.min(devicePixelRatio || 1, 2), canvas = display.canvas;
    canvas.width = Math.ceil(advance * value.length * dpr); canvas.height = Math.ceil(height * dpr);
    canvas.style.aspectRatio = `${advance * value.length} / ${height}`;
    const ctx = canvas.getContext('2d')!; ctx.scale(dpr, dpr);
    for (let i = 0; i < value.length; i++) {
      const glyph = this.font.chars.get(value.charCodeAt(i))!;
      ctx.drawImage(this.atlas, glyph.x, glyph.y, glyph.width, glyph.height, i * advance, 0, advance, height);
    }
  }
}
