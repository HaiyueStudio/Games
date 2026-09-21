/** Small scene overlay boundary: browser DOM and native labels share projection. */
export interface BoxboundLabel {
  text(text: string, complete?: boolean): void;
  project(x: number, y: number, visible: boolean): void;
  remove(): void;
}
export interface BoxboundLabels {
  readonly count: number;
  create(): BoxboundLabel;
  opacity(value: number): void;
  clear(): void;
}
export function browserLabels(root: HTMLElement): BoxboundLabels {
  return {
    get count() { return root.childElementCount; },
    create() {
      const node = document.createElement('div'); root.append(node);
      return {
        text(text, complete = false) { node.className = 'map-label' + (complete ? ' done' : ''); node.textContent = text; },
        project(x, y, visible) { node.style.visibility = visible ? 'visible' : 'hidden'; node.style.left = `${x}px`; node.style.top = `${y}px`; },
        remove() { node.remove(); },
      };
    },
    opacity(value) { root.style.opacity = String(value); },
    clear() { root.replaceChildren(); },
  };
}
