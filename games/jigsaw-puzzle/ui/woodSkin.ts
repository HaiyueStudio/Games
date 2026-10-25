import type { GuiButton, GuiStyle } from '@haiyue/engine/gui';
type WoodTheme = NonNullable<NonNullable<ConstructorParameters<typeof GuiButton>[0]>['themeResource']>;

/** Four 1536x256 panels; crop atlas gutters to keep adjacent rows out of filtering. */
export function woodPanel(source: HTMLImageElement, row: number, ratio = 5): NonNullable<GuiStyle['nineSlice']> {
  return { source, sourceWidth: source.naturalWidth, sourceHeight: source.naturalHeight / 4 - 2,
    uv: [0, (row * source.naturalHeight / 4 + 1) / source.naturalHeight, 1, (source.naturalHeight / 4 - 2) / source.naturalHeight],
    cuts: [40, 32, 40, 32], pixelRatio: ratio, contentInsets: { left: 5, right: 5, top: 2, bottom: 2 } };
}

/** Native GUI state selects raised, honey-highlighted and recessed wood skins. */
export function woodControl(source: HTMLImageElement, primary = false): WoodTheme {
  return { version: 1, subscribe: () => () => {}, resolve: (_type, state) => {
    const row = state.pressed ? 3 : primary || state.hover || state.focus ? 2 : 1;
    return { nineSlice: woodPanel(source, row), color: row === 2 ? '#39200c' : '#fff2d0', opacity: state.disabled ? .45 : 1 };
  } };
}

export async function loadWoodUi(): Promise<HTMLImageElement> {
  const image = new Image(); image.src = './assets/wood-ui.png'; await image.decode(); return image;
}
