/**
 * Smart dash-pass (improvement): a ball hit mid-dash flies in an arc that lands
 * near the current x of the ball's new target player.
 *
 * Ball physics: y grows downward, vy < 0 is up, gravity g > 0.
 * The ball runs with time scale `s` (speed multiplier), which scales the simulated
 * time but not the shape of the arc — so the horizontal velocity solution is
 * independent of s. We still accept it for clarity.
 */

export interface DashPassInput {
  ballX: number;
  ballY: number;
  targetX: number;
  /** Height the ball should come back down to (roughly the target's head height). */
  landY: number;
  launchVy: number; // positive number = upward speed
  gravity: number;
  vxMax: number;
}

/** Time (in simulated seconds) for the ball to rise and fall back to landY. */
export function flightTime(ballY: number, landY: number, launchVy: number, gravity: number): number {
  // y(t) = ballY − launchVy·t + ½·g·t²  →  solve y(t) = landY for the later root.
  const a = 0.5 * gravity;
  const b = -launchVy;
  const c = ballY - landY;
  const disc = b * b - 4 * a * c;
  if (disc < 0) {
    // Can't reach landY (it's above the apex) — use time to apex ×2 as a fallback.
    return (2 * launchVy) / gravity;
  }
  return (-b + Math.sqrt(disc)) / (2 * a);
}

export function solveDashPass(p: DashPassInput): { vx: number; vy: number } {
  const t = flightTime(p.ballY, p.landY, p.launchVy, p.gravity);
  const raw = (p.targetX - p.ballX) / t;
  const vx = Math.max(-p.vxMax, Math.min(p.vxMax, raw));
  return { vx, vy: -p.launchVy };
}

/** Where a ball launched with (vx, vy) comes back down to landY — used by tests. */
export function landingX(ballX: number, ballY: number, vx: number, launchVy: number, landY: number, gravity: number): number {
  return ballX + vx * flightTime(ballY, landY, launchVy, gravity);
}
