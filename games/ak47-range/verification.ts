import { type RangeGame } from './RangeGame';
export async function verifyRange(game: RangeGame, canvas: HTMLCanvasElement) {
  const checks: string[] = [];
  const check = (value: unknown, name: string) => { if (!value) throw new Error(name); checks.push(name); };
  const frames = async (n: number) => { for (let i = 0; i < n; i++) await new Promise<void>(resolve => game.engine.once('after-update', () => resolve())); };
  const capture = canvas.setPointerCapture.bind(canvas), release = canvas.releasePointerCapture.bind(canvas);
  canvas.setPointerCapture = id => { if (id < 9100) capture(id); };
  canvas.releasePointerCapture = id => { if (id < 9100) release(id); };
  const r = canvas.getBoundingClientRect();
  const send = (type: string, id: number, x: number, y: number) => canvas.dispatchEvent(new PointerEvent(type, {
    pointerId: id, pointerType: 'touch', isPrimary: id === 9101, clientX: r.left + x, clientY: r.top + y,
    button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true,
  }));
  try {
    await frames(12);
    if (r.width < r.height) {
      const time = game.rules.time;
      await frames(30);
      check(game.snapshot().portraitPaused, 'portrait displays landscape prompt');
      check(game.rules.time === time && !game.rules.firing, 'portrait pauses combat and spawning');
      check(game.controls.disabled, 'portrait disables movement');
      return { schemaVersion: 2, suite: 'ak47-range', checks, ...game.snapshot() };
    }
    check(game.snapshot().weaponAttached, 'AK47 attached to ren42 right-hand bone');
    const start = game.snapshot();
    const { x: cx, y: cy } = game.joystickCenter(r.width, r.height);
    const actions = game.hudActions();
    send('pointerdown', 9101, cx, cy); send('pointermove', 9101, cx + 42, cy - 32);
    await frames(20);
    check(game.playerTransform.position[0]! > start.player[0]! + 0.2, 'joystick translates character');
    check(Math.abs(game.playerTransform.rotation[1]!) > 0.3, 'character turns toward movement');
    check(game.snapshot().cameraTarget[0]! > 0.05, 'third-person camera follows character');
    send('pointerdown', 9102, actions.fire.x + 48, actions.fire.y + 48);
    await frames(45);
    check(game.rules.shots >= 3 && game.controls.state.active, 'second finger continuously fires during movement');
    check(game.rules.bullets.every(b => Math.abs(Math.hypot(b.dx, b.dz) - 1) < 1e-6), 'bullets retain normalized heading');
    send('pointerup', 9102, actions.fire.x + 48, actions.fire.y + 48);
    send('pointerup', 9101, cx, cy);
    const released = game.rules.shots, position = Array.from(game.playerTransform.position);
    await frames(15);
    check(game.rules.shots === released && game.playerTransform.position.every((v, i) => v === position[i]), 'release stops firing and movement');
    send('pointerdown', 9102, actions.reload.x + 44, actions.reload.y + 24);
    send('pointerup', 9102, actions.reload.x + 44, actions.reload.y + 24);
    await frames(2);
    check(game.rules.reloadRemaining > 0, 'Engine GUI reload starts magazine timer');
    for (let i = 0; i < 500 && game.rules.reloadRemaining > 0; i++) await frames(1);
    check(game.rules.ammo === 30 && game.rules.reloadRemaining === 0, 'reload replenishes magazine');
    send('pointerdown', 9102, actions.fire.x + 48, actions.fire.y + 48); send('pointercancel', 9102, 0, 0);
    check(!game.rules.firing, 'pointer cancellation stops continuous fire');
    game.restart();
    game.rules.spawnEnemy({ x: 1, z: -2 });
    game.rules.spawnEnemy({ x: 0, z: 7 });
    game.rules.spawnEnemy({ x: 5, z: -6 });
    await frames(2);
    check(game.snapshot().enemies[0]!.visible, 'front enemy visible inside 90-degree cone');
    check(!game.snapshot().enemies[1]!.visible, 'rear enemy hidden');
    check(!game.snapshot().enemies[2]!.visible, 'cover blocks enemy visibility');
    check(game.snapshot().renderedEnemies === game.snapshot().enemies.filter(e => e.visible).length, 'hidden enemies excluded from rendering');
    await frames(100);
    check(game.rules.health < 100 && game.rules.damageEvents > 0, 'enemy acquires player and bullets inflict damage');
    await frames(45);
    await game.engine.device.queue.onSubmittedWorkDone();
    return { schemaVersion: 2, suite: 'ak47-range', checks, ...game.snapshot() };
  } finally { game.cancelInteraction(); canvas.setPointerCapture = capture; canvas.releasePointerCapture = release; }
}
