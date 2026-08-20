import {
  rayAcceleration,
  rayDenoise,
  rayMaterial,
  rayPathTracing,
  raySampling,
  rayScene,
  rayTraversal,
} from '@haiyue/extensions/ray-tracing';

export interface GravityMazeRayContext {
  readonly scene: import('@haiyue/engine').Scene;
  readonly device: GPUDevice;
  readonly fixedSceneId: string;
  readonly fixedCameraReplayId: string;
  readonly seed: number;
  readonly mazeSize: readonly [number, number];
}

let context!: GravityMazeRayContext;

let disposed = false;
let builder: InstanceType<typeof rayAcceleration.RayAccelerationBuilder> | null = null;
let traversal: Awaited<ReturnType<typeof rayTraversal.RayTraversalRuntime.create>>['runtime'] = null;
let base: Awaited<ReturnType<typeof rayPathTracing.RayPathTracingRenderer.create>>['renderer'] = null;
let denoiser: Awaited<ReturnType<typeof rayDenoise.RaySpatialTemporalDenoiser.create>>['denoiser'] = null;
let progressive: Awaited<ReturnType<typeof raySampling.RayProgressiveRenderer.create>>['renderer'] = null;

export async function startGravityMazeRayTracingPreview(value: GravityMazeRayContext): Promise<void> {
  context = value;
  window.addEventListener('pagehide', dispose, { once: true });
  try {
    await renderCandidate();
  } catch (error) {
    publishFailure(error);
  }
}

