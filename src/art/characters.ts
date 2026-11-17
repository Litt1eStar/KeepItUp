/**
 * Round riso characters: PIK (pink ▲), BLOOP (blue ●), BRICK (yellow ■).
 *
 * Layers (separate textures so the runtime can multiply / misregister / boil them):
 *   fill  – flat body ink, mottled, halftone shading crescent, eye whites + back sticker knocked out
 *   line  – black hand-drawn outline + face + sticker outline (3 boil variants, no pupils)
 *   pupil – one shared black dot, placed per EYE_LAYOUT at runtime
 *
 * Texture layout (all body layers): CHAR_TEX.w × CHAR_TEX.h logical px, body center at
 * (CHAR_TEX.cx, CHAR_TEX.cy). Padding CHAR_PAD on left/right/top, none at the bottom, so the
 * body touches the bottom edge: use origin (0.5, 1) exactly like the old player sprite.
 * Faces look toward +x; flip the images with the facing direction.
 */
import { PLAYERS, type PlayerId } from '../config/players';
import { TUNING as T } from '../config/tuning';
import { INK, PLAYER_INK } from './palette';
import { circlePoints, fillHalftone, misregOffset, mottle, seeded, speckle, tracePath, wobblePoints } from './riso';
import { handLine, inkLayer, knockOut, strokeWobbly, traceShape, type Pt } from './draw';

type Ctx = CanvasRenderingContext2D;

/** Body radius (logical px), from tuning. */
export const CHAR_R = T.playerWidth / 2;
export const CHAR_PAD = 4;
/** Ink is drawn slightly inside the radius so the boiling outline never leaves the texture. */
const BODY_R = CHAR_R - 2;
export const CHAR_TEX = {
  w: CHAR_R * 2 + CHAR_PAD * 2,
  h: CHAR_R * 2 + CHAR_PAD,
  cx: CHAR_PAD + CHAR_R,
  cy: CHAR_PAD + CHAR_R,
  originX: 0.5,
  originY: 1,
} as const;

/** Feature scale relative to the 56 px design size. */
const K = CHAR_R / 28;

export interface EyeLayout {
  /** Pupil rest centers relative to the body center (facing +x). */
  eyes: { x: number; y: number }[];
  /** Horizontal half-size of the eye white. */
  eyeRadius: number;
  pupilRadius: number;
  /** Max pupil travel from rest (horizontal). */
  maxPupilOffset: number;
  /** Max vertical pupil travel (narrow/lidded eyes allow less). */
  maxPupilOffsetY: number;
}

export const EYE_LAYOUT: Record<PlayerId, EyeLayout> = {
  // PIK: sharp, narrow, slanted eyes → almost no vertical travel
  0: { eyes: [{ x: 3 * K, y: -6 * K }, { x: 16 * K, y: -6 * K }], eyeRadius: 4.8 * K, pupilRadius: 2.1 * K, maxPupilOffset: 2.3 * K, maxPupilOffsetY: 0.5 * K },
  // BLOOP: big round eyes, free travel
  1: { eyes: [{ x: 2 * K, y: -5 * K }, { x: 17 * K, y: -5 * K }], eyeRadius: 6.2 * K, pupilRadius: 3 * K, maxPupilOffset: 2.6 * K, maxPupilOffsetY: 2.6 * K },
  // BRICK: heavy lids; pupils hang just under the lid
  2: { eyes: [{ x: 3 * K, y: -2.4 * K }, { x: 17 * K, y: -2.4 * K }], eyeRadius: 5.2 * K, pupilRadius: 2.3 * K, maxPupilOffset: 2.2 * K, maxPupilOffsetY: 0.4 * K },
};

/** Shared pupil texture: radius PUPIL_TEX_R, centered in a PUPIL_TEX_SIZE square. Scale by pupilRadius / PUPIL_TEX_R. */
export const PUPIL_TEX_R = 3;
export const PUPIL_TEX_SIZE = 8;

/** Speed lines texture: streaks trail to the left; place with origin (1, 0.5) at the character's back. */
export const SPEEDLINES_TEX = { w: 72, h: 40 } as const;

const BRICK_EYE_DY = -1.6 * K; // BRICK eye-circle center relative to the pupil rest point
const BRICK_LID = -0.1; // lid line at (circle center + LID × eyeRadius)

