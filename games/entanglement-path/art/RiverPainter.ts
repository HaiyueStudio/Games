import { hexPoint, HEX_TEXTURE_STRETCH, pathCurve, portPoint } from './hexGeometry';
import { inkHash, inkNoise } from './inkNoise';
import { riverCurve, riverCrossings, riverPointAt, riverSegmentKey, type RiverCurve, type RiverWetness } from './riverFlow';

interface RiverTile { pairs: [number, number][] }
export interface RiverPaintOptions {
  fill?: string; stroke?: string; path?: string; glow?: boolean; entry?: number | null; exit?: number | null;
  activeEntry?: number | null; activeEntries?: number[]; pulseEntries?: number[]; pulse?: number;
  sourceExit?: number | null; label?: string; markers?: boolean; baseImage?: HTMLCanvasElement | null;
  wetness?: RiverWetness[]; time?: number; target?: HTMLCanvasElement;
}
const crossings = new Map<string, { upper: number; distance: number }[]>();

function strokeCurve(ctx: CanvasRenderingContext2D, entry: number, exit: number): void {
  const c = pathCurve(entry, exit); ctx.beginPath(); ctx.moveTo(c.start.x, c.start.y);
  ctx.bezierCurveTo(c.control1.x, c.control1.y, c.control2.x, c.control2.y, c.end.x, c.end.y); ctx.stroke();
}

function strokeRange(ctx: CanvasRenderingContext2D, curve: RiverCurve, from: number, to: number): void {
  if (to <= from) return;
  const a = riverPointAt(curve, from), b = riverPointAt(curve, to);
  ctx.beginPath(); ctx.moveTo(a.x, a.y);
  for (const p of curve.points) if (p.distance > from && p.distance < to) ctx.lineTo(p.x, p.y);
  ctx.lineTo(b.x, b.y); ctx.stroke();
}

function drawWater(ctx: CanvasRenderingContext2D, curve: RiverCurve, wet: RiverWetness, time: number, from = 0, to = curve.length): void {
  const end = Math.min(to, curve.length * wet.progress);
  if (end <= from) return;
  ctx.strokeStyle = 'rgba(55,103,102,.10)'; ctx.lineWidth = 19;
  strokeRange(ctx, curve, from, Math.min(to, curve.length * wet.bank));
  ctx.strokeStyle = 'rgba(38,75,76,.20)'; ctx.lineWidth = 12; strokeRange(ctx, curve, from, end);
  ctx.strokeStyle = '#315b5b'; ctx.lineWidth = 8.2; strokeRange(ctx, curve, from, end);
  ctx.strokeStyle = 'rgba(227,241,226,.75)'; ctx.lineWidth = 1.8;
  // Small moving streaks, rather than a continuous white line that reads like a second path.
  const phase = time * .018;
  for (let d = phase % 58 - 58; d < end; d += 58) strokeRange(ctx, curve, Math.max(from, d), Math.min(end, d + 14));
}

