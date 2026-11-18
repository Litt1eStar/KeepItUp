/** Reusable, Phaser-free runtime timing for the riso look: stepped, snappy, never smooth. */
import { SHADOW_STEPS, shadowStep } from './shadow';
import { BOIL_VARIANTS, RISO_KEYS } from './textures';
import { TUNING as T } from '../config/tuning';
import type { PlayerId } from '../config/players';

/** Idle animation tick (~12 fps). */
export const STEP_MS = 83;
/** Motion tick for positions/spin (~24 fps). */
export const MOTION_STEP_MS = 42;
/** Linework boil swap interval. */
export const BOIL_MS = 125;
/** Ball spin rate (radians per second of quantized time). */
export const SPIN_RAD_PER_S = 2.2;
export const JOLT_MS = 120;
export const JOLT_PX = 5;
/** BRICK blinks for exactly 2 idle steps every this many steps (~2.8 s). */
export const BLINK_PERIOD_STEPS = 34;

/** Snap time down to a multiple of stepMs. */
export function quantizeTime(tMs: number, stepMs = STEP_MS): number {
  return Math.floor(Math.max(0, tMs) / stepMs) * stepMs;
}

/** Linework boil variant (0..BOIL_VARIANTS-1) at time t. */
export function boilVariant(tMs: number, phase = 0): number {
  return (Math.floor(Math.max(0, tMs) / BOIL_MS) + phase) % BOIL_VARIANTS;
}

/** Ball spin angle (radians), stepped. */
export function spinAngle(tMs: number): number {
  return (quantizeTime(tMs, MOTION_STEP_MS) / 1000) * SPIN_RAD_PER_S;
}

export interface ShadowChoice { readonly danger: boolean; readonly step: number; readonly key: string }

const CHOICES: ShadowChoice[][] = [false, true].map((danger) =>
  Array.from({ length: SHADOW_STEPS }, (_, step) => ({
    danger, step, key: danger ? RISO_KEYS.shadowDanger(step) : RISO_KEYS.shadow(step),
  })),
);

/**
 * Floor-shadow texture for a ball whose bottom is at `ballBottomY`. `danger` picks the pink version;
 * gameplay passes Ball.inDanger, demos default to "bottom below dangerLineY". No allocation.
 */
export function shadowChoice(ballBottomY: number, danger = ballBottomY > T.dangerLineY): ShadowChoice {
  const step = shadowStep(T.floorY - ballBottomY, T.shadowMaxHeight);
  return CHOICES[danger ? 1 : 0][step];
}

/** Facing toward a target x. */
export function facingToward(charX: number, targetX: number): 1 | -1 {
  return targetX >= charX ? 1 : -1;
}

const PUNCH_A = { sx: 1.25, sy: 0.75 } as const;
const PUNCH_B = { sx: 0.9, sy: 1.1 } as const;
const PUNCH_REST = { sx: 1, sy: 1 } as const;

/** Quick stamp-squash after an ink change: stepped scale from time since the change. */
export function inkPunch(sinceChangeMs: number): { readonly sx: number; readonly sy: number } {
  if (sinceChangeMs < 60) return PUNCH_A;
  if (sinceChangeMs < 120) return PUNCH_B;
  return PUNCH_REST;
}

/** Stepped 1.4 -> 1.0 stamp slam scale. Pass Infinity for "at rest". */
export function slamScale(sinceSlamMs: number): number {
  if (sinceSlamMs < 50) return 1.4;
  if (sinceSlamMs < 100) return 1.2;
  if (sinceSlamMs < 150) return 1.08;
  return 1;
}

const NO_JOLT = { dx: 0, dy: 0 } as const;
const JOLT = { dx: JOLT_PX, dy: -JOLT_PX * 0.6 } as const;

/** Extra fill-layer misregistration (px) `msSinceWrongHit` after a wrong hit: jumps apart for JOLT_MS, then snaps back. */
export function joltOffset(msSinceWrongHit: number): { readonly dx: number; readonly dy: number } {
  return msSinceWrongHit >= 0 && msSinceWrongHit < JOLT_MS ? JOLT : NO_JOLT;
}

export interface IdlePose { dy: number; rot: number; sx: number; sy: number; blink: boolean }

/** Stepped idle personality at time t (px / radians / scale). PIK hops, BLOOP breathes, BRICK wobbles + blinks. */
export function idlePose(id: PlayerId, tMs: number, out: IdlePose = { dy: 0, rot: 0, sx: 1, sy: 1, blink: false }): IdlePose {
  const q = quantizeTime(tMs) / 1000;
  out.dy = 0; out.rot = 0; out.sx = 1; out.sy = 1; out.blink = false;
  if (id === 0) {
    const ph = (q % 0.9) / 0.9; // quick small hops
    out.dy = ph < 0.35 ? -Math.sin((ph / 0.35) * Math.PI) * 9 : 0;
    out.rot = Math.sin(q * 7) * 0.09;
  } else if (id === 1) {
    const b = Math.sin(q * 2.4);
    out.sy = 1 + b * 0.06;
    out.sx = 1 - b * 0.045;
  } else {
    out.rot = Math.sin(q * 1.3) * 0.045;
    out.sy = 1 - Math.abs(Math.sin(q * 1.3)) * 0.02;
    out.blink = Math.floor(Math.max(0, tMs) / STEP_MS) % BLINK_PERIOD_STEPS < 2;
  }
  return out;
}

const ARROW_BLINK_STEPS = 6; // one blink cycle = 6 idle steps (~0.5 s)
const ARROW_BLINK_STEPS_FAST = 4; // several balls on you → faster (~0.33 s)

/** Stepped turn-arrow blink (visibility, never alpha): on for 2/3 of each cycle. `fast` when 2+ balls target the player. */
export function arrowVisible(tMs: number, fast: boolean): boolean {
  const n = fast ? ARROW_BLINK_STEPS_FAST : ARROW_BLINK_STEPS;
  return Math.floor(Math.max(0, tMs) / STEP_MS) % n < Math.ceil((n * 2) / 3);
}

/** Stepped bob (px, ≤ 0 = up) for the turn arrow: two positions, swapped every 2 idle steps. */
export function arrowBob(tMs: number): number {
  return Math.floor(Math.max(0, tMs) / (STEP_MS * 2)) % 2 === 0 ? 0 : -3;
}

/** Off-screen indicator scale from the ball's y (< 0 above the screen): bigger when close, 0.6..1.2 in 0.2 steps. */
export function offscreenScale(ballY: number): number {
  const s = Math.min(1.2, Math.max(0.6, 1.2 + ballY / 600));
  return Math.round(s * 5) / 5;
}

const SPAWN_PULSE = [1, 1.08, 1.16, 1.08] as const;

/** Floating-spawn telegraph: stepped scale pulse (one value per idle step). */
export function spawnPulse(tMs: number): number {
  return SPAWN_PULSE[Math.floor(Math.max(0, tMs) / STEP_MS) % SPAWN_PULSE.length];
}

/** Displayed squash, quantized to 0.05 so the view only rescales in visible steps. */
export function stepSquash(squash: number): number {
  return Math.round(squash * 20) / 20;
}
