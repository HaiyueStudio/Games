import { actionKey, type Action, type Observation } from '../rules/types';
export interface AgentContext { signal: AbortSignal; requestId: string }
export interface MahjongAgent { name: string; decide(observation: Observation, context: AgentContext): Action | Promise<Action> }
/** Use a local server proxy to keep provider credentials out of the browser. */
export function httpAgent(name: string, endpoint: string, options: { parameters?: Record<string, unknown> | (() => Record<string, unknown>) } = {}): MahjongAgent {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Agent endpoint must be HTTP(S)');
  return { name, async decide(observation, context) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: context.signal,
      body: JSON.stringify({ protocol: observation.protocol, requestId: context.requestId, observation, ...(options.parameters ? { parameters: typeof options.parameters === 'function' ? options.parameters() : options.parameters } : {}) }) });
    if (!response.ok) throw new Error(`Agent HTTP ${response.status}`);
    const reply = await response.json() as { requestId: string; revision: number; action: Action };
    if (reply.requestId !== context.requestId || reply.revision !== observation.revision) throw new Error('Agent returned a stale or mismatched response');
    if (!observation.legalActions.some(a => actionKey(a) === actionKey(reply.action))) throw new Error('Agent returned an illegal action');
    return reply.action;
  } };
}
export const AGENT_SYSTEM_PROMPT = `你正在参加国标麻将比赛。按 haiyue.mcr/1 协议决策。只能使用 observation 中的己方手牌和公共信息，不推断为已知隐藏牌。花牌不计入 8 番起胡门槛。选择 legalActions 中的一个动作，逐字段照抄。返回 JSON：{"requestId":"请求给定值","revision":请求给定版本,"action":选定动作}。比赛共东南西北四圈 16 局，累计和牌番数（含花）排名，同时记录标准零和比赛分。`;
