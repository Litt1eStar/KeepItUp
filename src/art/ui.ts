/**
 * Riso UI pieces: rubber stamps and ink splats (drawn in WHITE so the runtime tints them with
 * setTint(INK_HEX.x)), player ticket stubs, the high-score receipt and the next-ball dots.
 * No Phaser import; all sizes logical.
 */
import { PLAYERS, type PlayerId } from '../config/players';
import { INK, INK_ANGLE, INK_HEX, PLAYER_INK } from './palette';
import { circlePoints, fillHalftone, misregOffset, mottle, paperGrain, seeded, speckle, tracePath, wobblePoints } from './riso';
import { DISPLAY_FONT, MONO_FONT } from './type';
import { densify, font, handLine, inkLayer, knockOut, roundRectPath, strokeWobbly, traceShape, type Pt } from './draw';
import { drawCharacter } from './characters';

type Ctx = CanvasRenderingContext2D;

// ---------------------------------------------------------------- stamps

export const STAMP_IDS = ['NICE', 'PASS', 'WRONG', 'PLUS_BALL', 'COMBO', 'DROPPED', 'JOINED'] as const;
export type StampId = (typeof STAMP_IDS)[number];
export const STAMP_TEXT: Record<StampId, string> = {
  NICE: 'NICE', PASS: 'PASS', WRONG: 'WRONG', PLUS_BALL: '+1 BALL', COMBO: 'COMBO', DROPPED: 'DROPPED', JOINED: 'JOINED',
};
const STAMP_FONT = 30;
const STAMP_PAD_X = 14;
const STAMP_H = 54;

/** Stamp texture size; needs a ctx only to measure the Anton text. */
export function stampSize(ctx: Ctx, id: StampId): { w: number; h: number } {
  font(ctx, STAMP_FONT, DISPLAY_FONT);
  return { w: Math.ceil(ctx.measureText(STAMP_TEXT[id]).width + STAMP_PAD_X * 2 + 10), h: STAMP_H };
}

/** Rubber stamp in white: double rounded border, Anton text, uneven pressure and missing ink. */
export function drawStamp(ctx: Ctx, id: StampId, w: number, h: number): void {
  const seed = STAMP_IDS.indexOf(id) * 37 + 5;
  const rnd = seeded(seed);
  ctx.save();
  ctx.fillStyle = ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3.2;
  roundRectPath(ctx, 5, 5, w - 10, h - 10, 7);
  ctx.stroke();
  ctx.lineWidth = 1.1;
  roundRectPath(ctx, 9.5, 9.5, w - 19, h - 19, 4);
  ctx.stroke();
  font(ctx, STAMP_FONT, DISPLAY_FONT);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(STAMP_TEXT[id], w / 2, h / 2 + 1.5);
  // uneven pressure: one side of the stamp prints lighter (bigger, more frequent gaps)
  const light = rnd() < 0.5 ? 0 : w;
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w, y = rnd() * h;
    const near = 1 - Math.abs(x - light) / w;
    if (rnd() > 0.25 + near * 0.6) continue;
    ctx.globalAlpha = 0.5 + rnd() * 0.5;
    ctx.beginPath();
    ctx.ellipse(x, y, 0.6 + rnd() * 2.6 * near + 0.4, 0.5 + rnd() * 1.4, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.85; // a couple of scratches
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 2; i++) {
    const y = h * (0.25 + rnd() * 0.5);
    ctx.beginPath();
    ctx.moveTo(rnd() * w * 0.4, y);
    ctx.lineTo(w * (0.6 + rnd() * 0.4), y + (rnd() - 0.5) * 6);
    ctx.stroke();
  }
  ctx.restore();
  mottle(ctx, w, h, seed + 1, 0.45);
  speckle(ctx, w, h, '#fff', seed + 2, 9);
}

// ---------------------------------------------------------------- splats

export const SPLAT_SIZE = 64;
const SPLAT_R = 13;
const SPIKE_MAX = 1.7; // × SPLAT_R
const DROP_DIST_MAX = 2.0; // × SPLAT_R
const DROP_R_MAX = 4.2;

