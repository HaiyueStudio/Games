import type { Observation } from '../rules/types';
import { tilePose, wallTile, WALL_TILE_PITCH, type TableTile, type WallState } from './tableModel';

export interface TilePose { x: number; y: number; z: number; angle: number; yaw: number }
export interface TileFlight {
  kind: string; tile: number | null; concealedAtStart: boolean; target: string;
  from: TilePose; to: TilePose; width: number; depth: number; startWidth: number; startDepth: number;
  arc: number; delay: number; duration: number; wallIndex?: number;
}
export interface AnimationBoard { tiles: TableTile[]; observation: Observation; wall: WallState; view: number; epoch: number; winningTile: number | null }
interface BoardHistory {
  tiles: TableTile[]; wall: WallState; view: number; epoch: number; revision: number; handIndex: number;
  cursor: number; last: Observation['last']; flowers: number[];
}
export const tileKey = (t: TableTile) => `${t.seat}:${t.role}:${t.group}:${t.sourceIndex}`;
const hand = (t: TableTile) => ['hand','revealed','concealed'].includes(t.role);
const pose = (t: TableTile): TilePose => { const {x,y,z,angle,yaw}=tilePose(t); return {x,y,z,angle,yaw}; };
/** Both ends take the upper visible tile of a full stack; a one-tile stack stays on the felt. */
export function wallPickup(wall: WallState, viewDealer: number, back: boolean) {
  const index = back ? wall.tail : wall.head, tile = wallTile(wall,index,viewDealer);
  if (!tile) return null;
  const first = Math.floor(index/2)*2, layer = first>=wall.head&&first+1<=wall.tail?1:0;
  return { index, pose: { x: tile.x, y: 1 + layer * WALL_TILE_PITCH, z: tile.z, angle: 0, yaw: tile.yaw } };
}
export function flightAt(f: TileFlight, elapsed: number) {
  const progress = Math.max(0, Math.min(1, (elapsed - f.delay) / f.duration));
  const t = progress * progress * (3 - 2 * progress), mix = (a: number, b: number) => progress===0?a:progress===1?b:a + (b - a) * t;
  return { progress, pose: { x: mix(f.from.x,f.to.x), y: mix(f.from.y,f.to.y) + 4 * f.arc * progress * (1-progress),
    z: mix(f.from.z,f.to.z), angle: mix(f.from.angle,f.to.angle), yaw: mix(f.from.yaw,f.to.yaw) },
    width: mix(f.startWidth,f.width), depth: mix(f.startDepth,f.depth),
    tile: f.concealedAtStart && progress < .45 ? null : f.tile };
}
/** Consumes public events once; restored games establish a cursor without replaying old moves. */
export class TileAnimationTimeline {
  private previous: BoardHistory | null = null;
  flights: TileFlight[] = [];
  elapsed = 0;
  private stepPlayback = false;
  get active() { return this.flights.some(f => this.elapsed < f.delay + f.duration); }
  advance(delta: number, paused: boolean, suspended = false) {
    if (suspended || !this.active || paused && !this.stepPlayback) return false;
    this.elapsed += Math.max(0, Math.min(100, delta)); return true;
  }
  sync(board: AnimationBoard, paused: boolean) {
    const old = this.previous, o=board.observation;
    // Animation history needs poses and a public event cursor, never previous rounds' results or hands.
    this.previous = {tiles:board.tiles.map(t=>({...t,rect:{...t.rect}})),wall:{...board.wall},view:board.view,epoch:board.epoch,
      revision:o.revision,handIndex:o.handIndex,cursor:o.events.at(-1)?.index??-1,last:o.last?{...o.last}:null,flowers:o.players.map(p=>p.flowers.length)};
    if (!old || old.epoch !== board.epoch || old.view !== board.view || old.handIndex !== o.handIndex) {
      this.flights = []; this.elapsed = 0; return true;
    }
    if (old.revision === o.revision) return false;
    let start=o.events.length;while(start>0&&o.events[start-1]!.index>old.cursor)start--;
    const events = o.events.slice(start), oldKeys=new Set(old.tiles.map(tileKey));
    const flights: TileFlight[] = [], used = new Set<string>();
    const takeHand = (seat: number, tile: number | null) => {
      const candidates = old.tiles.filter(t => t.seat === seat && hand(t) && !used.has(tileKey(t)));
      const found = candidates.find(t => tile !== null && t.tile === tile) ?? candidates.find(t => t.drawn) ?? candidates.at(-1);
      if (found) used.add(tileKey(found)); return found;
    };
    const add = (kind: string, source: TableTile, target: TableTile, delay = 0, arc = 90) => {
      flights.push({ kind, tile: target.tile, concealedAtStart: source.tile === null, target: tileKey(target), from: pose(source), to: pose(target),
        width: target.rect.width, depth: target.rect.height, startWidth: source.rect.width, startDepth: source.rect.height, arc, delay, duration: kind === 'hu' ? 950 : 650 });
    };
    const virtual = { ...old.wall }, relativeDealer = (board.observation.dealer - board.view + 4) % 4;
    let replacement = false, drawDelay = 0;
    const flowers = [...old.flowers];
    for (const event of events) {
      if (event.type === 'discard') {
        replacement = false;
        const target = board.tiles.filter(t => t.seat === event.seat && t.role === 'river').at(-1);
        const source = takeHand(event.seat, event.tile ?? null);
        if (source && target) add('discard',source,target);
      } else if (['chow','pung','kong','concealed-kong','add-kong'].includes(event.type)) {
        const newMelds = board.tiles.filter(t => t.seat === event.seat && t.role === 'meld');
        const targets = newMelds.filter(t => (event.type!=='add-kong'||t.sourceIndex===3)&&!oldKeys.has(tileKey(t)));
        const last = old.last;
        const claimed = event.type !== 'concealed-kong' && event.type !== 'add-kong' && last
          ? old.tiles.filter(t => t.seat === last.seat && t.role === 'river').at(-1) : undefined;
        const called = targets.find(t => t.emphasis === 'called') ?? targets.find(t => t.tile === event.tile);
        targets.forEach((target,i) => {
          const source = claimed && target === called ? claimed : takeHand(event.seat,target.tile);
          if (source) add(event.type,source,target,i*65,80);
        });
        if (event.type.includes('kong')) { replacement = true; drawDelay = 850; }
      } else if (event.type === 'flower' || event.type === 'draw') {
        const back = replacement || virtual.head >= board.wall.head;
        const pickup = wallPickup(virtual,relativeDealer,back);
        if (back) virtual.tail--; else virtual.head++;
        const flowerIndex = event.type === 'flower' ? flowers[event.seat]!++ : -1;
        const target = event.type === 'flower' ? board.tiles.find(t => t.role === 'flower' && t.seat === event.seat && t.sourceIndex === flowerIndex)
          : board.tiles.find(t => hand(t) && t.seat === event.seat && t.drawn) ?? board.tiles.filter(t => hand(t) && t.seat === event.seat).at(-1);
        if (pickup && target) flights.push({ kind: event.type, tile: target.tile, concealedAtStart: true, target: tileKey(target),
          from: pickup.pose, to: pose(target), width: target.rect.width, depth: target.rect.height, startWidth: 28, startDepth: 38,
          arc: 125, delay: drawDelay, duration: 750, wallIndex: pickup.index });
        if (event.type === 'flower') { replacement = true; drawDelay += 500; }
      } else if (event.type === 'hu') {
        const result = board.observation.results.at(-1), winner = event.seat;
        const targets = board.tiles.filter(t => t.seat === winner && hand(t));
        const winTarget = targets.find(t => t.tile === board.winningTile) ?? targets.at(-1);
        const source = result?.selfDrawn ? old.tiles.find(t => t.seat === winner && hand(t) && t.drawn)
          : old.last?.robKong ? takeHand(result!.from!,old.last.tile)
          : old.tiles.filter(t => t.seat === result?.from && t.role === 'river').at(-1);
        if (source && winTarget) { used.add(tileKey(source)); add('hu',source,winTarget,0,140); }
        targets.filter(t => t !== winTarget).forEach((target,i) => { const from = takeHand(winner,target.tile); if(from) add('hu',from,target,i*15,28); });
      }
    }
    this.flights = flights.slice(0,32); this.elapsed = 0; this.stepPlayback = paused;
    return true;
  }
  hiddenTargets() { return this.active ? new Set(this.flights.map(f => f.target)) : new Set<string>(); }
  snapshot() { return { active: this.active, elapsed: this.elapsed, flights: this.flights.map(f => ({ ...f, ...flightAt(f,this.elapsed) })) }; }
}
