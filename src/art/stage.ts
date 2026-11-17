/**
 * Stage background `riso:bg` (960×540 logical): grained paper with pale overprinted poster shapes
 * (yellow sun, pink zigzag, blue registration grid), crop marks, a color test strip, the black
 * floor band with ruler ticks, and the danger rule. Each ink is its own layer (own screen angle,
 * own mottle, own misregistration) multiplied onto the paper. The top ~70 px stays quiet for HUD.
 */
import { TUNING as T } from '../config/tuning';
import { INK } from './palette';
import { fillHalftone, misregOffset, mottle, paperGrain } from './riso';
import { MONO_FONT } from './type';
import { font, inkLayer, knockOut, type Pt } from './draw';

type Ctx = CanvasRenderingContext2D;

const W = T.width;
const H = T.height;
const F = T.floorY;
const D = T.dangerLineY;

/** Screen angles per ink, like real riso drums: they never moiré against each other much. */
const ANGLE = { yellow: 0, pink: 75, blue: 15, black: 45 } as const;

const SUN = { x: 700, y: 232, r: 160 };
/** Test strip box (paper window cut into the floor band, bottom-right). */
const STRIP = { x: 732, y: F + 9, w: 214, h: 24 };

function zigzag(cy: number, amp: number, half: number): Pt[] {
  const top: Pt[] = [], bot: Pt[] = [];
  for (let i = 0, x = -40; x <= W + 60; i++, x += 60) {
    const y = cy + (i % 2 ? amp : -amp);
    top.push([x, y - half]);
    bot.push([x, y + half]);
  }
  return [...top, ...bot.reverse()];
}

function yellowInk(c: Ctx): void {
  c.save();
  c.beginPath();
  c.arc(SUN.x, SUN.y, SUN.r, 0, Math.PI * 2);
  c.clip();
  fillHalftone(c, SUN.x - SUN.r, SUN.y - SUN.r, SUN.r * 2, SUN.r * 2, INK.yellow, 0.26, 8, ANGLE.yellow);
  c.restore();
  // thin solid rim so the disc has a printed edge
  c.beginPath();
  c.arc(SUN.x, SUN.y, SUN.r + 6, 0, Math.PI * 2);
  c.lineWidth = 2;
  c.strokeStyle = INK.yellow;
  c.stroke();
  mottle(c, W, H, 21, 0.3);
}

function pinkInk(c: Ctx): void {
  const band = zigzag(300, 30, 20);
  c.save();
  c.beginPath();
  band.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.clip();
  fillHalftone(c, 0, 230, W, 140, INK.pink, 0.17, 7, ANGLE.pink);
  c.restore();
  // danger rule
  c.save();
  c.setLineDash([10, 6]);
  c.lineWidth = 1.6;
  c.strokeStyle = INK.pink;
  c.beginPath();
  c.moveTo(58, D);
  c.lineTo(W, D);
  c.stroke();
  c.restore();
  mottle(c, W, H, 22, 0.25);
}

function blueInk(c: Ctx): void {
  c.save();
  c.strokeStyle = INK.blue;
  c.lineWidth = 0.8;
  c.lineCap = 'round';
  c.setLineDash([0.5, 4]); // dotted: a quiet layout grid, not a cage
  c.beginPath();
  for (let x = 40; x < W; x += 80) { c.moveTo(x, 84); c.lineTo(x, D - 10); }
  for (let y = 120; y < D - 10; y += 80) { c.moveTo(24, y); c.lineTo(W - 24, y); }
  c.stroke();
  // registration targets on the grid + an offset ring around the sun
  c.setLineDash([]);
  c.lineWidth = 1;
  for (const [x, y] of [[120, 200], [840, 440], [SUN.x, SUN.y]] as Pt[]) {
    c.beginPath();
    c.arc(x, y, 7, 0, Math.PI * 2);
    c.moveTo(x - 12, y); c.lineTo(x + 12, y);
    c.moveTo(x, y - 12); c.lineTo(x, y + 12);
    c.stroke();
  }
  c.setLineDash([2, 5]);
  c.beginPath();
  c.arc(SUN.x + 14, SUN.y - 10, SUN.r + 22, 0, Math.PI * 2);
  c.stroke();
  c.restore();
  mottle(c, W, H, 23, 0.3);
}