/** Trace (beginPath) the eye-white shape for eye `i` of player `id`, body center at (cx,cy). */
function traceEye(ctx: Ctx, id: PlayerId, i: number, cx: number, cy: number, seed = 0, amp = 0): void {
  const L = EYE_LAYOUT[id];
  const e = L.eyes[i];
  const x = cx + e.x, y = cy + e.y;
  const er = L.eyeRadius;
  let pts: Pt[];
  if (id === 0) {
    // almond with sharp corners, inner corner lower (mischievous slant)
    const tilt = i === 0 ? 0.3 : -0.3;
    const raw: Pt[] = [];
    for (let s = 0; s <= 12; s++) {
      const t = -1 + (s / 12) * 2;
      raw.push([t * er, -(1 - t * t) * 2.8 * K]);
    }
    for (let s = 11; s >= 1; s--) {
      const t = -1 + (s / 12) * 2;
      raw.push([t * er, (1 - t * t) * 2.2 * K]);
    }
    const c = Math.cos(tilt), sn = Math.sin(tilt);
    pts = raw.map(([px, py]) => [x + px * c - py * sn, y + px * sn + py * c]);
    tracePathSharp(ctx, amp > 0 ? wobblePoints(pts, seed, amp) : pts);
    return;
  }
  if (id === 1) {
    pts = circlePoints(x, y, er, 24);
  } else {
    // lower part of a circle under a flat heavy lid
    const ox = x, oy = y + BRICK_EYE_DY;
    const lidY = oy + BRICK_LID * er;
    const a0 = Math.asin(BRICK_LID);
    pts = [];
    for (let s = 0; s <= 16; s++) {
      const a = a0 + ((Math.PI - 2 * a0) * s) / 16; // from right lid corner round the bottom to left
      pts.push([ox + Math.cos(a) * er, oy + Math.sin(a) * er]);
    }
    pts.push([ox, lidY]);
    tracePathSharp(ctx, amp > 0 ? wobblePoints(pts, seed, amp) : pts);
    return;
  }
  tracePath(ctx, amp > 0 ? wobblePoints(pts, seed, amp) : pts);
}

