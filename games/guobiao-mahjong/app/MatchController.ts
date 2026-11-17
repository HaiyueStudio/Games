import { applyAction, createMatch, legalActions, nextHand, observe } from '../rules/match';
import { actionKey, seat, type Action, type Match, type Observation, type Scorer, type Seat, type Meld, type Tile } from '../rules/types';
import type { Decision } from '../ai/strategy';
import type { WorkerAgent } from '../ai/WorkerAgent';
import type { MahjongAgent } from '../api/agents';
import { exportReplay, type SavedGame } from '../rules/replay';
import type { HandAnalysis } from '../rules/handAnalysis';

export class MatchController {
  private state: Match;
  private agents = new Map<Seat, MahjongAgent>();
  private missingAgents = new Set<Seat>();
  private request: AbortController | null = null;
  private pending: { seat: Seat; action: Action; revision: number; at: number } | null = null;
  private clock = 0;
  private generation = 0;
  private presentationGeneration = 0;
  private disposed = false;
  paused = true;
  started = false;
  human: Seat | null = 0;
  delayMs = 900;
  timeoutMs = 30000;
  depth = 2;
  autoNext = false;
  status = '选择座位，开始东南西北四圈对局';
  analysis: Decision | null = null;
  handAnalysis: HandAnalysis | null = null;
  private readonly scorer: Scorer;
  private readonly worker: WorkerAgent;
  constructor(scorer: Scorer, worker: WorkerAgent, seedValue = 20261105) { this.scorer = scorer; this.worker = worker; this.state = createMatch(seedValue); }
  observation(who: Seat = this.human ?? 0): Observation { return observe(this.state, who, this.scorer); }
  /** Public wall positions for rendering; no tile identities or order are exposed. */
  presentationWall(): { head: number; tail: number } { return { head: this.state.head, tail: this.state.tail }; }
  presentationWinningTile(): Tile | null {
    const result = this.state.results.at(-1);
    if (!this.state.phase.endsWith('over') || !result || result.hand !== this.state.handIndex || result.winner === null) return null;
    return result.selfDrawn ? this.state.drawn : this.state.last?.tile ?? null;
  }
  /** Display-only spectator/settlement data. Never sent to a decision provider. */
  presentationHands(): { hands: Tile[][]; melds: Meld[][]; drawn: Tile | null } | null {
    const result = this.state.results.at(-1);
    if (this.state.phase.endsWith('over') && result?.hand === this.state.handIndex) return structuredClone({ hands: result.hands, melds: result.melds, drawn: null });
    if (this.human !== null) return null;
    return structuredClone({ hands: this.state.players.map(p => p.hand), melds: this.state.players.map(p => p.melds), drawn: this.state.phase === 'turn' ? this.state.drawn : null });
  }
  get revision(): number { return this.state.revision; }
  get viewRevision(): number { return this.generation; }
  /** Changes only when a loaded table or viewing seat is replaced. */
  get presentationEpoch(): number { return this.presentationGeneration; }
  get thinking(): boolean { return this.request !== null; }
  /** Registration identity lets model settings preserve third-party providers in saves. */
  agentAt(who: Seat): MahjongAgent | 'missing' | null { return this.agents.get(who) ?? (this.missingAgents.has(who) ? 'missing' : null); }
  get waitingMs(): number { return this.pending ? Math.max(0, this.pending.at - this.clock) : 0; }
  start(): void { this.started = true; this.paused = false; this.status = '对局进行中'; }
  pause(value = !this.paused): void { this.paused = value; }
  setDelay(ms: number): void { if (!Number.isFinite(ms) || ms < 0 || ms > 30000) throw new Error('Delay must be between 0 and 30000 ms'); this.delayMs = ms; if (this.pending) this.pending.at = this.clock + ms; }
  setHuman(who: Seat | null): void {
    this.presentationGeneration++;
    this.human = who;
    this.state.players.forEach((p, i) => { p.name = i === who ? '玩家' : this.agents.get(i as Seat)?.name ?? ['玄玉 AI', '青竹 AI', '白露 AI', '听雨 AI'][i]!; });
    this.invalidate();
  }
  setAgent(who: Seat, agent: MahjongAgent | null): void { if (agent) this.agents.set(who, agent); else this.agents.delete(who); this.missingAgents.delete(who); this.state.players[who]!.name = who === this.human ? '玩家' : agent?.name ?? ['玄玉 AI', '青竹 AI', '白露 AI', '听雨 AI'][who]!; this.invalidate(); }
  reset(seedValue: number): void { this.invalidate(); this.missingAgents.clear(); this.state = createMatch(seedValue); this.setHuman(this.human); this.started = false; this.paused = true; this.analysis = null; this.status = '新比赛就绪'; }
  next(): void { nextHand(this.state); this.invalidate(); this.status = '下一局'; }
  act(action: Action, revision = this.state.revision): void {
    if (this.human === null || !this.started) throw new Error('No human seat is active');
    applyAction(this.state, this.human, action, this.scorer, revision); this.invalidate(); this.analysis = null;
  }
  private invalidate(): void { this.generation++; this.request?.abort(); this.request = null; this.pending = null; this.handAnalysis = null; }
  async inspectHand(): Promise<void> {
    if (this.human === null || this.disposed) return;
    const generation = this.generation, o = this.observation(this.human), result = await this.worker.inspect(o);
    if (!this.disposed && generation === this.generation && this.human === o.seat && this.revision === o.revision) this.handAnalysis = result;
  }
  tick(deltaMs: number): void {
    if (this.disposed || this.paused || !this.started) return;
    this.clock += Math.min(100, Math.max(0, deltaMs));
    if (this.state.phase === 'hand-over' && this.autoNext) { this.next(); return; }
    if (this.pending) {
      if (this.clock >= this.pending.at) { const p = this.pending; this.pending = null; if (p.revision === this.state.revision) { applyAction(this.state, p.seat, p.action, this.scorer, p.revision); this.generation++; } }
      return;
    }
    if (!this.request) void this.compute(false);
  }
  async step(): Promise<void> { if (!this.started) { this.started = true; } this.paused = true; if (this.pending) { const p = this.pending; this.pending = null; if (p.revision === this.state.revision) applyAction(this.state, p.seat, p.action, this.scorer, p.revision); return; } if (!this.request) await this.compute(true); }
  async hint(): Promise<Decision | null> {
    if (this.human === null) return null;
    const o = this.observation(this.human); if (!o.legalActions.length) return null;
    const generation = this.generation, result = await this.worker.decide(o, this.depth);
    if (generation === this.generation) this.analysis = result;
    return result;
  }
  private async compute(immediate: boolean): Promise<void> {
    const s = this.state; if (!['turn', 'response'].includes(s.phase)) return;
    const who = s.phase === 'turn' ? s.turn : [1, 2, 3].map(n => seat(s.last!.seat + n)).find(i => !s.responses[i])!;
    const actions = legalActions(s, who, this.scorer);
    // Uncontested discards advance without forcing the human to click "pass".
    if (actions.length === 1 && actions[0]!.type === 'pass') { applyAction(s, who, actions[0]!, this.scorer); return; }
    if (who === this.human) { this.status = s.phase === 'turn' ? '轮到你：点击手牌出牌' : '你可以吃、碰、杠、和，或选择过'; return; }
    if (this.missingAgents.has(who)) { this.paused = true; this.status = '外部算法未连接，请重新接入后继续'; return; }
    const revision = s.revision, generation = this.generation, abort = new AbortController(); this.request = abort;
    this.status = `${s.players[who]!.name} 正在思考`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const agent = this.agents.get(who), o = observe(s, who, this.scorer);
      const cancelled = new Promise<never>((_, reject) => abort.signal.addEventListener('abort', () => reject(new Error('Decision cancelled')), { once: true }));
      timer = setTimeout(() => abort.abort(), this.timeoutMs);
      let chosen: Action;
      if (agent) chosen = await Promise.race([Promise.resolve().then(() => agent.decide(o, { signal: abort.signal, requestId: `${s.seed}:${generation}:${revision}:${who}` })), cancelled]);
      else { const decision = await Promise.race([this.worker.decide(o, this.depth), cancelled]); chosen = decision.action; }
      if (generation !== this.generation || this.disposed) return;
      if (!actions.some(a => actionKey(a) === actionKey(chosen))) throw new Error('算法返回了非法动作');
      this.status = `${s.players[who]!.name} 已完成计算`;
      if (immediate) applyAction(s, who, chosen, this.scorer, revision);
      else this.pending = { seat: who, action: chosen, revision, at: this.clock + this.delayMs };
    } catch (error) {
      if (generation !== this.generation || this.disposed) return;
      // A failed provider pauses for review; never silently replaces a model's move.
      this.paused = true; this.status = `算法异常，已暂停：${String(error)}`;
    } finally { clearTimeout(timer); if (this.request === abort) this.request = null; }
  }
  async restore(saved: SavedGame): Promise<boolean> {
    this.invalidate(); const generation = this.generation;
    const state = await this.worker.replay(saved.replay);
    if (this.disposed || generation !== this.generation) return false;
    this.state = state; this.human = saved.human; this.delayMs = saved.delayMs; this.presentationGeneration++;
    this.missingAgents = new Set((saved.externalSeats ?? []).filter(i => !this.agents.has(i)));
    this.started = true; this.paused = true; this.status = this.missingAgents.size ? '外部算法未连接，请重新接入后继续' : '已恢复对局，点击继续';
    return true;
  }
  save(): SavedGame { return { version: 1, replay: exportReplay(this.state), human: this.human, delayMs: this.delayMs, externalSeats: [...new Set([...this.agents.keys(), ...this.missingAgents])] }; }
  exportReplay(): object { return { ...exportReplay(this.state), events: structuredClone(this.state.events), results: structuredClone(this.state.results) }; }
  dispose(): void { this.disposed = true; this.invalidate(); }
}
