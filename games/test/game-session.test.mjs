import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionPause } from '../session/SessionPause.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('return confirmation freezes game time and resumes without counting dialog time', () => {
  let now = 100; const session = new SessionPause(() => now); const events = [];
  session.register({ pause: () => events.push('pause'), resume: () => events.push('resume') });
  now = 150; session.pause(); now = 5150;
  assert.equal(session.time(), 150); assert.equal(session.time(9999), 150);
  session.pause(); assert.deepEqual(events, ['pause']);
  session.resume(); assert.equal(session.time(), 150);
  now += 20; assert.equal(session.time(), 170);
  session.resume(); assert.deepEqual(events, ['pause', 'resume']);
  session.pause(); now += 500; session.resume(); assert.equal(session.time(), 170);
});

test('participants added during confirmation pause immediately; disposed owners never resume', () => {
  const session = new SessionPause(() => 10), events = [];
  session.pause();
  const remove = session.register({ pause: () => events.push('pause'), resume: () => events.push('resume') });
  assert.deepEqual(events, ['pause']); remove(); session.resume(); assert.deepEqual(events, ['pause']);
});

test('every manifest game creates its Engine through the shared session lifecycle', () => {
  const root = new URL('../', import.meta.url), manifest = JSON.parse(readFileSync(new URL('manifest.json', root)));
  const sources = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name);
    return entry.isDirectory() && !['dist','assets'].includes(entry.name) ? sources(file) : entry.isFile() && file.endsWith('.ts') ? [readFileSync(file, 'utf8')] : [];
  });
  for (const game of manifest.entries) {
    const files = sources(fileURLToPath(new URL(game.id + '/', root)));
    assert.ok(files.some(source => source.includes('new GameEngine(')), game.id + ' registers its engine');
    assert.ok(!files.some(source => source.includes('new HaiyueEngine(')), game.id + ' cannot bypass the pause owner');
  }
});
