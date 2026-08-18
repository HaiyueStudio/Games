export const MAX_WORLD_SIZE = 200;
export const DEFAULT_WORLD_SIZE = 200;
export const MAX_WORLD_HEIGHT = 48;
export const DEFAULT_TERRAIN_SEED = 0x4d_43_4c_54;

export const PLAYER_EYE_HEIGHT = 1.62;
export const PLAYER_RADIUS = 0.34;
export const PLAYER_GRAVITY = 18;
export const PLAYER_JUMP_HEIGHT = 5.5;
export const PLAYER_JUMP_SPEED = Math.sqrt(2 * PLAYER_GRAVITY * PLAYER_JUMP_HEIGHT);
export const PLAYER_STEP_HEIGHT = 1.01;

export interface MinecraftBlockColor {
  readonly digit: number;
  readonly name: string;
  readonly hex: string;
}

export const MINECRAFT_BLOCK_COLORS: readonly MinecraftBlockColor[] = Object.freeze([
  { digit: 0, name: '珊瑚红', hex: '#e85d5d' },
  { digit: 1, name: '琥珀橙', hex: '#e89445' },
  { digit: 2, name: '沙岩黄', hex: '#e4c35a' },
  { digit: 3, name: '草甸绿', hex: '#62a95a' },
  { digit: 4, name: '湖水青', hex: '#45b8b0' },
  { digit: 5, name: '天穹蓝', hex: '#4f83d8' },
  { digit: 6, name: '紫晶', hex: '#8c6bd2' },
  { digit: 7, name: '樱花粉', hex: '#d86fa8' },
  { digit: 8, name: '雪白', hex: '#e8edf2' },
  { digit: 9, name: '深岩灰', hex: '#4e5664' },
]);

export function paletteIndexForDigit(code: string): number | null {
  const match = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  return match ? Number(match[1]) : null;
}

export function jumpApexHeight(jumpSpeed = PLAYER_JUMP_SPEED, gravity = PLAYER_GRAVITY): number {
  if (!Number.isFinite(jumpSpeed) || jumpSpeed < 0) throw new RangeError('Jump speed must be finite and non-negative.');
  if (!Number.isFinite(gravity) || gravity <= 0) throw new RangeError('Gravity must be finite and positive.');
  return jumpSpeed * jumpSpeed / (2 * gravity);
}

export function requiredBlockColor(index: number): MinecraftBlockColor {
  const color = MINECRAFT_BLOCK_COLORS[index];
  if (!color) throw new RangeError(`Block palette index ${index} is outside 0..9.`);
  return color;
}
