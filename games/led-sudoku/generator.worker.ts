import { generate, type Options } from './rules';
const scope = globalThis as unknown as { onmessage: ((e: MessageEvent) => void) | null; postMessage(data: unknown): void };
scope.onmessage = ({ data }: MessageEvent<{ kind: string; version: number; id: number; options: Options; seed: number }>) => {
  if (data.kind !== 'led-sudoku-generate' || data.version !== 1) return;
  try { scope.postMessage({ kind: 'led-sudoku-generated', id: data.id, result: generate(data.options, data.seed) }); }
  catch (error) { scope.postMessage({ kind: 'led-sudoku-generated', id: data.id, error: String(error) }); }
};
