import type { InkPinballGame } from './InkPinballGame';

export async function verifyInkPinball(game: InkPinballGame): Promise<void> {
  game.stopLoop();
  const checks: string[] = [];
  const check = (condition: boolean, name: string) => { if (!condition) throw new Error(`Pinball verification failed: ${name}: ${JSON.stringify(game.snapshot())}`); checks.push(name); };
  const key = (code: string, down: boolean) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true, cancelable: true }));
  const advance = (count: number) => game.verifyStep(count);
  advance(1);
  check(game.snapshot().ready, 'engine and generated assets loaded');
  const initial = game.snapshot();
  key('KeyS', true); advance(90);
  check(game.snapshot().charge > 0.5, 'S charges plunger');
  key('KeyS', false); advance(1);
  check(game.snapshot().phase === 'playing', 'S release launches');
  advance(100);
  check(game.snapshot().ball.y > -100, 'ball travels up shooter lane');
  advance(75);
  check(game.snapshot().ball.x < 195, 'ball enters playfield');
  game.restart();
  key('ArrowUp', true); advance(1); key('ArrowUp', false);
  check(game.snapshot().phase === 'playing', 'arrow up launches');
  key('KeyA', true); key('ArrowRight', true); advance(30);
  const raised = game.snapshot();
  check(raised.flippers[0]! > initial.flippers[0]! + 0.5 && raised.flippers[1]! < initial.flippers[1]! - 0.5, 'A and right arrow actuate independent hinged flippers');
  key('KeyA', false); key('ArrowRight', false); advance(40);
  check(Math.abs(game.snapshot().flippers[0]! - initial.flippers[0]!) < 0.08, 'flipper returns when released');
  game.verifyBall(-100, 229, 0, -4); advance(12);
  check(game.snapshot().score >= 100 && game.snapshot().ball.y > 220, 'bumper contact scores and kicks ball away');
  check(game.snapshot().ink.trailCount > 0, 'moving ink ball leaves a bounded wake');
  check(game.snapshot().ink.passes > 0 && game.snapshot().ink.uiPanels >= 7, 'GPU diffusion renders brush UI and ink ball');
  const beforePause = game.snapshot(); key('KeyP', true); advance(1); key('KeyP', false); advance(100);
  check(game.snapshot().paused && game.snapshot().time === beforePause.time, 'pause freezes simulation');
  key('KeyP', true); advance(1); key('KeyP', false);
  check(!game.snapshot().paused, 'P resumes');
  // Reproduce both narrowing pockets, including the user's stationary ball.
  for (const scenario of [
    { name: 'left resting screenshot', x: -214, y: -143, vx: 0, vy: 0, side: 0 },
    { name: 'left slow drop', x: -221, y: -101, vx: 0, vy: -2, side: 0 },
    { name: 'left fast drop', x: -216, y: -115, vx: 0.2, vy: -12, side: 0, naturalEscape: true },
    { name: 'right resting', x: 174, y: -143, vx: 0, vy: 0, side: 1 },
    { name: 'right slow drop', x: 179, y: -104, vx: 0, vy: -2, side: 1 },
    { name: 'right fast drop', x: 173, y: -115, vx: -0.2, vy: -12, side: 1, naturalEscape: true },
  ]) {
    game.restart(); game.verifyBall(scenario.x, scenario.y, scenario.vx, scenario.vy);
    let escaped = false;
    for (let step = 0; step < 240; step++) {
      advance(1);
      const snapshot = game.snapshot();
      if ((scenario.naturalEscape || snapshot.springs[scenario.side]!.launches > 0) && snapshot.ball.y > -65 && (scenario.side === 0 ? snapshot.ball.x > -185 : snapshot.ball.x < 136)) { escaped = true; break; }
    }
    check(escaped && game.snapshot().phase === 'playing' && game.snapshot().balls === 3, `${scenario.name}: ball clears pocket within two seconds${scenario.naturalEscape ? " (natural rebound allowed)" : " using spring"}`);
  }
  game.restart(); game.verifyBall(-214, -143, 0, 0); advance(2);
  check(game.snapshot().springs[0]!.phase === 'compressing', 'spring compresses before launching');
  key('KeyP', true); advance(1); key('KeyP', false); const pausedSpring = JSON.stringify(game.snapshot().springs); advance(60);
  check(JSON.stringify(game.snapshot().springs) === pausedSpring, 'paused spring cannot fire');
  key('KeyP', true); advance(1); key('KeyP', false); advance(50);
  check(game.snapshot().springs[0]!.launches === 1, 'spring resumes its pending launch once');
  game.restart(); advance(2);
  check(game.snapshot().springs.every(spring => spring.phase === 'idle' && spring.launches === 0), 'restart clears pending spring actions');
  game.restart();
  // Flippers must physically return a descending ball to the board.
  game.verifyBall(-85, -263, 0, -3); key('ArrowLeft', true); advance(22); key('ArrowLeft', false);
  check(game.snapshot().ball.y > -250, 'moving left flipper imparts upward momentum');
  game.restart();
  for (let i = 0; i < 3; i++) { game.verifyBall(0, -430, 0, -4); advance(1); }
  check(game.snapshot().phase === 'over' && game.snapshot().balls === 0, 'three drains end the round');
  key('KeyW', true); advance(1); key('KeyW', false);
  check(game.snapshot().phase === 'playing' && game.snapshot().balls === 3, 'W restarts and launches after game over');
  game.restart();
  key('ArrowDown', true); advance(20);
  window.dispatchEvent(new Event('blur')); key('ArrowDown', false); advance(1);
  check(game.snapshot().paused && game.snapshot().phase === 'ready' && game.snapshot().charge === 0, 'focus loss clears controls without accidental launch');
  for (let i = 0; i < 20; i++) { game.restart(); advance(1); }
  const reset = game.snapshot();
  check(reset.resources.bodies === initial.resources.bodies && reset.resources.joints === initial.resources.joints && reset.entities === initial.entities, 'twenty restarts retain a constant body, joint and entity count');
  check(!document.documentElement.scrollWidth || document.documentElement.scrollWidth <= innerWidth, 'layout fits viewport width');
  check(document.querySelectorAll('#art img').length === 3, 'three ink lotus bumpers are visible');
  check([...document.querySelectorAll<HTMLImageElement>('#art img')].every(image => image.complete && image.naturalWidth > 0), 'all generated prop sprites decoded');
  game.restart(); advance(80);
  check(game.snapshot().ink.trailCount === 0, 'restart clears ink wake');
  // A repeatable in-motion composition captures the visible diffusing wake.
  game.verifyBall(-50, -20, 4, 3); advance(25);
  const diffusion = await game.verifyDiffusion();
  check(diffusion.changed > 150 && diffusion.transparent > 500 && diffusion.opaque > 1000, `actual GPU alpha: animated edge, transparent paper, stable ink centre (${JSON.stringify(diffusion)})`);
  // Allow image decode, layout and WebGPU presentation before taking screenshot.
  await new Promise(resolve => setTimeout(resolve, 150));
  const result = document.getElementById('result')!;
  result.textContent = JSON.stringify({ status: 'passed', checks, state: game.snapshot() }); result.dataset.status = 'passed';
}
