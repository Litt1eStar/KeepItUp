/**
 * Round riso characters: PIK (pink ▲), BLOOP (blue ●), BRICK (yellow ■).
 *
 * Layers (separate textures so the runtime can multiply / misregister / boil them):
 *   fill  – flat body ink, mottled, halftone shading crescent, eye whites + back sticker knocked out
 *   line  – black hand-drawn outline + face + sticker outline (3 boil variants, no pupils)
 *   pupil – one shared black dot, placed with pupilPos() at runtime
 *
 * Texture layout (all body layers): CHAR_TEX.w × CHAR_TEX.h logical px, body center at
 * (CHAR_TEX.cx, CHAR_TEX.cy). Padding CHAR_PAD on left/right/top, none at the bottom: the
 * outline's lowest point touches the bottom edge, so use origin (0.5, 1) like the old player
 * sprite. Draw the fill with offset charMisreg(id). Faces look toward +x; flip with facing.
 */
import { PLAYERS, type CharStyleId, type PlayerId } from '../config/players';
import { TUNING as T } from '../config/tuning';
import { INK, INK_ANGLE, styleColor } from './palette';
import { circlePoints, fillHalftone, misregOffset, mottle, seeded, speckle, tracePath, wobblePoints } from './riso';
import { SHADOW_STEPS, shadowStep } from './shadow';
import { handLine, inkLayer, knockOut, strokeWobbly, traceShape, type Pt } from './draw';

type Ctx = CanvasRenderingContext2D;

/** Body radius (logical px), from tuning. */
export const CHAR_R = T.playerWidth / 2;
export const CHAR_PAD = 4;
/** Feature scale relative to the 56 px design size. */
const K = CHAR_R / 28;
export const OUTLINE_W = 2.4 * K;
export const OUTLINE_AMP = 0.55 * K;
/** Nominal body radius: outline center line; max outline extent (with wobble + half width) = CHAR_R. */
export const BODY_R = CHAR_R - OUTLINE_W / 2 - OUTLINE_AMP;
/** Eye outline stroke width. */
export const EYE_LINE_W = 1.4 * K;
export const CHAR_TEX = {
  w: CHAR_R * 2 + CHAR_PAD * 2,
  h: CHAR_R * 2 + CHAR_PAD,
  cx: CHAR_PAD + CHAR_R,
  cy: CHAR_PAD + CHAR_R,
  originX: 0.5,
  originY: 1,
} as const;

/** Furthest extent of the body outline from the body center (pure; ≤ CHAR_R by construction). */
export function charOutlineExtent(): number {
  return BODY_R + OUTLINE_AMP + OUTLINE_W / 2;
}

/** Fixed fill-layer misregistration per character (runtime: offset the fill image by this). */
export function charMisreg(id: PlayerId): { dx: number; dy: number } {
  return misregOffset(40 + id);
}

export interface EyeLayout {
  /** Pupil rest centers relative to the body center (facing +x). */
  eyes: { x: number; y: number }[];
  /** Horizontal half-size of the eye white. */
  eyeRadius: number;
  pupilRadius: number;
  /** Max pupil travel from rest (horizontal). Travel is an ellipse with maxPupilOffsetY. */
  maxPupilOffset: number;
  /** Max vertical pupil travel (narrow/lidded eyes allow less). */
  maxPupilOffsetY: number;
}

