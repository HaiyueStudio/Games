import { SingleSlotGameSave, isFiniteNumber, isRecord } from '../../save/SingleSlotGameSave';
import type { MugenViewerBackground } from './MugenWebGpuView';

export interface MugenViewerPreferences {
  readonly background: MugenViewerBackground;
  readonly loop: boolean;
  readonly speed: number;
  readonly volume?: number;
  readonly origin: boolean;
  readonly axis: boolean;
  readonly spriteBounds: boolean;
  readonly clsn1: boolean;
  readonly clsn2: boolean;
}

export class MugenViewerPreferenceStore {
  readonly #save = new SingleSlotGameSave<MugenViewerPreferences>({
    gameId: 'mugen-viewer',
    name: 'MUGEN viewer preferences',
    validateData: isMugenViewerPreferences,
  });

  load(): Promise<MugenViewerPreferences | null> { return this.#save.load(); }
  save(value: MugenViewerPreferences): void { this.#save.save(Object.freeze({ ...value })); }
  flush(): Promise<void> { return this.#save.flush(); }
}

export function isMugenViewerPreferences(value: unknown): value is MugenViewerPreferences {
  if (!isRecord(value)) return false;
  return isBackground(value.background)
    && typeof value.loop === 'boolean'
    && isFiniteNumber(value.speed) && value.speed > 0 && value.speed <= 16
    && (value.volume === undefined || (isFiniteNumber(value.volume) && value.volume >= 0 && value.volume <= 1))
    && typeof value.origin === 'boolean'
    && typeof value.axis === 'boolean'
    && typeof value.spriteBounds === 'boolean'
    && typeof value.clsn1 === 'boolean'
    && typeof value.clsn2 === 'boolean';
}

function isBackground(value: unknown): value is MugenViewerBackground {
  return value === 'checker' || value === 'dark' || value === 'light';
}
