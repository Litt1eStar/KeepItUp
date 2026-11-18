/**
 * Which ball a character's eyes follow (render-only; no Phaser import, no allocation).
 *
 *  1. The lowest (largest y) ball whose target is this player: the most urgent one for them.
 *  2. Otherwise the nearest ball to (px, py).
 *  3. Otherwise null (no balls): look forward.
 */
export interface LookBall {
  readonly x: number;
  readonly y: number;
  readonly target: number;
}

export function pickLookTarget(
  px: number,
  py: number,
  id: number,
  balls: readonly LookBall[],
  out: { x: number; y: number },
): { x: number; y: number } | null {
  let pick: LookBall | null = null;
  for (const b of balls) if (b.target === id && (!pick || b.y > pick.y)) pick = b;
  if (!pick) {
    let best = Infinity;
    for (const b of balls) {
      const d = (b.x - px) ** 2 + (b.y - py) ** 2;
      if (d < best) {
        best = d;
        pick = b;
      }
    }
  }
  if (!pick) return null;
  out.x = pick.x;
  out.y = pick.y;
  return out;
}
