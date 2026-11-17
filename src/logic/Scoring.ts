/** Pure scoring rules from the design doc. */

export interface ScoreRules {
  pointsPerSecond: number;
  pointsPerCorrectHit: number;
  comboMultiplierStep: number;
}

export function comboMultiplier(combo: number, rules: ScoreRules): number {
  return 1 + combo * rules.comboMultiplierStep;
}

/** Points earned for surviving `dt` seconds at the given combo. */
export function timePoints(dt: number, combo: number, rules: ScoreRules): number {
  return rules.pointsPerSecond * dt * comboMultiplier(combo, rules);
}

/** Points for a correct hit. `comboAfterHit` is the combo including this hit. */
export function hitPoints(comboAfterHit: number, rules: ScoreRules): number {
  return rules.pointsPerCorrectHit * comboMultiplier(comboAfterHit, rules);
}
