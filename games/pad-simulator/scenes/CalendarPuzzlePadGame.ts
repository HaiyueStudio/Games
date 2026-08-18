import { CalendarPuzzleGame } from '../../calendar-puzzle/main';

interface PadPointerEvent {
  x: number;
  y: number;
  button?: number;
  buttons?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

const WIDTH = 1200;
const HEIGHT = 720;
const POINTER_ID = 1;

export class CalendarPuzzlePadGame {
  private readonly gameCanvas = document.createElement('canvas');
  private readonly statusCanvas = document.createElement('canvas');
  private game: CalendarPuzzleGame | null = null;
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
    this.drawStatus('Loading Calendar Puzzle…');
    void this.initialize();
  }

  get canvas(): HTMLCanvasElement {
    return this.game ? this.gameCanvas : this.statusCanvas;
  }

  update(): void {}

  pointerDown(event: PadPointerEvent): void {
    this.dispatchPointer('pointerdown', event);
  }

  pointerMove(event: PadPointerEvent): void {
    this.dispatchPointer('pointermove', event);
  }

  pointerUp(event: PadPointerEvent): void {
    this.dispatchPointer('pointerup', event);
  }

  stop(): void {
    this.disposed = true;
    this.game?.stop();
    this.game = null;
    this.gameCanvas.remove();
  }

  private async initialize(): Promise<void> {
    const game = new CalendarPuzzleGame();
    try {
      await game.init(this.gameCanvas);
      // Wait until the child engine has submitted its first frame before PadOS
      // starts sampling this WebGPU canvas as a CanvasImageSource.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      if (this.disposed) {
        game.stop();
        return;
      }
      this.game = game;
    } catch (error) {
      game.stop();
      this.gameCanvas.remove();
      this.drawStatus(error instanceof Error ? error.message : 'Calendar Puzzle failed to start');
      console.error('[PadOS] Failed to start Calendar Puzzle.', error);
    }
  }

  private dispatchPointer(type: 'pointerdown' | 'pointermove' | 'pointerup', event: PadPointerEvent): void {
    if (!this.game) return;
    const rect = this.gameCanvas.getBoundingClientRect();
    this.gameCanvas.dispatchEvent(new PointerEvent(type, {
      pointerId: POINTER_ID,
      pointerType: 'touch',
      isPrimary: true,
      clientX: rect.left + event.x,
      clientY: rect.top + event.y,
      button: event.button ?? 0,
      buttons: event.buttons ?? (type === 'pointerup' ? 0 : 1),
      ctrlKey: event.ctrlKey ?? false,
      metaKey: event.metaKey ?? false,
      bubbles: true,
      cancelable: true,
    }));
  }

  private drawStatus(message: string): void {
    const ctx = this.statusCanvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#eef6f1';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#22313a';
    ctx.font = '700 36px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, WIDTH / 2, HEIGHT / 2);
  }
}
