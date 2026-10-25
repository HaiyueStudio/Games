import type { GameBridge, GameEnvironment, GameHostOptions, GameProgress, HostedEngine } from './types';
import { deviceMediaMatches } from './styles';
import { isGameCancellation } from './cancellation';
import { canPresentGame } from './readiness';
import { resizeGameViewport } from './viewport';
import { GameAudio } from './GameAudio';

export class GameScope {
  readonly controller = new AbortController();
  readonly debug: Record<string, unknown> = {};
  readonly cleanups: (() => void)[] = [];
  readonly bridge: GameBridge;
  readonly environment: GameEnvironment;
  readonly ready: Promise<void>;
  readonly audio = new GameAudio();
  engine: HostedEngine | null = null;
  disposed = false;
  private readonly frames = new Set<number>();
  private readonly timers = new Set<number>();
  private readonly intervals = new Set<number>();
  private readonly pageHide = new Set<EventListenerOrEventListenerObject>();
  private readonly viewport = new Set<() => void>();
  private readonly resizeListeners = new Set<EventListenerOrEventListenerObject>();
  private readonly dispatched = new WeakSet<Event>();
  private completed = 0;
  private total = 0;
  private loaded = 0;
  private bytes = 0;
  private started = false;
  private boots = 0;
  private settled = false;
  private resolveReady!: () => void;
  private rejectReady!: (reason: unknown) => void;
  constructor(readonly options: GameHostOptions, readonly body: HTMLElement, readonly tree: Document | ShadowRoot, readonly moduleUrl: string, readonly pageUrl: string) {
    this.audio.setVolume(options.volume?.level ?? 1); this.own(() => this.audio.destroy());
    if (options.volume) this.own(options.volume.subscribe(level => this.audio.setVolume(level)));
    this.ready = new Promise((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    void this.ready.catch(() => {});
    this.bridge = { signal: this.controller.signal, mode: options.mode ?? 'screen', own: cleanup => this.own(cleanup), engine: engine => { this.engine = engine; this.own(() => engine.destroy()); },
      ready: () => { this.started = true; this.checkReady(); }, home: () => queueMicrotask(() => {
        if (options.onHome) options.onHome();
        else if (options.standalone) {
          if (window.parent !== window) window.parent.postMessage({ type: 'haiyue-gamepad-home' }, location.origin);
          else location.assign(new URL('../../index.html', this.pageUrl).href);
        }
      }), switch: direction => queueMicrotask(() => {
        if (options.onSwitch) options.onSwitch(direction);
        else if (options.standalone && window.parent !== window) window.parent.postMessage({ type: 'haiyue-gamepad-' + (direction > 0 ? 'next' : 'previous') }, location.origin);
      }) };
    this.environment = this.createEnvironment();
    const resize = new ResizeObserver(() => this.resize()); resize.observe(options.root); this.own(() => resize.disconnect()); this.resize();
    const failure = new MutationObserver(() => {
      if (![body.dataset.renderStatus, body.dataset.gameStatus].some(status => status === 'failed' || status === 'error')) { this.checkReady(); return; }
      let detail: string;
      try { const report = JSON.parse(body.querySelector('#result')?.textContent ?? '{}'); detail = report.errors?.join('\n') || report.message || ''; } catch { detail = ''; }
      this.fail(new Error(body.dataset.renderError || body.dataset.gameError || detail || body.querySelector('[role="alert"],#status,#load-status,#boot')?.textContent || 'Game initialization failed.'));
    });
    failure.observe(body, { attributes: true, attributeFilter: ['data-render-status', 'data-render-error', 'data-game-status', 'data-game-error'] }); this.own(() => failure.disconnect());
    options.signal?.addEventListener('abort', () => this.dispose(), { once: true, signal: this.controller.signal });
    if (options.signal?.aborted) this.dispose();
    window.addEventListener('pagehide', event => { if (!event.persisted) this.dispose(); else { this.engine?.pauseForHost?.(); for (const listener of this.pageHide) this.invoke(listener, event); } }, { signal: this.controller.signal });
    window.addEventListener('pageshow', event => { if (event.persisted) this.engine?.resumeForHost?.(); }, { signal: this.controller.signal });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.engine?.pauseForHost?.(); else this.engine?.resumeForHost?.(); }, { signal: this.controller.signal });
    const watchdog = window.setTimeout(() => this.fail(new Error('游戏初始化超时，请重试或检查网络连接。')), 120000); this.own(() => window.clearTimeout(watchdog));
  }
  own(cleanup: () => void): void { if (this.disposed) cleanup(); else this.cleanups.push(cleanup); }
  progress(phase: GameProgress['phase'], message: string): void { this.options.onProgress?.({ phase, message, completed: this.completed, total: this.total, loaded: this.loaded, bytes: this.bytes }); }
  fail(error: unknown): void { if (!this.disposed && !this.settled) { this.settled = true; this.rejectReady(error); } }
  setSize(width: number, height: number): void {
    if (this.disposed || !resizeGameViewport(this.options, width, height)) return;
    this.resize(); this.engine?.resizeToDisplaySize?.();
  }
  private checkReady(): void {
    if (this.disposed || this.settled || !canPresentGame(this.engine, this.started, this.boots, this.total - this.completed, [this.body.dataset.renderStatus, this.body.dataset.gameStatus])) return;
    this.environment.requestAnimationFrame(() => {
      if (this.disposed || this.settled || !canPresentGame(this.engine, this.started, this.boots, this.total - this.completed, [this.body.dataset.renderStatus, this.body.dataset.gameStatus])) return;
      this.settled = true; this.progress('ready', '准备就绪'); this.resolveReady();
    });
  }
  private resize(): void {
    if (this.disposed) return;
    const width = this.options.width ?? (this.options.root.clientWidth || innerWidth);
    const height = this.options.height ?? (this.options.root.clientHeight || innerHeight);
    this.body.style.setProperty('--game-width', `${width}px`); this.body.style.setProperty('--game-height', `${height}px`);
    for (const callback of this.viewport) callback();
    for (const listener of this.resizeListeners) this.invoke(listener, new Event('resize'));
  }
  private invoke(listener: EventListenerOrEventListenerObject, event: Event): void {
    if (typeof listener === 'function') listener.call(this.environment.window, event); else listener.handleEvent(event);
  }
  private createEnvironment(scope: GameScope = this): GameEnvironment {
    const realWindow = window, realDocument = document, page = new URL(this.pageUrl);
    let title = realDocument.title;
    const listeners = new Map<EventListenerOrEventListenerObject, Map<string, EventListener>>();
    const bind = (target: object, property: PropertyKey) => { const value = Reflect.get(target, property, target); return typeof value === 'function' && !/^[A-Z]/.test(String(property)) ? value.bind(target) : value; };
    const listen = (target: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, settings?: boolean | AddEventListenerOptions) => {
      if (!listener || scope.disposed) return;
      if (target === realWindow && type === 'pagehide') { scope.pageHide.add(listener); return; }
      if (target === realWindow && type === 'resize') { scope.resizeListeners.add(listener); return; }
      const config = typeof settings === 'boolean' ? { capture: settings } : settings ?? {};
      const signal = config.signal ? AbortSignal.any([config.signal, scope.controller.signal]) : scope.controller.signal;
      const key = `${target === realWindow ? 'window' : 'document'}:${type}:${!!config.capture}`;
      let entries = listeners.get(listener); if (!entries) { entries = new Map(); listeners.set(listener, entries); }
      if (entries.has(key)) return;
      const wrapped: EventListener = event => {
        if (!scope.options.standalone && /^(?:pointer|mouse|touch|click|wheel|contextmenu|key)/.test(type) && !scope.dispatched.has(event) && !event.composedPath().includes(scope.body)) return;
        scope.invoke(listener, event);
      };
      entries.set(key, wrapped); target.addEventListener(type, wrapped, { ...config, signal });
    };
    const remove = (target: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, settings?: boolean | EventListenerOptions) => {
      if (!listener) return; scope.pageHide.delete(listener); scope.resizeListeners.delete(listener);
      const key = `${target === realWindow ? 'window' : 'document'}:${type}:${typeof settings === 'boolean' ? settings : !!settings?.capture}`;
      const entries = listeners.get(listener), wrapped = entries?.get(key); if (wrapped) { target.removeEventListener(type, wrapped, settings); entries!.delete(key); }
    };
    const fakeScript = realDocument.createElement('script'); fakeScript.src = this.moduleUrl;
    const locationProxy = new Proxy(page, { get(target, property) {
      if (property === 'assign' || property === 'replace') return (url: string) => { const destination = new URL(url, page); if (destination.pathname.endsWith('/index.html') && !destination.pathname.includes('/games/')) scope.options.onHome?.(); else realWindow.location.assign(destination.href); };
      if (property === 'reload') return () => realWindow.location.reload();
      return bind(target, property);
    } }) as unknown as Location;
    const documentProxy = new Proxy(realDocument, { get(target, property) {
      if (property === 'title') return title;
      if (property === 'body' || property === 'documentElement') return scope.body;
      if (property === 'baseURI' || property === 'URL' || property === 'documentURI') return scope.pageUrl;
      if (property === 'currentScript') return fakeScript;
      if (property === 'defaultView') return windowProxy;
      if (property === 'activeElement') return scope.options.mode === 'texture' ? scope.engine?.canvas ?? scope.body : scope.tree.activeElement ?? scope.body;
      if (property === 'getElementById') return (id: string) => scope.tree.querySelector(`[id="${CSS.escape(id)}"]`);
      if (property === 'elementFromPoint' && scope.options.mode === 'texture') return () => scope.engine?.canvas ?? scope.body.querySelector('canvas');
      if (property === 'elementsFromPoint' && scope.options.mode === 'texture') return () => [...scope.body.querySelectorAll('canvas')];
      if (property === 'querySelector' || property === 'querySelectorAll' || property === 'elementFromPoint' || property === 'elementsFromPoint') return bind(scope.tree, property);
      if (property === 'addEventListener') return (type: string, listener: EventListenerOrEventListenerObject, settings?: AddEventListenerOptions) => listen(/^(visibilitychange|pointerlock|fullscreen)/.test(type) ? target : scope.tree, type, listener, settings);
      if (property === 'removeEventListener') return (type: string, listener: EventListenerOrEventListenerObject, settings?: EventListenerOptions) => remove(/^(visibilitychange|pointerlock|fullscreen)/.test(type) ? target : scope.tree, type, listener, settings);
      if (property === 'dispatchEvent') return (event: Event) => (scope.engine?.canvas ?? scope.body).dispatchEvent(event);
      return bind(target, property);
    }, set(target, property, value) { if (property === 'title') { title = String(value); return true; } return Reflect.set(target, property, value, target); } });
    const windowProxy = new Proxy(realWindow, { get(target, property) {
      if (property === '__haiyueGameHost') return scope.bridge;
      if (property === 'document') return documentProxy;
      if (property === 'location') return scope.options.standalone ? realWindow.location : locationProxy;
      if (['window', 'self', 'top', 'parent', 'globalThis'].includes(String(property))) return windowProxy;
      if (property === 'innerWidth') return scope.options.width ?? (scope.options.root.clientWidth || realWindow.innerWidth);
      if (property === 'innerHeight') return scope.options.height ?? (scope.options.root.clientHeight || realWindow.innerHeight);
      if (property === 'devicePixelRatio' && scope.options.mode === 'texture') return 1;
      if (property === 'dispatchEvent') return (event: Event) => {
        if (event.type === 'resize') { scope.resize(); return true; }
        scope.dispatched.add(event); try { return target.dispatchEvent(event); } finally { scope.dispatched.delete(event); }
      };
      if (scope.environment && property in scope.environment) return Reflect.get(scope.environment, property);
      if (property === 'addEventListener') return (type: string, listener: EventListenerOrEventListenerObject, settings?: AddEventListenerOptions) => listen(target, type, listener, settings);
      if (property === 'removeEventListener') return (type: string, listener: EventListenerOrEventListenerObject, settings?: EventListenerOptions) => remove(target, type, listener, settings);
      if (typeof property === 'string' && property.startsWith('__') && !scope.options.standalone) return Reflect.get(scope.debug, property);
      return bind(target, property);
    }, set(target, property, value) { return Reflect.set(scope.options.standalone || !String(property).startsWith('__') ? target : scope.debug, property, value); },
      defineProperty(target, property, descriptor) { return Reflect.defineProperty(scope.options.standalone || !String(property).startsWith('__') ? target : scope.debug, property, descriptor); } });
    class ScopedResizeObserver extends ResizeObserver { constructor(callback: ResizeObserverCallback) { super((entries, observer) => { if (!scope.disposed) callback(entries, observer); }); scope.own(() => this.disconnect()); } }
    class ScopedMutationObserver extends MutationObserver { constructor(callback: MutationCallback) { super((entries, observer) => { if (!scope.disposed) callback(entries, observer); }); scope.own(() => this.disconnect()); } }
    class ScopedWorker extends Worker { constructor(url: string | URL, settings?: WorkerOptions) { super(new URL(String(url), page), settings); scope.own(() => this.terminate()); } }
    class ScopedImage extends Image {
      constructor(width?: number, height?: number) {
        super(width, height);
        const add = this.addEventListener.bind(this);
        this.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, settings?: boolean | AddEventListenerOptions) => {
          const config = typeof settings === 'boolean' ? { capture: settings } : settings ?? {};
          add(type, listener, { ...config, signal: config.signal ? AbortSignal.any([config.signal, scope.controller.signal]) : scope.controller.signal });
        }) as typeof this.addEventListener;
        scope.own(() => { this.onload = null; this.onerror = null; this.removeAttribute('src'); });
      }
      override get src(): string { return super.src; }
      override set src(value: string) { super.src = new URL(value, page).href; }
      override async decode(): Promise<void> { try { await super.decode(); scope.controller.signal.throwIfAborted(); } catch (error) { scope.controller.signal.throwIfAborted(); throw error; } }
    }
    class ScopedAudioContext extends AudioContext {
      private readonly output: GainNode;
      constructor(settings?: AudioContextOptions) {
        super(settings);
        scope.own(() => { if (this.state !== 'closed') void this.close().catch(() => {}); });
        this.output = scope.audio.attach(this, super.destination);
      }
      override get destination(): AudioDestinationNode { return this.output as unknown as AudioDestinationNode; }
    }
    const NativeEvent = Event, NativeKeyboardEvent = KeyboardEvent, NativePointerEvent = PointerEvent, NativeMouseEvent = MouseEvent, NativeWheelEvent = WheelEvent;
    class ScopedEvent extends NativeEvent { constructor(type: string, settings?: EventInit) { super(type, { composed: true, ...settings }); } static [Symbol.hasInstance](event: unknown) { return event instanceof NativeEvent; } }
    class ScopedKeyboardEvent extends NativeKeyboardEvent { constructor(type: string, settings?: KeyboardEventInit) { super(type, { composed: true, ...settings }); } static [Symbol.hasInstance](event: unknown) { return event instanceof NativeKeyboardEvent; } }
    class ScopedPointerEvent extends NativePointerEvent { constructor(type: string, settings?: PointerEventInit) { super(type, { composed: true, ...settings }); } static [Symbol.hasInstance](event: unknown) { return event instanceof NativePointerEvent; } }
    class ScopedMouseEvent extends NativeMouseEvent { constructor(type: string, settings?: MouseEventInit) { super(type, { composed: true, ...settings }); } static [Symbol.hasInstance](event: unknown) { return event instanceof NativeMouseEvent; } }
    class ScopedWheelEvent extends NativeWheelEvent { constructor(type: string, settings?: WheelEventInit) { super(type, { composed: true, ...settings }); } static [Symbol.hasInstance](event: unknown) { return event instanceof NativeWheelEvent; } }
    const requestFrame: typeof requestAnimationFrame = callback => {
      if (scope.disposed) return 0;
      const frame = realWindow.requestAnimationFrame(time => { scope.frames.delete(frame); if (!scope.disposed) callback(time); }); scope.frames.add(frame); return frame;
    };
    const timeout: typeof window.setTimeout = (callback, delay, ...args) => {
      if (scope.disposed) return 0;
      const timer = realWindow.setTimeout(() => { scope.timers.delete(timer); if (!scope.disposed) { if (typeof callback === 'function') callback(...args); } }, delay); scope.timers.add(timer); return timer;
    };
    const interval: typeof window.setInterval = (callback, delay, ...args) => { if (scope.disposed) return 0; const timer = realWindow.setInterval(callback, delay, ...args); scope.intervals.add(timer); return timer; };
    const navigatorProxy = scope.options.mode === 'texture' ? new Proxy(navigator, { get(target, property) { return property === 'maxTouchPoints' ? 5 : bind(target, property); } }) : navigator;
    const media: typeof matchMedia = query => {
      const result = realWindow.matchMedia(query); if (scope.options.mode !== 'texture') return result;
      return new Proxy(result, { get(target, property) { return property === 'matches' ? deviceMediaMatches(query, windowProxy.innerWidth, windowProxy.innerHeight, clause => realWindow.matchMedia(clause).matches) : bind(target, property); } });
    };
    const logger = new Proxy(console, { get(target, property) {
      if (property !== 'error') return bind(target, property);
      return (...values: unknown[]) => {
        const errors = values.filter(value => value && typeof value === 'object');
        if (scope.disposed && errors.length && errors.every(error => isGameCancellation(error))) { scope.debug.cancelledInitialization = true; return; }
        if (!scope.disposed && !scope.settled && errors.length) scope.fail(errors[0]);
        target.error(...values);
      };
    } });
    return { window: windowProxy, document: scope.options.standalone ? realDocument : documentProxy, location: scope.options.standalone ? realWindow.location : locationProxy, navigator: navigatorProxy,
      fetch: (input, settings) => this.fetch(input, settings), requestAnimationFrame: requestFrame, cancelAnimationFrame: frame => { scope.frames.delete(frame); realWindow.cancelAnimationFrame(frame); },
      setTimeout: timeout, clearTimeout: timer => { if (timer !== undefined) scope.timers.delete(timer); realWindow.clearTimeout(timer); }, setInterval: interval, clearInterval: timer => { if (timer !== undefined) scope.intervals.delete(timer); realWindow.clearInterval(timer); },
      ResizeObserver: ScopedResizeObserver, MutationObserver: ScopedMutationObserver, Worker: ScopedWorker, Image: ScopedImage, AudioContext: ScopedAudioContext,
      Event: ScopedEvent, KeyboardEvent: ScopedKeyboardEvent, PointerEvent: ScopedPointerEvent, MouseEvent: ScopedMouseEvent, WheelEvent: ScopedWheelEvent,
      matchMedia: media,
      console: logger,
      trackBoot: value => {
        if (value && typeof (value as PromiseLike<unknown>).then === 'function') {
          scope.boots++;
          void Promise.resolve(value).then(() => { scope.boots--; scope.checkReady(); }, error => { scope.boots--; scope.fail(error); });
        }
        return value;
      },
      onViewportChange: callback => this.viewport.add(callback) };
  }
  private async fetch(input: RequestInfo | URL, settings?: RequestInit): Promise<Response> {
    const request = input instanceof Request ? input : new URL(String(input), this.pageUrl);
    this.total++; this.progress('resources', `载入资源 ${this.completed} / ${this.total}`);
    try {
      const response = await fetch(request, { ...settings, signal: AbortSignal.any([this.controller.signal, ...(settings?.signal ? [settings.signal] : []), ...(input instanceof Request ? [input.signal] : [])]) });
      const total = Number(response.headers.get('content-length') ?? 0); if (Number.isFinite(total)) this.bytes += total;
      if (!response.ok || !response.body) { this.completed++; this.checkReady(); return response; }
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({ pull: async controller => {
        try { const chunk = await reader.read(); if (chunk.done) { this.completed++; this.progress('resources', `载入资源 ${this.completed} / ${this.total}`); this.checkReady(); controller.close(); }
          else { this.loaded += chunk.value.byteLength; this.progress('resources', `载入资源 ${this.completed} / ${this.total}`); controller.enqueue(chunk.value); } }
        catch (error) { const failure = this.controller.signal.aborted ? this.controller.signal.reason : error; controller.error(failure); this.fail(failure); }
      }, cancel: reason => reader.cancel(reason) });
      const result = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      Object.defineProperty(result, 'url', { value: response.url }); return result;
    } catch (error) { const failure = this.controller.signal.aborted ? this.controller.signal.reason : error; this.fail(failure); throw failure; }
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const listener of this.pageHide) { try { this.invoke(listener, new PageTransitionEvent('pagehide', { persisted: false })); } catch (error) { console.error('Game cleanup failed', error); } }
    this.pageHide.clear(); this.controller.abort();
    for (const frame of this.frames) cancelAnimationFrame(frame);
    for (const timer of this.timers) clearTimeout(timer);
    for (const timer of this.intervals) clearInterval(timer);
    this.frames.clear(); this.timers.clear(); this.intervals.clear(); this.resizeListeners.clear(); this.viewport.clear();
    for (const cleanup of this.cleanups.reverse()) { try { cleanup(); } catch (error) { console.error('Game resource cleanup failed', error); } } this.cleanups.length = 0;
    if (!this.settled) { this.settled = true; this.rejectReady(new DOMException('Game mount cancelled.', 'AbortError')); }
  }
}