export const STYLE_EYE_LAYOUT: Record<CharStyleId, EyeLayout> = {
  // 0 PIK: sharp, narrow, slanted eyes -> small pupils, almost no vertical travel
  0: { eyes: [{ x: 3 * K, y: -6 * K }, { x: 16 * K, y: -6 * K }], eyeRadius: 5.2 * K, pupilRadius: 1.7 * K, maxPupilOffset: 1.2 * K, maxPupilOffsetY: 0.25 * K },
  // 1 BLOOP: big round eyes, free travel
  1: { eyes: [{ x: 2 * K, y: -5 * K }, { x: 17 * K, y: -5 * K }], eyeRadius: 6.2 * K, pupilRadius: 2.9 * K, maxPupilOffset: 2.5 * K, maxPupilOffsetY: 2.5 * K },
  // 2 BRICK: heavy lids; small pupils sit just under the lid
  2: { eyes: [{ x: 3 * K, y: -2.4 * K }, { x: 17 * K, y: -2.4 * K }], eyeRadius: 5.6 * K, pupilRadius: 1.8 * K, maxPupilOffset: 1.4 * K, maxPupilOffsetY: 0.15 * K },
  // 3 ZAP: sporty headband, round eyes, energetic look range
  3: { eyes: [{ x: 2.5 * K, y: -5.5 * K }, { x: 16.5 * K, y: -5.5 * K }], eyeRadius: 5.4 * K, pupilRadius: 2.1 * K, maxPupilOffset: 1.8 * K, maxPupilOffsetY: 1.8 * K },
  // 4 MOMO: bright cat eyes, wide curiosity
  4: { eyes: [{ x: 2.2 * K, y: -4.2 * K }, { x: 16.2 * K, y: -4.2 * K }], eyeRadius: 5.8 * K, pupilRadius: 2.5 * K, maxPupilOffset: 2.0 * K, maxPupilOffsetY: 2.0 * K },
  // 5 DOZER: goggle lenses, steady wide gaze
  5: { eyes: [{ x: 2.8 * K, y: -4.8 * K }, { x: 16.0 * K, y: -4.8 * K }], eyeRadius: 5.5 * K, pupilRadius: 2.0 * K, maxPupilOffset: 1.7 * K, maxPupilOffsetY: 1.5 * K },
};

/** Dynamic per-player eye layout reflecting each player's selected character variant. */
export const EYE_LAYOUT: Record<PlayerId, EyeLayout> = {
  get 0() {
    return STYLE_EYE_LAYOUT[PLAYERS[0].charStyle];
  },
  get 1() {
    return STYLE_EYE_LAYOUT[PLAYERS[1].charStyle];
  },
  get 2() {
    return STYLE_EYE_LAYOUT[PLAYERS[2].charStyle];
  },
};

/** Shared pupil texture: radius PUPIL_TEX_R, centered in a PUPIL_TEX_SIZE square. */
export const PUPIL_TEX_R = 3;
export const PUPIL_TEX_SIZE = 8;

/** Display scale for the pupil texture for character `id` (multiply by S at runtime). */
export function pupilScale(id: PlayerId): number {
  return EYE_LAYOUT[id].pupilRadius / PUPIL_TEX_R;
}

/** Pupil position helper for a specific character style `style` (`0..5`). */
export function pupilPosForStyle(
  style: CharStyleId, eyeIndex: number, lookX: number, lookY: number, facing: 1 | -1, out: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  const L = STYLE_EYE_LAYOUT[style];
  const e = L.eyes[eyeIndex];
  const len = Math.hypot(lookX, lookY);
  const ox = len > 1e-6 ? (lookX / len) * L.maxPupilOffset : 0;
  const oy = len > 1e-6 ? (lookY / len) * L.maxPupilOffsetY : 0;
  out.x = facing * e.x + ox;
  out.y = -CHAR_R + e.y + oy;
  return out;
}

/**
 * Pupil center for eye `eyeIndex` of character `id`, relative to the sprite origin (bottom-center;
 * body center at (0, -CHAR_R)), looking along world direction (lookX, lookY). Eye positions are
 * mirrored for facing = -1; travel is clamped to the eye's ellipse (zero look → rest position).
 */
export function pupilPos(
  id: PlayerId, eyeIndex: number, lookX: number, lookY: number, facing: 1 | -1, out: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  return pupilPosForStyle(PLAYERS[id].charStyle, eyeIndex, lookX, lookY, facing, out);
}

