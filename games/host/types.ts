export interface GameProgress { phase: 'code' | 'resources' | 'initializing' | 'ready' | 'error'; completed: number; total: number; loaded: number; bytes: number; message: string }
export interface HostedEngine {
  readonly canvas: HTMLCanvasElement | null;
  readonly state: string;
  readonly runningForHost: boolean;
  readonly device: GPUDevice;
  readonly adapter: GPUAdapter | null;
  readonly format: GPUTextureFormat;
  readonly screenTexture?: GPUTexture | null;
  resizeToDisplaySize?(force?: boolean): boolean;
  run(): unknown;
  stop(): unknown;
  destroy(): void;
  pauseForHost?(): void;
  resumeForHost?(): void;
}
export interface GameHostOptions {
  root: HTMLElement;
  url?: string;
  standalone?: boolean;
  mode?: 'screen' | 'texture';
  width?: number;
  height?: number;
  volume?: { readonly level: number; subscribe(listener: (level: number) => void): () => void };
  signal?: AbortSignal;
  onProgress?: (progress: GameProgress) => void;
  onHome?: () => void;
  onSwitch?: (direction: number) => void;
}
export interface GameBridge {
  readonly signal: AbortSignal;
  readonly mode: 'screen' | 'texture';
  own(dispose: () => void): void;
  engine(engine: HostedEngine): void;
  ready(): void;
  home(): void;
  switch(direction: number): void;
}
export interface MountedGame {
  readonly signal: AbortSignal;
  readonly id: string;
  readonly ready: Promise<void>;
  readonly canvas: HTMLCanvasElement | null;
  readonly engine: HostedEngine | null;
  readonly texture: GPUTexture | null;
  readonly layers: readonly HTMLCanvasElement[];
  readonly viewport: { x: number; y: number; width: number; height: number };
  readonly debug: Record<string, unknown>;
  readonly disposed: boolean;
  readonly audio: { level: number; contexts: number; gains: number[] };
  setVolume(level: number): void;
  presentFrame(): HTMLCanvasElement | null;
  resize(width: number, height: number): void;
  pause(): void;
  resume(): void;
  dispose(): void;
  pointer(type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', x: number, y: number, id?: number): void;
  key(code: string, down: boolean): void;
  wheel(x: number, y: number, deltaX: number, deltaY: number): void;
}
export interface GameModule { mountGame(options: GameHostOptions): Promise<MountedGame> }
export interface GameEnvironment {
  window: Window & typeof globalThis;
  document: Document;
  location: Location;
  navigator: Navigator;
  fetch: typeof fetch;
  requestAnimationFrame: typeof requestAnimationFrame;
  cancelAnimationFrame: typeof cancelAnimationFrame;
  setTimeout: typeof window.setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof window.setInterval;
  clearInterval: typeof clearInterval;
  ResizeObserver: typeof ResizeObserver;
  MutationObserver: typeof MutationObserver;
  Worker: typeof Worker;
  Image: typeof Image;
  AudioContext: typeof AudioContext;
  Event: typeof Event;
  KeyboardEvent: typeof KeyboardEvent;
  PointerEvent: typeof PointerEvent;
  MouseEvent: typeof MouseEvent;
  WheelEvent: typeof WheelEvent;
  matchMedia: typeof matchMedia;
  console: Console;
  trackBoot(value: unknown): unknown;
  onViewportChange(callback: () => void): void;
}
