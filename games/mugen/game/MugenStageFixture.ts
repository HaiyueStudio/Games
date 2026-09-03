export interface MugenStageFixture {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly displayName: string;
  readonly seed: string;
  readonly stageBounds: readonly [number, number];
  readonly spawn: readonly [number, number];
  readonly guardDistance: number;
  readonly camera: Readonly<{ localCoord: readonly [number, number]; pixelsPerUnit: number; groundRatio: number }>;
  readonly presentation: Readonly<{ sky: string; horizon: string; floor: string; line: string }>;
}

export async function loadMugenStageFixture(signal?: AbortSignal): Promise<MugenStageFixture> { const response = await fetch(new URL('../fixtures/g08-stage-v1/stage.json', import.meta.url), signal === undefined ? {} : { signal }); if (!response.ok) throw new Error(`无法载入内置舞台（HTTP ${response.status}）。`); return validate(await response.json()); }
export function validateMugenStageFixture(value: unknown): MugenStageFixture { return validate(value); }

function validate(value: unknown): MugenStageFixture {
  if (!record(value) || value.schemaVersion !== 1 || !text(value.id) || !text(value.displayName) || !text(value.seed) || !pair(value.stageBounds) || value.stageBounds[0] >= value.stageBounds[1] || !pair(value.spawn) || !finite(value.guardDistance, 0, 1_000) || !record(value.camera) || !pair(value.camera.localCoord) || value.camera.localCoord.some(item => item <= 0) || !finite(value.camera.pixelsPerUnit, 0.1, 16) || !finite(value.camera.groundRatio, 0.5, 0.95) || !record(value.presentation) || !color(value.presentation.sky) || !color(value.presentation.horizon) || !color(value.presentation.floor) || !color(value.presentation.line)) throw new TypeError('MUGEN 内置舞台配置无效。');
  return deepFreeze(structuredClone(value)) as unknown as MugenStageFixture;
}
function record(value: unknown): value is Record<string, any> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === 'string' && /^[\p{L}\p{N}_.: -]{1,128}$/u.test(value); }
function pair(value: unknown): value is [number, number] { return Array.isArray(value) && value.length === 2 && value.every(item => Number.isFinite(item) && Math.fround(item) === item); }
function finite(value: unknown, minimum: number, maximum: number): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum; }
function color(value: unknown): value is string { return typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value); }
function deepFreeze<T>(value: T): T { if (value !== null && typeof value === 'object') { for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); Object.freeze(value); } return value; }
