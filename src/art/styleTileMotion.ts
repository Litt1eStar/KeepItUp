/** Phaser-free motion/timing math for the style tile (StyleTileScene). Stepped, never smooth. */
import { SHADOW_STEPS, shadowStep } from './ball';
import { RISO_KEYS, BOIL_VARIANTS } from './textures';
import { TUNING as T } from '../config/tuning';
import type { PlayerId } from '../config/players';

/** Animation tick used for idle motion (~12 fps). */
export const STEP_MS = 83;
export const BOIL_MS = 125;
export const JOLT_PERIOD_MS = 3000;
export const JOLT_MS = 120;
export const JOLT_PX = 5;
export const INK_CYCLE_MS = 2000;
export const SLAM_PERIOD_MS = 3000;
export const SHADOW_MAX_HEIGHT = 300;

/** Snap time down to a multiple of stepMs. */
export function quantizeTime(tMs: number, stepMs = STEP_MS): number {
  return Math.floor(Math.max(0, tMs) / stepMs) * stepMs;
}

/** Linework boil variant (0..BOIL_VARIANTS-1) at time t. */
export function boilVariant(tMs: number, phase = 0): number {
  return (Math.floor(Math.max(0, tMs) / BOIL_MS) + phase) % BOIL_VARIANTS;
}

/** Demo ball center: bounces off the floor while drifting across the stage. Always inside the stage. */
export function demoBallPos(tMs: number, r: number): { x: number; y: number } {
  const t = Math.max(0, tMs) / 1000;
  const margin = r + 20;
  const x = T.width / 2 + (T.width / 2 - margin) * Math.sin(t * 0.55);
  const lo = T.floorY - r - 2; // resting on the floor
  const hi = 150 + r; // apex stays below the quiet band
  const h = Math.abs(Math.sin(t * 1.9)); // 0 on the floor, 1 at apex
  return { x, y: lo - (lo - hi) * (1 - (1 - h) * (1 - h)) };
}

/** Which floor-shadow texture to show for a ball centered at y. Danger exactly when its bottom is below dangerLineY. */
export function shadowChoice(ballY: number, r: number): { danger: boolean; step: number; key: string } {
  const bottom = ballY + r;
  const danger = bottom > T.dangerLineY;
  const step = shadowStep(T.floorY - bottom, SHADOW_MAX_HEIGHT);
  return { danger, step, key: danger ? RISO_KEYS.shadowDanger(step) : RISO_KEYS.shadow(step) };
}

/** Facing toward a target x. */
export function facingToward(charX: number, targetX: number): 1 | -1 {
  return targetX >= charX ? 1 : -1;
}

/** Ink (player id) the cycling demo ball is currently targeting. */
export function ballInkAt(tMs: number): PlayerId {
  return (Math.floor(Math.max(0, tMs) / INK_CYCLE_MS) % 3) as PlayerId;
}

/** Quick stamp-squash after an ink change: stepped scale {x,y} from time since the change. */
export function inkPunch(sinceChangeMs: number): { sx: number; sy: number } {
  if (sinceChangeMs < 60) return { sx: 1.25, sy: 0.75 };
  if (sinceChangeMs < 120) return { sx: 0.9, sy: 1.1 };
  return { sx: 1, sy: 1 };
}

/** Stepped 1.4 -> 1.0 stamp slam scale, 3 steps then rest. */
export function slamScale(sinceSlamMs: number): number {
  if (sinceSlamMs < 0) return 1.4;
  if (sinceSlamMs < 50) return 1.4;
  if (sinceSlamMs < 100) return 1.2;
  if (sinceSlamMs < 150) return 1.08;
  return 1;
}

/** Misregistration jolt: which character jolts and the extra fill offset (px) at time t. */
export function joltAt(tMs: number): { id: PlayerId; active: boolean; dx: number; dy: number } {
  const n = Math.floor(Math.max(0, tMs) / JOLT_PERIOD_MS);
  const within = Math.max(0, tMs) - n * JOLT_PERIOD_MS;
  const active = within < JOLT_MS;
  return { id: (n % 3) as PlayerId, active, dx: active ? JOLT_PX : 0, dy: active ? -JOLT_PX * 0.6 : 0 };
}

/** Number of filled dots (of 30) at time t: starts at 12, +1 per second, wraps 30 -> 1. */
export function dotsFilledAt(tMs: number, total = 30, start = 12): number {
  return ((start - 1 + Math.floor(Math.max(0, tMs) / 1000)) % total) + 1;
}

export interface IdlePose { dy: number; rot: number; sx: number; sy: number; blink: boolean }

/** Stepped idle personality for a character at time t (px / radians / scale). PIK hops, BLOOP breathes, BRICK wobbles + blinks. */
export function idlePose(id: PlayerId, tMs: number): IdlePose {
  const q = quantizeTime(tMs) / 1000;
  const pose: IdlePose = { dy: 0, rot: 0, sx: 1, sy: 1, blink: false };
  if (id === 0) {
    const ph = (q % 0.9) / 0.9; // quick small hops
    pose.dy = ph < 0.35 ? -Math.sin((ph / 0.35) * Math.PI) * 9 : 0;
    pose.rot = Math.sin(q * 7) * 0.09;
  } else if (id === 1) {
    const b = Math.sin(q * 2.4);
    pose.sy = 1 + b * 0.06;
    pose.sx = 1 - b * 0.045;
  } else {
    pose.rot = Math.sin(q * 1.3) * 0.045;
    pose.sy = 1 - Math.abs(Math.sin(q * 1.3)) * 0.02;
    pose.blink = quantizeTime(tMs) % 2800 < 110;
  }
  return pose;
}

export { SHADOW_STEPS };
