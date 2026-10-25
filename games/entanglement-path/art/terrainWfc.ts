import { inkHash, inkNoise } from './inkNoise';
import { hexPoint, type InkPoint } from './hexGeometry';

export const TERRAIN_DIRECTIONS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const;
export interface TerrainSite { q: number; r: number; kind: 'play' | 'wall' | 'sea' }
export interface TerrainNode extends TerrainSite { corners: number; ridges: number; variant: number }
export interface TerrainWorld { seed: number; nodes: Map<string, TerrainNode>; collapses: number; propagations: number }
export const terrainKey = (q: number, r: number): string => `${q},${r}`;
export const cornerLand = (mask: number, corner: number): number => (mask >> (corner % 6)) & 1;
export const edgeSocket = (mask: number, side: number): number => cornerLand(mask, side) * 2 + cornerLand(mask, side + 1);
const reversedSocket = (socket: number): number => ((socket & 1) << 1) | (socket >> 1);
const bitCount = (mask: number): number => { let n = 0; for (let i = 0; i < 6; i++) n += (mask >> i) & 1; return n; };

/** All 64 shoreline corner cases, with rotated equivalents and independently matched ridge sockets.
 * Lowest-entropy collapse + arc-consistency propagation. Domains factor into shared corner bits,
 * so every remaining choice extends to a solution without random retries or unbounded backtracking.
 */
export function collapseTerrain(sites: readonly TerrainSite[], seed: number): TerrainWorld {
  if (sites.length > 512) throw new Error('Terrain WFC exceeds the bounded 512-cell map');
  const indexed = new Map(sites.map((site, i) => [terrainKey(site.q, site.r), i]));
  const neighbors = sites.map(site => TERRAIN_DIRECTIONS.map(([dq, dr]) => indexed.get(terrainKey(site.q + dq, site.r + dr)) ?? -1));
  const domains = sites.map((site, i) => site.kind === 'sea' && neighbors[i]!.includes(-1) ? [0] : Array.from({ length: 64 }, (_, m) => m));
  let propagations = 0, collapses = 0;
  const propagate = (initial: number[]): void => {
    const queue = [...initial], queued = new Set(queue);
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!; queued.delete(i);
      if (++propagations > 50000) throw new Error('Terrain WFC propagation budget exceeded');
      for (let side = 0; side < 6; side++) {
        const n = neighbors[i]![side]!; if (n < 0) continue;
        let allowed = 0;
        for (const mask of domains[i]!) allowed |= 1 << reversedSocket(edgeSocket(mask, side));
        const filtered = domains[n]!.filter(mask => allowed & (1 << edgeSocket(mask, (side + 3) % 6)));
        if (!filtered.length) throw new Error('Inconsistent shared shoreline socket');
        if (filtered.length !== domains[n]!.length) {
          domains[n] = filtered; if (!queued.has(n)) { queue.push(n); queued.add(n); }
        }
      }
    }
  };
  propagate(domains.map((_, i) => i).filter(i => domains[i]!.length === 1));
  while (true) {
    let chosen = -1, entropy = Infinity;
    for (let i = 0; i < sites.length; i++) if (domains[i]!.length > 1) {
      const score = domains[i]!.length + inkHash(sites[i]!.q, sites[i]!.r, seed) * .4;
      if (score < entropy) { entropy = score; chosen = i; }
    }
    if (chosen < 0) break;
    const site = sites[chosen]!, domain = domains[chosen]!;
    const weight = (mask: number): number => {
      const count = bitCount(mask), transitions = Array.from({ length: 6 }, (_, d) => cornerLand(mask, d) !== cornerLand(mask, d + 1) ? 1 : 0).reduce<number>((a, b) => a + b, 0);
      const target = site.kind === 'play' ? 5.9 : site.kind === 'wall' ? 3.2 : .45;
      return Math.exp(-Math.abs(count - target) * 1.2) * (transitions > 2 ? .12 : 1) + .0001;
    };
    let draw = inkHash(chosen, collapses + 911, seed) * domain.reduce((sum, m) => sum + weight(m), 0), picked = domain[0]!;
    for (const mask of domain) { picked = mask; draw -= weight(mask); if (draw <= 0) break; }
    domains[chosen] = [picked]; collapses++; propagate([chosen]);
  }
  const nodes = new Map<string, TerrainNode>();
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i]!; let ridges = 0;
    if (site.kind === 'wall') for (let side = 0; side < 6; side++) {
      const other = neighbors[i]![side]!; if (other >= 0 && sites[other]!.kind === 'wall') ridges |= 1 << side;
    }
    nodes.set(terrainKey(site.q, site.r), { ...site, corners: domains[i]![0]!, ridges, variant: Math.floor(inkHash(site.q, site.r, seed + 61) * 65535) });
  }
  return { seed, nodes, collapses, propagations };
}

export function extendTerrainSites(board: readonly TerrainSite[], rings = 2): TerrainSite[] {
  const map = new Map(board.map(site => [terrainKey(site.q, site.r), site]));
  let frontier = [...board];
  for (let i = 0; i < rings; i++) {
    const added: TerrainSite[] = [];
    for (const site of frontier) for (const [dq, dr] of TERRAIN_DIRECTIONS) {
      const q = site.q + dq, r = site.r + dr, id = terrainKey(q, r);
      if (!map.has(id)) { const next: TerrainSite = { q, r, kind: 'sea' }; map.set(id, next); added.push(next); }
    }
    frontier = added;
  }
  return [...map.values()];
}

export function ridgePort(side: number): InkPoint {
  const a = hexPoint(side), b = hexPoint(side + 1); return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Shared edge values are exact and reverse on the opposing cell; interior noise vanishes at edges. */
export function terrainHeight(node: TerrainNode, x: number, y: number, seed: number): number {
  const dx = x - 128, dy = y - 128;
  let side = 0, projection = -Infinity;
  for (let d = 0; d < 6; d++) { const p = dx * Math.cos(d * Math.PI / 3) + dy * Math.sin(d * Math.PI / 3); if (p > projection) { side = d; projection = p; } }
  const a = hexPoint(side), b = hexPoint(side + 1), ax = a.x - 128, ay = a.y - 128, bx = b.x - 128, by = b.y - 128;
  const det = ax * by - ay * bx, u = (dx * by - dy * bx) / det, v = (dy * ax - dx * ay) / det;
  const radial = Math.max(0, Math.min(1, u + v)), along = Math.max(0, Math.min(1, v / (u + v || 1)));
  let edge = cornerLand(node.corners, side) * (1 - along) + cornerLand(node.corners, side + 1) * along;
  if (node.ridges & (1 << side)) edge = Math.max(edge, Math.max(0, 1 - Math.abs(along - .5) * 3.8));
  const center = node.ridges ? 1 : node.corners === 0 ? (node.variant % 17 === 0 ? .94 : 0) : node.kind === 'play' ? .92 : .64;
  return center * (1 - radial) + edge * radial
    + (inkNoise(x / 34, y / 34, seed + node.variant) - .5) * .24 * Math.sin(Math.PI * radial);
}