/** Contact shadow "radius" (drawShadow/shadowTexSize units): the shadow is ~1.1× the body wide. */
export const CHAR_SHADOW_R = CHAR_R * 1.1;
/** Feet height above the floor at which the contact shadow reaches its sparsest step. */
export const CHAR_SHADOW_MAX_LIFT = 220;

/**
 * Contact-shadow step for feet `liftPx` above the floor (SHADOW_STEPS-1 = standing, dense; 0 = high)
 * and its display scale (shrinks as the character rises, so it reads as distance). Pure, no allocation.
 */
export function charShadowStep(liftPx: number): number {
  return shadowStep(liftPx, CHAR_SHADOW_MAX_LIFT);
}
export function charShadowScale(step: number): number {
  return 0.55 + (0.45 * step) / (SHADOW_STEPS - 1);
}

/** Speed lines texture: streaks trail to the left; place with origin (1, 0.5) at the character's back. */
export const SPEEDLINES_TEX = { w: 72, h: 40 } as const;

const BRICK_EYE_DY = -2.6 * K; // BRICK eye-circle center relative to the pupil rest point
const BRICK_LID = -0.25; // lid stroke center at (circle center + LID × eyeRadius)
const LID_W = 2.6 * K;

/**
 * Eye-white outline for eye `i` of character style `style`, relative to the body center (facing +x), unwobbled.
 * Pure: the same polygon is knocked out of the fill, stroked on the line layer and used in tests.
 * `smooth` = trace with curves (round eyes) instead of straight segments (sharp corners).
 */
export function eyeOutlineForStyle(style: CharStyleId, i: number): { pts: Pt[]; smooth: boolean } {
  const L = STYLE_EYE_LAYOUT[style];
  const e = L.eyes[i];
  const er = L.eyeRadius;
  if (style === 0) {
    // almond with sharp corners, inner corner lower (mischievous slant)
    const tilt = i === 0 ? 0.3 : -0.3;
    const raw: Pt[] = [];
    for (let s = 0; s <= 12; s++) { const t = -1 + s / 6; raw.push([t * er, -(1 - t * t) * 3.6 * K]); }
    for (let s = 11; s >= 1; s--) { const t = -1 + s / 6; raw.push([t * er, (1 - t * t) * 3.2 * K]); }
    const c = Math.cos(tilt), sn = Math.sin(tilt);
    return { pts: raw.map(([px, py]) => [e.x + px * c - py * sn, e.y + px * sn + py * c]), smooth: false };
  }
  if (style !== 2) return { pts: circlePoints(e.x, e.y, er, 32), smooth: true };
  // BRICK (style 2): lower part of a circle; the white starts at the lid stroke's lower edge
  const ox = e.x, oy = e.y + BRICK_EYE_DY;
  const top = BRICK_LID * er + LID_W / 2; // relative to circle center
  const a0 = Math.asin(top / er);
  const pts: Pt[] = [];
  for (let s = 0; s <= 20; s++) {
    const a = a0 + ((Math.PI - 2 * a0) * s) / 20; // right lid corner, round the bottom, to the left
    pts.push([ox + Math.cos(a) * er, oy + Math.sin(a) * er]);
  }
  return { pts, smooth: false };
}

/** Eye-white outline for eye `i` of player `id`'s active character variant. */
export function eyeOutline(id: PlayerId, i: number): { pts: Pt[]; smooth: boolean } {
  return eyeOutlineForStyle(PLAYERS[id].charStyle, i);
}

