import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChromeWebGpuFixture } from '../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const gamesRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDirectory = resolve(gamesRoot, 'site', 'screenshots');
const screenshotPath = resolve(screenshotDirectory, 'mugen-g08-browser-current.png');
const evidencePath = resolve(screenshotDirectory, 'mugen-g08-browser-current.json');

const capture = await runChromeWebGpuFixture({
  root: gamesRoot,
  fixture: 'games/mugen/index.html',
  query: {
    verify: 1,
    verifyCapture: 1,
    verifyAfterImage: 1,
    verifyHitSpark: 1,
    verifyFightSound: 1,
    verifyFightFx: 1,
  },
  timeoutMs: 600_000,
  visualCapture: {
    viewportWidth: 1280,
    viewportHeight: 720,
    sampleWidth: 32,
    sampleHeight: 18,
  },
});

assert.equal(capture.status, 'running');
assert.equal(capture.phase, 'fight');
assert(capture.tick >= 180);
assert.equal(capture.deviceLossStatus, 'recovered');
assert(capture.deviceGeneration >= 2);
assert(capture.afterImageTrails > 0);
assert(capture.hitSparks > 0);
assert.equal(capture.missingTransientAnimations, 0);
assert.equal(capture.fightSoundVerification, 'played');
assert.equal(capture.audioStatus, 'running');
assert.equal(capture.backlogTicks, 0);
assert.equal(capture.browserDiagnostics.unclassifiedFailureCount, 0);
assert.equal(capture.browserEvidence.nativeBackend, true);

const png = Buffer.from(capture.visualCapture.pngBase64, 'base64');
assert(png.byteLength > 20_000, `MUGEN browser screenshot is unexpectedly small (${png.byteLength} bytes).`);
const sampledColors = new Set(Array.from({ length: capture.visualCapture.signature.length / 3 }, (_, index) => capture.visualCapture.signature.slice(index * 3, index * 3 + 3).join(',')));
assert(sampledColors.size >= 8, `MUGEN browser screenshot is visually empty (${sampledColors.size} sampled colors).`);
assert(capture.visualCapture.darkRatio < .95, 'MUGEN browser screenshot is almost entirely dark.');
const { pngBase64: ignoredPngBase64, ...visualFingerprint } = capture.visualCapture;
void ignoredPngBase64;
const screenshot = Object.freeze({
  path: 'Games/site/screenshots/mugen-g08-browser-current.png',
  bytes: png.byteLength,
  sha256: createHash('sha256').update(png).digest('hex'),
});
const evidence = Object.freeze({
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  result: 'pass',
  screenshot,
  runtime: Object.freeze({
    status: capture.status,
    phase: capture.phase,
    tick: capture.tick,
    outputHash: capture.outputHash,
    adapter: capture.adapter,
    characters: capture.characters,
    loadingProgress: capture.loadingProgress,
    deviceGeneration: capture.deviceGeneration,
    deviceLossStatus: capture.deviceLossStatus,
    afterImageTrails: capture.afterImageTrails,
    hitSparks: capture.hitSparks,
    missingTransientAnimations: capture.missingTransientAnimations,
    fightSoundVerification: capture.fightSoundVerification,
    fightSoundBank: capture.fightSoundBank,
    fightSoundCount: capture.fightSoundCount,
    audioStatus: capture.audioStatus,
    fps: capture.fps,
    simulationMilliseconds: capture.simulationMilliseconds,
    renderMilliseconds: capture.renderMilliseconds,
    backlogTicks: capture.backlogTicks,
  }),
  browserEvidence: capture.browserEvidence,
  browserDiagnostics: capture.browserDiagnostics,
  visualCapture: visualFingerprint,
  httpProvenance: capture.httpProvenance,
});

mkdirSync(screenshotDirectory, { recursive: true });
writeFileSync(screenshotPath, png);
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ result: 'pass', screenshot, runtime: evidence.runtime, browser: evidence.browserEvidence }));
