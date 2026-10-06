import { ATLAS_COLUMNS, SPRITE_INDEX } from './sprites';
import { GRID, TILE, SIZE, type GameState, type Tank } from './rules';

export class BattlefieldRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly atlas = new Image();
  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('当前浏览器不支持 Canvas 2D。');
    this.context = context; canvas.width = SIZE; canvas.height = SIZE;
  }
  async init(): Promise<void> { this.atlas.src = './assets/atlas.png'; await this.atlas.decode(); }
  private sprite(name: string, x: number, y: number, size = 16, angle = 0): void {
    const index = SPRITE_INDEX[name]; if (index === undefined) return;
    const c = this.context; c.save(); c.translate(Math.round(x), Math.round(y)); c.rotate(angle);
    c.drawImage(this.atlas, index % ATLAS_COLUMNS * 16, Math.floor(index / ATLAS_COLUMNS) * 16, 16, 16, -size / 2, -size / 2, size, size); c.restore();
  }
  private tank(tank: Tank, tick: number): void {
    const c = this.context;
    const team = tank.player ? `p${tank.player}` : tank.kind;
    const frame = tank.moving ? Math.floor(tick / 5) % 2 : 0;
    const flash = tank.carrier && Math.floor(tick / 10) % 2 === 0;
    this.sprite(`${flash ? 'flash' : team}-${tank.player && !flash ? tank.level : 0}-${frame}`, tank.x, tank.y, 28, tank.direction * Math.PI / 2);
    if (tank.shield > 0 && Math.floor(tick / 4) % 2 === 0) {
      c.strokeStyle = tank.player ? '#f3e6a6' : '#d99063'; c.lineWidth = 1;
      c.strokeRect(Math.round(tank.x) - 16.5, Math.round(tank.y) - 16.5, 32, 32);
    }
    if (tank.carrier) {
      c.fillStyle = flash ? '#fff0c6' : '#dd735c'; c.fillRect(Math.round(tank.x) - 2, Math.round(tank.y) - 21, 4, 3);
    }
    if (!tank.player && tank.hp > 1) {
      for (let i = 0; i < tank.hp; i++) { c.fillStyle = '#cdd7a4'; c.fillRect(Math.round(tank.x) - 7 + i * 4, Math.round(tank.y) + 17, 3, 2); }
    }
  }
  draw(state: GameState): void {
    const c = this.context; c.imageSmoothingEnabled = false; c.globalAlpha = 1;
    c.fillStyle = '#22291f'; c.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < state.tiles.length; i++) {
      const tile = state.tiles[i]!; const x = i % GRID * TILE + 8; const y = Math.floor(i / GRID) * TILE + 8;
      this.sprite(tile === 'water' ? `water-${Math.floor(state.tick / 30) % 2}` : tile === 'forest' ? 'ground' : tile, x, y);
    }
    for (const x of [16, 208, 400]) {
      c.strokeStyle = '#67714b'; c.setLineDash([2, 3]); c.strokeRect(x - 13.5, 2.5, 26, 27); c.setLineDash([]);
      c.fillStyle = '#899563'; c.fillRect(x - 2, 1, 4, 2);
    }
    // Base and the two friendly tanks use the exact same pixel atlas as the asset gallery.
    this.sprite(state.baseAlive ? 'base' : 'base-destroyed', 208, 400, 32);
    for (const tank of state.tanks) this.tank(tank, state.tick);
    for (const bullet of state.bullets) {
      c.fillStyle = bullet.player ? '#fff1b4' : '#f49779';
      c.fillRect(Math.round(bullet.x) - 2, Math.round(bullet.y) - 2, 4, 4);
    }
    for (let i = 0; i < state.tiles.length; i++) if (state.tiles[i] === 'forest') {
      this.sprite('forest', i % GRID * TILE + 8, Math.floor(i / GRID) * TILE + 8);
    }
    for (const pickup of state.pickups) if (pickup.ttl > 180 || Math.floor(state.tick / 8) % 2 === 0) {
      c.fillStyle = '#cfaf6638'; c.fillRect(pickup.x - 18, pickup.y - 18, 36, 36);
      this.sprite(`item-${pickup.kind}`, pickup.x, pickup.y, 28);
    }
    for (const effect of state.effects) {
      const life = effect.kind === 'spark' ? 8 : effect.kind === 'spawn' ? 35 : 25;
      const progress = 1 - Math.min(1, effect.ttl / life);
      const radius = effect.kind === 'spark' ? 4 : 5 + progress * 17;
      c.fillStyle = effect.kind === 'spawn' ? '#e6df9766' : effect.ttl > 12 ? '#f4d67f' : '#dd7a4d';
      for (let j = 0; j < 8; j++) {
        const angle = j * Math.PI / 4;
        const size = Math.max(2, Math.round(6 * (1 - progress)));
        c.fillRect(Math.round(effect.x + Math.cos(angle) * radius) - size / 2, Math.round(effect.y + Math.sin(angle) * radius) - size / 2, size, size);
      }
    }
    if (state.freeze > 0) { c.strokeStyle = '#9cdde3'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, SIZE - 3, SIZE - 3); }
  }
}
