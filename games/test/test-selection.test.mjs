import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectTests } from '../../scripts/test-selection.mjs';
const files = ['games/test/mugen-core.test.mjs', 'games/test/a.test.mjs', 'games/test/mugen/x.test.mjs', 'games/test/gamepad.test.mjs', 'games/test/mugen.json'];
test('default excludes only unfinished MUGEN tests', () => assert.deepEqual(selectTests(files), ['games/test/a.test.mjs', 'games/test/gamepad.test.mjs']));
test('MUGEN and all remain explicitly runnable', () => {
  assert.equal(selectTests(files, 'mugen').length, 2);
  assert.equal(selectTests(files, 'all').length, 4);
  assert.throws(() => selectTests(files, 'typo'), /Unknown/);
});
