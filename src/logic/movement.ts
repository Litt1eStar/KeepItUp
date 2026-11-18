/**
 * Pure platformer movement feel helpers: snappy horizontal accel/turn-around,
 * variable jump height via early-release velocity cut, and apex/fall gravity shaping.
 */
export interface MovementTuning {
  readonly moveSpeed: number;
  readonly moveAccel: number;
  readonly moveDecel: number;
  readonly moveTurnAccel: number;
  readonly airAccel: number;
  readonly airDecel: number;
  readonly jumpCutMultiplier: number;
  readonly jumpCutMinVy: number;
  readonly playerGravity: number;
  readonly fallGravityMult: number;
  readonly apexVyThreshold: number;
  readonly apexGravityMult: number;
}

/** Step horizontal velocity toward `dir * T.moveSpeed` using ground/air/turn rates. */
export function stepHorizontalVelocity(
  vx: number,
  dir: -1 | 0 | 1,
  grounded: boolean,
  dt: number,
  T: MovementTuning,
): number {
  const target = dir * T.moveSpeed;
  const rate =
    dir === 0
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
