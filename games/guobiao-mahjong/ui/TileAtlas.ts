export const TILE_ATLAS_WIDTH = 1152, TILE_ATLAS_HEIGHT = 1152, TILE_WIDTH = 128, TILE_HEIGHT = 176, BACK_TILE = 42;
export function tileUv(tile: number | null): [number, number, number, number] {
  const id = tile ?? BACK_TILE;
  if (!Number.isInteger(id) || id < 0 || id > BACK_TILE) throw new Error('Invalid atlas tile');
  return [(id % 8 * 144 + 8 + .5) / TILE_ATLAS_WIDTH, (Math.floor(id / 8) * 192 + 8 + .5) / TILE_ATLAS_HEIGHT, (TILE_WIDTH - 1) / TILE_ATLAS_WIDTH, (TILE_HEIGHT - 1) / TILE_ATLAS_HEIGHT];
}
export interface TileAtlas { source: HTMLImageElement; normal: HTMLImageElement; sourceKey: string }
export async function loadTextureImage(path:string,signal:AbortSignal):Promise<HTMLImageElement> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`麻将纹理加载失败 HTTP ${response.status}: ${path}`);
  const url = URL.createObjectURL(await response.blob()), image = new Image();
  try { image.src = url; await image.decode(); signal.throwIfAborted(); return image; }
  finally { URL.revokeObjectURL(url); }
}
export async function loadTileAtlas(signal: AbortSignal): Promise<TileAtlas> {
  const [source,normal]=await Promise.all([loadTextureImage('./assets/tiles-atlas.png?v=reference-2',signal),loadTextureImage('./assets/tiles-normal-v1.png',signal)]);
  if(source.naturalWidth!==TILE_ATLAS_WIDTH||source.naturalHeight!==TILE_ATLAS_HEIGHT)throw new Error('Invalid tile atlas dimensions');
  return {source,normal,sourceKey:'mahjong:reference-atlas:v2'};
}
