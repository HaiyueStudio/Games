import { GameSaveError, GameSaveErrorCode, GameSaveService, LocalStorageSaveBackend, type GameSaveBackend } from '@haiyue/engine/save';
import { browserLegacyStorage, readLegacyJson, type LegacyJsonStorage } from '../../../save/LegacyJsonStorage';
import { checkpointMapKey, parseCheckpoint, type CheckpointData, type ValleyMap } from '../model';

/** Game-specific validation; serialization, integrity and write ordering belong to Engine. */
export class CheckpointSave {
  private readonly service: GameSaveService<CheckpointData>;
  private readonly legacy: LegacyJsonStorage | null;
  private readonly legacyKey: string;
  private readonly map: ValleyMap;
  private readonly mapKey: string;

  constructor(map: ValleyMap, options: { backend?: GameSaveBackend; legacy?: LegacyJsonStorage | null } = {}) {
    this.map = map;
    this.mapKey = checkpointMapKey(map);
    this.legacyKey = `haiyue-valley-checkpoint:${map.id}`;
    this.legacy = options.legacy === undefined ? browserLegacyStorage() : options.legacy;
    this.service = new GameSaveService<CheckpointData>({
      gameId: `valley-of-light-map:${map.id}`, dataVersion: 1, maxSlots: 1,
      backend: options.backend ?? new LocalStorageSaveBackend({ namespace: 'haiyue-games' }),
      validateData: value => { try { parseCheckpoint(value, map, this.mapKey); return true; } catch { return false; } },
    });
  }

  async load(): Promise<CheckpointData | null> {
    try {
      const saved = await this.service.load('checkpoint');
      if (saved) return saved.data;
    } catch (error) {
      if (error instanceof GameSaveError && (error.code === GameSaveErrorCode.InvalidEnvelope || error.code === GameSaveErrorCode.InvalidData)) {
        try { await this.service.delete('checkpoint'); } catch { /* A storage outage must not block play. */ }
      }
    }
    let checkpoint: CheckpointData;
    try { checkpoint = parseCheckpoint(readLegacyJson(this.legacy, this.legacyKey), this.map, this.mapKey); }
    catch { return null; }
    // Never remove the old save until the Engine envelope has been written successfully.
    try { await this.save(checkpoint); this.removeLegacy(); } catch { /* Keep playing and retain the original save for retry. */ }
    return checkpoint;
  }

  async save(data: CheckpointData): Promise<void> {
    await this.service.checkpoint({ saveId: 'checkpoint', name: data.name, data });
  }
  async clear(): Promise<void> { await this.service.delete('checkpoint'); this.removeLegacy(); }
  async dispose(): Promise<void> { await this.service.flush(); await this.service.dispose(); }
  private removeLegacy(): void { try { this.legacy?.removeItem(this.legacyKey); } catch { /* Storage may become unavailable mid-session. */ } }
}
