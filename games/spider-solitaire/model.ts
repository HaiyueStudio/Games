export type SpiderRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;
export type SpiderSuit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type SpiderDifficulty = 'easy' | 'normal' | 'hard';

export interface SpiderCard {
  id: number;
  rank: SpiderRank;
  suit: SpiderSuit;
  faceUp: boolean;
}

export interface SpiderCardSelection {
  column: number;
  index: number;
}

export interface SpiderSnapshot {
  difficulty: SpiderDifficulty;
  columns: SpiderCard[][];
  stock: SpiderCard[];
  completedRuns: number;
  completedSuits: SpiderSuit[];
  moves: number;
}

export const SPIDER_COLUMN_COUNT = 10;
export const SPIDER_RUN_LENGTH = 13;
export const SPIDER_INITIAL_DEAL = [6, 6, 6, 6, 5, 5, 5, 5, 5, 5] as const;
export const SPIDER_DIFFICULTY_SUITS: Record<SpiderDifficulty, readonly SpiderSuit[]> = {
  easy: ['spades'],
  normal: ['spades', 'hearts'],
  hard: ['spades', 'hearts', 'diamonds', 'clubs'],
};
export const SPIDER_DIFFICULTY_LABELS: Record<SpiderDifficulty, string> = {
  easy: 'Easy · 1 Suit',
  normal: 'Normal · 2 Suits',
  hard: 'Hard · 4 Suits',
};
export const SPIDER_SUIT_SYMBOLS: Record<SpiderSuit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export const SPIDER_RANK_LABELS: Record<SpiderRank, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
};

export function isSpiderSaveData(value: unknown): value is SpiderSnapshot {
  return isRecord(value)
    && isSpiderDifficulty(value.difficulty)
    && Array.isArray(value.columns) && value.columns.length === SPIDER_COLUMN_COUNT
    && value.columns.every(column => Array.isArray(column) && column.every(isCard))
    && Array.isArray(value.stock) && value.stock.every(isCard)
    && isNonNegativeInteger(value.completedRuns) && value.completedRuns <= 8
    && Array.isArray(value.completedSuits) && value.completedSuits.length === value.completedRuns
    && value.completedSuits.every(isSpiderSuit)
    && isNonNegativeInteger(value.moves);
}

export function createSpiderDeck(difficulty: SpiderDifficulty, random = Math.random): SpiderCard[] {
  const cards: SpiderCard[] = [];
  const suits = SPIDER_DIFFICULTY_SUITS[difficulty];
  const copiesPerSuit = 8 / suits.length;
  let id = 1;
  for (const suit of suits) {
    for (let copy = 0; copy < copiesPerSuit; copy++) {
      for (let rank = 1; rank <= SPIDER_RUN_LENGTH; rank++) {
        cards.push({ id: id++, rank: rank as SpiderRank, suit, faceUp: false });
      }
    }
  }
  return shuffleSpiderCards(cards, random);
}

export function isSpiderMovableRun(cards: readonly SpiderCard[]): boolean {
  if (cards.length === 0) return false;
  for (let index = 0; index < cards.length; index++) {
    const card = requiredItemAt(cards, index, 'Spider movable run');
    if (!card.faceUp) return false;
    if (index === 0) continue;
    const previous = requiredItemAt(cards, index - 1, 'Spider movable run');
    if (previous.suit !== card.suit || previous.rank !== card.rank + 1) return false;
  }
  return true;
}

export function isSpiderCompleteRun(cards: readonly SpiderCard[]): boolean {
  if (cards.length !== SPIDER_RUN_LENGTH || !isSpiderMovableRun(cards)) return false;
  return requiredItemAt(cards, 0, 'completed Spider run').rank === 13
    && requiredItemAt(cards, cards.length - 1, 'completed Spider run').rank === 1;
}

export function cloneSpiderCard(card: SpiderCard): SpiderCard {
  return { ...card };
}

export function cloneSpiderColumns(columns: readonly SpiderCard[][]): SpiderCard[][] {
  return columns.map(column => column.map(cloneSpiderCard));
}

export function spiderColumnAt(columns: SpiderCard[][], index: number): SpiderCard[] {
  return requiredItemAt(columns, index, 'Spider columns');
}

export function shuffleSpiderCards<T>(items: T[], random = Math.random): T[] {
  for (let index = items.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    const current = requiredItemAt(items, index, 'Spider shuffle items');
    items[index] = requiredItemAt(items, target, 'Spider shuffle items');
    items[target] = current;
  }
  return items;
}

function isCard(value: unknown): value is SpiderCard {
  return isRecord(value)
    && isNonNegativeInteger(value.id)
    && isNonNegativeInteger(value.rank) && value.rank >= 1 && value.rank <= 13
    && isSpiderSuit(value.suit)
    && typeof value.faceUp === 'boolean';
}

function isSpiderDifficulty(value: unknown): value is SpiderDifficulty {
  return value === 'easy' || value === 'normal' || value === 'hard';
}

function isSpiderSuit(value: unknown): value is SpiderSuit {
  return value === 'spades' || value === 'hearts' || value === 'diamonds' || value === 'clubs';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function requiredItemAt<T>(items: readonly T[], index: number, label: string): T {
  const value = items[index];
  if (value === undefined) throw new RangeError(`${label} index ${index} is out of bounds.`);
  return value;
}
