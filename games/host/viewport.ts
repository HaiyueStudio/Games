import type { GameHostOptions } from './types';

export function resizeGameViewport(options: GameHostOptions, width: number, height: number): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) throw new RangeError('Game dimensions must be positive finite numbers.');
  if (options.width === width && options.height === height) return false;
  options.width = width; options.height = height;
  options.root.style.width = width + 'px'; options.root.style.height = height + 'px';
  return true;
}
