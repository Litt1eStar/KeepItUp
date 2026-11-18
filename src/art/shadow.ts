/** Shared floor-shadow stepping (balls and characters). Pure, dependency-free. */

/** Number of halftone density steps for every floor shadow texture. */
export const SHADOW_STEPS = 8;

/**
 * Shadow step for something whose bottom is `heightAboveFloor` px above the floor:
 * at/below the floor → SHADOW_STEPS-1 (dense), at/above `maxHeight` → 0 (sparse). Pure, clamped.
 */
export function shadowStep(heightAboveFloor: number, maxHeight: number): number {
  if (!(maxHeight > 0)) return SHADOW_STEPS - 1;
  const t = 1 - Math.min(1, Math.max(0, heightAboveFloor / maxHeight));
  return Math.min(SHADOW_STEPS - 1, Math.floor(t * SHADOW_STEPS));
}
