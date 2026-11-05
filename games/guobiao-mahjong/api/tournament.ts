import { applyAction, createMatch, nextHand, observe } from '../rules/match';
import { actionKey, seat, type GameEvent, type Scorer, type Seat } from '../rules/types';
import type { MahjongAgent } from './agents';
import { exportReplay } from '../rules/replay';

/** Headless competition uses precisely the browser referee and information boundary. */
export async function runTournament(scorer: Scorer, agents: readonly MahjongAgent[], seeds: readonly number[], options: { rotateSeats?: boolean; timeoutMs?: number; signal?: AbortSignal; onEvent?(event: GameEvent): void } = {}) {
  if (agents.length !== 4) throw new Error('Exactly four agents are required');
  const totals = agents.map(a => ({ name: a.name, fan: 0, score: 0, wins: 0, faults: 0 }));
  const matches = [];
  for (const seedValue of seeds) for (let rotation = 0; rotation < (options.rotateSeats === false ? 1 : 4); rotation++) {
    const seated = Array.from({ length: 4 }, (_, i) => agents[(i + rotation) % 4]!);
    const s = createMatch(seedValue, seated.map(a => a.name)); let eventCount = 0;
    while (s.phase !== 'match-over') {
      options.signal?.throwIfAborted();
      if (s.phase === 'hand-over') { nextHand(s); continue; }
      const who = s.phase === 'turn' ? s.turn : [1, 2, 3].map(n => seat(s.last!.seat + n)).find(i => !s.responses[i])!;
      const o = observe(s, who, scorer), agent = seated[who]!, abort = new AbortController();
      const onAbort = () => abort.abort(options.signal?.reason); options.signal?.addEventListener('abort', onAbort, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { abort.abort(); reject(new Error('Agent timeout')); }, options.timeoutMs ?? 30000); });
      const cancelled = new Promise<never>((_, reject) => abort.signal.addEventListener('abort', () => reject(new Error('Agent request aborted')), { once: true }));
      const allowed = new Set(o.legalActions.map(actionKey));
      let action = structuredClone(o.legalActions.find(a => a.type === 'pass') ?? o.legalActions[0]!);
      try {
        const chosen = await Promise.race([Promise.resolve().then(() => agent.decide(o, { signal: abort.signal, requestId: `${seedValue}:${rotation}:${s.revision}:${who}` })), timeout, cancelled]);
        if (!allowed.has(actionKey(chosen))) throw new Error('Illegal agent action');
        action = chosen;
      } catch (error) {
        options.signal?.throwIfAborted(); totals[(who + rotation) % 4]!.faults++;
      } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', onAbort); abort.abort(); }
      applyAction(s, who, action, scorer, o.revision);
      while (eventCount < s.events.length) { const event = s.events[eventCount++]!; options.onEvent?.(structuredClone(event)); }
    }
    s.players.forEach((p, i) => { const t = totals[(i + rotation) % 4]!; t.fan += p.fan; t.score += p.score; t.wins += p.wins; });
    matches.push({ seed: seedValue, rotation, players: s.players.map(p => ({ name: p.name, fan: p.fan, score: p.score, wins: p.wins })), results: s.results, events: s.events, replay: exportReplay(s) });
  }
  return { protocol: 'haiyue.mcr/1', ranking: totals.sort((a, b) => b.fan - a.fan || b.score - a.score), matches };
}
