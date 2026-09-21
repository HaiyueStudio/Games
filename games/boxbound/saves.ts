import {
  GameSaveService,
  LocalStorageSaveBackend,
  type GameSaveBackend,
} from '@haiyue/engine/save';
import { clone, validState, type State } from './model';
import { upgradeState } from './levels';
export class BoxboundSaves {
  readonly service: GameSaveService<State>;
  constructor(
    backend: GameSaveBackend = new LocalStorageSaveBackend({
      namespace: 'haiyue-games',
    }),
  ) {
    this.service = new GameSaveService({
      gameId: 'boxbound',
      dataVersion: 1,
      backend,
      maxSlots: 5,
      validateData: validState,
    });
  }
  private id(slot: number): string {
    if (!Number.isInteger(slot) || slot < 1 || slot > 5)
      throw new Error('存档编号必须在 1–5 之间');
    return `journey-${slot}`;
  }
  async load(slot: number): Promise<State | null> {
    const state = (await this.service.load(this.id(slot)))?.data;
    return state ? upgradeState(state) : null;
  }
  async save(slot: number, state: State): Promise<void> {
    await this.service.save({
      saveId: this.id(slot),
      name: `旅程 ${slot}`,
      kind: 'autosave',
      data: clone(state),
      metadata: { completed: state.completed.length, moves: state.moves },
    });
  }
  async summaries() {
    return this.service.list();
  }
}
