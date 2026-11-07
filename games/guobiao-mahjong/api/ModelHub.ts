import type { MatchController } from '../app/MatchController';
import type { Seat } from '../rules/types';
import type { BrowserModelSettings } from '../rules/replay';
import { httpAgent, type MahjongAgent } from './agents';
import { BrowserModelRuntime } from '../ai/browser/BrowserModelRuntime';
import { BROWSER_MODELS, browserModel, validBackend, validateParameters, type BrowserBackend } from '../ai/browser/catalog';
export interface HostedModel { id: string; name: string; rules: 'MCR'; available: boolean; license: string; source?: 'browser' | 'http' }
export interface ModelParameters { temperature: number; seed: number }
const localModels = (): HostedModel[] => BROWSER_MODELS.map(m => ({ id: m.id, name: m.name, rules: 'MCR', available: true, license: 'MIT', source: 'browser' }));
export class ModelHub {
  endpoint = 'http://127.0.0.1:8787';
  models: HostedModel[] = localModels();
  assignments = ['builtin', 'builtin', 'builtin', 'builtin'];
  parameters: ModelParameters = { temperature: 0, seed: 20261105 };
  backend: BrowserBackend = 'webgpu';
  status = '浏览器模型可直接使用 · WebGPU 加速已开启';
  configRevision = 0;
  private request: AbortController | null = null;
  private readonly managedAgents = new Map<Seat, MahjongAgent>();
  private readonly game: MatchController;
  readonly browser: BrowserModelRuntime;
  constructor(game: MatchController, browser = new BrowserModelRuntime()) { this.game = game; this.browser = browser; }
  async refresh(endpoint = this.endpoint): Promise<void> {
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('模型服务地址无效');
    this.request?.abort(); const request = this.request = new AbortController();
    const timeout = setTimeout(() => request.abort(), 5000); this.status = '正在连接模型服务…';
    try {
      const response = await fetch(new URL('models', url.href.endsWith('/') ? url : url.href + '/'), { signal: request.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as { protocol: string; models: HostedModel[] };
      if (payload.protocol !== 'haiyue.mcr/1' || !Array.isArray(payload.models) || payload.models.some(m => !/^[a-z0-9_-]+$/.test(m.id) || m.id === 'builtin' || m.id.startsWith('browser-') || typeof m.name !== 'string' || m.rules !== 'MCR' || typeof m.available !== 'boolean') || new Set(payload.models.map(m => m.id)).size !== payload.models.length) throw new Error('模型服务协议不兼容');
      if (this.request !== request) return;
      this.endpoint = url.href.replace(/\/$/, ''); this.models = [...payload.models.map(m => ({ ...m, source: 'http' as const })), ...localModels()];
      this.status = `已连接 · ${this.models.filter(m => m.available).length} 个模型可用`;
    } catch (error) { if (this.request === request) { this.status = `连接失败 · 浏览器模型仍可使用 · ${String(error)}`; this.models = localModels(); } throw error; }
    finally { clearTimeout(timeout); if (this.request === request) this.request = null; }
  }
  private validate(assignments: readonly string[], parameters: ModelParameters, backend: BrowserBackend) {
    validateParameters(parameters);
    if (assignments.length !== 4 || !validBackend(backend)) throw new Error('模型参数无效');
    assignments.forEach((id, who) => { if (who !== this.game.human && id !== 'builtin' && !this.models.some(m => m.id === id && m.available)) throw new Error('所选模型不可用，请先连接服务'); });
  }
  async prepare(assignments: readonly string[], backend: BrowserBackend, signal: AbortSignal): Promise<void> {
    this.validate(assignments, this.parameters, backend);
    const ids = assignments.filter((id, who) => who !== this.game.human && !!browserModel(id));
    if (ids.length) await this.browser.prepare(ids, backend, signal);
  }
  apply(assignments: readonly string[], parameters: ModelParameters, backend = this.backend): void {
    this.validate(assignments, parameters, backend);
    this.browser.setBackend(backend); this.backend = backend; this.parameters = { ...parameters };
    assignments.forEach((id, who) => {
      if (who === this.game.human) return;
      const model = this.models.find(m => m.id === id);
      const agent = id === 'builtin' ? null : browserModel(id) ? this.browserAgent(id) : httpAgent(model!.name, `${this.endpoint}/agent/${id}`, { parameters: () => ({ ...this.parameters }) });
      this.game.setAgent(who as Seat, agent);
      if (agent) this.managedAgents.set(who as Seat, agent); else this.managedAgents.delete(who as Seat);
      this.assignments[who] = id;
    });
    if (!this.assignments.some(id => browserModel(id))) this.browser.release();
    this.configRevision++; this.status = '模型设置已应用';
  }
  browserAgent(id: string) { return this.browser.agent(id, () => ({ ...this.parameters }), () => this.backend); }
  savedConfiguration(): BrowserModelSettings {
    return { version: 1, backend: this.backend, assignments: this.assignments.map((id, who) => {
      const registered = this.game.agentAt(who as Seat);
      if (registered === null) return 'builtin';
      return registered === this.managedAgents.get(who as Seat) && browserModel(id) ? id : null;
    }), ...this.parameters };
  }
  restoreConfiguration(settings?: BrowserModelSettings): void {
    if (!settings) return;
    validateParameters(settings);
    if (!validBackend(settings.backend) || settings.assignments.length !== 4 || settings.assignments.some(id => id !== null && id !== 'builtin' && !browserModel(id))) throw new Error('浏览器模型存档无效');
    this.browser.setBackend(settings.backend); this.backend = settings.backend; this.parameters = { temperature: settings.temperature, seed: settings.seed };
    settings.assignments.forEach((id, who) => {
      if (id === null) return;
      const agent = id === 'builtin' ? null : this.browserAgent(id);
      this.game.setAgent(who as Seat, agent); this.assignments[who] = id;
      if (agent) this.managedAgents.set(who as Seat, agent); else this.managedAgents.delete(who as Seat);
    });
    this.configRevision++; this.status = '浏览器模型设置已恢复';
  }
  snapshot() { return { endpoint: this.endpoint, status: this.status, backend: this.backend, browser: this.browser.snapshot(), models: this.models.map(m => ({ ...m })), assignments: [...this.assignments], parameters: { ...this.parameters } }; }
  dispose(): void { this.request?.abort(); this.request = null; this.browser.dispose(); }
}
