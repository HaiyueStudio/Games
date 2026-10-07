import type { InkPinballGame } from './InkPinballGame';
import { RIVER_LOTUSES } from './gardenRules';
import { INK_TARGETS } from './sceneRules';
import { DRAGON } from './sceneRules';

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
  check(game.snapshot().ink.fluid.emitted > 0, 'moving ink ball leaves a bounded wake');
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
  check(document.querySelectorAll('#art img').length === 3, 'three spirit orb bumpers are visible');
  check([...document.querySelectorAll<HTMLImageElement>('#art img')].every(image => image.complete && image.naturalWidth > 0), 'all generated prop sprites decoded');
  game.restart(); game.verifyBall(DRAGON.x,DRAGON.y,0,1); advance(2);
  check(game.snapshot().scene.dragon.phase==='holding' && game.snapshot().scene.dragon.captures===1,'dragon mouth captures the actual ball');
  const held=game.snapshot();key('KeyP',true);advance(1);key('KeyP',false);advance(60);
  check(game.snapshot().time===held.time && game.snapshot().scene.dragon.phase==='holding','pause freezes dragon bite');
  key('KeyP',true);advance(1);key('KeyP',false);advance(55);
  check(game.snapshot().scene.dragon.spits===1 && game.snapshot().score>=500 && game.snapshot().ball.y<DRAGON.y-30,'dragon spits quickly out of its mouth and awards 500');
  game.restart();game.verifyBall(-214,-143,0,0);advance(18);
  check(game.snapshot().springs[0]!.jump>0 && game.snapshot().springs[0]!.launches===1,'toad visible jump coincides with rescue impulse');
  for (const [side,x] of [[0,-214],[1,174]] as const) {
    game.restart();game.verifyBall(x,-143,0,0);advance(150);
    check(game.snapshot().springs[side]!.cycle.phase === 'submerged' && game.snapshot().springs[side]!.gateOpen, 'used toad dives and opens its real side rail '+side);
    game.verifyBall(x,-140,0,-1);
    let enteredWater=false;
    for(let i=0;i<220;i++){advance(1);if(game.snapshot().ink.atmosphere.waterEntries.ball>0)enteredWater=true;if(game.snapshot().balls<3)break;}
    check(enteredWater && game.snapshot().balls===2 && game.snapshot().springs[side]!.launches===1, 'next ball falls through the empty leaf into water without another rescue '+side);
    check(game.snapshot().springs[side]!.cycle.phase==='submerged','lost ball does not reset the absent toad '+side);
    key('KeyP',true);advance(1);key('KeyP',false);const waiting=game.snapshot();game.verifyPhysicsSteps(4000);
    check(game.snapshot().time===waiting.time && game.snapshot().springs[side]!.cycle.phase==='submerged','pause freezes the 30 second toad timer '+side);
    key('KeyP',true);advance(1);key('KeyP',false);
    const returnAt=game.snapshot().springs[side]!.cycle.returnAt;
    game.verifyPhysicsSteps(Math.max(0,Math.floor((returnAt-game.snapshot().time-.05)*120)));
    check(game.snapshot().springs[side]!.cycle.phase==='submerged','toad remains underwater for its full 30 seconds '+side);
    game.verifyPhysicsSteps(35);
    check(game.snapshot().springs[side]!.cycle.phase==='returning','toad leaps back toward the leaf after 30 seconds '+side);
    game.verifyPhysicsSteps(90);
    check(game.snapshot().springs[side]!.cycle.phase==='perched' && !game.snapshot().springs[side]!.gateOpen,'returned toad restores its support '+side);
    game.verifyBall(x,-143,0,0);advance(20);
    check(game.snapshot().springs[side]!.launches===2,'returned toad can rescue the next ball '+side);
    check(game.snapshot().resources.bodies===initial.resources.bodies && game.snapshot().entities===initial.entities,'toad departure and return reuse all scene resources '+side);
  }
  game.restart();advance(1);
  const orb=document.querySelector<HTMLImageElement>('#art img')!;
  const rotation=orb.style.transform;advance(60);
  check(orb.style.transform!==rotation && game.snapshot().ink.atmosphere.orbAuras===3,'all spirit pearls rotate with three persistent noise auras');
  key('KeyP',true);advance(1);key('KeyP',false);const pausedRotation=orb.style.transform;advance(60);
  check(orb.style.transform===pausedRotation,'pause freezes pearl rotation and aura simulation time');
  check(Math.abs(document.querySelector('.koi')!.getBoundingClientRect().width / document.getElementById('table')!.getBoundingClientRect().width-.196)<.01,'koi is scaled down by 30 percent');
  game.restart();game.verifyBall(0,-358,0,-4);advance(6);
  check(game.snapshot().ink.atmosphere.waterEntries.ball===1 && game.snapshot().ink.atmosphere.splashes===1,'ball contact with river emits one splash before drain');
  key('KeyP',true);advance(1);key('KeyP',false);const pausedWater=JSON.stringify(game.snapshot().ink.atmosphere);advance(120);
  check(JSON.stringify(game.snapshot().ink.atmosphere)===pausedWater,'pause freezes splash and ripple lifetimes');
  key('KeyP',true);advance(1);key('KeyP',false);advance(40);
  check(game.snapshot().ink.atmosphere.waterEntries.ball===1,'a submerged ball never repeatedly emits splash');
  game.restart();game.verifyBall(235,-345,0,-1);advance(20);
  check(game.snapshot().ink.atmosphere.waterEntries.ball===0,'shooter lane return does not splash into the river');
  game.restart();game.verifyBall(0,-430,0,-4);advance(1);advance(80);
  check(game.snapshot().scene.koi[0]!.airborne && game.snapshot().scene.koi[0]!.progress>.4,'a drain triggers an airborne koi somersault');
  advance(110);check(game.snapshot().scene.landings===1 && !game.snapshot().scene.koi[0]!.airborne,'koi returns to water and emits landing splash');
  check(game.snapshot().ink.atmosphere.waterEntries.fish===1 && game.snapshot().ink.atmosphere.splashes===1,'koi landing creates its own visible water spray');
  advance(300);check(game.snapshot().ink.atmosphere.splashes===0 && game.snapshot().ink.atmosphere.ripples===0,'transient water effects expire completely');
  game.restart();advance(2);const cache=game.snapshot().ink;advance(60);
  check(game.snapshot().ink.layoutReads===cache.layoutReads && game.snapshot().ink.uiUploads===cache.uiUploads,'unchanged UI reuses cached rectangles and storage data');
  check(game.snapshot().ink.fluid.bytes<3*1024*1024 && game.snapshot().ink.fluid.pending<=24,'fluid memory and input work stay bounded');
  check(document.querySelectorAll('#creatures img').length===10,'dragon body/jaw, two koi, three toads and three lily pads are independent layers');
  check([...document.querySelectorAll<HTMLImageElement>('#creatures img')].every(image=>image.complete&&image.naturalWidth>0),'all independent creature layers decoded before play');
  game.restart(); advance(1);
  check(Math.abs(document.querySelector('.crane')!.getBoundingClientRect().width / document.getElementById('table')!.getBoundingClientRect().width - .06) < .001, 'flying crane sprite is half the previous width');
  check(document.querySelectorAll('.lily-pad').length === 3, 'each toad has its own lily pad');
  const collect = (i: number) => { const p = RIVER_LOTUSES[i]!; game.verifyBall(p.x, p.y, 0, 0); advance(1); };
  collect(0);
  check(game.snapshot().score === 250 && game.snapshot().garden.collected === 1 && document.querySelectorAll('.river-lotus[hidden]').length === 1, 'lotus contact scores 250 and removes only that flower');
  advance(2); check(game.snapshot().score === 250, 'remaining inside a lotus sensor never scores twice');
  collect(1); collect(2);
  check(game.snapshot().score === 2750 && game.snapshot().garden.rounds === 1 && game.snapshot().garden.collected === 7, 'three lotus contacts grant the 2000 completion bonus once');
  game.verifyBall(235,-345,0,-1); advance(2);
  key('KeyP',true);advance(1);key('KeyP',false);advance(180);
  check(game.snapshot().garden.collected === 7, 'pause freezes pending lotus respawn');
  key('KeyP',true);advance(1);key('KeyP',false);advance(125);
  check(game.snapshot().garden.collected === 0 && document.querySelectorAll('.river-lotus[hidden]').length === 0, 'all three lotus flowers respawn after the celebration');
  for (let round=0;round<4;round++) { collect(0);collect(1);collect(2);game.verifyBall(235,-345,0,-1);advance(125); }
  check(game.snapshot().garden.rounds === 5 && game.snapshot().resources.bodies === initial.resources.bodies && game.snapshot().entities === initial.entities, 'five collection cycles reuse the same sensors and sprites');
  collect(0);game.verifyBall(0,-430,0,-4);advance(1);
  check(game.snapshot().garden.collected === 1, 'partial lotus collection persists across a lost ball');
  game.restart();advance(1);
  check(game.snapshot().garden.collected === 0 && game.snapshot().garden.rounds === 0, 'restart clears the lotus collection and pending respawn');
  for (let i=0;i<3;i++) {
    const p=INK_TARGETS[i]!;game.verifyBall(p.x,p.y+20,0,-2);advance(2);
    if(i===0){check(game.snapshot().targets === 1 && game.snapshot().garden.cranes[0] === 'downstroke', 'flying crane collision begins a downward wingbeat');advance(16);check(game.snapshot().garden.cranes[0] === 'upstroke','hit crane holds its upward wingbeat while waiting for the other cranes');}
  }
  check(game.snapshot().targets === 0 && game.snapshot().score >= 1950 && game.snapshot().garden.celebrationUntil > game.snapshot().time, 'three cranes celebrate and award their existing 1500 bonus');
  game.verifyBall(235,-345,0,-1);advance(125);
  check(game.snapshot().garden.cranes.every(p=>p==='gliding'), 'cranes return to gliding for the next set');
  const scoreNode=document.getElementById('score')!;
  const scoreCanvas=scoreNode.querySelector('canvas')!;
  const pixels=scoreCanvas.getContext('2d')!.getImageData(0,0,scoreCanvas.width,scoreCanvas.height).data;
  check(scoreNode.dataset.value === String(game.snapshot().score).padStart(6,'0') && pixels.some((v,i)=>i%4===3&&v>100), 'score uses painted bitmap glyph pixels and exposes the exact accessible value');
  game.restart(); advance(80);
  check(game.snapshot().ink.fluid.emitted === 0, 'restart clears ink wake');
  check(game.snapshot().ink.atmosphere.waterEntries.ball===0 && game.snapshot().ink.atmosphere.waterEntries.fish===0,'restart clears water events and counters');
  // A repeatable in-motion composition captures the visible diffusing wake.
  game.verifyBall(-50, -20, 4, 3); advance(25);
  const beforeFluid=await game.verifyFluid();
  check(beforeFluid.finite && beforeFluid.occupied>10 && beforeFluid.mass>1,'GPU fluid contains finite advected ink');
  game.verifyResumeManual();
  // Parked ball stops injecting. Existing ink must keep moving and dissipating.
  game.verifyBall(235,-345,0,-1);advance(2);
  for(let i=0;i<120;i++)advance(1);
  const afterFluid=await game.verifyFluid();
  check(afterFluid.finite && afterFluid.mass<beforeFluid.mass,'persistent ink dissipates after the ball stops injecting');
  const diffusion = await game.verifyDiffusion();
  check(diffusion.changed > 150 && diffusion.transparent > 500 && diffusion.opaque > 1000, `actual GPU alpha: animated edge, transparent paper, stable ink centre (${JSON.stringify(diffusion)})`);
  const water=await game.verifyWater();
  check(water.surface.changed>100 && water.surface.transparent>1000,'river shader produces animated waves on a transparent surface');
  check(water.splash.changed>100 && water.splash.transparent>1000,'splash shader renders moving droplets with transparent surroundings');
  const waterfall=await game.verifyWaterfall();
  check(waterfall.changed>100 && waterfall.transparent>1000,'right waterfall shader animates cascading ribbons and foam within a transparent rock mask');
  const orbAura=await game.verifyOrbAura();
  check(orbAura.changed>100 && orbAura.transparent>1000,'pearl aura shader evolves real noise pixels while leaving its surroundings transparent');
  const performance = await game.verifyPerformance();
  game.verifyResumeManual();
  game.restart();advance(80);
  game.verifyBall(DRAGON.x,DRAGON.y,0,1);advance(2);advance(54);
  for(let i=0;i<24;i++)advance(1);
  const pose=new URLSearchParams(location.search).get('pose');
  if(pose==='koi'){game.verifyBall(0,-430,0,-4);advance(1);advance(72);}
  if(pose==='toad'){game.restart();game.verifyBall(-214,-143,0,0);advance(25);}
  if(pose==='dragon'){game.restart();game.verifyBall(DRAGON.x,DRAGON.y,0,1);advance(20);}
  if(pose==='water'){game.restart();game.verifyBall(0,-358,0,-4);advance(25);}
  if(pose==='landing'){game.restart();game.verifyBall(0,-430,0,-4);advance(1);advance(198);}
  if(pose==='toad-away'){game.restart();game.verifyBall(-214,-143,0,0);advance(160);game.verifyBall(-214,-140,0,-1);advance(55);}
  if(pose==='toad-return'){game.restart();game.verifyBall(-214,-143,0,0);advance(160);game.verifyBall(235,-345,0,-1);advance(2);const t=game.snapshot().springs[0]!.cycle.returnAt;game.verifyPhysicsSteps(Math.round((t-game.snapshot().time+.4)*120));}
  if(pose==='garden'){game.restart();const p=INK_TARGETS[0]!;game.verifyBall(p.x,p.y+20,0,-2);advance(20);collect(0);game.verifyBall(0,-60,2,1);advance(1);}
  await game.verifyPresent();
  const result = document.getElementById('result')!;
  result.textContent = JSON.stringify({ status: 'passed', checks, performance, state: game.snapshot() }); result.dataset.status = 'passed';
}
