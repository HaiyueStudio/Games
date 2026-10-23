import { Entity, World } from '@haiyue/engine';
import { GuiRoot, GuiElement, GuiImage, type GuiRect } from '@haiyue/engine/gui';
import { ATLAS_COLUMNS, SPRITE_INDEX, SPRITES } from './sprites';
import { GRID, TILE, SIZE, type GameState, type Tank } from '../rules/rules';

/** Game-specific draw order; batching, texture ownership and compositing stay in Engine GUI. */
export class BattlefieldRenderer {
  private readonly layers = Array.from({ length: 5 }, () => new GuiRoot());
  private readonly images: GuiImage[][] = this.layers.map(() => []);
  private readonly shapes: GuiElement[][] = this.layers.map(() => []);
  private readonly imageCounts = this.layers.map(() => 0);
  private readonly shapeCounts = this.layers.map(() => 0);
  private atlas: ImageBitmap | null = null;
  private disposed = false;
  private board: GuiRect = { x: 0, y: 0, width: SIZE, height: SIZE };
  private layer = 0;
  constructor(world: World) {
    for (const [i, root] of this.layers.entries()) {
      const entity = new Entity(`Tank battlefield layer ${i}`);
      entity.addComponent(root); world.addEntity(entity);
      // The battlefield has no interactive controls; HUD owns hit testing.
      root.root.hitTest = () => null;
    }
  }
  async init(): Promise<void> {
    const source = new Image(); source.src = './assets/mobile-atlas.png'; await source.decode();
    // Reuse the four-direction atlas. Expand once to preserve crisp pixel edges with
    // the installed GUI renderer's linear sampler; there is no per-frame canvas upload.
    const atlas = await createImageBitmap(source, { resizeWidth: source.naturalWidth * 4,
      resizeHeight: source.naturalHeight * 4, resizeQuality: 'pixelated' });
    if (this.disposed) atlas.close(); else this.atlas = atlas;
  }
  private place(element: GuiElement, x: number, y: number, width: number, height: number): void {
    const scale = this.board.width / SIZE;
    const left = this.board.x + x * scale, top = this.board.y + y * scale;
    const w = width * scale, h = height * scale, area = element.rect;
    if (area.x === left && area.y === top && area.width === w && area.height === h) return;
    area.x = left; area.y = top; area.width = w; area.height = h; element.markDirty();
  }
  private sprite(name: string, x: number, y: number, size = TILE, direction = 0): void {
    const index = SPRITE_INDEX[name]; if (index === undefined) return;
    const left = Math.round(x) - size / 2, top = Math.round(y) - size / 2;
    const x0 = Math.max(0, left), y0 = Math.max(0, top);
    const width = Math.min(SIZE, left + size) - x0, height = Math.min(SIZE, top + size) - y0;
    if (width <= 0 || height <= 0) return;
    const pool = this.images[this.layer]!, count = this.imageCounts[this.layer]!;
    this.imageCounts[this.layer] = count + 1;
    let image = pool[count];
    if (!image) {
      image = this.layers[this.layer]!.add(new GuiImage({ source: this.atlas, sourceKey: 'tank-battle-directions' }));
      image.layout = () => {}; pool.push(image);
    }
    const rows = Math.ceil(SPRITES.length / ATLAS_COLUMNS);
    image.setVisible(true);
    image.setUv([(index % ATLAS_COLUMNS + (x0 - left) / size) / ATLAS_COLUMNS,
      (Math.floor(index / ATLAS_COLUMNS) + direction * rows + (y0 - top) / size) / (rows * 4),
      width / size / ATLAS_COLUMNS, height / size / (rows * 4)]);
    this.place(image, x0, y0, width, height);
  }
  private fill(x: number, y: number, width: number, height: number, color: string): void {
    // A single canvas no longer clips implicitly at the old battlefield canvas edge.
    const right = Math.min(SIZE, x + width), bottom = Math.min(SIZE, y + height);
    x = Math.max(0, x); y = Math.max(0, y); width = right - x; height = bottom - y;
    if (width <= 0 || height <= 0) return;
    const pool = this.shapes[this.layer]!, count = this.shapeCounts[this.layer]!;
    this.shapeCounts[this.layer] = count + 1;
    let shape = pool[count];
    if (!shape) {
      shape = this.layers[this.layer]!.add(new GuiElement()); shape.layout = () => {}; pool.push(shape);
    }
    shape.setVisible(true);
    if (shape.style.backgroundColor !== color) shape.setStyle({ backgroundColor: color });
    this.place(shape, x, y, width, height);
  }
  private outline(x: number, y: number, size: number, color: string, width = 1): void {
    this.fill(x, y, size, width, color); this.fill(x, y + size - width, size, width, color);
    this.fill(x, y + width, width, size - width * 2, color); this.fill(x + size - width, y + width, width, size - width * 2, color);
  }
  private tank(tank: Tank, tick: number): void {
    const team = tank.player ? `p${tank.player}` : tank.kind;
    const frame = tank.moving ? Math.floor(tick / 5) % 2 : 0;
    const flash = tank.carrier && Math.floor(tick / 10) % 2 === 0;
    this.sprite(`${flash ? 'flash' : team}-${tank.player && !flash ? tank.level : 0}-${frame}`, tank.x, tank.y, 28, tank.direction);
    if (tank.shield > 0 && Math.floor(tick / 4) % 2 === 0)
      this.outline(Math.round(tank.x) - 16, Math.round(tank.y) - 16, 32, tank.player ? '#f3e6a6' : '#d99063');
    if (tank.carrier) this.fill(Math.round(tank.x) - 2, Math.round(tank.y) - 21, 4, 3, flash ? '#fff0c6' : '#dd735c');
    if (!tank.player && tank.hp > 1)
      for (let i = 0; i < tank.hp; i++) this.fill(Math.round(tank.x) - 7 + i * 4, Math.round(tank.y) + 17, 3, 2, '#cdd7a4');
  }
  draw(state: GameState, board: GuiRect): void {
    this.board = board; this.imageCounts.fill(0); this.shapeCounts.fill(0); this.layer = 0;
    this.fill(0, 0, SIZE, SIZE, '#22291f');
    for (let i = 0; i < state.tiles.length; i++) {
      const tile = state.tiles[i]!;
      this.sprite(tile === 'water' ? `water-${Math.floor(state.tick / 30) % 2}` : tile === 'forest' ? 'ground' : tile,
        i % GRID * TILE + 8, Math.floor(i / GRID) * TILE + 8);
    }
    this.sprite(state.baseAlive ? 'base' : 'base-destroyed', 208, 400, 32);
    this.layer = 1;
    for (const x of [16, 208, 400]) {
      for (let d = 0; d < 26; d += 5) {
        this.fill(x - 13 + d, 2, 2, 1, '#67714b'); this.fill(x - 13 + d, 29, 2, 1, '#67714b');
        this.fill(x - 13, 2 + d, 1, 2, '#67714b'); this.fill(x + 13, 2 + d, 1, 2, '#67714b');
      }
      this.fill(x - 2, 1, 4, 2, '#899563');
    }
    for (const tank of state.tanks) this.tank(tank, state.tick);
    this.layer = 2;
    for (const bullet of state.bullets) this.fill(Math.round(bullet.x) - 2, Math.round(bullet.y) - 2, 4, 4, bullet.player ? '#fff1b4' : '#f49779');
    for (let i = 0; i < state.tiles.length; i++) if (state.tiles[i] === 'forest')
      this.sprite('forest', i % GRID * TILE + 8, Math.floor(i / GRID) * TILE + 8);
    this.layer = 3;
    for (const pickup of state.pickups) if (pickup.ttl > 180 || Math.floor(state.tick / 8) % 2 === 0) {
      this.fill(pickup.x - 18, pickup.y - 18, 36, 36, '#cfaf6638'); this.sprite(`item-${pickup.kind}`, pickup.x, pickup.y, 28);
    }
    this.layer = 4;
    for (const effect of state.effects) {
      const life = effect.kind === 'spark' ? 8 : effect.kind === 'spawn' ? 35 : 25;
      const progress = 1 - Math.min(1, effect.ttl / life), radius = effect.kind === 'spark' ? 4 : 5 + progress * 17;
      const color = effect.kind === 'spawn' ? '#e6df9766' : effect.ttl > 12 ? '#f4d67f' : '#dd7a4d';
      for (let j = 0; j < 8; j++) {
        const angle = j * Math.PI / 4, size = Math.max(2, Math.round(6 * (1 - progress)));
        this.fill(Math.round(effect.x + Math.cos(angle) * radius) - size / 2, Math.round(effect.y + Math.sin(angle) * radius) - size / 2, size, size, color);
      }
    }
    if (state.freeze > 0) this.outline(0, 0, SIZE, '#9cdde3', 3);
    for (let layer = 0; layer < this.layers.length; layer++) {
      for (let i = this.imageCounts[layer]!; i < this.images[layer]!.length; i++) this.images[layer]![i]!.setVisible(false);
      for (let i = this.shapeCounts[layer]!; i < this.shapes[layer]!.length; i++) this.shapes[layer]![i]!.setVisible(false);
    }
  }
  dispose(): void { this.disposed = true; this.atlas?.close(); this.atlas = null; }
}
