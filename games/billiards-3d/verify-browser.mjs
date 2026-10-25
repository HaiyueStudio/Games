import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runChromeWebGpuFixture } from '../../../Engine/scripts/webgpu-gate/chrome-runner.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const output = resolve(root, 'artifacts/billiards-3d');
mkdirSync(output, { recursive: true });
for (const [name, width, height] of [['desktop', 1280, 800], ['portrait', 390, 844]]) {
  const result = await runChromeWebGpuFixture({
    root, fixture: 'games/billiards-3d/index.html', query: { verify: 1 }, timeoutMs: 60000,
    disableDx12InfoCollection: true,
    visualCapture: { viewportWidth: width, viewportHeight: height, sampleWidth: 32, sampleHeight: 24 },
    interact: async cdp => {
      const evaluate = async expression => {
        const response = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description ?? response.result.exceptionDetails.text);
        return response.result?.result?.value;
      };
      const until = async (expression, label) => {
        const deadline = Date.now() + 45000;
        while (!await evaluate(expression)) {
          assert.ok(Date.now() < deadline, label);
          await new Promise(accept => setTimeout(accept, 40));
        }
      };
      const capture = async suffix => {
        // Flush prepared render commands through the normal engine frame loop.
        await evaluate(`(async () => {
          const game = __billiards3d; game.engine.run();
          await new Promise(accept => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(accept))));
          game.engine.stop();
        })()`);
        const png = await cdp.call('Page.captureScreenshot', { format: 'png' });
        writeFileSync(resolve(output, `${name}-${suffix}.png`), Buffer.from(png.result.data, 'base64'));
      };
      await until('!!window.__billiards3d', '3D Billiards initialized');
      await evaluate(`(() => {
        const game = window.__billiards3d; game.engine.stop(); game.newGame(false);
        window.__billiardsChecks = [];
        window.__check = (value, label) => { if (!value) throw new Error(label); window.__billiardsChecks.push(label); };
        window.__step = count => { for (let i = 0; i < count; i++) game.tick(performance.now(), 1000 / 60); };
        window.__put = (ball, x, z, vx = 0, vz = 0) => {
          game.physics.teleportBody(ball.physics, x, z, 0); game.physics.setLinearVelocity(ball.physics, vx, vz);
          ball.t2d.x = x; ball.t2d.y = z; game.syncBallMeshes();
        };
        const mesh = entity => [...entity.components.values()].find(component => component.geometry);
        const transform = entity => [...entity.components.values()].find(component => component.position?.length === 3 && component.rotation?.length === 3);
        const extent = (entity, maximum) => {
          const ys = mesh(entity).geometry.positions.filter((value, index) => index % 3 === 1);
          return (maximum ? Math.max(...ys) : Math.min(...ys)) + transform(entity).position[1];
        };
        const top = extent(game.tableEntities.find(entity => entity.name === 'Felt'), true);
        __check(game.balls.every(ball => Math.abs(extent(ball.entity, false) - top) < 0.001), 'all 11 sphere bottoms touch the rendered felt');
        __check(game.balls.every(ball => {
          const position = transform(ball.shadow).position;
          return Math.abs(position[0] - ball.t2d.x) < 0.001 && Math.abs(position[2] - ball.t2d.y) < 0.001
            && position[1] > top && position[1] < top + 0.1;
        }), 'contact shadows sit directly below the balls and just above the felt');
        __step(2);
      })()`);
      await capture('aim');
      // A real input gesture unlocks Web Audio before any fixture emits a cue.
      await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', x: 15, y: 100, button: 'left', clickCount: 1 });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 15, y: 100, button: 'left', clickCount: 1 });
      await until('__billiards3d.audio.snapshot().backend.buffers === 5 && __billiards3d.audio.snapshot().backend.state === "running"', 'audio unlocked with five synthesized buffers');
      const point = await evaluate(`(() => {
        const game = __billiards3d, p = game.cueBall.t3d.position, m = game.viewProj;
        const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
        return { x: ((m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w + 1) * innerWidth / 2,
          y: (1 - (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w) * innerHeight / 2 };
      })()`);
      await cdp.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y + 150, buttons: 1 });
      await cdp.call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y + 150, button: 'left', clickCount: 1 });
      await evaluate(`(() => {
        const game = __billiards3d;
        __check(game.audio.snapshot().played.cue === 1, 'real drag-and-release shot plays the cue strike');
        game.newGame(false);
        __put(game.cueBall, 0, 0, 4, 0); __put(game.balls[1], 35, 0); __step(10);
        __check(game.audio.snapshot().played.collision > 0, 'Box2D ball collision plays the impact sound');
        game.newGame(false);
        __put(game.cueBall, 330, 100, 6, 0); __step(10);
        __check(game.audio.snapshot().played.cushion > 0, 'Box2D cushion collision plays its softer impact');
        game.newGame(false);
        const pockets = game.audio.snapshot().played.pocket;
        __put(game.cueBall, 0, 194); __step(1);
        __check(game.audio.snapshot().played.pocket === pockets + 1 && game.cueBall.t2d.x === -235,
          'cue-ball scratch plays one pocket drop and respawns on the felt');
        for (const ball of game.balls.slice(1)) { __put(ball, 0, 194); __step(1); }
        const won = game.audio.snapshot();
        __check(game.potted === 10 && won.played.victory === 1 && won.played.pocket === pockets + 11,
          'all ten red pots play pocket drops and one victory fanfare');
        __step(20);
        __check(game.audio.snapshot().played.victory === 1, 'subsequent frames never repeat the victory sound');
        __check(won.backend.voices > 0 && won.backend.voices <= 8 && won.backend.error === null,
          'real Web Audio voices play within the eight-voice budget');
        game.newGame(false);
        __check(game.audio.snapshot().backend.voices === 0, 'new game stops old effects and the fanfare');
        game.mode = 'transition'; game.orbitTransform.setTarget(0, 0, 0); game.orbitTransform.set(980, 0, Math.PI * 0.035);
        __step(2);
      })()`);
      await capture('top');
      await evaluate(`(() => {
        const game = __billiards3d; game.newGame(false); __step(2);
        game.audio.dispose(); game.audio.dispose();
        __check(game.audio.snapshot().backend.disposed && game.audio.snapshot().backend.voices === 0,
          'audio teardown closes the mixer and releases voices idempotently');
        const result = document.createElement('output'); result.id = 'result'; result.hidden = true;
        result.textContent = JSON.stringify({ status: 'passed', checks: __billiardsChecks, audio: game.audio.snapshot() });
        result.dataset.status = 'passed'; document.body.append(result);
      })()`);
    },
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.browserDiagnostics.unclassifiedFailureCount, 0);
  writeFileSync(resolve(output, `${name}.png`), Buffer.from(result.visualCapture.pngBase64, 'base64'));
  delete result.visualCapture.pngBase64;
  writeFileSync(resolve(output, `${name}.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(`3D Billiards ${name}: ${result.checks.length} height, input, physics and audio checks passed`);
}
