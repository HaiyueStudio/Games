/** Store-neutral UI contract. Only a native verifier can grant the entitlement. */
export type PurchasePhase = 'loading' | 'ready' | 'purchasing' | 'restoring' | 'pending' | 'cancelled' | 'offline' | 'unavailable' | 'error' | 'revoked' | 'restored' | 'empty';
export interface CalendarPurchaseState {
  readonly entitled: boolean;
  readonly phase: PurchasePhase;
  readonly price: string | null;
  readonly canPurchase: boolean;
  readonly busy: boolean;
}
export interface CalendarPurchases {
  snapshot(): CalendarPurchaseState;
  subscribe(listener: () => void): () => void;
  purchase(): Promise<void>;
  restore(): Promise<void>;
  refresh(): Promise<void>;
}
export function canPlayCalendarDate(entitled: boolean, year: number, month: number, day: number, today = new Date()): boolean {
  return entitled || (year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate());
}
