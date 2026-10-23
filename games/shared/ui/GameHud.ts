import { Entity, type HaiyueEngine, type World, type Scene, type OrbitControl } from '@haiyue/engine';
import { GuiButton, GuiElement, GuiLabel, GuiRoot, GuiSystem, GuiInput, GuiSelect, GuiCheckbox, type GuiRect } from '@haiyue/engine/gui';

/** Screen-space game HUD composition. Rendering, input and resource ownership stay in GuiSystem. */
export class GameHud {
  readonly root = new GuiRoot({ theme: { fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: 16,
    colors: { text: '#f1f5f9', textMuted: '#aab8cc', primary: '#3674c9', danger: '#d05050', background: '#142033', surface: '#23334b', border: '#57708f', hover: '#42638b', active: '#274d7a', disabled: '#556273' } } });
  readonly system: GuiSystem;
  private readonly world: World;
  constructor(engine: HaiyueEngine, host: World | Scene, chars: string, readonly width = 1000, readonly height = 650) {
    const world = 'world' in host ? host.world : host; this.world = world;
    world.addEntity(new Entity('Game HUD').addComponent(this.root));
    this.system = new GuiSystem(engine, { loadOp: 'load', font: { chars: [...new Set(chars + Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join(''))].join(''), fontFamily: 'Microsoft YaHei, Arial, sans-serif', fontSize: 28, atlasSize: 2048 } });
    this.system.priority = 1000;
    if (new URLSearchParams(location.search).has('verify') || new URLSearchParams(location.search).has('gamepadVerify')) {
      Object.defineProperty(window, '__gameHud', { configurable: true, get: () => this.snapshot() });
    }
    if ('world' in host) host.addSystem(this.system, { pass: 'shared' });
    else world.addSystem(this.system);
  }
  place<T extends GuiElement>(node: T, rect: GuiRect, fontSize = 16): T {
    node.layout = () => { Object.assign(node.rect, rect); };
    fitGuiLayout(node, this.root, this.width, this.height, fontSize);
    if (this.width === 1000 && this.height === 650) {
      const fitted = node.layout.bind(node);
      node.layout = parent => {
        fitted(parent);
        const scale = Math.min(parent.width / this.width, parent.height / this.height);
        const portrait = parent.width < 600 && parent.height > parent.width;
        const verticalScale = Math.max(.65, scale);
        const buttons = portrait ? this.root.root.children.filter(child => child instanceof GuiButton && child.visible) : [];
        const columns = Math.max(1, Math.floor((parent.width - 16) / 110));
        const toolbarHeight = portrait && buttons.length ? Math.ceil(buttons.length / columns) * 42 + 4 : 0;
        if (rect.y < this.height * .3) node.rect.y = parent.y + rect.y * verticalScale;
        else if (rect.y >= this.height * .75) node.rect.y = parent.y + parent.height - toolbarHeight - (this.height - rect.y) * verticalScale;
        node.rect.height = rect.height * (node.constructor === GuiElement ? scale : verticalScale);
        if (portrait && node instanceof GuiButton) {
          const index = buttons.indexOf(node), cellWidth = (parent.width - 16) / columns;
          Object.assign(node.rect, { x: parent.x + 8 + index % columns * cellWidth, y: parent.y + parent.height - toolbarHeight + Math.floor(index / columns) * 42, width: cellWidth - 6, height: 36 });
        }
        if (portrait && (node instanceof GuiCheckbox || node instanceof GuiInput || node instanceof GuiSelect)) {
          node.rect.width = Math.min(parent.width - 16, Math.max(node.rect.width, node instanceof GuiCheckbox ? 128 : 100));
          node.rect.x = Math.min(node.rect.x, parent.x + parent.width - node.rect.width - 8);
          node.rect.height = Math.max(node.rect.height, 30);
        }
        if (node instanceof GuiLabel) {
          const ems = [...node.text].reduce((sum, char) => sum + (char.charCodeAt(0) < 128 ? .6 : 1), 0);
          node.setFontSize(Math.min(fontSize * verticalScale, Math.max(7, (node.rect.width - 4) / Math.max(1, ems))));
        } else this.root.theme.fontSize = portrait ? 12 : 16 * scale;
      };
    }
    return this.root.add(node);
  }
  label(text: string, x: number, y: number, width: number, height = 32, fontSize = 16): GuiLabel {
    return this.place(new GuiLabel({ text, fontSize, textAlign: 'center', style: { color: '#f1f5f9', backgroundColor: 'rgba(12,22,37,0.82)', padding: 2 } }), { x, y, width, height }, fontSize);
  }
  button(text: string, x: number, y: number, width: number, onClick: () => void, height = 38): GuiButton {
    return this.place(new GuiButton({ text, onClick, style: { backgroundColor: '#2d4e77', color: '#ffffff', padding: 3 } }), { x, y, width, height });
  }
  guardOrbit(orbit: OrbitControl, canvas: HTMLCanvasElement): void {
    const abort = new AbortController();
    const options = { capture: true, signal: abort.signal };
    let saved: [boolean, boolean, boolean] | null = null;
    const restore = () => { if (saved) [orbit.enableRotate, orbit.enablePan, orbit.enableZoom] = saved; saved = null; };
    const block = () => { saved ??= [orbit.enableRotate, orbit.enablePan, orbit.enableZoom]; orbit.enableRotate = orbit.enablePan = orbit.enableZoom = false; };
    canvas.addEventListener('pointerdown', e => { if (this.hit(e.clientX, e.clientY, canvas)) block(); else restore(); }, options);
    canvas.addEventListener('wheel', e => { if (this.hit(e.clientX, e.clientY, canvas)) { block(); queueMicrotask(restore); } }, options);
    for (const type of ['pointerup','pointercancel','blur']) window.addEventListener(type, () => queueMicrotask(restore), options);
    this.world.addRuntimeIntegration({ onDetach: () => { abort.abort(); orbit.dispose(); } });
  }
  snapshot() {
    return { width: this.root.viewport.width, height: this.root.viewport.height, nodes: this.root.root.children.map(node => ({
      type: node.constructor.name, text: 'text' in node ? String(node.text) : '', visible: node.visible, disabled: node.disabled,
      value: 'value' in node ? node.value : null, rect: { ...node.rect },
    })) };
  }
  /** Prevent a UI press from also selecting, shooting or dragging the world behind it. */
  hit(clientX: number, clientY: number, canvas: HTMLCanvasElement): boolean {
    const r = canvas.getBoundingClientRect();
    const hit = this.root.hitTest((clientX - r.left) / r.width * this.root.viewport.width, (clientY - r.top) / r.height * this.root.viewport.height);
    return hit instanceof GuiButton || hit instanceof GuiInput || hit instanceof GuiSelect || hit instanceof GuiCheckbox;
  }
}

/** Fit design-space widgets uniformly; percent dimensions resolve against the same logical viewport. */
export function fitGuiLayout(node: GuiElement, root: GuiRoot, width: number, height: number, fontSize = root.theme.fontSize): void {
  const layout = node.layout.bind(node);
  let previousScale = -1;
  node.layout = parent => {
    const scale = Math.min(parent.width / width, parent.height / height);
    if (scale !== previousScale) {
      previousScale = scale;
      if (node instanceof GuiLabel) node.setFontSize(fontSize * scale);
      else root.theme.fontSize = fontSize * scale;
    }
    layout({ x: 0, y: 0, width, height });
    node.rect.x = parent.x + (parent.width - width * scale) / 2 + node.rect.x * scale;
    node.rect.y = parent.y + (parent.height - height * scale) / 2 + node.rect.y * scale;
    node.rect.width *= scale; node.rect.height *= scale;
  };
}
