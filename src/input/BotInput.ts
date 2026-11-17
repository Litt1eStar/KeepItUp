import { TUNING as T } from '../config/tuning';
import type { PlayerId } from '../config/players';
import type { World } from '../game/World';
import type { Ball } from '../entities/Ball';
import type { Player } from '../entities/Player';
import { EMPTY_INPUT, type InputSource, type PlayerInput } from './InputManager';

/**
 * Simple AI for attract mode. It's deliberately imperfect (aim jitter, random jump choice)
 * so the demo looks like people playing and eventually drops a ball.
 */
export class BotInput implements InputSource {
  private out = new Map<PlayerId, PlayerInput>();
  private aimJitter = new Map<Ball, number>();
  private willJump = new Map<Ball, boolean>();

  constructor(private readonly world: World, private readonly rng: () => number = Math.random) {}

  update(): void {
    for (const p of this.world.players) this.out.set(p.id, this.think(p));
  }

  get(id: PlayerId): PlayerInput {
    return this.out.get(id) ?? EMPTY_INPUT;
  }

  private think(p: Player): PlayerInput {
    const mine = this.world.balls.filter((b) => b.target === p.id);
    if (mine.length === 0) return this.drift(p);
    // Most urgent = lowest ball.
    const ball = mine.reduce((a, b) => (b.bottom > a.bottom ? b : a));
    if (!this.aimJitter.has(ball) || ball.hitCooldown > 0) {
      this.aimJitter.set(ball, (this.rng() - 0.5) * 40);
      this.willJump.set(ball, this.rng() < 0.45);
    }

    const headY = p.top - ball.r;
    const { x: landX, t } = predict(ball, headY);
    const targetX = landX + this.aimJitter.get(ball)!;
    const dx = targetX - p.x;

    const input: PlayerInput = { ...EMPTY_INPUT };
    if (Math.abs(dx) > 10) {
      input.left = dx < 0;
      input.right = dx > 0;
      // A teammate in the way? Hop over them (landing on heads is allowed).
      const dir = Math.sign(dx);
      const blocker = this.world.players.find((o) => o !== p && Math.sign(o.x - p.x) === dir && Math.abs(o.x - p.x) < p.w + 14 && o.y > p.top);
      if (blocker && p.grounded) {
        input.jumpPressed = true;
        input.jumpHeld = true;
      }
    }
    // Dash when it's urgent and far away.
    if (Math.abs(dx) > 150 && t < 0.7 && p.dashCooldown <= 0) input.dashPressed = true;
    // Jump into the ball sometimes for the higher bounce.
    const falling = ball.vy > 0 && ball.floatTime <= 0;
    if (falling && this.willJump.get(ball) && Math.abs(ball.x - p.x) < 40 && ball.bottom > p.top - 170 && p.grounded) {
      input.jumpPressed = true;
      input.jumpHeld = true;
    }
    return input;
  }

  /** No ball for me: get out of the way of teammates' landing spots, else go home. */
  private drift(p: Player): PlayerInput {
    for (const b of this.world.balls) {
      const { x: landX } = predict(b, p.top - b.r);
      const away = p.x - landX;
      if (Math.abs(away) < 130) {
        let dir = Math.sign(away) || 1;
        if ((dir < 0 && p.x < 90) || (dir > 0 && p.x > T.width - 90)) dir = -dir; // cornered: go the other way
        return { ...EMPTY_INPUT, left: dir < 0, right: dir > 0 };
      }
    }
    const dx = p.def.spawnX - p.x;
    return { ...EMPTY_INPUT, left: dx < -20, right: dx > 20 };
  }
}

/** Predict where a ball crosses height y on the way down (sim physics, simple wall reflection). */
function predict(ball: Ball, y: number): { x: number; t: number } {
  if (ball.floatTime > 0) return { x: ball.x, t: ball.floatTime + 1 };
  const g = T.ballGravity;
  // y(t) = ball.y + vy t + ½ g t²  (sim seconds)
  const a = 0.5 * g;
  const b = ball.vy;
  const c = ball.y - y;
  const disc = b * b - 4 * a * c;
  const tSim = disc < 0 ? 0 : Math.max(0, (-b + Math.sqrt(disc)) / (2 * a));
  let x = ball.x + ball.vx * tSim;
  const lo = ball.r;
  const hi = T.width - ball.r;
  for (let i = 0; i < 4 && (x < lo || x > hi); i++) x = x < lo ? 2 * lo - x : 2 * hi - x;
  return { x, t: tSim / ball.speedMult };
}
