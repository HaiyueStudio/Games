import { HEX_RADIUS } from './hexGeometry';
import { inkNoise } from './inkNoise';
import { terrainHeight, type TerrainNode } from './terrainWfc';
export interface TerrainRaster { key: string; pixels: Uint8ClampedArray; waves: Float32Array }
export interface TerrainRasterRequest { id: number; seed: number; nodes: TerrainNode[] }
export interface TerrainRasterResponse { id: number; tiles?: TerrainRaster[]; error?: string; elapsedMs: number }
export const TERRAIN_RASTER_SIZE = 48;

/** Pure CPU terrain field calculation, shared with Node tests and run in the dedicated terrain worker. */
export function rasterizeTerrain(node: TerrainNode, seed: number): TerrainRaster {
  const origin = { x: (node.q + node.r / 2) * HEX_RADIUS * Math.sqrt(3), y: node.r * HEX_RADIUS * 1.5 };
  const size = TERRAIN_RASTER_SIZE, pixels = new Uint8ClampedArray(size * size * 4), waves: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = (x + .5) * 256 / size, py = (y + .5) * 256 / size, wx = px - 128 + origin.x, wy = py - 128 + origin.y;
    const height = terrainHeight(node, px, py, seed), t = Math.max(0, Math.min(1, (height - .37) / .21)), land = t * t * (3 - 2 * t);
    const grain = (inkNoise(wx / 19, wy / 19, seed) - .5) * 8, shore = Math.exp(-(((height - .46) / .07) ** 2)) * .45;
    const sea = [175, 201, 194], soil = [219, 222, 197], paper = [244, 239, 219], i = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) pixels[i + c] = (sea[c]! * (1 - land) + soil[c]! * land) * (1 - shore) + paper[c]! * shore + grain;
    pixels[i + 3] = 255;
  }
  for (let row = Math.floor((origin.y - 128) / 24); row < (origin.y + 128) / 24; row++) {
    waves.push(NaN, NaN);
    for (let x = -8; x <= 264; x += 8) {
      const y = row * 24 - origin.y + 128 + Math.sin((origin.x + x - 128) / 32 + seed) * 2.5;
      if (terrainHeight(node, x, y, seed) < .33) waves.push(x, y); else waves.push(NaN, NaN);
    }
  }
  return { key: `${node.q},${node.r}`, pixels, waves: new Float32Array(waves) };
}
