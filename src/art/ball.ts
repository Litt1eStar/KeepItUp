/**
 * Riso ball art. Every size derives from the ball radius (TUNING.ballRadius, `?ball=` override);
 * the pure helpers take the radius as a parameter so they are testable in node.
 *
 *   fill   – flat ink disc, mottled, halftone crescent, player shape knocked out (+ thin black
 *            keyline around the knockout so it reads on yellow). Texture ballArt(r).size square.
 *   line   – black wobbly ring + spin mark (3 boil variants, shared by all balls). Same size.
 *   shadow – halftone floor shadow, 8 steps from high (sparse, tiny dots) to landing (dense).
 * All ball textures are centered: use origin (0.5, 0.5).
 */
import { PLAYERS, type PlayerId } from '../config/players';
import { INK, PLAYER_INK } from './palette';
import { circlePoints, fillHalftone, halftoneDots, mottle, speckle } from './riso';
import { knockOut, strokeWobbly, traceShape } from './draw';

type Ctx = CanvasRenderingContext2D;

export const SHADOW_STEPS = 8;

/** All ball-art sizes for radius r (logical px). */
export function ballArt(r: number) {
  const ring = Math.max(2.2, r * 0.065);
  const pad = Math.max(3, Math.ceil(r * 0.08));
  return {
    r,
    pad,
    /** Square texture side for fill/line. */
    size: r * 2 + pad * 2,
    ring,
    /** Ink disc radius (sits under the ring). */
    inkR: r - ring * 0.4,
    shapeSize: r * 0.38,
    cell: Math.max(2.6, r * 0.1),
    shadowW: r * 2,
    shadowH: r * 0.35,
    shadowCell: Math.max(2.2, r * 0.085),
  };
}

/** Shadow halftone density for step n (0 = ball high, SHADOW_STEPS-1 = about to land). Monotonic. */
export function shadowDensity(n: number): number {
  const t = Math.min(1, Math.max(0, n / (SHADOW_STEPS - 1)));
  return 0.08 + 0.77 * Math.pow(t, 1.25);
}

/** Shadow texture size (logical) for radius r: ellipse plus a small margin, centered. */
export function shadowTexSize(r: number): { w: number; h: number } {
  const a = ballArt(r);
  return { w: Math.ceil(a.shadowW + 4), h: Math.ceil(a.shadowH + 4) };
}

/** Fill layer for player `id`'s ball, centered in the texture (c = size/2). */
export function drawBallFill(ctx: Ctx, id: PlayerId, r: number, seed = 1): void {
  const a = ballArt(r);
  const c = a.size / 2;
  const ink = INK[PLAYER_INK[id]];
  const shape = PLAYERS[id].shape;
  const sy = c + (shape === 'triangle' ? r * 0.08 : 0);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, a.inkR, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();
  // halftone crescent, lower-right (light from top-left)
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.rect(0, 0, a.size, a.size);
  ctx.arc(c - r * 0.24, c - r * 0.28, r * 1.0, 0, Math.PI * 2);
  ctx.clip('evenodd');
  fillHalftone(ctx, c - r, c - r, r * 2, r * 2, INK.black, 0.24, a.cell, 45);
  ctx.restore();
  // shape knockout + keyline
  knockOut(ctx, () => traceShape(ctx, shape, c, sy, a.shapeSize));
  traceShape(ctx, shape, c, sy, a.shapeSize + 0.6, seed + 3, 0.25);
  ctx.lineWidth = Math.max(1.2, r * 0.03);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK.black;
  ctx.stroke();
  mottle(ctx, a.size, a.size, seed * 13 + id, 0.22);
  // spatter at the rim
  ctx.beginPath();
  ctx.arc(c, c, r + 1.5, 0, Math.PI * 2);
  ctx.arc(c, c, a.inkR - 2, 0, Math.PI * 2, true);
  ctx.clip();
  speckle(ctx, a.size, a.size, ink, seed * 7 + id, Math.round(r * 0.5));
  ctx.restore();
}

/** Line layer (shared by all balls): wobbly black ring + spin mark at the upper-left. */
export function drawBallLine(ctx: Ctx, r: number, v: number): void {
  const a = ballArt(r);
  const c = a.size / 2;
  const s = 300 + v;
  strokeWobbly(ctx, circlePoints(c, c, r - a.ring / 2, 44), s, Math.max(0.5, r * 0.014), a.ring, INK.black);
  // spin mark: short arc + a trailing dot, asymmetric so rotation reads
  ctx.save();
  ctx.strokeStyle = INK.black;
  ctx.fillStyle = INK.black;
  ctx.lineCap = 'round';
  ctx.lineWidth = a.ring * 0.85;
  const sr = r * 0.72;
  const j = (v - 1) * 0.04;
  ctx.beginPath();
  ctx.arc(c, c, sr, -2.55 + j, -1.95 + j);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c + Math.cos(-1.68) * sr, c + Math.sin(-1.68) * sr, a.ring * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Halftone floor shadow step n in `color`, centered in shadowTexSize(r). */
export function drawShadow(ctx: Ctx, r: number, n: number, color: string, angle = 45): void {
  const a = ballArt(r);
  const { w, h } = shadowTexSize(r);
  const t = n / (SHADOW_STEPS - 1);
  const cell = a.shadowCell * (1.15 - 0.3 * t); // tighter grid as the ball drops
  const rx = a.shadowW / 2, ry = a.shadowH / 2;
  const cx = w / 2, cy = h / 2;
  const dots = halftoneDots(w, h, shadowDensity(n), cell, angle);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const d of dots) {
    const q = ((d.x - cx) / rx) ** 2 + ((d.y - cy) / ry) ** 2;
    if (q > 1) continue;
    const dr = d.r * (1 - 0.55 * q); // dots shrink toward the rim: soft edge without gradients
    ctx.moveTo(d.x + dr, d.y);
    ctx.arc(d.x, d.y, dr, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}
