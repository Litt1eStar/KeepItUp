/**
 * Riso UI pieces: rubber stamps (drawn in WHITE so the runtime tints them with setTint(stampTint(ink))),
 * player ticket stubs, the high-score receipt and the next-ball dots. Splats live in splat.ts.
 * No Phaser import; all sizes logical.
 */
import { CHAR_STYLE_NAMES, PLAYERS, formatTicketControls, type PlayerId } from '../config/players';
import { INK, INK_ANGLE, INK_HEX, PLAYER_INK, type InkName } from './palette';
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
/** Stamp texture height (logical px, before display scale). */
export const STAMP_H = 54;

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

/** Faint halftone ghost-print stamp in white (opaque dots only, no alpha fade). */
export function drawFaintStamp(ctx: Ctx, id: StampId, w: number, h: number): void {
  drawStamp(ctx, id, w, h);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  fillHalftone(ctx, 0, 0, w, h, '#fff', 0.28, 3.6, INK_ANGLE.pink);
  ctx.restore();
}

// ---------------------------------------------------------------- ticket

export const TICKET = { w: 190, h: 116, perfX: 56, notchR: 6 } as const;
export const CHAR_NAMES: Record<PlayerId, string> = {
  get 0() {
    return CHAR_STYLE_NAMES[PLAYERS[0].charStyle];
  },
  get 1() {
    return CHAR_STYLE_NAMES[PLAYERS[1].charStyle];
  },
  get 2() {
    return CHAR_STYLE_NAMES[PLAYERS[2].charStyle];
  },
};

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
  font(ctx, 6.5, MONO_FONT, 700);
  ctx.fillText('◄ CHAR ►', 126, 36);
  let size = 30;
  font(ctx, size, DISPLAY_FONT);
  const maxW = w - 10 - 126;
  const nw = ctx.measureText(CHAR_NAMES[id]).width;
  if (nw > maxW) { size = Math.floor((size * maxW) / nw); font(ctx, size, DISPLAY_FONT); }
  ctx.fillText(CHAR_NAMES[id], 126, 66);
  handLine(ctx, densify([[px + 8, 84], [w - 9, 84]], 6), 130 + id, 0.8, B);
  font(ctx, 8, MONO_FONT);
  ctx.fillText(formatTicketControls(PLAYERS[id].keys), px + 8, 99);
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

// ---------------------------------------------------------------- receipt & report cards

export const RECEIPT = { w: 260, h: 220, tooth: 8, depth: 5 } as const;
export const REPORT_CARD = { w: 396, h: 436, tooth: 8, depth: 5 } as const;
export const BOARD_CARD = { w: 452, h: 436, tooth: 8, depth: 5 } as const;
export const LETTER_BOX = { w: 46, h: 58 } as const;
export const PAUSE_CARD = { w: 540, h: 380, tooth: 8, depth: 5 } as const;

export interface ReceiptRowData {
  team: string;
  score: number;
  players?: number;
}