async function renderCandidate(): Promise<void> {
  setStatus('正在构建 Gravity Maze ray tracing 候选…');
  builder = new rayAcceleration.RayAccelerationBuilder();
  const buildStart = performance.now();
  const extracted = rayScene.extractRayTracingScene(context.scene);
  if (!extracted.valid) throw coded('RAY_GAME_SCENE_UNSUPPORTED', diagnosticsText(extracted.diagnostics));
  const update = builder.update(extracted.snapshot);
  if (!update.snapshot) throw coded('RAY_GAME_ACCELERATION_FAILED', diagnosticsText(update.diagnostics));
  const materials = rayMaterial.packRayPbrMaterialScene(context.scene.world, update.snapshot.packed);
  if (!materials.packed) throw coded('RAY_GAME_MATERIAL_FAILED', diagnosticsText(materials.diagnostics));
  const facts = rayPathTracing.extractRayPathSceneFacts(context.scene.world);
  if (!facts.facts) throw coded('RAY_GAME_CAMERA_OR_LIGHT_FAILED', diagnosticsText(facts.diagnostics));
  const buildMs = performance.now() - buildStart;
  const traversalCreated = await rayTraversal.RayTraversalRuntime.create(context.device, update.snapshot.packed);
  if (!traversalCreated.runtime) throw coded('RAY_GAME_TRAVERSAL_PIPELINE_FAILED', diagnosticsText(traversalCreated.diagnostics));
  traversal = traversalCreated.runtime;
  const representativeRays = Array.from({ length: 64 }, (_, index) => ({
    origin: [9.1 + (index % 8) * 0.01, 10.2, 14.7] as const,
    direction: [-0.43, -0.48, -0.76] as const,
    tMin: 0.05,
    tMax: 80,
  }));
  const traversalResult = await traversal.execute(representativeRays, { mode: 'closest-hit' });
  if (traversalResult.status !== 'ok') throw coded('RAY_GAME_TRAVERSAL_FAILED', diagnosticsText(traversalResult.diagnostics));
  const baseCreated = await rayPathTracing.RayPathTracingRenderer.create(context.device, update.snapshot.packed, materials.packed);
  if (!baseCreated.renderer) throw coded('RAY_GAME_PATH_PIPELINE_FAILED', diagnosticsText(baseCreated.diagnostics));
  base = baseCreated.renderer;
  const denoiseCreated = await rayDenoise.RaySpatialTemporalDenoiser.create(context.device);
  if (!denoiseCreated.denoiser) throw coded('RAY_GAME_DENOISE_PIPELINE_FAILED', diagnosticsText(denoiseCreated.diagnostics));
  denoiser = denoiseCreated.denoiser;
  const progressiveCreated = await raySampling.RayProgressiveRenderer.create(context.device, base, denoiser);
  if (!progressiveCreated.renderer) throw coded('RAY_GAME_PROGRESSIVE_PIPELINE_FAILED', diagnosticsText(progressiveCreated.diagnostics));
  progressive = progressiveCreated.renderer;
  setStatus('正在生成固定相机 ray tracing 候选…');
  const frame = Object.freeze({ facts: facts.facts, revision: raySampling.createRayProgressiveFrameRevision(update.snapshot, materials.packed, facts.facts) });
  const rendered = await progressive.render(frame, {
    width: 128,
    height: 72,
    maxBounces: 2,
    baseSeed: 0x73619a2d,
    qualityRevision: 'gravity-maze:evidence:low:v1',
    view: 'denoised',
    readback: true,
  });
  if (rendered.status !== 'ok' || !rendered.pixels) throw coded('RAY_GAME_RENDER_FAILED', diagnosticsText(rendered.diagnostics));
  if (disposed) return;
  const pixels = Uint8Array.from(rendered.pixels);
  const pixelSummary = summarizePixels(pixels);
  if (pixelSummary.maximumChannel < 8 || pixelSummary.nonBlackPixelCount < 1) throw coded('RAY_GAME_OUTPUT_DEGENERATE', JSON.stringify(pixelSummary));
  drawCandidate(pixels, 128, 72);
  const sourceDefinition = Object.freeze({
    schemaVersion: 1,
    fixedSceneId: context.fixedSceneId,
    fixedCameraReplayId: context.fixedCameraReplayId,
    seed: context.seed,
    mazeSize: context.mazeSize,
    sceneFingerprint: extracted.snapshot.fingerprint,
  });
  const diagnosticValues = compactDiagnostics([
    ...extracted.diagnostics, ...update.diagnostics, ...materials.diagnostics, ...facts.diagnostics,
    ...traversalCreated.diagnostics, ...traversalResult.diagnostics, ...baseCreated.diagnostics,
    ...denoiseCreated.diagnostics, ...progressiveCreated.diagnostics, ...rendered.diagnostics,
  ]);
  const denoiseNs = sumNullable(rendered.timing.denoiseTemporalNs, rendered.timing.denoiseSpatialNs);
  const report = Object.freeze({
    schemaVersion: 1,
    suite: 'gravity-maze-ray-tracing-candidate',
    status: 'passed',
    sceneClass: 'large-real-product',
    fixedSceneId: context.fixedSceneId,
    fixedCameraReplayId: context.fixedCameraReplayId,
    sourceSha256: `sha256:${await sha256(new TextEncoder().encode(JSON.stringify(sourceDefinition)))}`,
    candidateSha256: `sha256:${await sha256(pixels)}`,
    pixelSummary,
    width: 128,
    height: 72,
    buildRefit: Object.freeze({ buildMs, updateKind: update.kind, dirtyRangeCount: update.dirtyRanges.length }),
    stageTimings: Object.freeze({
      availability: rendered.timing.samplingNs === null ? 'unavailable:timestamp-query' : 'measured',
      traversalNs: traversalResult.gpuTimeNs,
      shadingAndPathTracingNs: rendered.timing.samplingNs,
      shadingIncludesTraversal: true,
      accumulationNs: rendered.timing.accumulationNs,
      denoiseNs,
      compositeNs: rendered.timing.presentNs,
    }),
    correctness: Object.freeze({ pixelSha256: `sha256:${await sha256(pixels)}`, traversalHits: traversalResult.counters.hits, traversalMisses: traversalResult.counters.misses }),
    memory: Object.freeze({ peakBytes: Math.max(traversalResult.memory.peakBytes, rendered.memory.peakBytes), liveResourceCount: traversalResult.memory.liveResourceCount + rendered.memory.liveResourceCount }),
    diagnostics: diagnosticValues,
    unclassifiedFailureCount: 0,
  });
  publish(report);
  setStatus('Gravity Maze ray tracing 候选已完成');
}

