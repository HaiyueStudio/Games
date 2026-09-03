import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { classifyOracleScreenshot } from '../mugen/oracle/g04-combat-oracle/run-official-oracle.mjs';

const EVIDENCE_URL = new URL('../mugen/oracle/g05-entity-oracle/latest-official-result.json', import.meta.url);
const SCREENSHOT_URL = new URL('../mugen/oracle/g05-entity-oracle/latest-official-result.bmp', import.meta.url);

function solidBmp(red, green, blue) {
  const content = Buffer.alloc(58);
  content.write('BM', 0, 'ascii');
  content.writeUInt32LE(content.length, 2);
  content.writeUInt32LE(54, 10);
  content.writeUInt32LE(40, 14);
  content.writeInt32LE(1, 18);
  content.writeInt32LE(1, 22);
  content.writeUInt16LE(1, 26);
  content.writeUInt16LE(24, 28);
  content.writeUInt32LE(4, 34);
  content[54] = blue;
  content[55] = green;
  content[56] = red;
  return content;
}

test('G05 oracle screenshot classifier tolerates one-channel capture quantization', () => {
  assert.equal(classifyOracleScreenshot(solidBmp(0, 254, 0)).result, 'pass');
  assert.deepEqual(classifyOracleScreenshot(solidBmp(255, 161, 0)), {
    result: 'fail',
    observedColor: { r: 255, g: 161, b: 0 },
    samples: Array.from({ length: 5 }, () => ({ r: 255, g: 161, b: 0 })),
    failureCode: 8,
  });
});

test('G05 committed official MUGEN evidence is a captured, content-addressed pass with full cleanup', () => {
  const evidence = JSON.parse(readFileSync(EVIDENCE_URL, 'utf8'));
  const screenshot = readFileSync(SCREENSHOT_URL);
  assert.equal(evidence.oracle, 'g05-helper-projectile-explod-target');
  assert.equal(evidence.result, 'pass');
  assert.equal(evidence.oracleRenderMode, 'System');
  assert.equal(evidence.screenshotCaptured, true);
  assert.equal(evidence.screenshotObservation.result, 'pass');
  assert.deepEqual(evidence.screenshotObservation.observedColor, { r: 0, g: 254, b: 0 });
  assert.equal(createHash('sha256').update(screenshot).digest('hex'), evidence.screenshotSha256);
  assert.deepEqual(evidence.cleanup, {
    temporaryCharacterRemoved: true,
    temporaryMotifRemoved: true,
    originalConfigurationRestored: true,
    originalOutputsRestored: true,
  });
});
