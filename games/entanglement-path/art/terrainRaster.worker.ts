import { rasterizeTerrain, type TerrainRasterRequest, type TerrainRasterResponse } from './terrainRaster';
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<TerrainRasterRequest>) => void) | null;
  postMessage(message: TerrainRasterResponse, transfer: Transferable[]): void;
};
scope.onmessage = ({ data }) => {
  const start = performance.now();
  try {
    const tiles = data.nodes.map(node => rasterizeTerrain(node, data.seed));
    scope.postMessage({ id: data.id, tiles, elapsedMs: performance.now() - start }, tiles.flatMap(tile => [tile.pixels.buffer, tile.waves.buffer]));
  } catch (error) {
    scope.postMessage({ id: data.id, error: String(error), elapsedMs: performance.now() - start }, []);
  }
};
