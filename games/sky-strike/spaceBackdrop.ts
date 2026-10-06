import type { SkyStrikeBattleLayer } from './battleLayer';

export const SPACE_FADE_MS = 9000;
export const SPACE_THEMES = [
  { level: 'orbital-gate', texture: 'bg-orbital', planet: 'planet-ice', x: 390, size: 270, phase: 230 },
  { level: 'ion-tempest', texture: 'bg-ion', planet: null, x: 0, size: 0, phase: 0 },
  { level: 'void-hunt', texture: 'bg-void', planet: 'planet-ice', x: 80, size: 180, phase: 640 },
  { level: 'carrier-siege', texture: 'bg-carrier', planet: 'planet-amber', x: 370, size: 360, phase: 370 },
  { level: 'prism-eclipse', texture: 'bg-prism', planet: 'planet-ice', x: 380, size: 310, phase: 440 },
  { level: 'serpent-rail', texture: 'bg-serpent', planet: null, x: 0, size: 0, phase: 0 },
  { level: 'binary-nova', texture: 'bg-binary', planet: 'planet-amber', x: 100, size: 240, phase: 590 },
  { level: 'asteroid-forge', texture: 'bg-mining', planet: null, x: 0, size: 0, phase: 0 },
  { level: 'event-horizon', texture: 'bg-void', planet: null, x: 0, size: 0, phase: 0 },
  { level: 'crystal-labyrinth', texture: 'bg-prism', planet: 'planet-ice', x: 390, size: 210, phase: 810 },
  { level: 'inferno-front', texture: 'bg-mining', planet: 'planet-amber', x: 380, size: 260, phase: 1110 },
  { level: 'quantum-armada', texture: 'bg-ion', planet: 'planet-ice', x: 80, size: 190, phase: 970 },
] as const;

/** Mirrored repeat shares identical edge texels, even when source art is not perfectly tileable. */
export function spaceTiles(ageMs: number, speed: number, size: number) {
  const travel = (Math.max(0, ageMs) * speed / 1000) % (size * 2);
  const first = Math.floor(-travel / size);
  const last = Math.ceil((960 - travel) / size);
  return Array.from({ length: last - first }, (_, n) => {
    const index = first + n;
    return { y: (index + 0.5) * size + travel, flipY: Math.abs(index % 2) === 1 };
  });
}

/** Game-specific scene composition; all pixels and transforms use the shared GPU sprite renderer. */
export class SkyStrikeSpaceBackdrop {
  private target = 0;
  private from: number[] = SPACE_THEMES.map((_, i) => Number(i === 0));
  private fadeMs = SPACE_FADE_MS;
  private ageMs = 0;

  select(levelId: string, immediate = false): void {
    const next = SPACE_THEMES.findIndex(theme => theme.level === levelId);
    if (next < 0) throw new Error(`Missing space theme for ${levelId}`);
    if (immediate) {
      this.target = next; this.from = SPACE_THEMES.map((_, i) => Number(i === next));
      this.fadeMs = SPACE_FADE_MS; this.ageMs = 0;
      return;
    }
    if (next === this.target) return;
    this.from = this.weights(); this.target = next; this.fadeMs = 0;
  }

  update(deltaMs: number): void {
    const delta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    this.ageMs += delta;
    this.fadeMs = Math.min(SPACE_FADE_MS, this.fadeMs + delta);
  }

  weights(): number[] {
    const t = this.fadeMs / SPACE_FADE_MS, p = t * t * (3 - 2 * t);
    return this.from.map((weight, i) => weight * (1 - p) + Number(i === this.target) * p);
  }

  snapshot() { return { theme: SPACE_THEMES[this.target]!.level, ageMs: this.ageMs, fadeMs: this.fadeMs, weights: this.weights() }; }

  draw(r: SkyStrikeBattleLayer, cameraX: number, playerX: number): void {
    const weights = this.weights();
    const center = (depth: number) => 240 + cameraX * (1 - depth) - (playerX - 240) * depth * 0.04;
    // Normalized alpha blends keep total exposure constant through a crossfade,
    // including interrupted transitions, rather than dimming the outgoing scene twice.
    let accumulated = 0;
    for (const [i, theme] of SPACE_THEMES.entries()) {
      const weight = weights[i]!; if (weight <= 0) continue;
      accumulated += weight;
      for (const tile of spaceTiles(this.ageMs, 7, 680))
        r.sprite(`assets/${theme.texture}.png`, center(0.12), tile.y, 680, 680, 0, weight / accumulated, '#c4c4c4', false, tile.flipY);
    }
    for (const [i, theme] of SPACE_THEMES.entries()) {
      const weight = weights[i]!; if (weight <= 0) continue;
      // A larger, faster diffuse copy of the nebula makes dust pass in front of distant stars.
      for (const tile of spaceTiles(this.ageMs + 19000, 19, 1080))
        r.sprite(`assets/${theme.texture}.png`, center(0.36) + 40, tile.y, 1080, 1080, 0, weight * 0.18, '#8090ae', true, tile.flipY);
      if (theme.planet) {
        // Recycle only fully off-screen; planet size always fits the hidden gap.
        const y = ((this.ageMs * 0.011 + theme.phase + 400) % 1800) - 400;
        r.sprite(`assets/${theme.planet}.png`, theme.x + center(0.22) - 240, y,
          theme.size, theme.size, 0, weight * 0.65, '#8996b0');
      }
    }
  }
}
