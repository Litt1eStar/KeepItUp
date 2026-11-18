/**
 * Riso turn arrows (pointing down, above the player whose turn it is) and off-screen indicators
 * (pointing up, pinned to the top edge while a ball is above the screen).
 *
 * One composite texture per player and direction, meant to be displayed with MULTIPLY:
 *   – player-ink triangle (own offscreen ink layer, mottled, slightly misregistered),
 *     with the player's shape glyph knocked out so paper shows through;
 *   – black wobbly keyline around the triangle and around the glyph (so yellow reads).
 * ARROW_TEX square, centered: use origin (0.5, 0.5). No Phaser import.
 */
import { PLAYERS, type PlayerId } from '../config/players';
import { INK, playerColor } from './palette';
import { misregOffset, mottle, tracePath, wobblePoints } from './riso';
import { densify, inkLayer, knockOut, traceShape, type Pt } from './draw';

type Ctx = CanvasRenderingContext2D;

/** Texture box (logical px); the triangle is centered in it. */
export const ARROW_TEX = { w: 40, h: 40 } as const;
const HALF_W = 14;
const HALF_H = 13;
const LINE_W = 2.2;
const LINE_AMP = 0.45;
const GLYPH_SIZE = 4.6;
const GLYPH_LINE_W = 1.3;

/**
 * Triangle corners (texture coords). `up` = tip at the top (off-screen indicator), otherwise
 * tip at the bottom (turn arrow pointing at the player's head). Pure.
 */
export function arrowTriangle(up: boolean): Pt[] {
  const cx = ARROW_TEX.w / 2;
  const cy = ARROW_TEX.h / 2;
  const tip = up ? cy - HALF_H : cy + HALF_H;
  const base = up ? cy + HALF_H : cy - HALF_H;
  return [[cx, tip], [cx + HALF_W, base], [cx - HALF_W, base]];
}

/** Glyph center: in the wide part of the triangle, a third of the way from the base. Pure. */
export function arrowGlyphCenter(up: boolean): Pt {
  const cy = ARROW_TEX.h / 2;
  return [ARROW_TEX.w / 2, up ? cy + HALF_H * 0.38 : cy - HALF_H * 0.38];
}

export const ARROW_GLYPH_SIZE = GLYPH_SIZE;

/** Furthest extent of anything drawn from the texture center (keyline incl. wobble + misreg). Pure. */
export function arrowExtent(): { x: number; y: number } {
  const pad = LINE_W / 2 + LINE_AMP + 2; // keyline half-width, wobble, max misregistration (2 px)
  return { x: HALF_W + pad, y: HALF_H + pad };
}

/** Fixed fill-layer misregistration for player id's arrows. */
export function arrowMisreg(id: PlayerId): { dx: number; dy: number } {
  return misregOffset(500 + id);
}

function closedOutline(up: boolean): Pt[] {
  const tri = arrowTriangle(up);
  return densify([...tri, tri[0]], 6).slice(0, -1);
}

/** Composite arrow for player `id` (display with MULTIPLY). */
export function drawArrow(ctx: Ctx, id: PlayerId, up: boolean): void {
  const { w, h } = ARROW_TEX;
  const shape = PLAYERS[id].shape;
  const [gx, gy] = arrowGlyphCenter(up);
  const tri = arrowTriangle(up);
  inkLayer(ctx, 0, 0, w, h, (c) => {
    c.save();
    c.beginPath();
    tri.forEach(([x, y], k) => (k === 0 ? c.moveTo(x, y) : c.lineTo(x, y)));
    c.closePath();
    c.fillStyle = playerColor(id).css;
    c.fill();
    knockOut(c, () => traceShape(c, shape, gx, gy, GLYPH_SIZE + 0.8));
    mottle(c, w, h, 600 + id * 7 + (up ? 3 : 0), 0.2);
    c.restore();
  }, arrowMisreg(id));

  const B = INK.black;
  ctx.save();
  tracePath(ctx, wobblePoints(closedOutline(up), 520 + id * 5 + (up ? 1 : 0), LINE_AMP));
  ctx.lineWidth = LINE_W;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = B;
  ctx.stroke();
  traceShape(ctx, shape, gx, gy, GLYPH_SIZE + 0.4, 540 + id, 0.25);
  ctx.lineWidth = GLYPH_LINE_W;
  ctx.stroke();
  ctx.restore();
}
