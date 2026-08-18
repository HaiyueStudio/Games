import { SudokuGame } from '../../sudoku/main';

interface PointerPoint {
  x: number;
  y: number;
}

const WIDTH = 900;
const HEIGHT = 600;
const TAP_DISTANCE = 24;

export class SudokuPadGame {
  private readonly gameCanvas = document.createElement('canvas');
  private readonly statusCanvas = document.createElement('canvas');
  private game: SudokuGame | null = null;
  private pointerStart: PointerPoint | null = null;
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
    this.drawStatus('Loading Sudoku…');
    void this.initialize();
  }

  get canvas(): HTMLCanvasElement {
    return this.game ? this.gameCanvas : this.statusCanvas;
  }

  update(): void {}

  pointerDown(event: PointerPoint): void {
    this.pointerStart = { x: event.x, y: event.y };
  }

  pointerMove(): void {}

  pointerUp(event: PointerPoint): void {
    const start = this.pointerStart;
    this.pointerStart = null;
    if (!start || Math.hypot(event.x - start.x, event.y - start.y) > TAP_DISTANCE) return;
    this.game?.clickAt(event.x, event.y);
  }

  stop(): void {
    this.disposed = true;
    this.pointerStart = null;
    this.game?.stop();
    this.game = null;
    this.gameCanvas.remove();
  }

  private async initialize(): Promise<void> {
    const game = new SudokuGame({ difficulty: 'normal' });
    try {
      await game.init(this.gameCanvas);
      // The WebGPU canvas is not a valid CanvasImageSource until its first submitted frame.
      // Keep the loading surface visible for one RAF so PadOS never samples an uninitialized image.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (this.disposed) {
        game.stop();
        return;
      }
      this.game = game;
    } catch (error) {
      game.stop();
      this.gameCanvas.remove();
      this.drawStatus(error instanceof Error ? error.message : 'Sudoku failed to start');
      console.error('[PadOS] Failed to start Sudoku.', error);
    }
  }

  private drawStatus(message: string): void {
    const ctx = this.statusCanvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#f3efe7';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#243447';
    ctx.font = '700 32px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, WIDTH / 2, HEIGHT / 2);
  }
}