function traceEye(ctx: Ctx, style: CharStyleId, i: number, cx: number, cy: number, seed = 0, amp = 0): void {
  const { pts, smooth } = eyeOutlineForStyle(style, i);
  const moved: Pt[] = pts.map(([x, y]) => [cx + x, cy + y]);
  const p = amp > 0 ? wobblePoints(moved, seed, amp) : moved;
  if (smooth) { tracePath(ctx, p); return; }
  ctx.beginPath();
  p.forEach(([x, y], k) => (k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

const stickerAt = (cx: number, cy: number) => ({ x: cx - 0.6 * CHAR_R, y: cy + 0.2 * CHAR_R, size: 5.5 * K });

/** Fill layer: body ink with crescent shading, eye whites and back sticker knocked out (paper shows). */
export function drawCharacterFill(ctx: Ctx, id: PlayerId, cx: number, cy: number, seed = 1, styleOverride?: CharStyleId): void {
  const style = styleOverride ?? PLAYERS[id].charStyle;
  const ink = styleColor(style).css;
  const bodyPts = wobblePoints(circlePoints(cx, cy, BODY_R, 36), 900 + id, 0.4 * K);
  ctx.save();
  tracePath(ctx, bodyPts);
  ctx.fillStyle = ink;
  ctx.fill();
  // halftone crescent, light from top-left
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.rect(cx - CHAR_R * 2, cy - CHAR_R * 2, CHAR_R * 4, CHAR_R * 4);
  ctx.arc(cx - 0.26 * CHAR_R, cy - 0.3 * CHAR_R, CHAR_R * 1.02, 0, Math.PI * 2);
  ctx.clip('evenodd');
  fillHalftone(ctx, cx - CHAR_R, cy - CHAR_R, CHAR_R * 2, CHAR_R * 2, INK.black, 0.26, 2.6 * K, INK_ANGLE.black, { jitterSeed: 910 + id });
  ctx.restore();
  // knockouts
  for (let i = 0; i < STYLE_EYE_LAYOUT[style].eyes.length; i++) knockOut(ctx, () => traceEye(ctx, style, i, cx, cy));
  const st = stickerAt(cx, cy);
  knockOut(ctx, () => traceShape(ctx, PLAYERS[id].shape, st.x, st.y, st.size));
  // uneven ink + a few spatters around the rim
  ctx.translate(cx - CHAR_R, cy - CHAR_R);
  mottle(ctx, CHAR_R * 2, CHAR_R * 2, seed * 31 + id, 0.22);
  ctx.beginPath();
  ctx.arc(CHAR_R, CHAR_R, CHAR_R - 0.5, 0, Math.PI * 2);
  ctx.arc(CHAR_R, CHAR_R, BODY_R - 2, 0, Math.PI * 2, true);
  ctx.clip();
  speckle(ctx, CHAR_R * 2, CHAR_R * 2, ink, seed * 17 + id, 14);
  ctx.restore();
}

/** Line layer: outline, face (no pupils) and sticker outline. `v` picks the boil variant. */
export function drawCharacterLine(ctx: Ctx, id: PlayerId, cx: number, cy: number, v: number, styleOverride?: CharStyleId): void {
  const style = styleOverride ?? PLAYERS[id].charStyle;
  const B = INK.black;
  const s = 100 + id * 10 + v; // seed per character × variant
  // outline: wobbly, but the bottom 3 points are pinned at max extent so the feet touch the floor
  const ring = wobblePoints(circlePoints(cx, cy, BODY_R, 40), s, OUTLINE_AMP);
  const low = circlePoints(cx, cy, BODY_R + OUTLINE_AMP, 40);
  for (const k of [9, 10, 11]) ring[k] = low[k];
  strokeWobbly(ctx, ring, 0, 0, OUTLINE_W, B);
  // eyes
  for (let i = 0; i < STYLE_EYE_LAYOUT[style].eyes.length; i++) {
    ctx.save();
    traceEye(ctx, style, i, cx, cy, s * 3 + i, 0.2 * K);
    ctx.lineWidth = EYE_LINE_W;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = B;
    ctx.stroke();
    ctx.restore();
  }
  const at = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [cx + x * K, cy + y * K]);
  if (style === 0) {
    // PIK: sharp brows slanting toward the center + wide filled grin with a dimple
    handLine(ctx, at([[-2, -12.5], [2, -11.5], [6.5, -10]]), s + 1, 1.8 * K, B, 0.25);
    handLine(ctx, at([[12.5, -10.5], [17, -12], [21, -13.5]]), s + 2, 1.8 * K, B, 0.25);
    ctx.save();
    tracePath(ctx, wobblePoints(at([[1, 4], [6, 5], [11, 5], [16, 4], [20, 2], [18, 7], [14, 11], [9, 12], [4, 9]]), s + 3, 0.3 * K));
    ctx.fillStyle = B;
    ctx.fill();
    ctx.restore();
    handLine(ctx, at([[19.5, 0], [21.5, 3.2]]), s + 4, 1.3 * K, B, 0.2);
  } else if (style === 1) {
    // BLOOP: small "o" mouth + hatched blush
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx + 10 * K, cy + 8 * K, 2.1 * K, 2.6 * K, 0, 0, Math.PI * 2);
    ctx.lineWidth = 1.7 * K;
    ctx.strokeStyle = B;
    ctx.stroke();
    ctx.restore();
    for (const bx of [-6, 21]) {
      for (let j = 0; j < 3; j++) {
        const x0 = bx + j * 2.2;
        handLine(ctx, at([[x0, 4.5], [x0 + 1.4, 1.8]]), s + 20 + bx + j, 0.9 * K, B, 0.15);
      }
    }
  } else if (style === 2) {
    // BRICK: heavy lids (thick flat line over each eye) + flat mouth
    const er = STYLE_EYE_LAYOUT[2].eyeRadius;
    for (const e of STYLE_EYE_LAYOUT[2].eyes) {
      const ly = cy + e.y + BRICK_EYE_DY + BRICK_LID * er;
      handLine(ctx, [[cx + e.x - er - 1.2 * K, ly + 0.3 * K], [cx + e.x, ly], [cx + e.x + er + 1 * K, ly - 0.2 * K]], s + Math.round(e.x), LID_W, B, 0.2);
    }
    handLine(ctx, at([[4.5, 9], [10, 9.2], [15.5, 8.8]]), s + 5, 2 * K, B, 0.25);
  } else if (style === 3) {
    // ZAP: forehead headband + fierce V-brows + zigzag lightning grin
    handLine(ctx, at([[-14, -14.5], [2, -16], [19, -14.5]]), s + 1, 2.2 * K, B, 0.2);
    handLine(ctx, at([[-1.5, -12], [6, -9.5]]), s + 2, 1.9 * K, B, 0.2);
    handLine(ctx, at([[12, -9.5], [20, -12.5]]), s + 3, 1.9 * K, B, 0.2);
    handLine(ctx, at([[1, 6], [5.5, 9.5], [10, 5.5], [14.5, 9.5], [19, 5.5]]), s + 4, 2 * K, B, 0.2);
  } else if (style === 4) {
    // MOMO: arched cat brows + "w" cat mouth + cheek whiskers
    handLine(ctx, at([[-1, -11.5], [2.5, -13], [6, -11.5]]), s + 1, 1.5 * K, B, 0.2);
    handLine(ctx, at([[12.5, -11.5], [16, -13], [19.5, -11.5]]), s + 2, 1.5 * K, B, 0.2);
    handLine(ctx, at([[3, 6], [6.5, 9.2], [9.8, 6.2], [13.2, 9.2], [16.5, 5.8]]), s + 3, 1.8 * K, B, 0.2);
    handLine(ctx, at([[-8.5, 1.5], [-3.5, 2.5]]), s + 4, 1.2 * K, B, 0.15);
    handLine(ctx, at([[-8.5, 5], [-3.5, 4.8]]), s + 5, 1.2 * K, B, 0.15);
    handLine(ctx, at([[20.5, 2.2], [24.2, 1.2]]), s + 6, 1.2 * K, B, 0.15);
    handLine(ctx, at([[20.5, 4.8], [24.2, 5.2]]), s + 7, 1.2 * K, B, 0.15);
  } else {
    // DOZER: goggle bridge + side strap + thick brow ridge + stitched underbite grin
    handLine(ctx, at([[8.2, -5.5], [10.6, -5.5]]), s + 1, 2.4 * K, B, 0.15);
    handLine(ctx, at([[-17, -5.5], [-2.8, -5.2]]), s + 2, 2.4 * K, B, 0.2);
    handLine(ctx, at([[-2, -11.2], [10, -11.4], [21, -11]]), s + 3, 2.1 * K, B, 0.2);
    handLine(ctx, at([[2, 7.5], [10, 8], [18, 7.3]]), s + 4, 2.2 * K, B, 0.2);
    for (const tx of [6, 10, 14]) {
      handLine(ctx, at([[tx, 5.5], [tx, 9.8]]), s + 10 + tx, 1.2 * K, B, 0.15);
    }
  }
  // back sticker outline
  const st = stickerAt(cx, cy);
  ctx.save();
  traceShape(ctx, PLAYERS[id].shape, st.x, st.y, st.size, s + 7, 0.3 * K);
  ctx.lineWidth = 1.4 * K;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = B;
  ctx.stroke();
  ctx.restore();
}

/** Shared pupil: a slightly irregular black ink dot of radius PUPIL_TEX_R centered at (cx,cy). */
export function drawPupil(ctx: Ctx, cx: number, cy: number, r = PUPIL_TEX_R): void {
  ctx.save();
  tracePath(ctx, wobblePoints(circlePoints(cx, cy, r * 0.94, 12), 77, r * 0.08));
  ctx.fillStyle = INK.black;
  ctx.fill();
  ctx.restore();
}

/** Black speed-line streaks in a SPEEDLINES_TEX box; thick at the right (character side), tapering left. */
export function drawSpeedlines(ctx: Ctx, seed = 5): void {
  const { w, h } = SPEEDLINES_TEX;
  const rows = [0.16, 0.3, 0.45, 0.6, 0.74, 0.88];
  const rnd = seeded(seed);
  ctx.save();
  ctx.fillStyle = INK.black;
  for (const ry of rows) {
    const y = h * ry + (rnd() - 0.5) * 2;
    const th = 1.2 + rnd() * 1.4;
    const x1 = w - 2 - th / 2 - rnd() * 10;
    const x0 = x1 - (22 + rnd() * (x1 - 22 - 16)); // tail never further left than x = 16
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.quadraticCurveTo((x0 + x1) / 2, y - th * 0.55, x1, y - th / 2);
    ctx.arc(x1, y, th / 2, -Math.PI / 2, Math.PI / 2);
    ctx.quadraticCurveTo((x0 + x1) / 2, y + th * 0.55, x0, y);
    ctx.fill();
    // a broken fleck further back on some rows (stays ≥ 2 px inside the left edge)
    if (rnd() < 0.6) ctx.fillRect(x0 - 4 - rnd() * 8, y - 0.5, 2 + rnd() * 2, 1);
  }
  ctx.restore();
}

/**
 * Full character composite on paper (ticket illustrations etc.): fill multiplied with its
 * misregistration, then line variant `v`, then pupils glancing forward.
 * Draws at the ctx's current transform; body center at (cx,cy).
 */
export function drawCharacter(ctx: Ctx, id: PlayerId, cx: number, cy: number, v = 0, styleOverride?: CharStyleId): void {
  const style = styleOverride ?? PLAYERS[id].charStyle;
  const span = CHAR_R + CHAR_PAD;
  inkLayer(ctx, cx - span, cy - span, span * 2, span * 2, (c) => drawCharacterFill(c, id, cx, cy, 1, style), charMisreg(id));
  drawCharacterLine(ctx, id, cx, cy, v, style);
  for (let i = 0; i < STYLE_EYE_LAYOUT[style].eyes.length; i++) {
    const p = pupilPosForStyle(style, i, 1, 0, 1);
    drawPupil(ctx, cx + p.x, cy + CHAR_R + p.y, STYLE_EYE_LAYOUT[style].pupilRadius);
  }
}