/** Straight-segment closed path (keeps sharp corners, e.g. almond eye tips). */
function tracePathSharp(ctx: Ctx, pts: Pt[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

const stickerAt = (cx: number, cy: number) => ({ x: cx - 0.6 * CHAR_R, y: cy + 0.2 * CHAR_R, size: 5.5 * K });

/** Fill layer: body ink with crescent shading, eye whites and back sticker knocked out (paper shows). */
export function drawCharacterFill(ctx: Ctx, id: PlayerId, cx: number, cy: number, seed = 1): void {
  const ink = INK[PLAYER_INK[id]];
  const body = () => { ctx.beginPath(); ctx.arc(cx, cy, BODY_R, 0, Math.PI * 2); };
  ctx.save();
  body();
  ctx.fillStyle = ink;
  ctx.fill();
  // halftone crescent, light from top-left
  ctx.save();
  body();
  ctx.clip();
  ctx.beginPath();
  ctx.rect(cx - CHAR_R * 2, cy - CHAR_R * 2, CHAR_R * 4, CHAR_R * 4);
  ctx.arc(cx - 0.26 * CHAR_R, cy - 0.3 * CHAR_R, CHAR_R * 1.02, 0, Math.PI * 2);
  ctx.clip('evenodd');
  fillHalftone(ctx, cx - CHAR_R, cy - CHAR_R, CHAR_R * 2, CHAR_R * 2, INK.black, 0.26, 2.6 * K, 45);
  ctx.restore();
  // knockouts
  for (let i = 0; i < EYE_LAYOUT[id].eyes.length; i++) knockOut(ctx, () => traceEye(ctx, id, i, cx, cy));
  const st = stickerAt(cx, cy);
  knockOut(ctx, () => traceShape(ctx, PLAYERS[id].shape, st.x, st.y, st.size));
  // uneven ink + a few spatters around the rim
  ctx.translate(cx - CHAR_R, cy - CHAR_R);
  mottle(ctx, CHAR_R * 2, CHAR_R * 2, seed * 31 + id, 0.22);
  ctx.beginPath();
  ctx.arc(CHAR_R, CHAR_R, CHAR_R + 1.5, 0, Math.PI * 2);
  ctx.arc(CHAR_R, CHAR_R, BODY_R - 2, 0, Math.PI * 2, true);
  ctx.clip();
  speckle(ctx, CHAR_R * 2, CHAR_R * 2, ink, seed * 17 + id, 14);
  ctx.restore();
}

/** Line layer: outline, face (no pupils) and sticker outline. `v` picks the boil variant. */
export function drawCharacterLine(ctx: Ctx, id: PlayerId, cx: number, cy: number, v: number): void {
  const B = INK.black;
  const s = 100 + id * 10 + v; // seed per character × variant
  strokeWobbly(ctx, circlePoints(cx, cy, BODY_R, 40), s, 0.55 * K, 2.4 * K, B);
  // eyes
  for (let i = 0; i < EYE_LAYOUT[id].eyes.length; i++) {
    ctx.save();
    traceEye(ctx, id, i, cx, cy, s * 3 + i, 0.25 * K);
    ctx.lineWidth = 1.4 * K;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = B;
    ctx.stroke();
    ctx.restore();
  }
  const at = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [cx + x * K, cy + y * K]);
  if (id === 0) {
    // sharp brows slanting toward the center + wide filled grin with a dimple
    handLine(ctx, at([[-2, -12], [2, -11], [6.5, -9.5]]), s + 1, 1.8 * K, B, 0.25);
    handLine(ctx, at([[12.5, -10], [17, -11.5], [21, -13]]), s + 2, 1.8 * K, B, 0.25);
    ctx.save();
    tracePath(ctx, wobblePoints(at([[1, 4], [6, 5], [11, 5], [16, 4], [20, 2], [18, 7], [14, 11], [9, 12], [4, 9]]), s + 3, 0.3 * K));
    ctx.fillStyle = B;
    ctx.fill();
    ctx.restore();
    handLine(ctx, at([[19.5, 0], [21.5, 3.2]]), s + 4, 1.3 * K, B, 0.2);
  } else if (id === 1) {
    // small "o" mouth + hatched blush
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
  } else {
    // heavy lids (thick flat line over each eye) + flat mouth
    for (const e of EYE_LAYOUT[2].eyes) {
      const ly = e.y + BRICK_EYE_DY + BRICK_LID * EYE_LAYOUT[2].eyeRadius;
      const er = EYE_LAYOUT[2].eyeRadius;
      handLine(ctx, [[cx + e.x - er - 1.2 * K, cy + ly + 0.3 * K], [cx + e.x, cy + ly], [cx + e.x + er + 1 * K, cy + ly - 0.2 * K]], s + Math.round(e.x), 2.6 * K, B, 0.2);
    }
    handLine(ctx, at([[4.5, 9], [10, 9.2], [15.5, 8.8]]), s + 5, 2 * K, B, 0.25);
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
    const x1 = w - 2 - rnd() * 10;
    const len = 22 + rnd() * (w - 30);
    const th = 1.2 + rnd() * 1.4;
    const x0 = x1 - len;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.quadraticCurveTo((x0 + x1) / 2, y - th * 0.55, x1, y - th / 2);
    ctx.arc(x1, y, th / 2, -Math.PI / 2, Math.PI / 2);
    ctx.quadraticCurveTo((x0 + x1) / 2, y + th * 0.55, x0, y);
    ctx.fill();
    // a broken fleck further back on some rows
    if (rnd() < 0.6) ctx.fillRect(x0 - 4 - rnd() * 8, y - 0.5, 2 + rnd() * 3, 1);
  }
  ctx.restore();
}

/**
 * Full character composite on paper (ticket illustrations etc.): fill multiplied with its
 * misregistration, then line variant `v`, then pupils at rest glancing forward.
 * Draws at the ctx's current transform; body center at (cx,cy).
 */
export function drawCharacter(ctx: Ctx, id: PlayerId, cx: number, cy: number, v = 0): void {
  const span = CHAR_R + CHAR_PAD;
  inkLayer(ctx, cx - span, cy - span, span * 2, span * 2, (c) => drawCharacterFill(c, id, cx, cy), misregOffset(40 + id));
  drawCharacterLine(ctx, id, cx, cy, v);
  const L = EYE_LAYOUT[id];
  for (const e of L.eyes) drawPupil(ctx, cx + e.x + L.maxPupilOffset * 0.5, cy + e.y, L.pupilRadius);
}
