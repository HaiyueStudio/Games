import type { Direction, Input } from '../rules/rules';

const DIRECTIONS: readonly Readonly<Record<string, Direction>>[] = [
  { KeyW: 0, KeyD: 1, KeyS: 2, KeyA: 3 },
  { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 },
];
const FIRE_KEYS = [new Set(['KeyJ', 'Space']), new Set(['Enter', 'Slash'])];

/** Keep last-pressed direction priority, including independent GUI pointer controls. */
export function desktopTankInput(player: 1 | 2, keyboard: Iterable<string>, pointers: Iterable<string>): Input {
  const directionKeys = DIRECTIONS[player - 1]!, fireKeys = FIRE_KEYS[player - 1]!;
  const input: Input = { direction: null, fire: false };
  for (const key of keyboard) {
    if (directionKeys[key] !== undefined) input.direction = directionKeys[key]!;
    if (fireKeys.has(key)) input.fire = true;
  }
  for (const key of pointers) {
    if (directionKeys[key] !== undefined) input.direction = directionKeys[key]!;
    if (fireKeys.has(key)) input.fire = true;
  }
  return input;
}
