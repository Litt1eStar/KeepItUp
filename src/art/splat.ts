/**
 * Riso ink splats: drawn in WHITE so the runtime tints them with setTint(INK_HEX.x), plus a black
 * keyline texture per variant (same outlines) that the runtime layers on top of yellow splats
 * (see splatNeedsKeyline). SPLAT_SIZE square textures, origin (0.5, 0.5). No Phaser import.
 */
import { INK, INK_HEX, type InkName } from './palette';
import { circlePoints, mottle, seeded, speckle, tracePath, wobblePoints } from './riso';
import type { Pt } from './draw';

type Ctx = CanvasRenderingContext2D;

export const SPLAT_SIZE = 64;
const SPLAT_R = 13;
const SPIKE_MAX = 1.7; // × SPLAT_R
const DROP_DIST_MAX = 2.0; // × SPLAT_R
const DROP_R_MAX = 4.2;

/** Max distance from the splat center that ink can reach (pure; ≤ SPLAT_SIZE/2 so nothing clips). */
export function splatMaxExtent(): number {
  return Math.max(SPLAT_R * SPIKE_MAX, SPLAT_R * DROP_DIST_MAX + DROP_R_MAX * 1.15);
}

/** Keyline width of `riso:splatLine:{v}`. */
export const SPLAT_LINE_W = 1.2;

/** Splat outlines for variant v (pure, deterministic): the lumpy main blot, then each droplet. */
export function splatShapes(v: number): Pt[][] {
  const rnd = seeded(500 + v * 11);
  const c = SPLAT_SIZE / 2, R = SPLAT_R;
  const pts: Pt[] = [];
  const spikes = new Set([Math.floor(rnd() * 22), Math.floor(rnd() * 22), Math.floor(rnd() * 22)]);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const rr = R * (spikes.has(i) ? SPIKE_MAX - 0.25 + rnd() * 0.25 : 0.82 + rnd() * 0.3);
    pts.push([c + Math.cos(a) * rr, c + Math.sin(a) * rr]);
  }
  const shapes = [pts];
  const drops = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < drops; i++) {
    const a = rnd() * Math.PI * 2, d = R * (DROP_DIST_MAX - 0.35 + rnd() * 0.35), r = 1.8 + rnd() * (DROP_R_MAX - 1.8);
    shapes.push(wobblePoints(circlePoints(c + Math.cos(a) * d, c + Math.sin(a) * d, r, 10), v * 7 + i, r * 0.15));
  }
  return shapes;
}

/** Max distance from the splat center reached by the keyline stroke (pure; ≤ SPLAT_SIZE/2). */
export function splatLineExtent(): number {
  return splatMaxExtent() + SPLAT_LINE_W / 2;
}

/**
 * Whether the runtime should layer `riso:splatLine:{v}` on a splat of this ink (InkName or its
 * INK_HEX tint). Only yellow: pale yellow on paper needs a black keyline to read; pink/blue splats
 * stay flat (a keyline would make them heavy and cartoony).
 */
export function splatNeedsKeyline(ink: InkName | number): boolean {
  return ink === 'yellow' || ink === INK_HEX.yellow;
}

/** Ink splat in white: lumpy main blot + a few droplets, variant v. */
export function drawSplat(ctx: Ctx, v: number): void {
  ctx.save();
  ctx.fillStyle = '#fff';
  for (const s of splatShapes(v)) {
    tracePath(ctx, s);
    ctx.fill();
  }
  ctx.restore();
  mottle(ctx, SPLAT_SIZE, SPLAT_SIZE, 520 + v, 0.3);
  // stray specks, kept off the texture edge
  ctx.save();
  ctx.translate(4, 4);
  speckle(ctx, SPLAT_SIZE - 8, SPLAT_SIZE - 8, '#fff', 530 + v, 6);
  ctx.restore();
}

/**
 * Black keyline for splat variant v (same SPLAT_SIZE texture, same outlines as drawSplat, NOT tinted).
 * Layer it on top of the tinted splat (MULTIPLY) when splatNeedsKeyline(tint), with the same variant.
 */
export function drawSplatLine(ctx: Ctx, v: number): void {
  ctx.save();
  ctx.strokeStyle = INK.black;
  ctx.lineWidth = SPLAT_LINE_W;
  ctx.lineJoin = 'round';
  for (const s of splatShapes(v)) {
    tracePath(ctx, s);
    ctx.stroke();
  }
  ctx.restore();
  // broken like a worn print, so it stays a keyline rather than a cartoon outline
  mottle(ctx, SPLAT_SIZE, SPLAT_SIZE, 540 + v, 0.35);
}