function drawCandidate(pixels: Uint8Array, width: number, height: number): void {
  const canvas = document.createElement('canvas');
  canvas.id = 'ray-tracing-candidate'; canvas.width = width; canvas.height = height;
  canvas.style.cssText = 'position:fixed;right:20px;bottom:92px;z-index:7;width:min(42vw,512px);height:auto;border:1px solid #63e6be;border-radius:10px;background:#000;box-shadow:0 16px 42px #000a';
  canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  document.body.append(canvas);
}

function publish(value: unknown): void {
  document.body.dataset.renderStatus = 'passed';
  document.body.dataset.rayTracingStatus = 'passed';
  const result = document.getElementById('result'); if (!result) return;
  result.dataset.status = 'passed'; result.textContent = JSON.stringify(value);
}

function publishFailure(error: unknown): void {
  const classified = error instanceof Error && /^RAY_/.test(error.name);
  const code = classified ? (error as Error).name : 'RAY_GAME_UNCLASSIFIED_FAILURE';
  const message = error instanceof Error ? error.message : String(error);
  document.body.dataset.renderStatus = 'failed'; document.body.dataset.rayTracingStatus = 'failed';
  const result = document.getElementById('result');
  if (result) { result.dataset.status = 'failed'; result.textContent = JSON.stringify({ schemaVersion: 1, suite: 'gravity-maze-ray-tracing-candidate', status: 'failed', diagnostics: [{ code, severity: 'error', message }], unclassifiedFailureCount: classified ? 0 : 1 }); }
  setStatus(`Ray tracing 失败：${code}`); console.error(error); dispose();
}

function dispose(): void {
  if (disposed) return; disposed = true;
  progressive?.destroy(); denoiser?.destroy(); base?.destroy(); traversal?.destroy(); builder?.destroy();
  progressive = null; denoiser = null; base = null; traversal = null; builder = null;
  document.getElementById('ray-tracing-candidate')?.remove();
}

function compactDiagnostics(values: readonly { readonly code: string; readonly severity: string; readonly message: string }[]) {
  const limit = 80;
  const result = values.slice(0, limit).map(value => Object.freeze({ code: value.code, severity: value.severity, message: value.message }));
  if (values.length > limit) result.push(Object.freeze({ code: 'RAY_GAME_DIAGNOSTICS_TRUNCATED', severity: 'info', message: `${values.length - limit} additional diagnostics omitted.` }));
  return Object.freeze(result);
}
function diagnosticsText(values: readonly { readonly code: string; readonly message: string }[]): string { return values.slice(0, 8).map(value => `${value.code}: ${value.message}`).join('\n') || 'No diagnostic details.'; }
function sumNullable(...values: readonly (number | null)[]): number | null { return values.every(value => value !== null) ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null; }
function summarizePixels(pixels: Uint8Array): Readonly<{ maximumChannel: number; nonBlackPixelCount: number; meanRgb: readonly [number, number, number] }> { let maximumChannel = 0; let nonBlackPixelCount = 0; const sums = [0, 0, 0]; for (let offset = 0; offset < pixels.length; offset += 4) { const red = pixels[offset] ?? 0; const green = pixels[offset + 1] ?? 0; const blue = pixels[offset + 2] ?? 0; maximumChannel = Math.max(maximumChannel, red, green, blue); if (red > 2 || green > 2 || blue > 2) nonBlackPixelCount++; sums[0]! += red; sums[1]! += green; sums[2]! += blue; } const count = pixels.length / 4; const meanRgb: readonly [number, number, number] = Object.freeze([Math.round(sums[0]! / count * 1000) / 1000, Math.round(sums[1]! / count * 1000) / 1000, Math.round(sums[2]! / count * 1000) / 1000]); return Object.freeze({ maximumChannel, nonBlackPixelCount, meanRgb }); }
function coded(code: string, message: string): Error { const error = new Error(message); error.name = code; return error; }
function setStatus(message: string): void { const status = document.getElementById('status'); if (status) status.textContent = message; }
async function sha256(value: Uint8Array): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(value).buffer))].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
