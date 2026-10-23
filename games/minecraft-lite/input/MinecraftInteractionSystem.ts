import type{MinecraftHud}from'../ui/MinecraftHud';
import type{GuiButton}from'@haiyue/engine/gui';
import { gamepadFrame } from '../../gamepad/runtime';
import { CartesianTransform3D, System, type World as EngineWorld } from '@haiyue/engine';
import {
  MINECRAFT_BLOCK_COLORS,
  PLAYER_EYE_HEIGHT,
  PLAYER_RADIUS,
  paletteIndexForDigit,
} from '../rules/MinecraftRules';
import type { BlockCell, MinecraftWorld, VoxelRaycastHit } from '../rules/MinecraftWorld';
import type { MinecraftVoxelRenderer } from '../rendering/MinecraftVoxelRenderer';

interface MinecraftInteractionOptions {
  readonly canvas: HTMLCanvasElement;
  readonly cameraTransform: CartesianTransform3D;
  readonly world: MinecraftWorld;
  readonly renderer: MinecraftVoxelRenderer;
  readonly hud: MinecraftHud;
  readonly initialPalette?: number;
  readonly onStateChanged?: (selectedPalette: number) => void;
}

/** Pointer-lock block editing and number-key palette selection. */
export class MinecraftInteractionSystem extends System {
  private readonly _canvas: HTMLCanvasElement;
  private readonly _cameraTransform: CartesianTransform3D;
  private readonly _voxelWorld: MinecraftWorld;
  private readonly _renderer: MinecraftVoxelRenderer;
  private readonly _hud: MinecraftHud;
  private readonly _direction = new Float32Array(3);
  private readonly _buttons: GuiButton[] = [];
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
    this._hud=options.hud;
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
    this._hud.target.setText(this._hit
      ? `${this._hit.block.x}, ${this._hit.block.y}, ${this._hit.block.z}`
      : '—');
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
    for(const [index,color] of MINECRAFT_BLOCK_COLORS.entries()){
      const button=this._hud.button(String(color.digit),75+index*85,590,78,()=>this._selectPalette(index),45);
      button.setStyle({backgroundColor:color.hex});this._buttons.push(button);
    }
    this._selectPalette(this._selectedPalette);
  }

  private _selectPalette(index: number): void {
    this._selectedPalette = index;
    document.body.dataset.selectedBlock = String(index);
    for (const [buttonIndex, button] of this._buttons.entries()) {
      const selected = buttonIndex === index;
      button.setStyle({borderColor:selected?'#ffffff':'#263447',color:selected?'#ffffff':'#18202b'});
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
    if(document.pointerLockElement!==this._canvas && this._hud.hit(event.clientX,event.clientY,this._canvas))return;
    if ((document.pointerLockElement !== this._canvas && !gamepadFrame()) || !this._hit) return;
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
    this._hud.blockCount.setText(this._voxelWorld.blockCount.toLocaleString());
    document.body.dataset.visibleBlocks = String(this._renderer.visibleBlockCount);
    document.body.dataset.selectedBlock = String(this._selectedPalette);
  }

  private _flash(message: string): void {
    this._hud.message.setText(message);
    this._hud.message.setVisible(true);
    if (this._messageTimer !== 0) window.clearTimeout(this._messageTimer);
    this._messageTimer = window.setTimeout(() => this._hud.message.setVisible(false), 1200);
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
