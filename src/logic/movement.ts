/**
 * Pure platformer movement & arcade physics helpers: horizontal accel/turn-around,
 * variable jump cut, apex/fall gravity, player dash-bumps, ball spin/Magnus curve,
 * and ball-to-ball mid-air collisions.
 */
export interface MovementTuning {
  readonly moveSpeed: number;
  readonly moveAccel: number;
  readonly moveDecel: number;
  readonly moveTurnAccel: number;
  readonly airAccel: number;
  readonly airDecel: number;
  readonly bumpDecayDecel?: number;
  readonly jumpCutMultiplier: number;
  readonly jumpCutMinVy: number;
  readonly playerGravity: number;
  readonly fallGravityMult: number;
  readonly apexVyThreshold: number;
  readonly apexGravityMult: number;
}

export interface BumpBody {
  vx: number;
  vy: number;
  dashing: boolean;
  dashDir: 1 | -1;
  dashTime: number;
}

export interface BallBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  spin: number;
}

/** Step horizontal velocity toward `dir * T.moveSpeed` using ground/air/turn/bump-decay rates. */
export function stepHorizontalVelocity(
  vx: number,
  dir: -1 | 0 | 1,
  grounded: boolean,
  dt: number,
  T: MovementTuning,
): number {
  const target = dir * T.moveSpeed;
  const rate =
    Math.abs(vx) > T.moveSpeed && vx !== 0
      ? (T.bumpDecayDecel ?? T.moveDecel)
      : dir === 0
        ? grounded
          ? T.moveDecel
          : T.airDecel
        : vx !== 0 && Math.sign(vx) !== dir
          ? T.moveTurnAccel
          : grounded
            ? T.moveAccel
            : T.airAccel;
  const diff = target - vx;
  const maxStep = rate * Math.max(0, dt);
  return Math.abs(diff) <= maxStep ? target : vx + Math.sign(diff) * maxStep;
}

/** Gravity with lighter apex hang near the peak and heavier, snappier fall. */
export function effectivePlayerGravity(vy: number, T: MovementTuning): number {
  if (Math.abs(vy) < T.apexVyThreshold) return T.playerGravity * T.apexGravityMult;
  return vy > 0 ? T.playerGravity * T.fallGravityMult : T.playerGravity;
}

/** Cut upward velocity once when the jump button is released early while still rising. */
export function applyJumpCut(
  vy: number,
  jumpHeld: boolean,
  cutApplied: boolean,
  T: MovementTuning,
): { vy: number; cutApplied: boolean } {
  if (!jumpHeld && !cutApplied && vy < T.jumpCutMinVy) {
    return { vy: vy * T.jumpCutMultiplier, cutApplied: true };
  }
  return { vy, cutApplied };
}

/**
 * Resolve horizontal contact between two players (`dirAtoB` = +1 when b is right of a).
 * Returns true if a dash-bump occurred (so the caller can emit jolt/splat feedback).
 */
export function resolvePlayerBump(
  a: BumpBody,
  b: BumpBody,
  dirAtoB: 1 | -1,
  T: { dashBumpVx: number; dashBumpVy: number; dashBumpRecoilVx: number },
): boolean {
  if (a.dashing && !b.dashing) {
    b.vx = dirAtoB * T.dashBumpVx;
    b.vy = Math.min(b.vy, -T.dashBumpVy);
    a.vx = -dirAtoB * T.dashBumpRecoilVx;
    a.dashTime = 0;
    return true;
  }
  if (b.dashing && !a.dashing) {
    a.vx = -dirAtoB * T.dashBumpVx;
    a.vy = Math.min(a.vy, -T.dashBumpVy);
    b.vx = dirAtoB * T.dashBumpRecoilVx;
    b.dashTime = 0;
    return true;
  }
  if (a.dashing && b.dashing) {
    a.vx = -dirAtoB * T.dashBumpVx * 0.65;
    b.vx = dirAtoB * T.dashBumpVx * 0.65;
    a.dashTime = 0;
    b.dashTime = 0;
    return true;
  }
  const avg = (a.vx + b.vx) * 0.5;
  a.vx = avg - dirAtoB * 40;
  b.vx = avg + dirAtoB * 40;
  return false;
}

/** Spin (rad/s) imparted on a ball hit from off-center contact + player sideways velocity. */
export function computeHitSpin(
  ballX: number,
  playerX: number,
  reach: number,
  playerVx: number,
  T: { moveSpeed: number; hitSpinFactor: number; moveSpinFactor: number; ballSpinMax: number },
): number {
  const offset = Math.max(-1, Math.min(1, (ballX - playerX) / Math.max(1, reach)));
  const raw = offset * T.hitSpinFactor + (playerVx / T.moveSpeed) * T.moveSpinFactor;
  return Math.max(-T.ballSpinMax, Math.min(T.ballSpinMax, raw));
}

/** Magnus curve acceleration + air spin decay over `dt`. */
export function stepBallSpin(
  vx: number,
  spin: number,
  dt: number,
  T: { magnusFactor: number; spinDecay: number },
): { vx: number; spin: number } {
  return {
    vx: vx + spin * T.magnusFactor * dt,
    spin: spin * Math.max(0, 1 - T.spinDecay * dt),
  };
}

/** Elastic mid-air collision between two balls; returns true when they overlap. */
export function resolveBallCollision(a: BallBody, b: BallBody): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const minDist = a.r + b.r;
  if (dist >= minDist) return false;

  const nx = dist > 1e-6 ? dx / dist : 1;
  const ny = dist > 1e-6 ? dy / dist : 0;
  const push = (minDist - dist) * 0.5;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;

  const relVn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (relVn < 0) {
    const impulse = -(1 + 0.95) * relVn * 0.5;
    a.vx -= impulse * nx;
    a.vy -= impulse * ny;
    b.vx += impulse * nx;
    b.vy += impulse * ny;
    a.spin += 3.5;
    b.spin -= 3.5;
    const higher = a.y < b.y ? a : b;
    higher.vy = Math.min(higher.vy, -180);
  }
  return true;
}
