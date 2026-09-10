import type { WeaponForm } from './rules';
export interface SkyStrikeHud {
  score: number; highScore: number; wave: number; lives: number; health: number;
  weapon: WeaponForm; weaponLevel: number; bombs: number; bombDisabled: boolean;
  bossName: string; bossHealth: number;
}
export interface SkyStrikeActions { start(): void; bomb(): void; pause(): void; suspend(): void; }
export interface SkyStrikeStatus { title: string; copy: string; action: string; gameOver: boolean; }
export interface SkyStrikeUi {
  update(hud: SkyStrikeHud): void;
  status(status: SkyStrikeStatus | null): void;
  pauseState(text: string, disabled: boolean): void;
  metadata(values: Record<string, string>): void;
  bindActions(actions: SkyStrikeActions): () => void;
  dispose(): void;
}
