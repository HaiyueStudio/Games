import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';

registerHooks({ resolve(specifier, context, nextResolve) { const relativeWithoutExtension = /^\.{1,2}\//u.test(specifier) && !/\.[a-z0-9]+$/iu.test(specifier); return nextResolve(relativeWithoutExtension ? specifier + '.ts' : specifier, context); } });

const [{ evaluateMugenAirAction }, { bindMugenSnapshotToSpriteOwner }] = await Promise.all([
  import('../mugen/import/air/MugenAirRuntime.ts'),
  import('../mugen/game/MugenAnimationOwnership.ts'),
]);

const span = Object.freeze({ byteOffset: 0, line: 1, column: 1 });
const element = Object.freeze({ ...span, index: 0, spriteGroup: 5010, spriteItem: 10, spriteId: 'petra-sprite', offsetX: 0, offsetY: 0, durationTicks: 5, flipX: false, flipY: false, blend: Object.freeze({ mode: 'opaque', sourceAlpha: 1, destinationAlpha: 0 }), scaleX: 1, scaleY: 1, angleDegrees: 0, interpolateToThis: Object.freeze([]), clsn1: Object.freeze([]), clsn2: Object.freeze([]) });
const action = Object.freeze({ ...span, number: 295, loopStart: 0, elements: Object.freeze([element]), totalTicks: 5, preLoopTicks: 0, loopTicks: 5 });

test('ChangeAnim2 keeps the AIR owner while rebinding the frame to the physical fighter sprite', () => {
  const evaluated = evaluateMugenAirAction(action, 0, { x: 0, y: 0, facing: 1, coordinateScale: 2 });
  const victimSprite = Object.freeze({ id: 'kfm-sprite', renderSpriteId: 'kfm-sprite', sourcePath: 'kfm.sff', group: 5010, item: 10, width: 80, height: 120, axisX: 40, axisY: 110, format: 'indexed8', pixels: new Uint8Array(0), defaultPaletteId: null });
  const rebound = bindMugenSnapshotToSpriteOwner(evaluated, new Map([['5010,10', victimSprite]]), .25);
  assert.equal(rebound.actionNumber, 295);
  assert.equal(rebound.element.spriteId, 'petra-sprite');
  assert.deepEqual({ spriteId: rebound.render.spriteId, missing: rebound.render.missingSprite, axis: [rebound.render.axisX, rebound.render.axisY], scale: [rebound.render.scaleX, rebound.render.scaleY] }, { spriteId: 'kfm-sprite', missing: false, axis: [40, 110], scale: [.5, .5] });
});

test('browser fighter rendering resolves AIR from animationOwnerId and sprites from the physical fixture', () => {
  const source = readFileSync(new URL('../mugen/main.ts', import.meta.url), 'utf8');
  assert.match(source, /#fixtureForFighterId\(snapshot, fighter\.animationOwnerId\)/u);
  assert.match(source, /bindMugenSnapshotToSpriteOwner\(evaluated, spriteFixture\.spritesByGroupItem/u);
  assert.doesNotMatch(source, /fixture\.actionsByNumber\.get\(fighter\.actionNumber\); if \(!action\) throw new RangeError\(`角色动作/u);
});
