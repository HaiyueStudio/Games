import type { MugenViewerAction } from './MugenCharacterModel';

const ELEMENT_NAME = 'mugen-action-list-item';
const selection: { current: MugenActionListItem | null } = { current: null };

/** Business-specific catalog row used inside the shared virtual list. */
export class MugenActionListItem extends HTMLElement {
  readonly #button = document.createElement('button');
  readonly #number = document.createElement('span');
  readonly #title = document.createElement('strong');
  readonly #meta = document.createElement('small');
  readonly #flags = document.createElement('span');

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { display: block; width: 100%; height: 100%; min-width: 0; }
      button {
        display: grid;
        grid-template-columns: 56px minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        width: 100%;
        height: 100%;
        padding: 8px 12px;
        border: 0;
        color: var(--text, #f3f5f9);
        text-align: left;
        background: transparent;
        cursor: pointer;
        font: inherit;
      }
      button:hover { background: #171c27; }
      button:focus-visible { outline: 2px solid var(--lime, #ccff45); outline-offset: -2px; }
      button[aria-selected="true"] { color: #fff; background: #20271b; box-shadow: inset 3px 0 var(--lime, #ccff45); }
      .number { color: var(--lime, #ccff45); font: 800 12px ui-monospace, SFMono-Regular, Consolas, monospace; }
      .copy { min-width: 0; }
      strong { display: block; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      small { display: block; margin-top: 3px; color: var(--muted, #8d96a8); font-size: 9px; }
      .flags { display: flex; align-items: center; gap: 3px; }
      .flag { padding: 2px 4px; border: 1px solid #394154; border-radius: 3px; color: #9099aa; font-size: 8px; }
      .flag.warning { border-color: #76552d; color: #ffbe69; }
      .flag.blank { border-color: #46516a; color: #aeb8ca; }
    `;
    this.#button.type = 'button';
    this.#button.className = 'action-item';
    this.#button.role = 'option';
    this.#number.className = 'number';
    const copy = document.createElement('span');
    copy.className = 'copy';
    copy.append(this.#title, this.#meta);
    this.#flags.className = 'flags';
    this.#button.append(this.#number, copy, this.#flags);
    this.#button.addEventListener('click', () => this.select());
    root.append(style, this.#button);
  }

  disconnectedCallback(): void { if (selection.current === this) selection.current = null; }

  get actionId(): string { return this.dataset.actionId ?? ''; }

  get selected(): boolean { return this.#button.ariaSelected === 'true'; }

  set selected(value: boolean) { if (value) this.select(); else this.deselect(); }

  select(): void {
    if (this.actionId === '') return;
    if (selection.current !== null && selection.current !== this) selection.current.deselect();
    selection.current = this;
    this.#setSelected(true);
  }

  deselect(): void {
    if (selection.current === this) selection.current = null;
    this.#setSelected(false);
  }

  configure(action: MugenViewerAction, selected: boolean): void {
    this.dataset.actionId = action.id;
    this.selected = selected;
    this.#button.setAttribute('aria-label', `Action ${action.action.number} · ${action.label ?? '自定义动作'} · ${visualStatusLabel(action.visualStatus)}`);
    this.#number.textContent = String(action.action.number);
    this.#title.textContent = action.label ?? '自定义动作';
    this.#meta.textContent = `${action.elementCount} elements · ${action.action.totalTicks === null ? '∞' : `${action.action.totalTicks} ticks`} · ${action.referencedSpriteIds.length} sprites`;
    this.#flags.replaceChildren();
    if (action.action.loopStart > 0) this.#flags.append(createFlag('LOOP'));
    if (action.clsn1Count + action.clsn2Count > 0) this.#flags.append(createFlag('CLSN'));
    if (action.visualStatus === 'blank') this.#flags.append(createFlag('LOGIC', false, 'blank'));
    else if (action.visualStatus === 'missing') this.#flags.append(createFlag('NO SFF', true));
    else if (action.visualStatus === 'partial') this.#flags.append(createFlag(`PARTIAL ${action.warningCount}`, true));
  }

  #setSelected(value: boolean): void { this.#button.ariaSelected = String(value); }
}

export function createMugenActionListItem(action: MugenViewerAction, selected: boolean): MugenActionListItem {
  const item = document.createElement(ELEMENT_NAME) as MugenActionListItem;
  item.configure(action, selected);
  return item;
}

export function defineMugenActionListItem(): void {
  if (!customElements.get(ELEMENT_NAME)) customElements.define(ELEMENT_NAME, MugenActionListItem);
}

function createFlag(value: string, warning = false, className = ''): HTMLElement {
  const flag = document.createElement('span');
  flag.className = `flag${warning ? ' warning' : ''}${className ? ` ${className}` : ''}`;
  flag.textContent = value;
  return flag;
}

function visualStatusLabel(value: MugenViewerAction['visualStatus']): string { return ({ drawable: '可绘制', partial: '部分素材未解析', missing: '当前 SFF 无素材', blank: '逻辑空动作' } as const)[value]; }