export function drawRiverTile(tile: RiverTile | null, rotation: number, options: RiverPaintOptions): HTMLCanvasElement {
  const canvas = options.target ?? document.createElement('canvas');
  if (canvas.width !== 256 || canvas.height !== 256) { canvas.width = 256; canvas.height = 256; }
  const ctx = canvas.getContext('2d')!; ctx.clearRect(0, 0, 256, 256);
  if (options.baseImage) ctx.drawImage(options.baseImage, 0, 0, 256, 256);
  ctx.save(); ctx.translate(128, 0); ctx.scale(HEX_TEXTURE_STRETCH, 1); ctx.translate(-128, 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (options.sourceExit != null) drawSpring(ctx, options.sourceExit, options.time ?? 0);
  if (tile) {
    const pairs = tile.pairs.map(([a, b]) => [(a + rotation * 2) % 12, (b + rotation * 2) % 12] as [number, number]);
    const rivers = pairs.map(([a, b]) => riverCurve(a, b));
    const wetness = options.wetness ?? [];
    const time = options.time ?? 0;
    ctx.save(); ctx.beginPath();
    for (let i = 0; i < 6; i++) { const p = hexPoint(i, 118); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
    ctx.closePath(); ctx.clip();
    // Pale riverbeds remain legible over the mountain texture.
    for (const [a, b] of pairs) {
      ctx.strokeStyle = 'rgba(241,235,213,.76)'; ctx.lineWidth = 5.5; strokeCurve(ctx, a, b);
      ctx.strokeStyle = 'rgba(100,123,112,.66)'; ctx.lineWidth = 2.9; strokeCurve(ctx, a, b);
    }
    for (const wet of wetness) drawWater(ctx, riverCurve(wet.entry, wet.exit), wet, time);
    // The current piece previews its route with a cinnabar thread, before committing water.
    if (options.activeEntry != null) {
      const pair = pairs.find(p => p.includes(options.activeEntry!));
      if (pair) { ctx.strokeStyle = 'rgba(157,67,47,.85)'; ctx.lineWidth = 4.1; ctx.setLineDash([8, 5]); strokeCurve(ctx, pair[0], pair[1]); ctx.setLineDash([]); }
    }
    // Reused pieces in the proposed continuation get only a dry dashed guide.
    for (const entry of options.pulseEntries ?? []) {
      const pair = pairs.find(p => p.includes(entry));
      if (pair && !wetness.some(w => riverSegmentKey(w.entry, w.exit) === riverSegmentKey(...pair))) {
        ctx.strokeStyle = `rgba(147,78,53,${.28 + (options.pulse ?? 0) * .18})`; ctx.lineWidth = 3;
        ctx.setLineDash([6, 7]); strokeCurve(ctx, pair[0], pair[1]); ctx.setLineDash([]);
      }
    }
    const layoutKey = pairs.map(p => p.join('-')).join(':');
    let bridges = crossings.get(layoutKey);
    if (!bridges) {
      bridges = [];
      for (let upper = 1; upper < rivers.length; upper++) for (let lower = 0; lower < upper; lower++) {
        for (const distance of riverCrossings(rivers[lower]!, rivers[upper]!)) bridges.push({ upper, distance });
      }
      if (crossings.size > 128) crossings.clear();
      crossings.set(layoutKey, bridges);
    }
    for (const bridge of bridges) {
      const curve = rivers[bridge.upper]!, pair = pairs[bridge.upper]!;
      const from = bridge.distance - 8, to = bridge.distance + 8;
      ctx.strokeStyle = '#ece6cf'; ctx.lineWidth = 13; strokeRange(ctx, curve, from, to);
      ctx.strokeStyle = 'rgba(100,123,112,.90)'; ctx.lineWidth = 2.9; strokeRange(ctx, curve, from, to);
      const wet = wetness.find(w => riverSegmentKey(w.entry, w.exit) === riverSegmentKey(...pair));
      if (wet) {
        // Draw in traversal direction, even if this pair was authored in the reverse order.
        const directed = riverCurve(wet.entry, wet.exit), reverse = wet.entry !== pair[0];
        drawWater(ctx, directed, wet, time, reverse ? curve.length - to : from, reverse ? curve.length - from : to);
      }
      const a = riverPointAt(curve, from), b = riverPointAt(curve, to), angle = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.strokeStyle = 'rgba(98,90,69,.65)'; ctx.lineWidth = 1.5;
      for (const side of [-1, 1]) {
        const nx = Math.sin(angle) * 5.5 * side, ny = -Math.cos(angle) * 5.5 * side;
        ctx.beginPath(); ctx.moveTo(a.x + nx, a.y + ny); ctx.lineTo(b.x + nx, b.y + ny); ctx.stroke();
      }
    }
    for (const wet of wetness) if (wet.progress > 0 && wet.progress < 1) {
      const p = riverPointAt(riverCurve(wet.entry, wet.exit), riverCurve(wet.entry, wet.exit).length * wet.progress);
      ctx.fillStyle = 'rgba(232,243,225,.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, 3.7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(52,102,96,.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore(); return canvas;
}

function drawSpring(ctx: CanvasRenderingContext2D, exit: number, time: number): void {
  const end = portPoint(exit), inner = portPoint(exit, 48);
  ctx.strokeStyle = 'rgba(49,91,91,.18)'; ctx.lineWidth = 18;
  ctx.beginPath(); ctx.moveTo(128, 128); ctx.quadraticCurveTo(inner.x, inner.y, end.x, end.y); ctx.stroke();
  ctx.strokeStyle = '#315b5b'; ctx.lineWidth = 8.2;
  ctx.beginPath(); ctx.moveTo(128, 128); ctx.quadraticCurveTo(inner.x, inner.y, end.x, end.y); ctx.stroke();
  const wash = ctx.createRadialGradient(128, 128, 4, 128, 128, 39);
  wash.addColorStop(0, '#dae5cf'); wash.addColorStop(.4, '#537e79'); wash.addColorStop(.7, 'rgba(49,91,91,.6)'); wash.addColorStop(1, 'rgba(49,91,91,0)');
  ctx.fillStyle = wash; ctx.beginPath(); ctx.ellipse(128, 128, 39, 30, -.3, 0, Math.PI * 2); ctx.fill();
  for (const radius of [11, 21]) {
    ctx.strokeStyle = 'rgba(239,242,218,.65)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(128, 128, radius + Math.sin(time * .001) * 2, radius * .65, -.3, .1, Math.PI * 1.55); ctx.stroke();
  }
  ctx.fillStyle = '#a14735'; ctx.fillRect(154, 150, 10, 10);
}

/** One cached transparent ink bloom. Animation changes its transform/opacity only. */
export function drawWetInkHalo(seed = 517): HTMLCanvasElement {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  for (let layer = 9; layer >= 0; layer--) {
    ctx.beginPath();
    for (let i = 0; i <= 180; i++) {
      const angle = i / 180 * Math.PI * 2;
      const radius = 119 + layer * 2.8 + (inkNoise(Math.cos(angle) * 3 + 4, Math.sin(angle) * 3 + 4, seed) - .5) * 29
        + (inkHash(i % 180, layer, seed) - .5) * 3;
      const x = 192 + Math.cos(angle) * radius, y = 192 + Math.sin(angle) * radius;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.strokeStyle = `rgba(42,78,70,${.04 + (9 - layer) * .01})`; ctx.lineWidth = 10; ctx.stroke();
  }
  return canvas;
}
