import type { Fan, Meld, Scorer, Tile, Win } from './types';
interface Exports {
  memory: WebAssembly.Memory; input(): number; fans(): number; fan_count(): number;
  fan_name(i: number): number; fan_value(i: number): number;
  score(count: number, packs: number, win: number, flowers: number, flags: number, round: number, seat: number): number;
  shanten(count: number): number;
}
/** One isolated WASM instance per game/worker. No filesystem, network or WASI imports. */
export async function createScorer(bytes: BufferSource): Promise<Scorer> {
  const { instance } = await WebAssembly.instantiate(bytes, {});
  const api = instance.exports as unknown as Exports;
  const data = new Int32Array(api.memory.buffer, api.input(), 128);
  const decoder = new TextDecoder();
  const catalog: Fan[] = Array.from({ length: api.fan_count() - 1 }, (_, n) => {
    const id = n + 1, start = api.fan_name(id), memory = new Uint8Array(api.memory.buffer);
    let end = start; while (memory[end]) end++;
    return { id, name: decoder.decode(memory.subarray(start, end)), value: api.fan_value(id), count: 1 };
  });
  return {
    catalog,
    analyze(hand) {
      if (![1, 4, 7, 10, 13].includes(hand.length)) throw new Error('Analysis requires a hand after discarding');
      data.set(hand); const shanten = api.shanten(hand.length);
      return { shanten, effective: Array.from({ length: 34 }, (_, i) => i).filter(i => data[64 + i]) };
    },
    shanten(hand) {
      if (![1, 4, 7, 10, 13].includes(hand.length)) throw new Error('Shanten requires a hand after discarding');
      data.set(hand); return api.shanten(hand.length);
    },
    score(hand: Tile[], melds: Meld[], win: Tile, flowers: number, flags: number, round: number, seat: number): Win | null {
      if (hand.length + melds.length * 3 !== 13 || hand.some(t => !Number.isInteger(t) || t < 0 || t > 33) || !Number.isInteger(win) || win < 0 || win > 33) return null;
      data.set(hand);
      melds.forEach((m, i) => {
        const kind = m.kind === 'chow' ? 1 : m.kind === 'pung' ? 2 : 3;
        data.set([kind, m.tiles[m.kind === 'chow' ? 1 : 0]!, m.concealed ? 0 : 1, +m.promoted], 32 + i * 4);
      });
      const total = api.score(hand.length, melds.length, win, flowers, flags, round, seat);
      if (total < 0) return null;
      const counts = new Uint16Array(api.memory.buffer, api.fans(), api.fan_count());
      const items = catalog.filter(f => counts[f.id]).map(f => ({ ...f, count: counts[f.id]! }));
      return { fan: total - flowers, flowers, total, items };
    },
  };
}
