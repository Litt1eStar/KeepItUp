/**
 * Shared composition helpers for the riso art modules: player shape outlines, wobbly strokes,
 * offscreen ink layers (so mottle/knockouts never punch through the paper) and small text helpers.
 * No Phaser import. All coordinates are LOGICAL units; ctx is pre-scaled by the render scale.
 */
import type { Shape } from '../config/players';
import { circlePoints, tracePath, wobblePoints } from './riso';

type Ctx = CanvasRenderingContext2D;
export type Pt = [number, number];

/** Points along an edge a→b (excluding b), `n` segments. */
function edge(a: Pt, b: Pt, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return out;
}

/**
 * Outline points of a player shape centered at (cx,cy). `size` ~ half-extent. Edges are densely
 * subdivided so tracePath keeps corners crisp (only slightly rounded) and wobble stays hand-made.
 */
export function shapePoints(shape: Shape, cx: number, cy: number, size: number): Pt[] {
  if (shape === 'circle') return circlePoints(cx, cy, size * 0.95, 28);
  const verts: Pt[] =
    shape === 'triangle'
      ? [[cx, cy - size * 1.05], [cx + size, cy + size * 0.75], [cx - size, cy + size * 0.75]]
      : [[cx - size * 0.82, cy - size * 0.82], [cx + size * 0.82, cy - size * 0.82], [cx + size * 0.82, cy + size * 0.82], [cx - size * 0.82, cy + size * 0.82]];
  const per = shape === 'triangle' ? 7 : 6;
  return verts.flatMap((v, i) => edge(v, verts[(i + 1) % verts.length], per));
}

/** Trace (beginPath) a player shape, optionally wobbled by seed. */
export function traceShape(ctx: Ctx, shape: Shape, cx: number, cy: number, size: number, seed = 0, amp = 0): void {
  const pts = shapePoints(shape, cx, cy, size);
  tracePath(ctx, amp > 0 ? wobblePoints(pts, seed, amp) : pts);
}

/** Stroke a closed wobbly path through `pts`. */
export function strokeWobbly(ctx: Ctx, pts: Pt[], seed: number, amp: number, width: number, color: string, close = true): void {
  ctx.save();
  tracePath(ctx, wobblePoints(pts, seed, amp), close);
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

/** A hand-drawn open stroke: the points get a light wobble so straight lines are never ruler-straight. */
export function handLine(ctx: Ctx, pts: Pt[], seed: number, width: number, color: string, amp = 0.35): void {
  strokeWobbly(ctx, pts, seed, amp, width, color, false);
}

/** Points along a polyline, `n` per segment (so handLine wobbles along long straight lines). */
export function densify(pts: Pt[], n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) out.push(...edge(pts[i], pts[i + 1], n));
  out.push(pts[pts.length - 1]);
  return out;
}

/** Rounded rectangle path (beginPath). */
export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Draw one ink pass on its own offscreen canvas (covering logical rect x,y,w,h), then composite it
 * onto ctx with `op` (multiply by default = overprint) shifted by `offset` (misregistration).
 * Inside `draw`, mottle/destination-out only affect this ink, never the paper below.
 * Resolution follows ctx's current scale so the result stays sharp at any render scale.
 */
export function inkLayer(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  draw: (c: Ctx) => void,
  offset: { dx: number; dy: number } = { dx: 0, dy: 0 },
  op: GlobalCompositeOperation = 'multiply',
): void {
  const sc = Math.hypot(ctx.getTransform().a, ctx.getTransform().b) || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * sc));
  canvas.height = Math.max(1, Math.ceil(h * sc));
  const lc = canvas.getContext('2d')!;
  lc.scale(sc, sc);
  lc.translate(-x, -y);
  draw(lc);
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.drawImage(canvas, x + offset.dx, y + offset.dy, w, h);
  ctx.restore();
}

/** Knock `path` out of what's drawn (destination-out), e.g. to let paper show through an ink. */
export function knockOut(ctx: Ctx, trace: () => void): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  trace();
  ctx.fill();
  ctx.restore();
}

/** Set a canvas font from a family string. */
export function font(ctx: Ctx, size: number, family: string, weight = 400): void {
  ctx.font = `${weight} ${size}px ${family}`;
}
