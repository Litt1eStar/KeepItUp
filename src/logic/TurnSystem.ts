/**
 * Pure rules for color turns, combo and ball speed. No Phaser imports, so it can be unit tested.
 *
 * Turn rule (improvement over the doc, which never defined "next player"):
 *  - After any hit, the ball's next target is a random joined player who is NOT the hitter.
 *  - With 2 players this alternates; in solo the target is always the solo player.
 *  - A newly spawned ball targets the player with the fewest balls currently assigned.
 */

export interface SpeedRules {
  speedPenalty: number;
  speedRecovery: number;
  speedMax: number;
  speedMin: number;
}

export type Rng = () => number;

export function pickNextTarget(hitter: number, joined: readonly number[], rng: Rng = Math.random): number {
  if (joined.length === 0) throw new Error('pickNextTarget: no players joined');
  if (joined.length === 1) return joined[0];
  const others = joined.filter((p) => p !== hitter);
  // Hitter might not be in `joined` (shouldn't happen) — fall back to everyone.
  const pool = others.length > 0 ? others : [...joined];
  const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[i];
}

export function pickSpawnTarget(joined: readonly number[], currentTargets: readonly number[], rng: Rng = Math.random): number {
  if (joined.length === 0) throw new Error('pickSpawnTarget: no players joined');
  const counts = joined.map((p) => currentTargets.filter((t) => t === p).length);
  const min = Math.min(...counts);
  const least = joined.filter((_, i) => counts[i] === min);
  return least[Math.min(least.length - 1, Math.floor(rng() * least.length))];
}

export interface HitResult {
  correct: boolean;
  combo: number;
  speedMult: number;
}

/** Resolve a hit on a ball. `combo` is the team combo; `speedMult` belongs to the ball. */
export function resolveHit(
  hitter: number,
  ballTarget: number,
  combo: number,
  speedMult: number,
  rules: SpeedRules,
): HitResult {
  const correct = hitter === ballTarget;
  if (correct) {
    return {
      correct,
      combo: combo + 1,
      speedMult: round2(Math.max(rules.speedMin, speedMult - rules.speedRecovery)),
    };
  }
  return {
    correct,
    combo: 0,
    speedMult: round2(Math.min(rules.speedMax, speedMult + rules.speedPenalty)),
  };
}

/**
 * Danger-zone rule (improvement): if a ball's bottom edge sinks below the danger line,
 * the combo breaks. Returns true only on the frame the ball *enters* the zone, so the
 * caller can fire feedback once.
 */
export function entersDangerZone(prevBottom: number, bottom: number, dangerLineY: number): boolean {
  return prevBottom <= dangerLineY && bottom > dangerLineY;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
