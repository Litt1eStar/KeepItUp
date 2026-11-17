/** Demo-only schedules and paths for the style tile (the real game drives these from events). */
import { TUNING as T } from '../config/tuning';
import type { PlayerId } from '../config/players';

export const JOLT_PERIOD_MS = 3000;
export const INK_CYCLE_MS = 2000;
export const SLAM_PERIOD_MS = 3000;

/** Index of the current period of length periodMs (use to detect "a new period started"). */
export function periodIndex(tMs: number, periodMs: number): number {
  return Math.floor(Math.max(0, tMs) / periodMs);
}

/** Demo ball center: bounces off the floor while drifting across the stage. Always inside the stage. */
export function demoBallPos(tMs: number, r: number, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  const t = Math.max(0, tMs) / 1000;
  const margin = r + 20;
  const lo = T.floorY - r - 2; // resting on the floor
  const hi = 150 + r; // apex stays below the quiet band
  const h = Math.abs(Math.sin(t * 1.9)); // 0 on the floor, 1 at apex
  out.x = T.width / 2 + (T.width / 2 - margin) * Math.sin(t * 0.55);
  out.y = lo - (lo - hi) * (1 - (1 - h) * (1 - h));
  return out;
}

/** Demo wrong-hit scheduler: which character was hit last and how long ago (feed msSince to joltOffset). */
export function demoWrongHit(tMs: number): { id: PlayerId; msSince: number } {
  const n = periodIndex(tMs, JOLT_PERIOD_MS);
  return { id: (n % 3) as PlayerId, msSince: Math.max(0, tMs) - n * JOLT_PERIOD_MS };
}

/** Ink (player id) the cycling demo ball is currently targeting. */
export function ballInkAt(tMs: number): PlayerId {
  return (periodIndex(tMs, INK_CYCLE_MS) % 3) as PlayerId;
}

/** Number of filled dots (of 30) at time t: starts at 12, +1 per second, wraps 30 -> 1. */
export function dotsFilledAt(tMs: number, total = 30, start = 12): number {
  return ((start - 1 + Math.floor(Math.max(0, tMs) / 1000)) % total) + 1;
}
