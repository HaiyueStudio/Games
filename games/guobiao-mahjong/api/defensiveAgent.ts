import type {MahjongAgent} from './agents';
import {lastTileAlternative} from '../ai/lastTileDefense';
import {actionKey} from '../rules/types';
/** Optional public-information guard for HTTP, local or third-party agents. */
export function withLastTileDefense(agent:MahjongAgent):MahjongAgent {
  return {name:agent.name+' + 末张防守',async decide(o,context){
    const action=await agent.decide(o,context);
    if(context.signal.aborted)throw new DOMException('模型任务已取消','AbortError');
    if(!o.legalActions.some(a=>actionKey(a)===actionKey(action)))throw new Error('Agent returned an illegal action');
    return lastTileAlternative(o,action)??action;
  }};
}