/** "12840" → "12 840" (thin-space thousands like a till printout). */
export function formatScore(score: number): string {
  return String(Math.max(0, Math.round(score))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Rank as two digits: 1 → "01". */
export function formatRank(rank: number): string {
  return String(rank).padStart(2, '0');
}

/** One receipt row in Space Mono: `01  BOUNCERS ........ 12 840`, spanning x..x+width at baseline y. */
export function drawReceiptRow(
  ctx: Ctx,
  x: number,
  y: number,
  width: number,
  rank: number,
  team: string,
  score: number,
  fontSize = 10,
): void {
  ctx.save();
  font(ctx, fontSize, MONO_FONT);
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

const SAMPLE_ROWS: ReceiptRowData[] = [
  { team: 'BOUNCERS', score: 12840 },
  { team: 'PIK-NIC', score: 9120 },
  { team: 'TRIPLE TROUBLE', score: 7455 },
  { team: 'NO DROPS', score: 5020 },
  { team: 'BLOOP SQUAD', score: 3310 },
];

function zigzagReceiptPath(ctx: Ctx, w: number, h: number, tooth: number, depth: number): void {
  ctx.beginPath();
  ctx.moveTo(0, depth);
  for (let x = 0; x < w; x += tooth) { ctx.lineTo(x + tooth / 2, 0); ctx.lineTo(Math.min(w, x + tooth), depth); }
  ctx.lineTo(w, h - depth);
  for (let x = w; x > 0; x -= tooth) { ctx.lineTo(x - tooth / 2, h); ctx.lineTo(Math.max(0, x - tooth), h - depth); }
  ctx.closePath();
}

function drawDashedRules(ctx: Ctx, x0: number, x1: number, ys: readonly number[]): void {
  ctx.save();
  ctx.setLineDash([3, 2]);
  ctx.strokeStyle = INK.black;
  ctx.lineWidth = 0.9;
  for (const y of ys) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
  ctx.restore();
}

function drawBarcode(ctx: Ctx, x0: number, x1: number, y: number, h: number, seed: number): void {
  const rnd = seeded(seed);
  for (let x = x0; x < x1; ) {
    const bw = 0.7 + rnd() * 2;
    ctx.fillRect(x, y, bw, h);
    x += bw + 0.9 + rnd() * 1.8;
  }
}

function drawPinkBand(ctx: Ctx, w: number, h: number, bx: number, by: number, bw: number, bh: number, density: number, seed: number): void {
  inkLayer(ctx, 0, 0, w, h, (c) => {
    c.save();
    c.beginPath();
    c.rect(bx, by, bw, bh);
    c.clip();
    fillHalftone(c, bx, by, bw, bh, INK.pink, density, 3.2, INK_ANGLE.pink);
    c.restore();
    mottle(c, w, h, seed, 0.25);
  }, misregOffset(seed + 1));
}

/** Receipt (RECEIPT.w × RECEIPT.h) with torn zigzag edges, header and up to 5 rows (sample data when omitted). */
export function drawReceipt(ctx: Ctx, rows?: readonly ReceiptRowData[], highlightRank: number | null = 1): void {
  const { w, h, tooth, depth } = RECEIPT;
  const list = rows ? rows.slice(0, 5) : SAMPLE_ROWS;
  ctx.save();
  zigzagReceiptPath(ctx, w, h, tooth, depth);
  ctx.clip();
  paperGrain(ctx, w, h, 140);
  if (highlightRank !== null && highlightRank >= 1 && highlightRank <= list.length) {
    drawPinkBand(ctx, w, h, 14, 71 + (highlightRank - 1) * 19, w - 28, 13, 0.26, 141);
  }
  inkLayer(ctx, 0, 0, w, h, (c) => {
    c.fillStyle = INK.black;
    c.textAlign = 'center';
    font(c, 26, DISPLAY_FONT);
    c.fillText('TOP TEAMS', w / 2, 40);
    font(c, 6.5, MONO_FONT, 700);
    c.fillText('KIU-01 · KEEP IT UP! · HIGH SCORES', w / 2, 53);
    drawDashedRules(c, 16, w - 16, [61, 172]);
    if (list.length === 0) {
      font(c, 9, MONO_FONT, 700);
      c.fillText('NO SCORES YET — BE FIRST!', w / 2, 118);
    } else {
      list.forEach((r, i) => drawReceiptRow(c, 18, 81 + i * 19, w - 36, i + 1, r.team, r.score));
    }
    c.textAlign = 'center';
    font(c, 7, MONO_FONT);
    c.fillText('THANK YOU FOR KEEPING IT UP', w / 2, 186);
    drawBarcode(c, 70, w - 70, 192, 14, 150);
    mottle(c, w, h, 151, 0.2);
  });
  ctx.restore();
}

/** Blank "ROUND REPORT" receipt card (REPORT_CARD.w × REPORT_CARD.h); GameOverScene prints live stats on top. */
export function drawReportCard(ctx: Ctx): void {
  const { w, h, tooth, depth } = REPORT_CARD;
  ctx.save();
  zigzagReceiptPath(ctx, w, h, tooth, depth);
  ctx.clip();
  paperGrain(ctx, w, h, 210);
  drawPinkBand(ctx, w, h, 22, 29, w - 44, 33, 0.16, 211);
  inkLayer(ctx, 0, 0, w, h, (c) => {
    c.fillStyle = INK.black;
    c.textAlign = 'center';
    font(c, 8, MONO_FONT, 700);
    c.fillText('KIU-01 · OFFICIAL TILL REPORT', w / 2, 24);
    font(c, 34, DISPLAY_FONT);
    c.fillText('ROUND REPORT', w / 2, 58);
    drawDashedRules(c, 22, w - 22, [70, 166, 368]);
    c.textAlign = 'center';
    font(c, 8, MONO_FONT, 700);
    c.fillText('THANK YOU FOR KEEPING IT UP', w / 2, 388);
    drawBarcode(c, 108, w - 108, 396, 18, 215);
    mottle(c, w, h, 212, 0.2);
  });
  ctx.restore();
}

/** Full 10-row leaderboard receipt for Game Over (BOARD_CARD.w × BOARD_CARD.h), with optional highlighted rank. */
export function drawBoardReceipt(ctx: Ctx, rows: readonly ReceiptRowData[], highlightRank: number | null): void {
  const { w, h, tooth, depth } = BOARD_CARD;
  const list = rows.slice(0, 10);
  ctx.save();
  zigzagReceiptPath(ctx, w, h, tooth, depth);
  ctx.clip();
  paperGrain(ctx, w, h, 230);
  if (highlightRank !== null && highlightRank >= 1 && highlightRank <= list.length) {
    drawPinkBand(ctx, w, h, 18, 75 + (highlightRank - 1) * 27, w - 36, 16, 0.26, 231);
  }
  inkLayer(ctx, 0, 0, w, h, (c) => {
    c.fillStyle = INK.black;
    c.textAlign = 'center';
    font(c, 30, DISPLAY_FONT);
    c.fillText('TOP TEAMS', w / 2, 44);
    font(c, 7.5, MONO_FONT, 700);
    c.fillText('KIU-01 · HIGH SCORE REGISTER · TOP 10', w / 2, 60);
    drawDashedRules(c, 20, w - 20, [70, 368]);
    if (list.length === 0) {
      font(c, 11, MONO_FONT, 700);
      c.fillText('NO SCORES RECORDED YET', w / 2, 210);
    } else {
      list.forEach((r, i) => {
        const label = r.players ? `${r.team} [${r.players}P]` : r.team;
        drawReceiptRow(c, 24, 86 + i * 27, w - 48, i + 1, label, r.score, 12);
      });
    }
    c.textAlign = 'center';
    font(c, 8, MONO_FONT, 700);
    c.fillText('THANK YOU FOR KEEPING IT UP', w / 2, 388);
    drawBarcode(c, 128, w - 128, 396, 18, 235);
    mottle(c, w, h, 232, 0.2);
  });
  ctx.restore();
}

/** Rubber-stamp letter frame in white (tint at runtime with stampTint + MULTIPLY). */
export function drawLetterBox(ctx: Ctx): void {
  const { w, h } = LETTER_BOX;
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.8;
  roundRectPath(ctx, 3, 3, w - 6, h - 6, 6);
  ctx.stroke();
  ctx.lineWidth = 1;
  roundRectPath(ctx, 7, 7, w - 14, h - 14, 3.5);
  ctx.stroke();
  ctx.restore();
  mottle(ctx, w, h, 260, 0.35);
  speckle(ctx, w, h, '#fff', 261, 6);
}

/** Riso pause menu card (PAUSE_CARD.w × PAUSE_CARD.h) with torn top/bottom edges, side rules and pink header band. */
export function drawPauseCard(ctx: Ctx): void {
  const { w, h, tooth, depth } = PAUSE_CARD;
  ctx.save();
  zigzagReceiptPath(ctx, w, h, tooth, depth);
  ctx.clip();
  paperGrain(ctx, w, h, 310);
  drawPinkBand(ctx, w, h, 24, 28, w - 48, 36, 0.16, 311);
  inkLayer(ctx, 0, 0, w, h, (c) => {
    handLine(c, densify([[6, tooth + 2], [6, h - tooth - 2]], 10), 313, 1.8, INK.black);
    handLine(c, densify([[w - 6, tooth + 2], [w - 6, h - tooth - 2]], 10), 314, 1.8, INK.black);
    drawDashedRules(c, 24, w - 24, [72, 330]);
    c.fillStyle = INK.black;
    drawBarcode(c, w / 2 - 58, w / 2 + 58, 354, 12, 315);
    mottle(c, w, h, 312, 0.2);
  });
  ctx.restore();
}

// ---------------------------------------------------------------- next-ball dots

export const DOT_TEX = 10;
export const TARGET_TEX = 88;
export const TARGET_RING_R = 38;

/** Mid-air poster target ring in white (tint at runtime with pink/blue + MULTIPLY). */
export function drawTargetRing(ctx: Ctx): void {
  const c = TARGET_TEX / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, 36, 0, Math.PI * 2);
  ctx.arc(c, c, 27, 0, Math.PI * 2);
  ctx.clip('evenodd');
  fillHalftone(ctx, 0, 0, TARGET_TEX, TARGET_TEX, '#fff', 0.25, 3.5, INK_ANGLE.pink);
  ctx.restore();

  strokeWobbly(ctx, circlePoints(c, c, 37, 36), 341, 0.5, 2.6, '#fff');

  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.6;
  ctx.setLineDash([5, 4]);
  tracePath(ctx, wobblePoints(circlePoints(c, c, 27, 32), 342, 0.3));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    ctx.moveTo(c + dx * 22, c + dy * 22);
    ctx.lineTo(c + dx * 41, c + dy * 41);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  mottle(ctx, TARGET_TEX, TARGET_TEX, 340, 0.3);
}

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

/** Inks a text stamp may use. Never yellow: yellow type is too faint on paper. */
export const STAMP_INKS_ALLOWED: readonly number[] = [INK_HEX.pink, INK_HEX.blue, INK_HEX.black];

/** Default ink (INK_HEX tint) for each stamp when used at runtime: pink, blue or black only. */
export const STAMP_INK: Record<StampId, number> = {
  NICE: INK_HEX.blue, PASS: INK_HEX.pink, WRONG: INK_HEX.pink, PLUS_BALL: INK_HEX.blue,
  COMBO: INK_HEX.pink, DROPPED: INK_HEX.black, JOINED: INK_HEX.blue,
};

/** Replacement for a disallowed stamp ink (yellow, or any non-ink tint): black, the most legible on paper. */
export const STAMP_INK_FALLBACK = INK_HEX.black;

/**
 * Runtime tint for a text stamp printed in `ink` (InkName or INK_HEX value). Pink/blue/black pass
 * through; yellow (e.g. P3's player ink) or anything else becomes STAMP_INK_FALLBACK.
 */
export function stampTint(ink: InkName | number): number {
  const hex = typeof ink === 'number' ? ink : INK_HEX[ink];
  return STAMP_INKS_ALLOWED.includes(hex) ? hex : STAMP_INK_FALLBACK;
}
