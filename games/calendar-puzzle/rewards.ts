/** Host-injected allowance service; web games do not import a native SDK. */
export interface CalendarRewards {
  snapshot(): { unlimited: boolean; free: number; credits: number; adsRemaining: number; busy: boolean;
    phase: 'ready'|'loading'|'earned'|'cancelled'|'unavailable'|'offline'|'error'|'limit'; privacyRequired: boolean };
  subscribe(listener: () => void): () => void;
  consume(resultKey: string): boolean;
  watch(): Promise<void>;
  privacy(): Promise<void>;
  refresh(): void;
}
