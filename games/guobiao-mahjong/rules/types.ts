export type Seat = 0 | 1 | 2 | 3;
export type Tile = number;
export interface Meld { kind: 'chow' | 'pung' | 'kong'; tiles: Tile[]; from: Seat; concealed: boolean; promoted: boolean }
export interface Player { hand: Tile[]; melds: Meld[]; flowers: Tile[]; river: Tile[]; score: number; fan: number; wins: number; name: string }
export interface Action { type: 'discard' | 'chow' | 'pung' | 'kong' | 'concealed-kong' | 'add-kong' | 'hu' | 'pass'; tile?: Tile; tiles?: Tile[] }
export interface Fan { id: number; name: string; value: number; count: number }
export interface Win { fan: number; flowers: number; total: number; items: Fan[] }
export interface Scorer {
  score(hand: Tile[], melds: Meld[], win: Tile, flowers: number, flags: number, round: number, seat: number): Win | null;
  shanten(hand: Tile[]): number;
  analyze(hand: Tile[]): { shanten: number; effective: Tile[] };
  catalog: Fan[];
}
export interface GameEvent { index: number; hand: number; type: string; seat: Seat; tile?: Tile; tiles?: Tile[]; text: string }
export interface HandResult { hand: number; winner: Seat | null; from: Seat | null; selfDrawn: boolean; win: Win | null; deltas: number[]; hands: Tile[][]; melds: Meld[][] }
export interface Match {
  seed: number; rng: number; revision: number; handIndex: number; dealer: Seat; turn: Seat;
  phase: 'turn' | 'response' | 'hand-over' | 'match-over';
  wall: Tile[]; head: number; tail: number; players: Player[];
  drawn: Tile | null; replacement: boolean; last: { seat: Seat; tile: Tile; robKong: boolean } | null;
  responses: Partial<Record<Seat, Action>>; events: GameEvent[]; results: HandResult[];
  actions: Array<{ hand: number; seat: Seat; action: Action; revision: number }>;
}
export interface Observation {
  protocol: 'haiyue.mcr/1'; revision: number; seat: Seat; handIndex: number; roundWind: number; dealer: Seat; turn: Seat;
  phase: Match['phase']; wallRemaining: number; hand: Tile[]; drawn: Tile | null; replacement: boolean;
  players: Array<Omit<Player, 'hand' | 'melds'> & { handCount: number; melds: Array<Omit<Meld, 'tiles'> & { tiles: Array<Tile | null> }> }>;
  last: Match['last']; legalActions: Action[]; events: GameEvent[]; results: HandResult[];
}
export const WINDS = ['东', '南', '西', '北'];
export const TILE_NAMES = Array.from({ length: 42 }, (_, t) => t < 27 ? `${t % 9 + 1}${['万', '条', '筒'][Math.floor(t / 9)]}` : ['东', '南', '西', '北', '中', '发', '白', '春', '夏', '秋', '冬', '梅', '兰', '竹', '菊'][t - 27]!);
export const seat = (n: number): Seat => ((n + 4) % 4) as Seat;
export const actionKey = (a: Action): string => `${a.type}:${a.tile ?? ''}:${a.tiles?.join(',') ?? ''}`;
