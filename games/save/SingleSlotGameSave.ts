import { GameSaveError, GameSaveService, LocalStorageSaveBackend, type GameSaveBackend } from '@haiyue/engine/save';

export const SINGLE_SLOT_SAVE_ID = 'autosave';
export const SINGLE_SLOT_SAVE_DATA_VERSION = 1;

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface SingleSlotGameSaveOptions<T> {
  onStatus?: (status: AutoSaveStatus) => void;
  gameId: string;
  name: string;
  backend?: GameSaveBackend;
  validateData(value: unknown): value is T;
}

/** Shared one-slot LocalStorage policy for the games in this repository. */
export class SingleSlotGameSave<T> {
  private readonly service: GameSaveService<T>;
  private readonly options: SingleSlotGameSaveOptions<T>;
  private writeRevision = 0;
  private pendingWrite: Promise<void> = Promise.resolve();

  constructor(options: SingleSlotGameSaveOptions<T>) {
    this.options = options;
    this.service = new GameSaveService<T>({
      gameId: options.gameId,
      dataVersion: SINGLE_SLOT_SAVE_DATA_VERSION,
      backend: options.backend ?? new LocalStorageSaveBackend({ namespace: 'haiyue-games' }),
      maxSlots: 1,
      validateData: options.validateData,
    });
  }

  async load(): Promise<T | null> {
    await this.flush();
    try {
      const data = (await this.service.load(SINGLE_SLOT_SAVE_ID))?.data ?? null;
      this.options.onStatus?.(data ? 'saved' : 'idle');
      return data;
    } catch (error) {
      this.report('读取存档失败，存档槽将被清理。', error);
      try {
        await this.service.delete(SINGLE_SLOT_SAVE_ID);
      } catch (deleteError) {
        this.report('清理损坏存档失败。', deleteError);
      }
      return null;
    }
  }

  save(data: T): void { void this.enqueue(data).catch(() => {}); }

  async saveNow(data: T): Promise<void> { await this.enqueue(data); }

  private enqueue(data: T): Promise<void> {
    const revision = ++this.writeRevision;
    this.options.onStatus?.('saving');
    const write = this.pendingWrite.then(() => this.write(data)).then(() => {
      if (revision === this.writeRevision) this.options.onStatus?.('saved');
    });
    this.pendingWrite = write.catch(error => {
      if (revision === this.writeRevision) this.options.onStatus?.('error');
      this.report('自动保存失败。', error);
    });
    return write;
  }

  async clear(): Promise<void> {
    await this.flush();
    await this.service.delete(SINGLE_SLOT_SAVE_ID);
  }

  async flush(): Promise<void> {
    await this.pendingWrite;
  }

  private async write(data: T): Promise<void> {
    await this.service.save({
      saveId: SINGLE_SLOT_SAVE_ID,
      name: this.options.name,
      kind: 'autosave',
      data,
    });
  }

  private report(message: string, error: unknown): void {
    if (error instanceof GameSaveError) {
      console.warn(`[${this.options.gameId} save] ${message}`, {
        code: error.code,
        operation: error.operation,
        issues: error.issues,
      });
      return;
    }
    console.warn(`[${this.options.gameId} save] ${message}`, error);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(Number.isSafeInteger);
}
