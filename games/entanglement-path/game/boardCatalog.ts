const LEGACY_IDS = ['classic', 'compact', 'broken-spiral', 'trident', 'blossom'];
export function savedBoardIndex(saved: { levelIndex: number; levelId?: string }, ids: readonly string[]): number | null {
  const id = saved.levelId ?? LEGACY_IDS[saved.levelIndex];
  const index = id === undefined ? -1 : ids.indexOf(id);
  return index < 0 ? null : index;
}
export function savedBestScores(scores: readonly number[], savedIds: readonly string[] | undefined, ids: readonly string[]): number[] {
  const source = savedIds ?? LEGACY_IDS;
  return ids.map(id => scores[source.indexOf(id)] ?? 0);
}
