import type { MugenCommandProgram } from '../../import/cmd/types';
import type { MugenSourceInputSnapshot, MugenSourcePlayerInput } from './MugenInputRuntime';

export interface MugenLegacyAiPlayerConfig {
  readonly playerId: string;
  readonly aiLevel: number;
  readonly seed: string | number;
  readonly commands: MugenCommandProgram;
}

/**
 * Deterministic compatibility source for MUGEN 1.1's AI.Cheat command channel.
 * It emits command names into the same tick snapshot consumed by human input;
 * it never changes character state or executes controllers directly.
 */
export class MugenLegacyAiInput {
  readonly #players: ReadonlyMap<string, Readonly<{ aiLevel: number; seed: string; commands: readonly string[] }>>;

  constructor(configs: readonly MugenLegacyAiPlayerConfig[]) {
    if (!Array.isArray(configs) || configs.length < 1 || configs.length > 8) throw new TypeError('MUGEN legacy AI requires from 1 to 8 player configurations.');
    const entries: Array<readonly [string, Readonly<{ aiLevel: number; seed: string; commands: readonly string[] }>]> = configs.map(config => {
      if (typeof config.playerId !== 'string' || !/^[A-Za-z][A-Za-z0-9._:-]{0,31}$/u.test(config.playerId)) throw new TypeError('MUGEN legacy AI player id is invalid.');
      if (!Number.isSafeInteger(config.aiLevel) || config.aiLevel < 1 || config.aiLevel > 8) throw new RangeError('MUGEN legacy AI level must be from 1 to 8.');
      if ((typeof config.seed !== 'string' && typeof config.seed !== 'number') || (typeof config.seed === 'number' && !Number.isSafeInteger(config.seed)) || String(config.seed).length < 1 || String(config.seed).length > 128) throw new TypeError('MUGEN legacy AI seed is invalid.');
      if (!config.commands || config.commands.schemaVersion !== 1 || config.commands.revision !== 'm08-g08b-command-v1' || !Array.isArray(config.commands.commands) || config.commands.commands.length < 1) throw new TypeError('MUGEN legacy AI command program is invalid.');
      const program: MugenCommandProgram = config.commands;
      const commands: readonly string[] = Object.freeze([...new Set<string>(program.commands.map(command => command.foldedName))]);
      return [config.playerId, Object.freeze({ aiLevel: config.aiLevel, seed: String(config.seed), commands })] as const;
    });
    if (new Set(entries.map(entry => entry[0])).size !== entries.length) throw new TypeError('MUGEN legacy AI player id is duplicated.');
    this.#players = new Map(entries);
  }

  apply(source: MugenSourceInputSnapshot): MugenSourceInputSnapshot {
    if (!Number.isSafeInteger(source.tick) || source.tick < 1 || !Array.isArray(source.players)) throw new TypeError('MUGEN legacy AI source snapshot is invalid.');
    const players = source.players.map(player => this.#applyPlayer(source.tick, player));
    return Object.freeze({ tick: source.tick, players: Object.freeze(players) });
  }

  #applyPlayer(tick: number, player: MugenSourcePlayerInput): MugenSourcePlayerInput {
    const config = this.#players.get(player.id);
    if (config === undefined) return player;
    const gate = roll(`${config.seed}:${player.id}:${tick}:gate`) % 1_000;
    const active = gate < config.aiLevel * 120;
    const selected = active ? config.commands[roll(`${config.seed}:${player.id}:${tick}:command`) % config.commands.length]! : undefined;
    return Object.freeze({ id: player.id, actions: Object.freeze([]), aiLevel: config.aiLevel, aiCommands: Object.freeze(selected === undefined ? [] : [selected]) });
  }
}

function roll(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d); hash ^= hash >>> 15; hash = Math.imul(hash, 0x846ca68b); hash ^= hash >>> 16;
  return hash >>> 0;
}
