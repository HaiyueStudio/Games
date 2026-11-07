import { actionKey, seat, TILE_NAMES, WINDS, type GameEvent, type Observation, type Seat } from '../rules/types';
import { tableLayout } from './layout';

export interface ActionNotice {
  id: string; seat: Seat; badge: string; text: string; winning: boolean;
  tone: 'chow' | 'pung' | 'kong' | 'hu'; eventIndex: number;
}
export interface ActionOpportunity { id: string; text: string; winning: boolean }
export const NOTICE_QUEUE_LIMIT = 8;
const EVENTS = new Set(['chow', 'pung', 'kong', 'concealed-kong', 'add-kong', 'hu']);

/** Uses only the local player's legal actions; another player's possible claim stays private. */
export function actionOpportunity(o: Observation, human: Seat | null, started: boolean): ActionOpportunity | null {
  if (!started || human === null || o.seat !== human) return null;
  const actions = o.legalActions.filter(a => EVENTS.has(a.type));
  if (!actions.length) return null;
  const names = ['胡', '杠', '碰', '吃'].filter(name => actions.some(a =>
    (a.type === 'hu' ? '胡' : a.type === 'chow' ? '吃' : a.type === 'pung' ? '碰' : '杠') === name));
  const tile = o.phase === 'response' && o.last ? ` · ${TILE_NAMES[o.last.tile]}` : '';
  return { id: `${o.handIndex}:${human}:${o.phase}:${o.last?.seat}:${o.last?.tile}:${actions.map(actionKey).sort().join('|')}`,
    text: `你可以 ${names.join(' / ')}${tile}`, winning: actions.some(a => a.type === 'hu') };
}

function completedNotice(o: Observation, e: GameEvent, human: Seat | null, epoch: number): ActionNotice {
  const tone = e.type === 'hu' ? 'hu' : e.type === 'chow' ? 'chow' : e.type === 'pung' ? 'pung' : 'kong';
  const badge = { chow: '吃', pung: '碰', kong: '杠', hu: '胡' }[tone];
  const name = e.seat === human ? '你' : [...o.players[e.seat]!.name].slice(0, 10).join('');
  let detail: string;
  if (e.type === 'hu') {
    const result = o.results.find(r => r.hand === e.hand && r.winner === e.seat);
    detail = result?.win ? `${result.selfDrawn ? '自摸' : '胡牌'} · ${result.win.fan} 番 + ${result.win.flowers} 花` : '胡牌';
  } else {
    const label = e.type === 'concealed-kong' ? '暗杠' : e.type === 'add-kong' ? '加杠' : e.type === 'kong' ? '明杠' : badge;
    // Never infer an opponent's concealed kong from spectator-only face data.
    detail = label + (e.type !== 'concealed-kong' && e.tile !== undefined ? ` ${TILE_NAMES[e.tile]}` : '');
  }
  return { id: `${epoch}:${e.hand}:${e.index}`, seat: e.seat, badge, tone, winning: tone === 'hu', eventIndex: e.index,
    text: `${WINDS[seat(e.seat - o.dealer)]} · ${name}  ${detail}` };
}

/** One cursor per loaded table. Repaints and response revisions cannot replay historical effects. */
export class ActionNoticeFeed {
  private epoch: number | null = null;
  private cursor = -1;
  private hand = -1;
  private queue: ActionNotice[] = [];
  private opportunityKey = '';
  private opportunity: ActionOpportunity | null = null;
  sync(o: Observation, human: Seat | null, started: boolean, epoch: number) {
    const tail = o.events.at(-1)?.index ?? -1;
    const reset = this.epoch !== epoch || tail < this.cursor;
    let urgent = false;
    const added: ActionNotice[] = [];
    if (reset) { this.epoch = epoch; this.queue = []; this.cursor = tail; }
    else {
      if (this.hand !== o.handIndex) this.queue = [];
      let start=o.events.length;while(start>0&&o.events[start-1]!.index>this.cursor)start--;
      for (let i=start;i<o.events.length;i++) {
        const event=o.events[i]!;if(!EVENTS.has(event.type))continue;
        const notice = completedNotice(o, event, human, epoch);
        added.push(notice);
        if (notice.winning) { this.queue = [notice]; urgent = true; }
        else this.queue.push(notice);
        if (this.queue.length > NOTICE_QUEUE_LIMIT) this.queue.shift();
      }
      this.cursor = tail;
    }
    this.hand = o.handIndex;
    const key=`${epoch}:${o.revision}:${human}:${started}`;
    if(key!==this.opportunityKey){this.opportunityKey=key;this.opportunity=actionOpportunity(o,human,started);}
    return { reset, urgent, added, opportunity: this.opportunity };
  }
  take(): ActionNotice | null { return this.queue.shift() ?? null; }
  get pending(): number { return this.queue.length; }
}

export function notificationRects(w: number, h: number, relative: number) {
  const { table: r, center: c, compact, actionY } = tableLayout(w, h), size = compact ? 48 : 66;
  const width = Math.min(460, w - (compact ? 24 : 48));
  const promptWidth = Math.min(540, r.width - 32);
  return {
    toast: { x: w - width - (compact ? 12 : 24), y: compact ? 80 : 82, width, height: compact ? 48 : 56 },
    opportunity: { x: c.x - promptWidth / 2, y: Math.min(actionY - 52, r.y + r.height * .68), width: promptWidth, height: 44 },
    badge: { x: relative === 0 || relative === 2 ? c.x - size / 2 : relative === 1 ? r.x + r.width - (compact ? 92 : 190) : r.x + (compact ? 44 : 124),
      y: relative === 0 ? r.y + r.height - (compact ? 108 : 244) : relative === 2 ? r.y + 86 : c.y - size / 2, width: size, height: size },
  };
}
