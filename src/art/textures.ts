/**
 * Registers every riso texture with Phaser at boot. Textures are drawn at RS× resolution
 * (display images with .setScale(S)). All keys are prefixed `riso:`; use RISO_KEYS, not strings.
 *
 * Origins: characters (fill/line) (0.5, 1) — see CHAR_TEX; pupil, balls, shadows, stamps, splats,
 * splat keylines, dots (0.5, 0.5); speedlines (1, 0.5) at the character's back; bg/ticket/receipt (0, 0).
 */
import type Phaser from 'phaser';
import { PLAYERS, type PlayerId } from '../config/players';
import { RS } from '../config/render';
import { TUNING as T } from '../config/tuning';
import { INK, INK_ANGLE } from './palette';
import { CHAR_TEX, PUPIL_TEX_SIZE, SPEEDLINES_TEX, drawCharacterFill, drawCharacterLine, drawPupil, drawSpeedlines } from './characters';
import { SHADOW_STEPS, ballArt, drawBallFill, drawBallLine, drawShadow, shadowTexSize } from './ball';
import { drawStage } from './stage';
import { DOT_TEX, RECEIPT, STAMP_IDS, TICKET, drawDot, drawReceipt, drawStamp, drawTicket, stampSize, type StampId } from './ui';
import { SPLAT_SIZE, drawSplat, drawSplatLine } from './splat';

type Ctx = CanvasRenderingContext2D;

/** Number of boil variants for every linework texture (swap at ~8 fps). */
export const BOIL_VARIANTS = 3;

export const RISO_KEYS = {
  bg: 'riso:bg',
  charFill: (id: PlayerId) => `riso:char${id}:fill`,
  charLine: (id: PlayerId, v: number) => `riso:char${id}:line:${v}`,
  pupil: 'riso:pupil',
  speedlines: 'riso:speedlines',
  ballFill: (id: PlayerId) => `riso:ball${id}:fill`,
  ballLine: (v: number) => `riso:ball:line:${v}`,
  shadow: (n: number) => `riso:shadow:${n}`,
  shadowDanger: (n: number) => `riso:shadowDanger:${n}`,
  stamp: (id: StampId) => `riso:stamp:${id}`,
  splat: (v: number) => `riso:splat:${v}`,
  /** Black keyline matching splat(v) (untinted). Layered on top when splatNeedsKeyline(tint), i.e. yellow. */
  splatLine: (v: number) => `riso:splatLine:${v}`,
  ticket: (id: PlayerId) => `riso:ticket${id}`,
  receipt: 'riso:receipt',
  dot: 'riso:dot',
  dotEmpty: 'riso:dotEmpty',
} as const;

const IDS: PlayerId[] = [0, 1, 2];
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Every riso texture key generateRisoTextures registers (pure; for tests and preloading checks). */
export function allRisoKeys(): string[] {
  const K = RISO_KEYS;
  return [
    K.bg, K.pupil, K.speedlines, K.receipt, K.dot, K.dotEmpty,
    ...IDS.map(K.charFill),
    ...IDS.flatMap((id) => range(BOIL_VARIANTS).map((v) => K.charLine(id, v))),
    ...IDS.map(K.ballFill),
    ...range(BOIL_VARIANTS).map(K.ballLine),
    ...range(SHADOW_STEPS).map(K.shadow),
    ...range(SHADOW_STEPS).map(K.shadowDanger),
    ...STAMP_IDS.map(K.stamp),
    ...range(BOIL_VARIANTS).map(K.splat),
    ...range(BOIL_VARIANTS).map(K.splatLine),
    ...IDS.map(K.ticket),
  ];
}

/** Create a canvas texture of logical size w×h drawn at RS× resolution (ctx pre-scaled). */
function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, Math.ceil(w * RS), Math.ceil(h * RS))!;
  const ctx = tex.getContext();
  ctx.save();
  ctx.scale(RS, RS);
  draw(ctx);
  ctx.restore();
  tex.refresh();
}

export function generateRisoTextures(scene: Phaser.Scene): void {
  const K = RISO_KEYS;
  const tex = (key: string, w: number, h: number, draw: (ctx: Ctx) => void) => canvasTexture(scene, key, w, h, draw);

  tex(K.bg, T.width, T.height, drawStage);

  for (const p of PLAYERS) {
    tex(K.charFill(p.id), CHAR_TEX.w, CHAR_TEX.h, (c) => drawCharacterFill(c, p.id, CHAR_TEX.cx, CHAR_TEX.cy));
    for (let v = 0; v < BOIL_VARIANTS; v++) {
      tex(K.charLine(p.id, v), CHAR_TEX.w, CHAR_TEX.h, (c) => drawCharacterLine(c, p.id, CHAR_TEX.cx, CHAR_TEX.cy, v));
    }
  }
  tex(K.pupil, PUPIL_TEX_SIZE, PUPIL_TEX_SIZE, (c) => drawPupil(c, PUPIL_TEX_SIZE / 2, PUPIL_TEX_SIZE / 2));
  tex(K.speedlines, SPEEDLINES_TEX.w, SPEEDLINES_TEX.h, (c) => drawSpeedlines(c));

  const r = T.ballRadius;
  const ball = ballArt(r);
  for (const p of PLAYERS) tex(K.ballFill(p.id), ball.size, ball.size, (c) => drawBallFill(c, p.id, r));
  for (let v = 0; v < BOIL_VARIANTS; v++) tex(K.ballLine(v), ball.size, ball.size, (c) => drawBallLine(c, r, v));
  const sh = shadowTexSize(r);
  for (let n = 0; n < SHADOW_STEPS; n++) {
    tex(K.shadow(n), sh.w, sh.h, (c) => drawShadow(c, r, n, INK.black, INK_ANGLE.black));
    tex(K.shadowDanger(n), sh.w, sh.h, (c) => drawShadow(c, r, n, INK.pink, INK_ANGLE.pink));
  }

  const measure = document.createElement('canvas').getContext('2d')!;
  for (const id of STAMP_IDS) {
    const { w, h } = stampSize(measure, id);
    tex(K.stamp(id), w, h, (c) => drawStamp(c, id, w, h));
  }
  for (let v = 0; v < BOIL_VARIANTS; v++) {
    tex(K.splat(v), SPLAT_SIZE, SPLAT_SIZE, (c) => drawSplat(c, v));
    tex(K.splatLine(v), SPLAT_SIZE, SPLAT_SIZE, (c) => drawSplatLine(c, v));
  }
  for (const p of PLAYERS) tex(K.ticket(p.id), TICKET.w, TICKET.h, (c) => drawTicket(c, p.id));
  tex(K.receipt, RECEIPT.w, RECEIPT.h, drawReceipt);
  tex(K.dot, DOT_TEX, DOT_TEX, (c) => drawDot(c, true));
  tex(K.dotEmpty, DOT_TEX, DOT_TEX, (c) => drawDot(c, false));
}
