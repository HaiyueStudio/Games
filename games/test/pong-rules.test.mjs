import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BALL_RADIUS,
  INITIAL_BALL_SPEED,
  MAX_BALL_SPEED,
  PADDLE_X,
  WALL_Z,
  clampPaddleZ,
  serveVelocity,
  stepPongBall,
} from '../pong/PongRules.ts';

test('pong controls clamp paddles to the playable court', () => {
  assert.equal(clampPaddleZ(999), 154);
  assert.equal(clampPaddleZ(-999), -154);
  assert.equal(clampPaddleZ(42), 42);
});

test('pong paddle reflections accelerate the ball and aim from contact offset', () => {
  const result = stepPongBall(
    { x: -PADDLE_X + 38, z: 42, vx: -INITIAL_BALL_SPEED, vz: 0 },
    1 / 30,
    0,
    0,
  );
  const hit = result.events.find(event => event.type === 'paddle');
  assert.ok(hit);
  assert.equal(hit.side, 'left');
  assert.ok(result.ball.vx > 0);
  assert.ok(result.ball.vz > 0);
  assert.ok(Math.hypot(result.ball.vx, result.ball.vz) > INITIAL_BALL_SPEED);
});

test('pong wall reflections stay inside the court and gain speed', () => {
  const result = stepPongBall(
    { x: 0, z: WALL_Z - BALL_RADIUS - 1, vx: 220, vz: 180 },
    1 / 30,
    0,
    0,
  );
  assert.equal(result.events[0]?.type, 'wall');
  assert.ok(result.ball.vz < 0);
  assert.ok(result.ball.z <= WALL_Z - BALL_RADIUS);
  assert.ok(Math.hypot(result.ball.vx, result.ball.vz) > Math.hypot(220, 180));
});

test('pong acceleration is capped and serves have a stable magnitude', () => {
  const [vx, vz] = serveVelocity(1, 99);
  assert.ok(Math.abs(Math.hypot(vx, vz) - INITIAL_BALL_SPEED) < 1e-8);

  const result = stepPongBall(
    { x: PADDLE_X - 38, z: 0, vx: MAX_BALL_SPEED, vz: 0 },
    1 / 30,
    0,
    0,
  );
  assert.ok(Math.hypot(result.ball.vx, result.ball.vz) <= MAX_BALL_SPEED + 1e-8);
});