function cropMarks(c: Ctx): void {
  const m = 6, g = 18, len = 14;
  c.save();
  c.lineWidth = 0.9;
  c.strokeStyle = INK.black;
  c.beginPath();
  for (const [sx, sy] of [[1, 1], [-1, 1]] as Pt[]) {
    const x0 = sx > 0 ? 0 : W, y0 = sy > 0 ? 0 : H;
    c.moveTo(x0 + sx * m, y0 + sy * g); c.lineTo(x0 + sx * (m + len), y0 + sy * g);
    c.moveTo(x0 + sx * g, y0 + sy * m); c.lineTo(x0 + sx * g, y0 + sy * (m + len));
  }
  // side registration targets
  for (const x of [12, W - 12]) {
    c.moveTo(x + 5, 270); c.arc(x, 270, 5, 0, Math.PI * 2);
    c.moveTo(x - 9, 270); c.lineTo(x + 9, 270);
    c.moveTo(x, 261); c.lineTo(x, 279);
  }
  c.stroke();
  c.restore();
}

function blackInk(c: Ctx): void {
  cropMarks(c);
  // danger label
  c.fillStyle = INK.black;
  font(c, 7.5, MONO_FONT, 700);
  c.textBaseline = 'middle';
  c.fillText('DANGER', 12, D + 0.5);
  // floor band
  c.fillRect(0, F, W, H - F);
  knockOut(c, () => {
    c.beginPath();
    for (let x = 0; x <= W; x += 20) {
      const long = x % 100 === 0;
      c.rect(x - (long ? 0.7 : 0.5), F - 0.5, long ? 1.4 : 1, long ? 9 : 4.5);
    }
    // bottom crop marks, cut out of the band
    for (const x0 of [0, W]) {
      const s = x0 === 0 ? 1 : -1;
      c.rect(Math.min(x0 + s * 6, x0 + s * 20), H - 18.5, 14, 0.9);
      c.rect(x0 + s * 18 - 0.45, H - 20, 0.9, 14);
    }
    c.rect(STRIP.x, STRIP.y, STRIP.w, STRIP.h);
  });
  // knocked-out type on the floor
  c.save();
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = '#000';
  c.textBaseline = 'alphabetic';
  font(c, 6, MONO_FONT);
  for (let x = 100; x < W; x += 100) if (x < STRIP.x - 10) c.fillText(String(x), x + 2.5, F + 9);
  font(c, 10, MONO_FONT, 700);
  c.fillText('FLOOR — DO NOT TOUCH', 26, H - 9);
  c.restore();
  // test strip contents (black parts): halftone steps + label + keyline
  const sx = STRIP.x + 6, sy = STRIP.y + 5, sw = 14, sh = 14;
  [0.25, 0.5, 0.75].forEach((d, i) => {
    const x = sx + (4 + i) * (sw + 2);
    c.save();
    c.beginPath();
    c.rect(x, sy, sw, sh);
    c.clip();
    fillHalftone(c, x, sy, sw, sh, INK.black, d, 2.4, ANGLE.black);
    c.restore();
  });
  c.strokeStyle = INK.black;
  c.lineWidth = 0.6;
  c.strokeRect(sx - 0.5, sy - 0.5, 7 * (sw + 2) - 1, sh + 1);
  font(c, 6.5, MONO_FONT, 700);
  c.textBaseline = 'middle';
  c.fillText('KIU-01 · RISO PROOF', sx + 7 * (sw + 2) + 4, sy + sh / 2 + 0.5);
  mottle(c, W, H, 24, 0.22);
}

/** Color swatches for the test strip, one per ink, drawn as separate overprinted passes. */
function swatch(ctx: Ctx, i: number, color: string): void {
  const x = STRIP.x + 6 + i * 16, y = STRIP.y + 5;
  inkLayer(ctx, x - 2, y - 2, 18, 18, (c) => {
    c.fillStyle = color;
    c.fillRect(x, y, 14, 14);
    c.translate(x, y);
    mottle(c, 14, 14, 60 + i, 0.35);
  }, misregOffset(60 + i));
}

/** Draw the whole stage background (W×H logical) on ctx. */
export function drawStage(ctx: Ctx): void {
  paperGrain(ctx, W, H, 11);
  inkLayer(ctx, 0, 0, W, H, yellowInk, misregOffset(1));
  inkLayer(ctx, 0, 0, W, H, pinkInk, misregOffset(2));
  inkLayer(ctx, 0, 0, W, H, blueInk, misregOffset(3));
  inkLayer(ctx, 0, 0, W, H, blackInk);
  ([INK.pink, INK.blue, INK.yellow, INK.black] as string[]).forEach((c, i) => swatch(ctx, i, c));
}
