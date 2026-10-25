export function isGameCancellation(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== 'object' || depth > 3) return false;
  const value = error as { name?: string; code?: string; context?: { state?: string }; cause?: unknown };
  return value.name === 'AbortError' || value.code === 'E_ENGINE_DESTROYED' || value.code === 'E_ENGINE_INVALID_STATE' && value.context?.state === 'destroyed' || isGameCancellation(value.cause, depth + 1);
}
