export const TABLE_HALF_WIDTH = 430;
export const WALL_Z = 220;
export const GOAL_X = 468;
export const PADDLE_X = 372;
export const PADDLE_HALF_WIDTH = 18;
export const PADDLE_HALF_DEPTH = 58;
export const PADDLE_LIMIT_Z = 154;
export const BALL_RADIUS = 17;
export const INITIAL_BALL_SPEED = 270;
export const MAX_BALL_SPEED = 760;

export interface PongBallState {
  readonly x: number;
  readonly z: number;
  readonly vx: number;
  readonly vz: number;
}

export type PongCollisionEvent =
  | { readonly type: 'wall'; readonly side: 'top' | 'bottom'; readonly x: number; readonly z: number; readonly speed: number }
  | { readonly type: 'paddle'; readonly side: 'left' | 'right'; readonly x: number; readonly z: number; readonly speed: number; readonly offset: number }
  | { readonly type: 'goal'; readonly scorer: 'left' | 'right' };

export interface PongStepResult {
  readonly ball: PongBallState;
  readonly events: readonly PongCollisionEvent[];
}

export function clampPaddleZ(value: number): number {
  return Math.max(-PADDLE_LIMIT_Z, Math.min(PADDLE_LIMIT_Z, value));
}

export function serveVelocity(direction: -1 | 1, angle: number, speed = INITIAL_BALL_SPEED): readonly [number, number] {
  const safeAngle = Math.max(-0.56, Math.min(0.56, angle));
  const safeSpeed = Math.max(INITIAL_BALL_SPEED, Math.min(MAX_BALL_SPEED, speed));
  return [Math.cos(safeAngle) * safeSpeed * direction, Math.sin(safeAngle) * safeSpeed];
}

export function stepPongBall(
  state: PongBallState,
  deltaSeconds: number,
  leftPaddleZ: number,
  rightPaddleZ: number,
): PongStepResult {
  const dt = Math.max(0, Math.min(1 / 30, deltaSeconds));
  let x = state.x + state.vx * dt;
  let z = state.z + state.vz * dt;
  let vx = state.vx;
  let vz = state.vz;
  const events: PongCollisionEvent[] = [];

  if (z + BALL_RADIUS >= WALL_Z && vz > 0) {
    z = WALL_Z - BALL_RADIUS;
    const speed = acceleratedSpeed(vx, vz, 1.018, 1.2);
    const directionLength = Math.hypot(vx, vz) || 1;
    vx = vx / directionLength * speed;
    vz = -Math.abs(vz / directionLength * speed);
    events.push({ type: 'wall', side: 'bottom', x, z: WALL_Z, speed });
  } else if (z - BALL_RADIUS <= -WALL_Z && vz < 0) {
    z = -WALL_Z + BALL_RADIUS;
    const speed = acceleratedSpeed(vx, vz, 1.018, 1.2);
    const directionLength = Math.hypot(vx, vz) || 1;
    vx = vx / directionLength * speed;
    vz = Math.abs(vz / directionLength * speed);
    events.push({ type: 'wall', side: 'top', x, z: -WALL_Z, speed });
  }

  if (vx < 0 && x - BALL_RADIUS <= -PADDLE_X + PADDLE_HALF_WIDTH && x > -PADDLE_X - PADDLE_HALF_WIDTH - BALL_RADIUS) {
    const collision = paddleBounce('left', z, leftPaddleZ, vx, vz);
    if (collision) {
      x = -PADDLE_X + PADDLE_HALF_WIDTH + BALL_RADIUS;
      vx = collision.vx;
      vz = collision.vz;
      events.push({ type: 'paddle', side: 'left', x: -PADDLE_X + PADDLE_HALF_WIDTH, z, speed: collision.speed, offset: collision.offset });
    }
  } else if (vx > 0 && x + BALL_RADIUS >= PADDLE_X - PADDLE_HALF_WIDTH && x < PADDLE_X + PADDLE_HALF_WIDTH + BALL_RADIUS) {
    const collision = paddleBounce('right', z, rightPaddleZ, vx, vz);
    if (collision) {
      x = PADDLE_X - PADDLE_HALF_WIDTH - BALL_RADIUS;
      vx = collision.vx;
      vz = collision.vz;
      events.push({ type: 'paddle', side: 'right', x: PADDLE_X - PADDLE_HALF_WIDTH, z, speed: collision.speed, offset: collision.offset });
    }
  }

  if (x < -GOAL_X) events.push({ type: 'goal', scorer: 'right' });
  else if (x > GOAL_X) events.push({ type: 'goal', scorer: 'left' });

  return { ball: { x, z, vx, vz }, events };
}

function paddleBounce(
  side: 'left' | 'right',
  ballZ: number,
  paddleZ: number,
  vx: number,
  vz: number,
): { vx: number; vz: number; speed: number; offset: number } | null {
  const reach = PADDLE_HALF_DEPTH + BALL_RADIUS;
  const distance = ballZ - paddleZ;
  if (Math.abs(distance) > reach) return null;
  const offset = Math.max(-1, Math.min(1, distance / reach));
  const speed = acceleratedSpeed(vx, vz, 1.055, 7);
  const angle = offset * 0.78;
  const direction = side === 'left' ? 1 : -1;
  return {
    vx: Math.cos(angle) * speed * direction,
    vz: Math.sin(angle) * speed,
    speed,
    offset,
  };
}

function acceleratedSpeed(vx: number, vz: number, multiplier: number, bonus: number): number {
  return Math.min(MAX_BALL_SPEED, Math.hypot(vx, vz) * multiplier + bonus);
}
