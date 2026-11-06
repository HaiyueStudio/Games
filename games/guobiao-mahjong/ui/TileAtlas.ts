import type { GuiImageSource } from '@haiyue/engine/gui';
export const TILE_ATLAS_WIDTH = 1152, TILE_ATLAS_HEIGHT = 1152, TILE_WIDTH = 128, TILE_HEIGHT = 176, BACK_TILE = 42;
export function tileUv(tile: number | null): [number, number, number, number] {
  const id = tile ?? BACK_TILE;
  if (!Number.isInteger(id) || id < 0 || id > BACK_TILE) throw new Error('Invalid atlas tile');
  return [(id % 8 * 144 + 8 + .5) / TILE_ATLAS_WIDTH, (Math.floor(id / 8) * 192 + 8 + .5) / TILE_ATLAS_HEIGHT, (TILE_WIDTH - 1) / TILE_ATLAS_WIDTH, (TILE_HEIGHT - 1) / TILE_ATLAS_HEIGHT];
}
export interface TileAtlas { source: GuiImageSource; sourceKey: string }
export async function loadTileAtlas(signal: AbortSignal): Promise<TileAtlas> {
  const response = await fetch('./assets/tiles-atlas.png?v=reference-2', { signal });
  if (!response.ok) throw new Error(`麻将牌面加载失败 HTTP ${response.status}`);
  const url = URL.createObjectURL(await response.blob()), image = new Image();
  try { image.src = url; await image.decode(); signal.throwIfAborted(); if (image.naturalWidth !== TILE_ATLAS_WIDTH || image.naturalHeight !== TILE_ATLAS_HEIGHT) throw new Error('Invalid tile atlas dimensions'); return { source: image, sourceKey: 'mahjong:reference-atlas:v2' }; }
  finally { URL.revokeObjectURL(url); }
}
