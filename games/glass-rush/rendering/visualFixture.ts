import { createRound, type Gate, type Round } from '../rules/model';

// Read-only, fixed-time scenes for browser screenshots; enabled only with ?verify&scene=….
export function visualFixture(scene: string | null): Round | null {
  if (!['tunnel', 'impact', 'impact-center', 'impact-camera', 'shatter', 'shatter-near'].includes(scene ?? '')) return null;
  const round = createRound(42);
  Object.assign(round, { phase: 'playing', time: 18.25, distance: 186, angle: -.7, hits: 1 });
  const gate = (z: number, angle: number, shape: Gate['shape'], width = .95): Gate => ({ z, angle, shape, width, spin: 0, passed: false, shattered: false });
  round.gates = [gate(4.8, 1.7, 'diamonds'), gate(10, -2.1, 'crown'), gate(19, .6, 'split'), gate(32, -.4, 'arc')];
  if (scene !== 'tunnel') {
    const broken = gate(3, round.angle, 'arc', .8);
    broken.passed = broken.shattered = true;
    const age = scene === 'impact-camera' ? .55 : scene === 'impact-center' ? .4 : .22;
    round.impacts = [{ gate: broken, angle: broken.angle, age, playerAngle: round.angle }];
    round.flash = .6 - age;
    round.hits = 2;
  }
  if (scene === 'shatter' || scene === 'shatter-near') {
    round.phase = 'over'; round.hits = 4; round.broken = scene === 'shatter' ? .32 : .62;
    round.impacts[0]!.age = round.broken; round.flash = Math.max(0, .6 - round.broken);
  }
  return round;
}
