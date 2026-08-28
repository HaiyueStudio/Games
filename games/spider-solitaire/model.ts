export type SpiderRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface SpiderCard {
  id: number;
  rank: SpiderRank;
  faceUp: boolean;
}

export interface SpiderCardSelection {
  column: number;
  index: number;
}

export interface SpiderSnapshot {
  columns: SpiderCard[][];
  stock: SpiderCard[];
  completedRuns: number;
  moves: number;
}

export const SPIDER_COLUMN_COUNT = 10;
export const SPIDER_RUN_LENGTH = 13;
export const SPIDER_INITIAL_DEAL = [6, 6, 6, 6, 5, 5, 5, 5, 5, 5] as const;

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
    && Array.isArray(value.columns) && value.columns.length === SPIDER_COLUMN_COUNT
    && value.columns.every(column => Array.isArray(column) && column.every(isCard))
    && Array.isArray(value.stock) && value.stock.every(isCard)
    && isNonNegativeInteger(value.completedRuns) && value.completedRuns <= 8
    && isNonNegativeInteger(value.moves);
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
    && typeof value.faceUp === 'boolean';
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
