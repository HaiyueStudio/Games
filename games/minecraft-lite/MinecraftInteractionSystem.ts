import { CartesianTransform3D, System, type World as EngineWorld } from '@haiyue/engine';
import {
  MINECRAFT_BLOCK_COLORS,
  PLAYER_EYE_HEIGHT,
  PLAYER_RADIUS,
  paletteIndexForDigit,
} from './MinecraftRules';
import type { BlockCell, MinecraftWorld, VoxelRaycastHit } from './MinecraftWorld';
import type { MinecraftVoxelRenderer } from './MinecraftVoxelRenderer';

interface MinecraftInteractionOptions {
  readonly canvas: HTMLCanvasElement;
  readonly cameraTransform: CartesianTransform3D;
  readonly world: MinecraftWorld;
  readonly renderer: MinecraftVoxelRenderer;
  readonly hotbar: HTMLElement;
  readonly target: HTMLElement;
  readonly blockCount: HTMLElement;
  readonly message: HTMLElement;
  readonly initialPalette?: number;
  readonly onStateChanged?: (selectedPalette: number) => void;
}

/** Pointer-lock block editing and number-key palette selection. */
export class MinecraftInteractionSystem extends System {
  private readonly _canvas: HTMLCanvasElement;
  private readonly _cameraTransform: CartesianTransform3D;
  private readonly _voxelWorld: MinecraftWorld;
  private readonly _renderer: MinecraftVoxelRenderer;
  private readonly _hotbar: HTMLElement;
  private readonly _target: HTMLElement;
  private readonly _blockCount: HTMLElement;
  private readonly _message: HTMLElement;
  private readonly _direction = new Float32Array(3);
  private readonly _buttons: HTMLButtonElement[] = [];
  private _selectedPalette = 3;
  private readonly _onStateChanged: (selectedPalette: number) => void;
  private _hit: VoxelRaycastHit | null = null;
  private _messageTimer = 0;
  private _disposed = false;

  constructor(options: MinecraftInteractionOptions) {
    super(() => false);
    this.name = 'MinecraftInteractionSystem';
    this.priority = -50;
    this._canvas = options.canvas;
    this._cameraTransform = options.cameraTransform;
    this._voxelWorld = options.world;
    this._renderer = options.renderer;
    this._hotbar = options.hotbar;
    this._target = options.target;
    this._blockCount = options.blockCount;
    this._message = options.message;
    this._selectedPalette = options.initialPalette ?? 3;
    this._onStateChanged = options.onStateChanged ?? (() => undefined);
    this._buildHotbar();
    window.addEventListener('keydown', this._onKeyDown);
    this._canvas.addEventListener('mousedown', this._onMouseDown);
    this._canvas.addEventListener('contextmenu', this._onContextMenu);
    this._syncHud();
  }

  override update(_world: EngineWorld): this {
    if (this._disposed) return this;
    viewDirection(this._cameraTransform.rotation, this._direction);
    this._hit = this._voxelWorld.raycast(this._cameraTransform.position, this._direction, 9);
    this._target.textContent = this._hit
      ? `${this._hit.block.x}, ${this._hit.block.y}, ${this._hit.block.z}`
      : '—';
    return this;
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    window.removeEventListener('keydown', this._onKeyDown);
    this._canvas.removeEventListener('mousedown', this._onMouseDown);
    this._canvas.removeEventListener('contextmenu', this._onContextMenu);
    if (this._messageTimer !== 0) window.clearTimeout(this._messageTimer);
  }

  override destroy(): this {
    this.dispose();
    return super.destroy();
  }

  private _buildHotbar(): void {
    this._hotbar.replaceChildren();
    for (const [index, color] of MINECRAFT_BLOCK_COLORS.entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.style.setProperty('--block-color', color.hex);
      button.title = `${color.digit} · ${color.name}`;
      button.setAttribute('aria-label', `选择 ${color.name} 方块`);
      button.innerHTML = `<span>${color.digit}</span><i></i>`;
      button.addEventListener('click', () => this._selectPalette(index));
      this._buttons.push(button);
      this._hotbar.append(button);
    }
    this._selectPalette(this._selectedPalette);
  }

  private _selectPalette(index: number): void {
    this._selectedPalette = index;
    document.body.dataset.selectedBlock = String(index);
    for (const [buttonIndex, button] of this._buttons.entries()) {
      const selected = buttonIndex === index;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    this._onStateChanged(this._selectedPalette);
  }

  private _onKeyDown = (event: KeyboardEvent): void => {
    const index = paletteIndexForDigit(event.code);
    if (index === null) return;
    this._selectPalette(index);
    event.preventDefault();
  };

  private _onMouseDown = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this._canvas || !this._hit) return;
    if (event.button === 0) this._removeBlock(this._hit.block);
    else if (event.button === 2 && this._hit.adjacent) this._addBlock(this._hit.adjacent);
    else return;
    event.preventDefault();
  };

  private _onContextMenu = (event: MouseEvent): void => event.preventDefault();

  private _removeBlock(cell: Readonly<BlockCell>): void {
    if (!this._voxelWorld.removeBlock(cell)) return;
    this._renderer.syncNeighborhood(this._voxelWorld, cell);
    this._flash('已删除方块');
    this._syncHud();
    this._onStateChanged(this._selectedPalette);
  }

  private _addBlock(cell: Readonly<BlockCell>): void {
    if (this._intersectsPlayer(cell)) {
      this._flash('不能把方块放在玩家身上');
      return;
    }
    if (!this._voxelWorld.setBlock(cell, this._selectedPalette)) return;
    this._renderer.syncNeighborhood(this._voxelWorld, cell);
    this._flash(`已放置 ${MINECRAFT_BLOCK_COLORS[this._selectedPalette]?.name ?? '方块'}`);
    this._syncHud();
    this._onStateChanged(this._selectedPalette);
  }

  private _intersectsPlayer(cell: Readonly<BlockCell>): boolean {
    const center = this._voxelWorld.worldCenter(cell);
    const player = this._cameraTransform.position;
    const horizontalOverlap = Math.abs(center[0] - player[0]!) < PLAYER_RADIUS + 0.5
      && Math.abs(center[2] - player[2]!) < PLAYER_RADIUS + 0.5;
    const feet = player[1]! - PLAYER_EYE_HEIGHT;
    const verticalOverlap = cell.y < player[1]! + 0.2 && cell.y + 1 > feet;
    return horizontalOverlap && verticalOverlap;
  }

  private _syncHud(): void {
    this._blockCount.textContent = this._voxelWorld.blockCount.toLocaleString();
    document.body.dataset.visibleBlocks = String(this._renderer.visibleBlockCount);
    document.body.dataset.selectedBlock = String(this._selectedPalette);
  }

  private _flash(message: string): void {
    this._message.textContent = message;
    this._message.classList.add('visible');
    if (this._messageTimer !== 0) window.clearTimeout(this._messageTimer);
    this._messageTimer = window.setTimeout(() => this._message.classList.remove('visible'), 1200);
  }
}

function viewDirection(rotation: Readonly<Float32Array>, output: Float32Array): void {
  const pitch = rotation[0] ?? 0;
  const yaw = rotation[1] ?? 0;
  const cosPitch = Math.cos(pitch);
  output[0] = -Math.sin(yaw) * cosPitch;
  output[1] = Math.sin(pitch);
  output[2] = -Math.cos(yaw) * cosPitch;
}
