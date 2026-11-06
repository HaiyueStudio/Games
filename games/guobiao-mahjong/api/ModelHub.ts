import type { MatchController } from '../app/MatchController';
import type { Seat } from '../rules/types';
import { httpAgent } from './agents';
export interface HostedModel { id: string; name: string; rules: 'MCR'; available: boolean; license: string }
export interface ModelParameters { temperature: number; seed: number }
export class ModelHub {
  endpoint = 'http://127.0.0.1:8787';
  models: HostedModel[] = [];
  assignments = ['builtin', 'builtin', 'builtin', 'builtin'];
  parameters: ModelParameters = { temperature: 0, seed: 20261105 };
  status = '内置 AI · 可连接本地模型服务';
  private request: AbortController | null = null;
  private readonly game: MatchController;
  constructor(game: MatchController) { this.game = game; }
  async refresh(endpoint = this.endpoint): Promise<void> {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('模型服务地址无效');
    this.request?.abort(); const request = this.request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 5000); this.status = '正在连接模型服务…';
    try {
      const response = await fetch(new URL('models', url.href.endsWith('/') ? url : url.href + '/'), { signal: request.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { protocol: string; models: HostedModel[] };
      if (payload.protocol !== 'haiyue.mcr/1' || !Array.isArray(payload.models) || payload.models.some(m => !/^[a-z0-9_-]+$/.test(m.id) || typeof m.name !== 'string' || m.rules !== 'MCR' || typeof m.available !== 'boolean')) throw new Error('模型服务协议不兼容');
      if (this.request !== request) return;
      this.endpoint = url.href.replace(/\/$/, ''); this.models = payload.models;
      this.status = `已连接 · ${this.models.filter(m => m.available).length} 个模型可用`;
    } catch (error) { if (this.request === request) { this.status = `连接失败 · ${String(error)}`; this.models = []; } throw error; }
    finally { clearTimeout(timeout); if (this.request === request) this.request = null; }
  }
  apply(assignments: readonly string[], parameters: ModelParameters): void {
    if (assignments.length !== 4 || !Number.isFinite(parameters.temperature) || parameters.temperature < 0 || parameters.temperature > 2 || !Number.isInteger(parameters.seed) || parameters.seed < 0 || parameters.seed > 0xffffffff) throw new Error('模型参数无效');
    // Validate every seat before changing any provider.
    assignments.forEach((id, who) => { if (who !== this.game.human && id !== 'builtin' && !this.models.some(m => m.id === id && m.available)) throw new Error('所选模型不可用，请先连接服务'); });
    this.parameters = { ...parameters };
    assignments.forEach((id, who) => {
      if (who === this.game.human) return;
      const model = this.models.find(m => m.id === id);
      this.game.setAgent(who as Seat, id === 'builtin' ? null : httpAgent(model!.name, `${this.endpoint}/agent/${id}`, { parameters: () => ({ ...this.parameters }) }));
      this.assignments[who] = id;
    });
    this.status = '模型设置已应用';
  }
  snapshot() { return { endpoint: this.endpoint, status: this.status, models: this.models.map(m => ({ ...m })), assignments: [...this.assignments], parameters: { ...this.parameters } }; }
  dispose(): void { this.request?.abort(); this.request = null; }
}
