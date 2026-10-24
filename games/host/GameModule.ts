import { GameScope } from './GameScope';
import type { GameEnvironment, GameHostOptions, GameModule, MountedGame } from './types';
import { gameStyles } from './styles';
import { presentGameFrame } from './presentation';
import { GameDecorations } from './GameDecorations';
export { gameStyles } from './styles';

export function createGameModule(id: string, moduleUrl: string, boot: (environment: GameEnvironment) => unknown): GameModule {
  return { async mountGame(options: GameHostOptions): Promise<MountedGame> {
    options.signal?.throwIfAborted();
    const page = new URL(options.url ?? (moduleUrl.includes('/dist/') ? '../index.html' : './index.html'), moduleUrl);
    let body = options.root, tree: Document | ShadowRoot = document, container: HTMLElement | null = null;
    if (!options.standalone) {
      const response = await fetch(page, { signal: options.signal ?? null }); if (!response.ok) throw new Error(`Game page: HTTP ${response.status} ${page}`);
      const template = new DOMParser().parseFromString(await response.text(), 'text/html');
      options.signal?.throwIfAborted(); container = document.createElement('div'); container.className = 'game-mount';
      container.style.cssText = `position:relative;container-type:size;container-name:game-viewport;width:${options.width ? options.width + 'px' : '100%'};height:${options.height ? options.height + 'px' : '100%'};`;
      tree = container.attachShadow({ mode: 'open' });
      body = document.createElement('div'); for (const attribute of template.body.attributes) body.setAttribute(attribute.name, attribute.value);
      body.id = 'game-document'; body.style.cssText += ';position:relative;width:100%;height:100%;overflow:hidden;contain:layout style;';
      for (const element of template.body.querySelectorAll('script')) element.remove();
      body.append(...[...template.body.childNodes].map(node => document.importNode(node, true)));
      const sheets = await Promise.all([...template.head.querySelectorAll('style,link[rel="stylesheet"]')].map(async sheet => {
        const base = sheet instanceof HTMLLinkElement ? new URL(sheet.getAttribute('href')!, page).href : page.href;
        const css = sheet instanceof HTMLLinkElement ? await fetch(base, { signal: options.signal ?? null }).then(result => { if (!result.ok) throw new Error(`Game stylesheet: HTTP ${result.status}`); return result.text(); }) : sheet.textContent ?? '';
        const style = document.createElement('style'); style.textContent = gameStyles(css, base, options.mode === 'texture'); return style;
      }));
      for (const element of body.querySelectorAll<HTMLElement>('[src],[href]')) for (const attribute of ['src', 'href']) if (element.hasAttribute(attribute)) element.setAttribute(attribute, new URL(element.getAttribute(attribute)!, page).href);
      options.signal?.throwIfAborted(); tree.append(...sheets, body); options.root.replaceChildren(container);
    }
    const scope = new GameScope(container ? { ...options, root: container } : options, body, tree, moduleUrl, page.href);
    if (container) scope.own(() => container.remove());
    const bounds = new WeakMap<HTMLCanvasElement, () => DOMRect>();
    for (const canvas of body.querySelectorAll('canvas')) {
      if (!canvas.hasAttribute('tabindex')) canvas.tabIndex = 0;
      if (options.mode === 'texture') {
        const original = canvas.getBoundingClientRect.bind(canvas); bounds.set(canvas, original);
        canvas.getBoundingClientRect = () => { const rectangle = original(), parent = body.getBoundingClientRect(); return new DOMRect(rectangle.left - parent.left, rectangle.top - parent.top, rectangle.width, rectangle.height); };
        scope.own(() => { canvas.getBoundingClientRect = original; });
      }
    }
    const pointers = new Map<number, { x: number; y: number }>(), positions = new Map<number, { x: number; y: number }>(), virtual = new Set<number>(), captures = new Set<number>(), guarded = new WeakSet<HTMLCanvasElement>();
    const guard = (canvas: HTMLCanvasElement) => {
      if (guarded.has(canvas)) return; guarded.add(canvas);
      const set = canvas.setPointerCapture.bind(canvas), release = canvas.releasePointerCapture.bind(canvas), has = canvas.hasPointerCapture.bind(canvas);
      canvas.setPointerCapture = pointer => { if (virtual.has(pointer)) { if (pointers.has(pointer)) captures.add(pointer); } else set(pointer); };
      canvas.releasePointerCapture = pointer => { if (virtual.has(pointer)) captures.delete(pointer); else release(pointer); };
      canvas.hasPointerCapture = pointer => virtual.has(pointer) ? captures.has(pointer) : has(pointer);
      scope.own(() => { canvas.setPointerCapture = set; canvas.releasePointerCapture = release; canvas.hasPointerCapture = has; });
    };
    let decorations: GameDecorations | null = null;
    const instance: MountedGame = { id, signal: scope.controller.signal, ready: scope.ready, get canvas() { return scope.engine?.canvas ?? body.querySelector('canvas'); }, get engine() { return scope.engine; },
      get viewport() { const canvas = instance.canvas, parent = body.getBoundingClientRect(), rectangle = canvas ? (bounds.get(canvas) ?? canvas.getBoundingClientRect.bind(canvas))() : parent; return { x: (rectangle.left - parent.left) / (parent.width || 1), y: (rectangle.top - parent.top) / (parent.height || 1), width: rectangle.width / (parent.width || 1), height: rectangle.height / (parent.height || 1) }; },
      get texture() { return scope.engine?.screenTexture ?? null; }, get layers() { return [...(decorations ? [decorations.canvas] : []), ...[...body.querySelectorAll('canvas')].filter(canvas => canvas !== instance.canvas && canvas.width > 0 && canvas.height > 0 && getComputedStyle(canvas).display !== 'none')]; }, debug: scope.debug, get disposed() { return scope.disposed; }, pause: () => scope.engine?.pauseForHost?.(), resume: () => scope.engine?.resumeForHost?.(),
      dispose() { scope.dispose(); container?.remove(); },
      presentFrame() { decorations?.update(); return scope.disposed || !scope.engine || !instance.texture ? null : presentGameFrame(scope.engine, instance.texture); },
      resize(width, height) { if (scope.disposed) return; scope.setSize(width, height); if (container) { options.root.style.width = width + 'px'; options.root.style.height = height + 'px'; } },
      pointer(type, x, y, pointerId = 7100) {
        const canvas = instance.canvas; if (!canvas || scope.disposed) return; guard(canvas); virtual.add(pointerId); const rectangle = canvas.getBoundingClientRect();
        if (type === 'pointerdown') pointers.set(pointerId, { x, y });
        const origin = pointers.get(pointerId), previous = positions.get(pointerId), ending = type === 'pointerup' || type === 'pointercancel', buttons = origin && !ending ? 1 : 0;
        const movementX = previous ? (x - previous.x) * rectangle.width : 0, movementY = previous ? (y - previous.y) * rectangle.height : 0;
        positions.set(pointerId, { x, y });
        canvas.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch', isPrimary: !pointers.size || pointers.keys().next().value === pointerId, pressure: buttons ? .5 : 0, button: 0, buttons, movementX, movementY,
          clientX: rectangle.left + x * rectangle.width, clientY: rectangle.top + y * rectangle.height, bubbles: true, composed: true, cancelable: true }));
        const mouse = { clientX: rectangle.left + x * rectangle.width, clientY: rectangle.top + y * rectangle.height, button: 0, buttons, movementX, movementY, bubbles: true, composed: true, cancelable: true };
        if (type !== 'pointercancel') canvas.dispatchEvent(new MouseEvent(type.replace('pointer', 'mouse'), mouse));
        if (type === 'pointerup' && origin && Math.hypot((origin.x - x) * rectangle.width, (origin.y - y) * rectangle.height) < 12) canvas.dispatchEvent(new MouseEvent('click', mouse));
        if (ending) { pointers.delete(pointerId); positions.delete(pointerId); captures.delete(pointerId); }
      },
      key(code, down) { if (!scope.disposed) (instance.canvas ?? body).dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code, bubbles: true, composed: true, cancelable: true })); },
      wheel(x, y, deltaX, deltaY) { const canvas = instance.canvas; if (!canvas || scope.disposed) return; const rectangle = canvas.getBoundingClientRect(); canvas.dispatchEvent(new WheelEvent('wheel', { clientX: rectangle.left + x * rectangle.width, clientY: rectangle.top + y * rectangle.height, deltaX, deltaY, bubbles: true, composed: true, cancelable: true })); },
    };
    scope.progress('initializing', '初始化图形与游戏资源');
    try {
      await boot(scope.environment); await scope.ready; options.signal?.throwIfAborted();
      const canvas = instance.canvas;
      if (options.mode === 'texture' && canvas && (body.querySelector('img,svg') || [...body.querySelectorAll<HTMLElement>('*')].some(element => getComputedStyle(element).backgroundImage.startsWith('url(')))) {
        decorations = new GameDecorations(body, canvas, bounds.get(canvas) ?? canvas.getBoundingClientRect.bind(canvas)); scope.own(() => decorations?.dispose());
        scope.progress('resources', '合成游戏画面素材'); await decorations.ready(); options.signal?.throwIfAborted(); scope.progress('ready', '准备就绪');
      }
      return instance;
    }
    catch (error) { const failure = scope.disposed ? scope.controller.signal.reason : error; instance.dispose(); throw failure; }
  } };
}

export function startStandalone(module: GameModule, moduleUrl: string): void {
  if (![...document.scripts].some(script => script.type === 'module' && script.src === moduleUrl)) return;
  void module.mountGame({ root: document.body, standalone: true, url: location.href }).catch(error => { if (error instanceof DOMException && error.name === 'AbortError') return; document.body.dataset.renderStatus = 'failed'; console.error('Standalone game failed', error); });
}
