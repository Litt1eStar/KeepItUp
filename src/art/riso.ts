/**
 * Risograph drawing helpers. Pure math functions (testable in node) come first,
 * then canvas helpers. No gradients or blur effects: shading is halftone dots only.
 *
 * Conventions: cell/amp/px sizes are LOGICAL units; the ctx is expected to be pre-scaled by the
 * render scale. Seeds are integers (non-integers are truncated). Canvas helpers save/restore state.
 */
import { PAPER } from './palette';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Deterministic PRNG (mulberry32). Returns a function yielding floats in [0,1). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HalftoneOpts {
  /** Keep dots whose center is within one radius outside the rect so edges have no empty band. Default false. */
  bleed?: boolean;
  /** Grid anchor in the rect's LOCAL coords (default: rect center). Share it across fills to align the same ink. */
  origin?: { x: number; y: number };
  /**
   * Draw-time dot gain (fillHalftone/drawn dots only; halftoneDots' output is unaffected):
   * seeded ±10% radius and ±0.2 px position jitter. Default on in fillHalftone; pass false to disable.
   */
  jitter?: boolean;
  /** Seed for the jitter (default 1). */
  jitterSeed?: number;
}

/** Deterministically jitter dots like real dot gain: ±10% radius, ±0.2 px position. */
export function jitterDots(
  dots: { x: number; y: number; r: number }[],
  seed: number,
): { x: number; y: number; r: number }[] {
  const rnd = seeded(seed * 4099 + 7);
  return dots.map((d) => ({
    x: d.x + (rnd() * 2 - 1) * 0.2,
    y: d.y + (rnd() * 2 - 1) * 0.2,
    r: d.r * (1 + (rnd() * 2 - 1) * 0.1),
  }));
}

/**
 * Halftone dot centers on a grid rotated by `angleDeg` about `opts.origin`, in the rect's local
 * (0,0)-(w,h) coords. By default only centers inside the rect are kept; with `bleed` centers up to
 * one radius outside are kept too (the canvas/caller clip trims them). Radius grows with density,
 * capped at 0.62*cell. All sizes are LOGICAL units. Returns [] for non-positive/NaN density,
 * cell < 0.5, or non-finite/non-positive w or h (guards against runaway loops).
 */
export function halftoneDots(
  w: number,
  h: number,
  density: number,
  cell: number,
  angleDeg = 15,
  opts: HalftoneOpts = {},
): { x: number; y: number; r: number }[] {
  if (!(density > 0) || !(cell >= 0.5) || !Number.isFinite(w) || !Number.isFinite(h) || !(w > 0) || !(h > 0)) {
    return [];
  }
  const d = clamp(density, 0, 1);
  const r = Math.min(cell * 0.5 * Math.sqrt(d) * 1.15, cell * 0.62);
  const lo = opts.bleed ? -r : 0;
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const ox = opts.origin?.x ?? w / 2;
  const oy = opts.origin?.y ?? h / 2;
  // Furthest rect corner from the origin bounds the grid indices needed.
  const far = Math.max(Math.hypot(ox, oy), Math.hypot(w - ox, oy), Math.hypot(ox, h - oy), Math.hypot(w - ox, h - oy));
  const reach = Math.ceil(far / cell) + 1 + (opts.bleed ? 1 : 0);
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) {
      const gx = i * cell, gy = j * cell;
      const x = ox + gx * cos - gy * sin;
      const y = oy + gx * sin + gy * cos;
      if (x >= lo && x <= w - lo && y >= lo && y <= h - lo) out.push({ x, y, r });
    }
  }
  return out;
}

/** Fixed per-seed ink-layer misregistration offset, magnitude in [1,2] px. */
export function misregOffset(seed: number): { dx: number; dy: number } {
  const rnd = seeded(seed * 7919 + 13);
  const ang = rnd() * Math.PI * 2;
  const mag = 1 + rnd();
  return { dx: Math.cos(ang) * mag, dy: Math.sin(ang) * mag };
}

/** Jittered copy of `points` (each coordinate within +-amp). Same seed gives same output. */
export function wobblePoints(
  points: [number, number][],
  seed: number,
  amp: number,
): [number, number][] {
  const rnd = seeded(seed);
  return points.map(([x, y]) => [x + (rnd() * 2 - 1) * amp, y + (rnd() * 2 - 1) * amp]);
}

/** Points around a circle (use with wobblePoints for boiling outlines). */
export function circlePoints(cx: number, cy: number, r: number, segments = 48): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}

// ---------------------------------------------------------------- canvas helpers

/**
 * beginPath + smooth closed/open curve through `pts` (quadratic curves via midpoints).
 * Does not stroke or fill; the caller does. Leaves the path on ctx.
 */
export function tracePath(ctx: CanvasRenderingContext2D, pts: [number, number][], close = true): void {
  ctx.beginPath();
  const n = pts.length;
  if (n === 0) return;
  if (n < 3) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
    return;
  }
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  if (close) {
    const m0 = mid(pts[n - 1], pts[0]);
    ctx.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const m = mid(pts[i], pts[(i + 1) % n]);
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n - 1; i++) {
      const m = mid(pts[i], pts[i + 1]);
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
  }
}

/**
 * Fill a rect with halftone dots of `color`. Dots bleed past the edges by default (trim with a clip).
 * `origin` is in the rect's local coords (relative to x,y). Inherits the caller's
 * globalCompositeOperation/globalAlpha and clip.
 */
export function fillHalftone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  density: number,
  cell: number,
  angleDeg = 15,
  opts: HalftoneOpts = {},
): void {
  const raw = halftoneDots(w, h, density, cell, angleDeg, { bleed: true, ...opts });
  if (raw.length === 0) return;
  const dots = opts.jitter === false ? raw : jitterDots(raw, opts.jitterSeed ?? 1);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const p of dots) {
    ctx.moveTo(x + p.x + p.r, y + p.y);
    ctx.arc(x + p.x, y + p.y, p.r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}

/** Fill w x h with PAPER (forces source-over, ignoring caller's composite op) and speckle it with faint dark/light fibers. Deterministic by seed. */
export function paperGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, amount = 0.06): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  const rnd = seeded(seed);
  const n = Math.floor(w * h * 0.02);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h;
    const dark = rnd() < 0.55;
    ctx.fillStyle = dark ? '#6b5a44' : '#ffffff';
    ctx.globalAlpha = amount * (0.4 + rnd() * 0.6);
    const s = rnd() < 0.85 ? 1 : 2;
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();
}

/**
 * Knock small low-alpha irregular blotches out of what is already drawn
 * (destination-out) to mimic uneven ink coverage. Deterministic by seed.
 * Apply to an ink-only layer: on a canvas with painted paper it punches holes in the paper.
 */
export function mottle(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, strength = 0.18): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  const rnd = seeded(seed);
  const n = Math.floor((w * h) / 90);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h;
    const rx = 0.6 + rnd() * 2.4, ry = 0.6 + rnd() * 2.4;
    ctx.globalAlpha = strength * (0.3 + rnd() * 0.7);
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Scatter `count` tiny ink dots over the w x h area. Deterministic by seed. Inherits caller's composite op. */
export function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, seed: number, count: number): void {
  ctx.save();
  ctx.fillStyle = color;
  const rnd = seeded(seed);
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = 0.5 + rnd() * 0.5;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, 0.4 + rnd() * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
