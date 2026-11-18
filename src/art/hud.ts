/**
 * Riso HUD + game-feel timing and layout (pure, Phaser-free). Everything is stepped: values change
 * in whole STEP_MS ticks, never by smooth interpolation or alpha.
 */
import { STEP_MS, slamScale } from './motion';
import { DOT_TEX, STAMP_H, formatScore } from './ui';
import type { InkName } from './palette';
import { STAGE_QUIET_Y } from './stage';
import { TUNING as T } from '../config/tuning';

// ---------------------------------------------------------------- layout (logical px, top band)

/** HUD anchor points. Everything sits in the quiet top band (y < STAGE_QUIET_Y). */
export const HUD = {
  score: { x: 16, y: 0, size: 48 },
  /** Combo stamp-label center (rotated container). */
  combo: { x: 300, y: 36, rot: -0.08, multSize: 24, countSize: 10, h: 50 },
  time: { x: T.width / 2, y: 2, size: 22 },
  nextCaption: { x: T.width / 2, y: 36, size: 9 },
  dots: { y: 57, spacing: 11.5, scale: 1 },
  best: { x: T.width - 16, y: 10, size: 16 },
  /** Attract-mode strip, printed on the black floor band. */
  demo: { x: T.width / 2, y: (T.floorY + T.height) / 2 + 2, size: 15 },
} as const;

/** Combo label border half-height (the label's lowest point at rest is HUD.combo.y + this). */
export const COMBO_HALF_H = HUD.combo.h / 2;
/** Displayed next-ball dot radius (texture half-size × display scale). */
export const DOT_R = (DOT_TEX / 2) * HUD.dots.scale;

/** x of next-ball dot i (of n), centered on the stage. */
export function dotX(i: number, n: number = T.extraBallInterval): number {
  return HUD.time.x + (i - (n - 1) / 2) * HUD.dots.spacing;
}

// ---------------------------------------------------------------- labels

/** Filled next-ball dots: one per whole elapsed second since the last ball, 0..interval. */
export function dotsFilled(elapsedS: number, nextBallAtS: number, intervalS: number = T.extraBallInterval): number {
  const n = Math.floor(intervalS - (nextBallAtS - elapsedS));
  return Math.min(intervalS, Math.max(0, n));
}

/** 83 → "1:23". */
export function formatClock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Combo multiplier label: 2.3 → "×2.3". */
export function comboMultLabel(mult: number): string {
  return `×${mult.toFixed(1)}`;
}

/** Combo count label: 12 → "COMBO 12". */
export function comboCountLabel(combo: number): string {
  return `COMBO ${combo}`;
}

/** "BEST 12 840". */
export function bestLabel(best: number): string {
  return `BEST ${formatScore(best)}`;
}

/** Ink to print small type in: yellow type is too faint on paper, so it prints black. */
export function readableInk(ink: InkName): InkName {
  return ink === 'yellow' ? 'black' : ink;
}

// ---------------------------------------------------------------- cadence

/** Combo banner every 10. */
export function isComboMilestone(combo: number): boolean {
  return combo > 0 && combo % 10 === 0;
}

export const NICE_EVERY = 5;

/** NICE stamp on every NICE_EVERY-th consecutive correct hit, unless a milestone banner already fires. */
export function niceDue(streak: number, milestone: boolean): boolean {
  return streak > 0 && streak % NICE_EVERY === 0 && !milestone;
}

/**
 * The one small stamp to slam above the hitter (they share a spot, so never more than one):
 * WRONG > NICE > PASS, or null.
 */
export function localStampFor(hit: { correct: boolean; nice: boolean; pass: boolean }): 'WRONG' | 'NICE' | 'PASS' | null {
  if (!hit.correct) return 'WRONG';
  if (hit.nice) return 'NICE';
  return hit.pass ? 'PASS' : null;
}

/** Highest centre y for a stamp of display scale `scale` so it stays under the HUD band, even mid-slam (×1.4). */
export function stampMinY(scale: number): number {
  return STAGE_QUIET_Y + (STAMP_H * scale * slamScale(0)) / 2;
}

// ---------------------------------------------------------------- stepped effect schedules

export const SPLAT_HOLD_STEPS = 3;
const SPLAT_SHRINK = [0.6, 0.3] as const;

/**
 * Splat scale multiplier `sinceMs` after it printed: full size for `holdSteps` idle steps, then
 * 0.6, 0.3 (one step each), then 0 = done (destroy/recycle). holdSteps = Infinity never ends.
 */
export function splatScale(sinceMs: number, holdSteps: number = SPLAT_HOLD_STEPS): number {
  const step = Math.floor(Math.max(0, sinceMs) / STEP_MS);
  if (step < holdSteps) return 1;
  return SPLAT_SHRINK[step - holdSteps] ?? 0;
}

/** Splat sizes (× the 64 px texture). */
export const SPLAT_SIZE_MUL = { small: 1.3, hit: 1.8, jump: 2.6, floor: 4.5 } as const;
export type SplatSize = keyof typeof SPLAT_SIZE_MUL;

/** Popup y offsets (px), one per popup step; the popup is gone after the last one. */
export const POPUP_RISE = [0, -12, -24, -34] as const;
export const POPUP_STEP_MS = STEP_MS * 2;
export const POPUP_MS = POPUP_RISE.length * POPUP_STEP_MS;

/** Popup y offset `sinceMs` after it appeared, or NaN once it should disappear. */
export function popupRise(sinceMs: number): number {
  const i = Math.floor(Math.max(0, sinceMs) / POPUP_STEP_MS);
  return i < POPUP_RISE.length ? POPUP_RISE[i] : NaN;
}

/** Centre banner stamp hold (PLUS_BALL, COMBO); then it disappears in one step. */
export const BANNER_MS = 1100;
/** Small stamps near a player (NICE, WRONG, PASS). */
export const LOCAL_STAMP_MS = STEP_MS * 8;

/** Attract-mode strip: stepped blink, on 8 idle steps, off 3 (visibility only). */
export function demoStripVisible(tMs: number): boolean {
  return Math.floor(Math.max(0, tMs) / STEP_MS) % 11 < 8;
}

/** True when every HUD anchor sits in the quiet band (for tests). */
export function hudInQuietBand(): boolean {
  const ys = [HUD.score.y + HUD.score.size, HUD.combo.y + COMBO_HALF_H, HUD.time.y + HUD.time.size, HUD.dots.y + DOT_R, HUD.best.y + HUD.best.size];
  return ys.every((y) => y < STAGE_QUIET_Y);
}
