import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectTests } from '../../scripts/test-selection.mjs';
const files = ['games/test/nested/x.test.mjs', 'games/test/a.test.mjs', 'games/test/gamepad.test.mjs', 'games/test/data.json'];
test('default runs every Games test and ignores non-test fixtures', () => assert.deepEqual(selectTests(files), ['games/test/a.test.mjs', 'games/test/gamepad.test.mjs', 'games/test/nested/x.test.mjs']));
test('all uses the same complete Games selection and invalid profiles fail', () => { assert.deepEqual(selectTests(files, 'all'), selectTests(files)); assert.throws(() => selectTests(files, 'typo'), /Unknown/); });