/** Max distance from the splat center that ink can reach (pure; ≤ SPLAT_SIZE/2 so nothing clips). */
export function splatMaxExtent(): number {
  return Math.max(SPLAT_R * SPIKE_MAX, SPLAT_R * DROP_DIST_MAX + DROP_R_MAX * 1.15);
}

/** Ink splat in white: lumpy main blot + a few droplets, variant v. */
export function drawSplat(ctx: Ctx, v: number): void {
  const rnd = seeded(500 + v * 11);
  const c = SPLAT_SIZE / 2, R = SPLAT_R;
  const pts: Pt[] = [];
  const spikes = new Set([Math.floor(rnd() * 22), Math.floor(rnd() * 22), Math.floor(rnd() * 22)]);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const rr = R * (spikes.has(i) ? SPIKE_MAX - 0.25 + rnd() * 0.25 : 0.82 + rnd() * 0.3);
    pts.push([c + Math.cos(a) * rr, c + Math.sin(a) * rr]);
  }
  ctx.save();
  ctx.fillStyle = '#fff';
  tracePath(ctx, pts);
  ctx.fill();
  const drops = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < drops; i++) {
    const a = rnd() * Math.PI * 2, d = R * (DROP_DIST_MAX - 0.35 + rnd() * 0.35), r = 1.8 + rnd() * (DROP_R_MAX - 1.8);
    tracePath(ctx, wobblePoints(circlePoints(c + Math.cos(a) * d, c + Math.sin(a) * d, r, 10), v * 7 + i, r * 0.15));
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

// ---------------------------------------------------------------- ticket

export const TICKET = { w: 190, h: 116, perfX: 56, notchR: 6 } as const;
const CONTROLS: Record<PlayerId, string> = {
  0: 'A/D · W jump · S dash',
  1: '←/→ · ↑ jump · ↓ dash',
  2: 'J/L · I jump · K dash',
};
const NAMES: Record<PlayerId, string> = { 0: 'PIK', 1: 'BLOOP', 2: 'BRICK' };

function rectPts(x: number, y: number, w: number, h: number): Pt[] {
  return densify([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], 8).slice(0, -1);
}

/** Ticket stub for player `id`, TICKET.w × TICKET.h: paper card, perforation, character, name, controls. */
export function drawTicket(ctx: Ctx, id: PlayerId): void {
  ctx.save();
  drawTicketBody(ctx, id);
  ctx.restore();
}

function drawTicketBody(ctx: Ctx, id: PlayerId): void {
  const { w, h, perfX: px, notchR: nr } = TICKET;
  const inkName = PLAYER_INK[id];
  const ink = INK[inkName];
  const B = INK.black;
  ctx.save();
  roundRectPath(ctx, 1.5, 1.5, w - 3, h - 3, 3);
  ctx.clip();
  paperGrain(ctx, w, h, 70 + id);
  ctx.restore();
  // player ink pass: halftone disc behind the character + solid stub shape
  inkLayer(ctx, 0, 0, w, h, (c) => {
    c.save();
    c.beginPath();
    c.arc(92, 52, 30, 0, Math.PI * 2);
    c.arc(92, 54, 21, 0, Math.PI * 2); // halo only: keep the face (eye whites) clean
    c.clip('evenodd');
    fillHalftone(c, 62, 22, 60, 60, ink, 0.34, 3.6, INK_ANGLE[inkName]);
    c.restore();
    traceShape(c, PLAYERS[id].shape, px / 2, 54, 15);
    c.fillStyle = ink;
    c.fill();
    mottle(c, w, h, 80 + id, 0.25);
  }, misregOffset(90 + id));
  // black pass
  strokeWobbly(ctx, rectPts(2.5, 2.5, w - 5, h - 5), 95 + id, 0.35, 1.6, B);
  traceShape(ctx, PLAYERS[id].shape, px / 2, 54, 15, 96 + id, 0.35);
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = B;
  ctx.stroke();
  ctx.fillStyle = B;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  font(ctx, 10, MONO_FONT, 700);
  ctx.fillText(`P${id + 1}`, px / 2, 22);
  font(ctx, 6, MONO_FONT, 700);
  ctx.fillText('ADMIT ONE', px / 2, 88);
  const rnd = seeded(110 + id);
  for (let x = 13; x < px - 12; ) {
    const bw = 0.6 + rnd() * 1.8;
    ctx.fillRect(x, 94, bw, 12);
    x += bw + 0.8 + rnd() * 1.6;
  }
  // main area
  ctx.textAlign = 'left';
  font(ctx, 6.5, MONO_FONT, 700);
  ctx.fillText(`KEEP IT UP! · PLAYER ${id + 1}`, px + 8, 15);
  handLine(ctx, densify([[px + 8, 20], [w - 9, 20]], 6), 120 + id, 0.8, B);
  ctx.save();
  ctx.translate(92, 54);
  ctx.scale(0.8, 0.8);
  drawCharacter(ctx, id, 0, 0, id);
  ctx.restore();
  ctx.fillStyle = B;
  let size = 30;
  font(ctx, size, DISPLAY_FONT);
  const maxW = w - 10 - 126;
  const nw = ctx.measureText(NAMES[id]).width;
  if (nw > maxW) { size = Math.floor((size * maxW) / nw); font(ctx, size, DISPLAY_FONT); }
  ctx.fillText(NAMES[id], 126, 66);
  handLine(ctx, densify([[px + 8, 84], [w - 9, 84]], 6), 130 + id, 0.8, B);
  font(ctx, 8, MONO_FONT);
  ctx.fillText(CONTROLS[id], px + 8, 99);
  font(ctx, 5.5, MONO_FONT);
  ctx.fillText('VALID FOR ONE GAME · NO REFUNDS', px + 8, 108);
  // perforation: punched notches (transparent) + dashed tear line
  knockOut(ctx, () => { ctx.beginPath(); ctx.arc(px, 1.5, nr, 0, Math.PI * 2); ctx.arc(px, h - 1.5, nr, 0, Math.PI * 2); });
  ctx.save();
  ctx.strokeStyle = B;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(px, 1.5, nr, 0, Math.PI);
  ctx.moveTo(px + nr, h - 1.5);
  ctx.arc(px, h - 1.5, nr, 0, Math.PI, true);
  ctx.stroke();
  ctx.setLineDash([3, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, nr + 4);
  ctx.lineTo(px, h - nr - 4);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- receipt

export const RECEIPT = { w: 260, h: 220, tooth: 8, depth: 5 } as const;

/** "12840" → "12 840" (thin-space thousands like a till printout). */
export function formatScore(score: number): string {
  return String(Math.max(0, Math.round(score))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Rank as two digits: 1 → "01". */
export function formatRank(rank: number): string {
  return String(rank).padStart(2, '0');
}

/** One receipt row in Space Mono: `01  BOUNCERS ........ 12 840`, spanning x..x+width at baseline y. */
export function drawReceiptRow(ctx: Ctx, x: number, y: number, width: number, rank: number, team: string, score: number): void {
  ctx.save();
  font(ctx, 10, MONO_FONT);
  ctx.fillStyle = INK.black;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const left = `${formatRank(rank)}  ${team.toUpperCase()}`;
  ctx.fillText(left, x, y);
  const right = formatScore(score);
  ctx.textAlign = 'right';
  ctx.fillText(right, x + width, y);
  const lw = ctx.measureText(left).width, rw = ctx.measureText(right).width;
  const dw = ctx.measureText('.').width;
  const n = Math.floor((width - lw - rw - 10) / dw);
  if (n > 0) ctx.fillText('.'.repeat(n), x + width - rw - 5, y);
  ctx.restore();
}

const SAMPLE_ROWS: [string, number][] = [
  ['BOUNCERS', 12840], ['PIK-NIC', 9120], ['TRIPLE TROUBLE', 7455], ['NO DROPS', 5020], ['BLOOP SQUAD', 3310],
];

function receiptPath(ctx: Ctx): void {
  const { w, h, tooth, depth } = RECEIPT;
  ctx.beginPath();
  ctx.moveTo(0, depth);
  for (let x = 0; x < w; x += tooth) { ctx.lineTo(x + tooth / 2, 0); ctx.lineTo(Math.min(w, x + tooth), depth); }
  ctx.lineTo(w, h - depth);
  for (let x = w; x > 0; x -= tooth) { ctx.lineTo(x - tooth / 2, h); ctx.lineTo(Math.max(0, x - tooth), h - depth); }
  ctx.closePath();
}

/** Sample receipt (RECEIPT.w × RECEIPT.h) with torn zigzag edges, header and 5 rows. */
export function drawReceipt(ctx: Ctx): void {
  const { w, h } = RECEIPT;
  ctx.save();
  receiptPath(ctx);
  ctx.clip();
  paperGrain(ctx, w, h, 140);
  // pink highlighter pass behind the winning row
  inkLayer(ctx, 0, 0, w, h, (c) => {
    c.save();
    c.beginPath();
    c.rect(14, 71, w - 28, 13);
    c.clip();
    fillHalftone(c, 14, 71, w - 28, 13, INK.pink, 0.26, 3.2, INK_ANGLE.pink);
    c.restore();
    mottle(c, w, h, 141, 0.25);
  }, misregOffset(142));
  inkLayer(ctx, 0, 0, w, h, (c) => {
    c.fillStyle = INK.black;
    c.textAlign = 'center';
    font(c, 26, DISPLAY_FONT);
    c.fillText('TOP TEAMS', w / 2, 40);
    font(c, 6.5, MONO_FONT, 700);
    c.fillText('KIU-01 · KEEP IT UP! · HIGH SCORES', w / 2, 53);
    c.setLineDash([3, 2]);
    c.strokeStyle = INK.black;
    c.lineWidth = 0.9;
    for (const y of [61, 172]) { c.beginPath(); c.moveTo(16, y); c.lineTo(w - 16, y); c.stroke(); }
    c.setLineDash([]);
    SAMPLE_ROWS.forEach(([team, score], i) => drawReceiptRow(c, 18, 81 + i * 19, w - 36, i + 1, team, score));
    c.textAlign = 'center';
    font(c, 7, MONO_FONT);
    c.fillText('THANK YOU FOR KEEPING IT UP', w / 2, 186);
    const rnd = seeded(150);
    for (let x = 70; x < w - 70; ) {
      const bw = 0.7 + rnd() * 2;
      c.fillRect(x, 192, bw, 14);
      x += bw + 0.9 + rnd() * 1.8;
    }
    mottle(c, w, h, 151, 0.2);
  });
  ctx.restore();
}

// ---------------------------------------------------------------- next-ball dots

export const DOT_TEX = 10;

/** Next-ball row dot (filled or empty outline), centered in DOT_TEX. */
export function drawDot(ctx: Ctx, filled: boolean, seed = 0): void {
  const c = DOT_TEX / 2;
  ctx.save();
  tracePath(ctx, wobblePoints(circlePoints(c, c, filled ? 3.6 : 3.2, 12), 160 + seed, 0.25));
  ctx.fillStyle = ctx.strokeStyle = INK.black;
  ctx.lineWidth = 1.2;
  if (filled) ctx.fill();
  else ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- stamp inks

/** Default ink (INK_HEX tint) for each stamp when used at runtime. Yellow is faint on paper: back it with a darker ink. */
export const STAMP_INK: Record<StampId, number> = {
  NICE: INK_HEX.blue, PASS: INK_HEX.pink, WRONG: INK_HEX.pink, PLUS_BALL: INK_HEX.yellow,
  COMBO: INK_HEX.pink, DROPPED: INK_HEX.black, JOINED: INK_HEX.blue,
};
