import { System, type World } from '@haiyue/engine';
import { mat4 } from 'wgpu-matrix';
import { BOARD_Y, MAX_TILT, type BoardPiece } from './MazeConfig';

/** Owns removable drag/keyboard input and synchronizes every visual/static body transform. */
export class MazeTiltSystem extends System {
  private readonly _pieces: BoardPiece[] = [];
  private readonly _boardMatrix = mat4.identity() as Float32Array;
  private readonly _inverseBoardMatrix = mat4.identity() as Float32Array;
  private readonly _localMatrix = mat4.identity() as Float32Array;
  private readonly _worldMatrix = mat4.identity() as Float32Array;
  private _pitch = 0;
  private _roll = 0;
  private _targetPitch = 0;
  private _targetRoll = 0;
  private _pointerId: number | null = null;
  private _lastX = 0;
  private _lastY = 0;

  constructor(
    private readonly _canvas: HTMLCanvasElement,
    private readonly _onTilt: (pitch: number, roll: number) => void,
  ) {
    super(() => false);
    this.name = 'MazeTiltSystem';
    this.priority = -20;
    _canvas.addEventListener('pointerdown', this._onPointerDown);
    _canvas.addEventListener('pointermove', this._onPointerMove);
    _canvas.addEventListener('pointerup', this._onPointerUp);
    _canvas.addEventListener('pointercancel', this._onPointerUp);
    window.addEventListener('keydown', this._onKeyDown);
    this._rebuildBoardMatrix();
  }

  setPieces(pieces: readonly BoardPiece[]): void {
    this._pieces.length = 0;
    this._pieces.push(...pieces);
    this._applyPieces();
  }

  reset(): void {
    this._pitch = 0;
    this._roll = 0;
    this._targetPitch = 0;
    this._targetRoll = 0;
    this._rebuildBoardMatrix();
    this._applyPieces();
  }

  boardToWorld(local: readonly [number, number, number]): [number, number, number] {
    return transformPoint(this._boardMatrix, local);
  }

  worldToBoard(world: readonly [number, number, number]): [number, number, number] {
    return transformPoint(this._inverseBoardMatrix, world);
  }

  override update(_world: World, _time: number, delta: number): this {
    const blend = 1 - Math.exp(-Math.max(0, delta) / 48);
    const nextPitch = this._pitch + (this._targetPitch - this._pitch) * blend;
    const nextRoll = this._roll + (this._targetRoll - this._roll) * blend;
    if (Math.abs(nextPitch - this._pitch) > 1e-5 || Math.abs(nextRoll - this._roll) > 1e-5) {
      this._pitch = nextPitch;
      this._roll = nextRoll;
      this._rebuildBoardMatrix();
      this._applyPieces();
    }
    this._onTilt(this._pitch, this._roll);
    document.body.dataset.tiltPitch = this._pitch.toFixed(4);
    document.body.dataset.tiltRoll = this._roll.toFixed(4);
    return this;
  }

  override destroy(): this {
    this._canvas.removeEventListener('pointerdown', this._onPointerDown);
    this._canvas.removeEventListener('pointermove', this._onPointerMove);
    this._canvas.removeEventListener('pointerup', this._onPointerUp);
    this._canvas.removeEventListener('pointercancel', this._onPointerUp);
    window.removeEventListener('keydown', this._onKeyDown);
    return super.destroy();
  }

  private _rebuildBoardMatrix(): void {
    const translation = mat4.translation([0, BOARD_Y, 0]);
    const pitch = mat4.rotationX(this._pitch);
    const roll = mat4.rotationZ(this._roll);
    mat4.multiply(translation, mat4.multiply(pitch, roll), this._boardMatrix);
    mat4.inverse(this._boardMatrix, this._inverseBoardMatrix);
  }

  private _applyPieces(): void {
    for (const piece of this._pieces) {
      mat4.translation(piece.localPosition, this._localMatrix);
      mat4.multiply(this._boardMatrix, this._localMatrix, this._worldMatrix);
      piece.transform.setMatrix(this._worldMatrix);
    }
  }

  private _onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this._pointerId !== null) return;
    this._pointerId = event.pointerId;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    this._canvas.setPointerCapture(event.pointerId);
    this._canvas.classList.add('dragging');
    event.preventDefault();
  };

  private _onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) return;
    const deltaX = event.clientX - this._lastX;
    const deltaY = event.clientY - this._lastY;
    this._lastX = event.clientX;
    this._lastY = event.clientY;
    this._targetPitch = clamp(this._targetPitch + deltaY * 0.0032, -MAX_TILT, MAX_TILT);
    this._targetRoll = clamp(this._targetRoll - deltaX * 0.0032, -MAX_TILT, MAX_TILT);
    event.preventDefault();
  };

  private _onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this._pointerId) return;
    this._pointerId = null;
    this._canvas.classList.remove('dragging');
    if (this._canvas.hasPointerCapture(event.pointerId)) this._canvas.releasePointerCapture(event.pointerId);
  };

  private _onKeyDown = (event: KeyboardEvent): void => {
    const increment = event.shiftKey ? 0.045 : 0.025;
    if (event.code === 'ArrowUp' || event.code === 'KeyW') this._targetPitch -= increment;
    else if (event.code === 'ArrowDown' || event.code === 'KeyS') this._targetPitch += increment;
    else if (event.code === 'ArrowLeft' || event.code === 'KeyA') this._targetRoll += increment;
    else if (event.code === 'ArrowRight' || event.code === 'KeyD') this._targetRoll -= increment;
    else return;
    this._targetPitch = clamp(this._targetPitch, -MAX_TILT, MAX_TILT);
    this._targetRoll = clamp(this._targetRoll, -MAX_TILT, MAX_TILT);
    event.preventDefault();
  };
}

function transformPoint(matrix: Float32Array, point: readonly [number, number, number]): [number, number, number] {
  const [x, y, z] = point;
  return [
    (matrix[0] ?? 0) * x + (matrix[4] ?? 0) * y + (matrix[8] ?? 0) * z + (matrix[12] ?? 0),
    (matrix[1] ?? 0) * x + (matrix[5] ?? 0) * y + (matrix[9] ?? 0) * z + (matrix[13] ?? 0),
    (matrix[2] ?? 0) * x + (matrix[6] ?? 0) * y + (matrix[10] ?? 0) * z + (matrix[14] ?? 0),
  ];
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
