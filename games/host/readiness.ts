export function canPresentGame(engine: { state: string; runningForHost: boolean } | null, rendered: boolean, boots: number, resources: number, statuses: readonly (string | undefined)[] = []): boolean {
  return engine?.state === 'ready' && (rendered || engine.runningForHost === false) && boots === 0 && resources === 0 && !statuses.some(status => ['starting', 'pending', 'loading', 'initializing'].includes(status ?? ''));
}
