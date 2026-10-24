import type { GuiStyle } from '@haiyue/engine/gui';

// Measured opaque panel bounds, excluding transparent atlas gutters.
const PANELS = {
  plaque: { rect: [40, 180, 692, 276], cuts: [96, 70, 96, 70], ratio: 5 },
  parchment: { rect: [800, 76, 700, 480], cuts: [80, 76, 80, 76], ratio: 3 },
  primary: { rect: [40, 654, 692, 230], cuts: [88, 55, 88, 55], ratio: 5 },
  secondary: { rect: [798, 654, 704, 230], cuts: [88, 55, 88, 55], ratio: 6 },
} as const;

export function dojoSkin(source: HTMLImageElement, panel: keyof typeof PANELS): NonNullable<GuiStyle['nineSlice']> {
  const { rect: [x, y, width, height], cuts, ratio } = PANELS[panel];
  return { source, sourceWidth: width, sourceHeight: height, cuts, pixelRatio: ratio,
    uv: [x / source.naturalWidth, y / source.naturalHeight, width / source.naturalWidth, height / source.naturalHeight],
    contentInsets: { left: 10, right: 10, top: 3, bottom: 3 } };
}
