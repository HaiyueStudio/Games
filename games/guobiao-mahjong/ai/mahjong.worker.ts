import { createScorer } from '../rules/scorer';
import { decide } from './strategy';
import type { Observation, Scorer } from '../rules/types';
import { replayMatch, type Replay } from '../rules/replay';
let scorer: Scorer | null = null;
globalThis.onmessage = async (event: MessageEvent<{ id: number; bytes?: ArrayBuffer; observation?: Observation; depth?: number; replay?: Replay }>) => {
  const { id, bytes, observation, depth, replay } = event.data;
  try {
    if (bytes) { scorer = await createScorer(bytes); globalThis.postMessage({ id, result: null }); }
    else if (scorer && observation) globalThis.postMessage({ id, result: decide(observation, scorer, depth) });
    else if (scorer && replay) globalThis.postMessage({ id, result: replayMatch(replay, scorer) });
    else throw new Error('Mahjong worker is not initialized');
  } catch (error) { globalThis.postMessage({ id, error: String(error) }); }
};
