import assert from 'node:assert/strict';

export function validateBoxboundPerformance(profile) {
  const samples = Object.fromEntries(profile.samples.map((s) => [s.name, s.resources]));
  const cases = [];
  const check = (condition, message) => { assert.ok(condition, message); cases.push(message); };
  const first = samples.start, walk = samples['walk-repeat'];
  check(walk.createdParts === first.createdParts && walk.destroyedParts === first.destroyedParts,
    '96 same-room moves reuse every live entity without allocation or destruction');
  for (const name of ['walk', 'rooms', 'transfer', 'nested', 'recursive']) {
    const warm = samples[`${name}-warm`], repeat = samples[`${name}-repeat`];
    check(JSON.stringify(warm.gpu) === JSON.stringify(repeat.gpu), `${name}: GPU resources plateau after warm-up`);
    check(warm.entities === repeat.entities && warm.parts === repeat.parts && warm.geometries === repeat.geometries && warm.materials === repeat.materials && warm.labels === repeat.labels,
      `${name}: live scene objects and CPU asset caches remain bounded`);
  }
  check(samples['recursive-warm'].createdParts === samples['recursive-repeat'].createdParts &&
    samples['recursive-warm'].destroyedParts === samples['recursive-repeat'].destroyedParts,
    'three recursive player occurrences reuse all render entities during repeated movement');
  const idleStart = samples['idle-start'], idleEnd = samples['idle-end'];
  check(idleEnd.transformWrites === idleStart.transformWrites, 'idle frames perform no model transform writes');
  check(idleEnd.sceneExtractions === idleStart.sceneExtractions, 'idle frames reuse the extracted scene');
  check(profile.teardown.length === 4 && profile.teardown.every((s) => s.entities === 0 && s.parts === 0 && s.geometries === 0 && s.materials === 0 && s.labels === 0),
    'four dispose cycles release all game entities, labels and CPU asset caches');
  check(profile.teardown.every((s) => JSON.stringify(s.gpu) === JSON.stringify(profile.teardown[0].gpu)),
    'four dispose cycles return GPU resources to the same engine-only baseline');
  check(profile.wake.jumpWoke && profile.wake.resizeWoke, 'idle rendering wakes for jumping and canvas resize');
  return cases;
}
