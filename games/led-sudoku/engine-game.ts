import { HaiyueEngine } from '@haiyue/engine';
import { SudokuGui, type GuiTextures } from './engine-gui';
import { SudokuController } from './gui-controller';
import { GeneratorClient } from './generator-client';
import { SingleSlotGameSave } from '../save/SingleSlotGameSave';
import { preferences } from './preferences';
import { DEFAULT_OPTIONS, isSaveData, type SaveData } from './rules';
import { RULE_KEYS } from './i18n';
import { selectRule } from './extra-rules';
import { boardWidth } from './topology';
class WebTextures implements GuiTextures {
  private entries = new Map<string, GPUTexture>();
  constructor(private device: GPUDevice) {}
  createCanvas2D = (w: number, h: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return canvas;
  };
  textureFromCanvas = (canvas: HTMLCanvasElement, key: string) => {
    let texture = this.entries.get(key);
    if (!texture) {
      texture = this.device.createTexture({
        size: [canvas.width, canvas.height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.entries.set(key, texture);
    }
    this.device.queue.copyExternalImageToTexture({ source: canvas }, { texture }, [
      canvas.width,
      canvas.height,
    ]);
    return texture;
  };
  async saveImage(canvas: HTMLCanvasElement, filename: string) {
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('PNG encoding failed')), 'image/png'));
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'download' as const;
  }
  async icon(name: string) {
    const image = new Image();
    image.src = `./icons/${name}.png`;
    await image.decode();
    const canvas = this.createCanvas2D(96, 96);
    canvas.getContext('2d')!.drawImage(image, 0, 0, 96, 96);
    return this.textureFromCanvas(canvas, `icon-${name}`);
  }
  dispose() {
    for (const t of this.entries.values()) t.destroy();
    this.entries.clear();
  }
}
export class EngineSudokuGame {
  private engine: HaiyueEngine | null = null;
  private gui: SudokuGui | null = null;
  private controller: SudokuController | null = null;
  private generator = new GeneratorClient();
  private saves = new SingleSlotGameSave<SaveData>({
    gameId: 'led-sudoku',
    name: '流光数独自动存档',
    validateData: isSaveData,
  });
  private abort = new AbortController();
  private observer: ResizeObserver | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopped = false;
  private lastTick = performance.now();
  async init() {
    const canvas = document.querySelector<HTMLCanvasElement>('#board')!;
    let prefs = preferences({}, navigator.language);
    try {
      prefs = preferences(
        JSON.parse(localStorage.getItem('led-sudoku-gui-preferences') ?? 'null'),
        navigator.language,
      );
      const old = localStorage.getItem('led-sudoku-theme');
      if (!localStorage.getItem('led-sudoku-gui-preferences')) {
        if (old) prefs.theme = old === 'light-blue' ? 'light-blue' : 'dark';
        prefs.manualCandidates = localStorage.getItem('led-sudoku-manual-candidates') === 'true';
      }
    } catch {}
    const engine = (this.engine = new HaiyueEngine({
      canvas,
      msaaSamples: 4,
      devicePixelRatio: () => Math.min(devicePixelRatio, 2),
    }));
    await engine.init();
    if (this.stopped) {
      engine.destroy();
      return;
    }
    const c = (this.controller = new SudokuController(
      {
        statistics: {
          read: () => JSON.parse(localStorage.getItem('led-sudoku-statistics') ?? 'null'),
          write: value => localStorage.setItem('led-sudoku-statistics', JSON.stringify(value)),
        },
        generate: (o, s) => this.generator.generate(o, s),
        save: (s) => {
          void this.saves.save(s);
        },
        preferences: (p) => localStorage.setItem('led-sudoku-gui-preferences', JSON.stringify(p)),
        changed: () => {
          this.gui?.update();
          canvas.setAttribute(
            'aria-label',
            `${c.text('title')} · ${c.page} · ${c.session.selected >= 0 ? c.text('cell', { r: Math.floor(c.session.selected / boardWidth(c.session.state!.puzzle)) + 1, c: (c.session.selected % boardWidth(c.session.state!.puzzle)) + 1 }) : ''}`,
          );
        },
      },
      prefs,
    ));
    this.gui = new SudokuGui(engine, c, new WebTextures(engine.device), () => {});
    await this.gui.load();
    engine.run();
    this.observer = new ResizeObserver(() => {
      engine.resizeToDisplaySize();
      this.gui?.update(false);
    });
    this.observer.observe(canvas);
    engine.resizeToDisplaySize();
    canvas.addEventListener(
      'keydown',
      (e) => {
        if (c.page !== 'game' || c.lesson >= 0) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          c.undo();
          return;
        }
        if (/^[1-9]$/.test(e.key)) c.input(Number(e.key));
        else if (e.key === 'Backspace' || e.key === 'Delete') c.input(0);
        else if (e.key.toLowerCase() === 'n') {
          c.session.pencil = !c.session.pencil;
          c.changed();
        } else if (e.key.startsWith('Arrow') && c.session.state) {
          e.preventDefault();
          const p = c.session.state.puzzle,
            w = boardWidth(p),
            delta = e.key === 'ArrowUp' ? -w : e.key === 'ArrowDown' ? w : e.key === 'ArrowLeft' ? -1 : 1,
            len = c.session.state.board.length;
          let i = c.session.selected;
          for (let n = 0; n < len; n++) {
            i = (i + delta + len) % len;
            if (!p.blocked[i]) break;
          }
          c.session.select(i);
          c.changed();
        }
      },
      { signal: this.abort.signal },
    );
    const query = new URLSearchParams(location.search);
    let options = { ...DEFAULT_OPTIONS };
    for (const key of RULE_KEYS) {
      if (query.get(key) === '1') options = selectRule(options, key, true).options;
      if (query.get(key) === '0') options[key] = false;
    }
    if (['easy', 'normal', 'hard'].includes(query.get('difficulty') ?? ''))
      options.difficulty = query.get('difficulty') as typeof options.difficulty;
    const saved = query.has('seed') ? null : await this.saves.load();
    if (saved) c.restore(saved);
    else await c.newGame(options, query.has('seed') ? Number(query.get('seed')) : undefined);
    document.querySelector('#boot')?.remove();
    this.timer = setInterval(() => {
      const now = performance.now();
      if (!document.hidden) {
        c.tick((now - this.lastTick) / 1000);
        this.gui?.updateClock();
      }
      this.lastTick = now;
    }, 1000);
    document.addEventListener(
      'visibilitychange',
      () => {
        this.gui?.cancel();
        c.commit();
        this.lastTick = performance.now();
      },
      { signal: this.abort.signal },
    );
    window.addEventListener(
      'pagehide',
      () => {
        c.commit();
        void this.saves.flush();
      },
      { signal: this.abort.signal },
    );
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.abort.abort();
    this.observer?.disconnect();
    this.controller?.dispose();
    this.generator.dispose();
    this.gui?.dispose();
    this.engine?.destroy();
  }
}
