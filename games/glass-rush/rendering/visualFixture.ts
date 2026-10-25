import { createRound, type Gate, type GateShape, type Round } from '../rules/model';

// Read-only, fixed-time scenes for browser screenshots; enabled only with ?verify&scene=….
export function visualFixture(scene: string | null, shape: string | null = null): Round | null {
  if (!['menu', 'occlusion', 'occlusion-clear', 'ball-a', 'ball-b', 'tunnel', 'shapes', 'rotation', 'impact', 'impact-center', 'impact-camera', 'shatter', 'shatter-near'].includes(scene ?? '')) return null;
  const round = createRound(42);
  Object.assign(round, { phase: 'playing', time: 18.25, distance: 186, angle: -.7, hits: 1 });
  const gate = (z: number, angle: number, shape: Gate['shape'], width = .95): Gate => ({ z, angle, shape, width, spin: 0, passed: false, shattered: false });
  round.gates = [gate(4.8, 1.7, 'diamonds'), gate(10, -2.1, 'crown'), gate(19, .6, 'split'), gate(32, -.4, 'arc')];
  if (scene === 'menu') { round.phase='ready'; round.time=0; round.hits=0; return round; }
  if (scene === 'occlusion' || scene === 'occlusion-clear') {
    round.distance=0;round.flash=0;
    if(scene==='occlusion')round.gates.push(gate(60,.3,'pinwheel',1.1));
    return round;
  }
  if (scene === 'ball-a' || scene === 'ball-b') { round.time=scene==='ball-a'?3:4.2;round.hits=0;return round; }
  if (scene === 'shapes') {
    const shapes: GateShape[] = ['pinwheel', 'chevrons', 'hexagons', 'trident', 'iris'];
    const index = shapes.indexOf(shape as GateShape);
    if (index > 0) shapes.unshift(...shapes.splice(index, 1));
    const depths = [5.5, 10, 17, 28, 44], angles = [.2, 1, -.2, .8, -.8];
    round.gates = shapes.map((kind, i) => gate(depths[i]!, angles[i]!, kind, i === 0 ? 1.1 : .95));
    return round;
  }
  if (scene === 'rotation') {
    round.time = 24;
    round.gates = [gate(35, -.8, 'pinwheel', 1.1), gate(56, .7, 'hexagons'), gate(82, -.5, 'iris'), gate(115, .3, 'trident'), gate(165, -.7, 'chevrons')];
    round.gates[0]!.spin = .72; round.gates[2]!.spin = -.65; round.gates[4]!.spin = .5;
    return round;
  }
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
