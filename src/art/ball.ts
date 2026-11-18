/**
 * Riso ball art. Every size derives from the ball radius (TUNING.ballRadius, `?ball=` override);
 * the pure helpers take the radius as a parameter so they are testable in node.
 *
 *   fill   – flat ink disc, mottled, halftone crescent, player shape knocked out (+ thin black
 *            keyline around the knockout so it reads on yellow). Texture ballArt(r).size square.
 *   line   – black wobbly ring + two straight spin ticks (3 boil variants, shared by all balls).
 *            No dots/curves inside the ring: balls must never read as faces. Same size.
 *   shadow – halftone floor shadow, 8 steps from high (sparse, tiny dots) to landing (dense);
 *            pick the step with shadowStep() (shadow.ts).
 * All ball textures are centered: use origin (0.5, 0.5). Offset the fill by ballMisreg(id).
 */
import { PLAYERS, type PlayerId } from '../config/players';
import { INK, INK_ANGLE, PLAYER_INK } from './palette';
import { circlePoints, fillHalftone, halftoneDots, jitterDots, misregOffset, mottle, speckle, tracePath, wobblePoints } from './riso';
import { knockOut, strokeWobbly, traceShape } from './draw';
import { SHADOW_STEPS } from './shadow';

type Ctx = CanvasRenderingContext2D;

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
    /** Wobble amplitude of the outline ring and the ink disc edge. */
    lineAmp: Math.max(0.5, r * 0.014),
    fillAmp: Math.max(0.4, r * 0.01),
  };
}

/** Furthest extent of the line ring from the center (pure; ≤ size/2 so it never clips). */
export function ballLineExtent(r: number): number {
  const a = ballArt(r);
  return r - a.ring / 2 + a.lineAmp + a.ring / 2;
}

/** Fixed fill-layer misregistration per ball (runtime: offset the fill image by this). */
export function ballMisreg(id: PlayerId): { dx: number; dy: number } {
  return misregOffset(200 + id);
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
  tracePath(ctx, wobblePoints(circlePoints(c, c, a.inkR - a.fillAmp, 36), 950 + id, a.fillAmp));
  ctx.fillStyle = ink;
  ctx.fill();
  // halftone crescent, lower-right (light from top-left)
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.rect(0, 0, a.size, a.size);
  ctx.arc(c - r * 0.24, c - r * 0.28, r * 1.0, 0, Math.PI * 2);
  ctx.clip('evenodd');
  fillHalftone(ctx, c - r, c - r, r * 2, r * 2, INK.black, 0.24, a.cell, INK_ANGLE.black, { jitterSeed: 960 + id });
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

/**
 * Spin-mark ticks (pure): two short STRAIGHT parallel strokes near the rim on the upper-left only,
 * tangent to the ring (a cartoon glint/seam). Deliberately no dots and no curves, so a ball never
 * reads as a face. Returns [x1,y1,x2,y2] segments in texture coords for boil variant v.
 */
export function ballSpinTicks(r: number, v: number): [number, number, number, number][] {
  const a = ballArt(r);
  const c = a.size / 2;
  const ang = -2.36 + (v - 1) * 0.035; // upper-left, nudged per boil variant
  const ux = Math.cos(ang), uy = Math.sin(ang); // radial unit
  const tx = -uy, ty = ux; // tangent unit
  return [
    { rad: r * 0.78, len: r * 0.36 },
    { rad: r * 0.6, len: r * 0.2 },
  ].map(({ rad, len }) => {
    const mx = c + ux * rad, my = c + uy * rad;
    return [mx - (tx * len) / 2, my - (ty * len) / 2, mx + (tx * len) / 2, my + (ty * len) / 2];
  });
}

/** Line layer (shared by all balls): wobbly black ring + straight spin ticks at the upper-left. */
export function drawBallLine(ctx: Ctx, r: number, v: number): void {
  const a = ballArt(r);
  const c = a.size / 2;
  const s = 300 + v;
  strokeWobbly(ctx, circlePoints(c, c, r - a.ring / 2, 44), s, a.lineAmp, a.ring, INK.black);
  ctx.save();
  ctx.strokeStyle = INK.black;
  ctx.lineCap = 'butt'; // square-ish ends: round caps on short ticks start to look like dots
  ctx.lineWidth = a.ring * 0.8;
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of ballSpinTicks(r, v)) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  ctx.stroke();
  ctx.restore();
}

/** Halftone floor shadow step n in `color`, centered in shadowTexSize(r). */
export function drawShadow(ctx: Ctx, r: number, n: number, color: string, angle = INK_ANGLE.black): void {
  const a = ballArt(r);
  const { w, h } = shadowTexSize(r);
  const t = n / (SHADOW_STEPS - 1);
  const cell = a.shadowCell * (1.15 - 0.3 * t); // tighter grid as the ball drops
  const rx = a.shadowW / 2, ry = a.shadowH / 2;
  const cx = w / 2, cy = h / 2;
  const dots = jitterDots(halftoneDots(w, h, shadowDensity(n), cell, angle), 970 + n);
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

/** Incoming spawn halo texture size (logical square) derived from ball radius r. */
export function incomingTexSize(r: number): number {
  return Math.ceil(r * 3.1);
}

/** Halftone "incoming" circle + dashed wobbly black target ring shown while a new ball floats in. */
export function drawIncomingRing(ctx: Ctx, id: PlayerId, r: number): void {
  const size = incomingTexSize(r);
  const c = size / 2;
  const ink = INK[PLAYER_INK[id]];
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, r * 1.42, 0, Math.PI * 2);
  ctx.arc(c, c, r * 1.04, 0, Math.PI * 2);
  ctx.clip('evenodd');
  fillHalftone(ctx, 0, 0, size, size, ink, 0.28, Math.max(3, r * 0.11), INK_ANGLE[PLAYER_INK[id]], { jitterSeed: 980 + id });
  ctx.restore();

  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = INK.black;
  tracePath(ctx, wobblePoints(circlePoints(c, c, r * 1.38, 40), 990 + id, Math.max(0.4, r * 0.012)));
  ctx.stroke();
  ctx.restore();
}
