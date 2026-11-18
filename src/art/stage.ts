/**
 * Stage background `riso:bg` (960×540 logical): grained paper with pale overprinted poster shapes,
 * crop marks, a color test strip, the black floor band with ruler ticks, and the danger rule.
 * Each ink is its own layer (own screen angle, own mottle, own misregistration) multiplied onto
 * the paper. The top ~70 px stays quiet for HUD.
 *
 * Readability rule: balls are flat pink/blue/yellow discs, so the play field (PLAY_FIELD) must stay
 * calm. Poster decoration lives at the margins: a small yellow sun rising from behind the floor
 * (bottom-right), a blue halftone quarter-disc (bottom-left), a thin pink zigzag strip just above
 * the floor, and a faint dotted blue grid. All decorative marks are described as data
 * (DOT_FILLS / STROKES) used both to draw and by stageInkCoverage(), which tests keep ≤ 12% per ink.
 */
import { TUNING as T } from '../config/tuning';
import { INK, INK_ANGLE as ANGLE, type InkName } from './palette';
import { circlePoints, fillHalftone, halftoneDots, misregOffset, mottle, paperGrain } from './riso';
import { MONO_FONT } from './type';
import { font, inkLayer, knockOut, polygonClearance, type Pt } from './draw';

type Ctx = CanvasRenderingContext2D;

const W = T.width;
const H = T.height;
const F = T.floorY;
const D = T.dangerLineY;

/** Top HUD band: no poster ink above this y (crop marks excepted). */
export const STAGE_QUIET_Y = 72;
/** Where balls fly: full width, from the HUD band down to the floor. */
export const PLAY_FIELD = { x: 0, y: STAGE_QUIET_Y, w: W, h: F - STAGE_QUIET_Y } as const;

/** Yellow sun rising from behind the floor band, bottom-right; its lower part is hidden by the floor. */
export const SUN = { x: 846, y: F + 14, r: 92 } as const;
const SUN_RIM_R = SUN.r + 5;
const RAY = { inner: SUN.r + 14, outer: SUN.r + 30, width: 1.4 } as const;
/** Blue dashed offset ring around the sun (a deliberate "misprinted" second impression). */
const SUN_RING = { x: SUN.x - 12, y: SUN.y - 8, r: SUN.r + 20 } as const;
/** Thin pink zigzag strip between the danger rule and the floor. */
const ZIG = { cy: F - 18, amp: 6, half: 4, step: 40 } as const;
/** Blue halftone quarter-disc in the bottom-left corner, rising from behind the floor. */
const BLUE_DISC = { x: 0, y: F, r: 84 } as const;

/** Topmost y reached by sun ink (yellow rays/rim or the blue offset ring). Pure, for tests. */
export function sunTopY(): number {
  return Math.min(SUN.y - RAY.outer - RAY.width, SUN.y - SUN_RIM_R - 1, SUN_RING.y - SUN_RING.r - 0.5);
}

/** Test strip box (paper window cut into the floor band, bottom-right). */
const STRIP = { x: 732, y: F + 9, w: 214, h: 24 };

// ---------------------------------------------------------------- decoration as data

type Seg = [number, number, number, number];

/** A halftone fill clipped to a closed polygon (and optionally above maxY). */
interface DotFill {
  ink: InkName;
  /** Halftone rect (grid origin = its center, like fillHalftone). */
  rect: [number, number, number, number];
  density: number;
  cell: number;
  poly: Pt[];
  maxY?: number;
}

/** Straight stroked segments of one ink; dash = [on, off]; round = round caps. */
interface StrokeSet {
  ink: InkName;
  width: number;
  dash?: [number, number];
  round?: boolean;
  segs: Seg[];
}

const poly2segs = (pts: Pt[], close = true): Seg[] =>
  pts.slice(0, close ? pts.length : -1).map(([x, y], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    return [x, y, x2, y2];
  });

/** Drop segments entirely at or below y = maxY (segments crossing it are kept whole; the floor hides the rest). */
const above = (segs: Seg[], maxY: number): Seg[] => segs.filter(([, y1, , y2]) => Math.min(y1, y2) < maxY);

function zigzag(cy: number, amp: number, half: number, step: number): Pt[] {
  const top: Pt[] = [], bot: Pt[] = [];
  for (let i = 0, x = -step; x <= W + step; i++, x += step) {
    const y = cy + (i % 2 ? amp : -amp);
    top.push([x, y - half]);
    bot.push([x, y + half]);
  }
  return [...top, ...bot.reverse()];
}

/** Every decorative halftone fill on the stage. */
export const DOT_FILLS: readonly DotFill[] = [
  {
    ink: 'yellow', density: 0.11, cell: 6, maxY: F,
    rect: [SUN.x - SUN.r, SUN.y - SUN.r, SUN.r * 2, SUN.r * 2],
    poly: circlePoints(SUN.x, SUN.y, SUN.r, 72),
  },
  {
    ink: 'pink', density: 0.16, cell: 5,
    rect: [0, ZIG.cy - ZIG.amp - ZIG.half - 2, W, (ZIG.amp + ZIG.half + 2) * 2],
    poly: zigzag(ZIG.cy, ZIG.amp, ZIG.half, ZIG.step),
  },
  {
    ink: 'blue', density: 0.12, cell: 6, maxY: F,
    rect: [BLUE_DISC.x - BLUE_DISC.r, BLUE_DISC.y - BLUE_DISC.r, BLUE_DISC.r * 2, BLUE_DISC.r * 2],
    poly: circlePoints(BLUE_DISC.x, BLUE_DISC.y, BLUE_DISC.r, 72),
  },
];

function sunRays(): Seg[] {
  const segs: Seg[] = [];
  for (let deg = -172; deg <= -8; deg += 12) {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a), s = Math.sin(a);
    segs.push([SUN.x + c * RAY.inner, SUN.y + s * RAY.inner, SUN.x + c * RAY.outer, SUN.y + s * RAY.outer]);
  }
  return above(segs, F);
}

function blueGrid(): Seg[] {
  const segs: Seg[] = [];
  for (let x = 40; x < W; x += 80) segs.push([x, 84, x, D - 10]);
  for (let y = 120; y < D - 10; y += 80) segs.push([24, y, W - 24, y]);
  return segs;
}

const REG_TARGETS: Pt[] = [[120, 200], [880, 168]];

function regTarget([x, y]: Pt, r: number, arm: number): Seg[] {
  return [...poly2segs(circlePoints(x, y, r, 24)), [x - arm, y, x + arm, y], [x, y - arm, x, y + arm]];
}

function cropSegs(): Seg[] {
  const m = 6, g = 18, len = 14;
  const segs: Seg[] = [];
  for (const [sx, sy] of [[1, 1], [-1, 1]] as Pt[]) {
    const x0 = sx > 0 ? 0 : W, y0 = sy > 0 ? 0 : H;
    segs.push([x0 + sx * m, y0 + sy * g, x0 + sx * (m + len), y0 + sy * g]);
    segs.push([x0 + sx * g, y0 + sy * m, x0 + sx * g, y0 + sy * (m + len)]);
  }
  // side registration targets
  for (const x of [12, W - 12]) segs.push(...regTarget([x, 270], 5, 9));
  return segs;
}

/** Every decorative / printer's-mark stroke on the stage (the danger rule included). */
export const STROKES: readonly StrokeSet[] = [
  { ink: 'yellow', width: 1.6, segs: above(poly2segs(circlePoints(SUN.x, SUN.y, SUN_RIM_R, 96)), F) },
  { ink: 'yellow', width: RAY.width, round: true, segs: sunRays() },
  { ink: 'pink', width: 1.6, dash: [10, 6], segs: [[58, D, W, D]] }, // danger rule
  { ink: 'blue', width: 0.8, dash: [0.5, 4], round: true, segs: blueGrid() },
  { ink: 'blue', width: 1, segs: REG_TARGETS.flatMap((p) => regTarget(p, 7, 12)) },
  { ink: 'blue', width: 1, dash: [2, 5], segs: above(poly2segs(circlePoints(SUN_RING.x, SUN_RING.y, SUN_RING.r, 96)), F) },
  { ink: 'black', width: 0.9, segs: cropSegs() },
];

// ---------------------------------------------------------------- coverage (pure)

/** Ink area per unit stroke length (dashes and round caps included). */
function areaPerLength(s: StrokeSet): number {
  if (!s.dash) return s.width;
  const [on, off] = s.dash;
  const cap = s.round ? Math.PI * (s.width / 2) ** 2 : 0;
  return (on * s.width + cap) / (on + off);
}

/**
 * Ink coverage (0..1) per ink of the decorative layers inside `rect` (default the play field):
 * halftone dot areas whose centers fall in the rect + stroke area sampled per 1 px of length.
 * Computed from the same DOT_FILLS / STROKES used to draw. Approximate (mottle and draw-time
 * jitter ignored).
 */
export function stageInkCoverage(
  rect: { x: number; y: number; w: number; h: number } = PLAY_FIELD,
): Record<InkName, number> {
  const area: Record<InkName, number> = { pink: 0, blue: 0, yellow: 0, black: 0 };
  const inRect = (x: number, y: number) => x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
  for (const f of DOT_FILLS) {
    const [rx, ry, rw, rh] = f.rect;
    for (const d of halftoneDots(rw, rh, f.density, f.cell, ANGLE[f.ink], { bleed: true })) {
      const x = rx + d.x, y = ry + d.y;
      if (!inRect(x, y) || (f.maxY !== undefined && y >= f.maxY)) continue;
      if (polygonClearance(f.poly, [x, y]) < 0) continue;
      area[f.ink] += Math.PI * d.r * d.r;
    }
  }
  for (const s of STROKES) {
    const k = areaPerLength(s);
    for (const [x1, y1, x2, y2] of s.segs) {
      const len = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.max(1, Math.ceil(len));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        if (inRect(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) area[s.ink] += (len / n) * k;
      }
    }
  }
  const total = rect.w * rect.h;
  return { pink: area.pink / total, blue: area.blue / total, yellow: area.yellow / total, black: area.black / total };
}

// ---------------------------------------------------------------- drawing

/** Mottle only the rect that actually carries this ink (full-stage mottle ×4 costs seconds at RS=3). */
function mottleRect(c: Ctx, x: number, y: number, w: number, h: number, seed: number, strength: number): void {
  c.save();
  c.translate(x, y);
  mottle(c, w, h, seed, strength);
  c.restore();
}

function drawFills(c: Ctx, ink: InkName): void {
  for (const f of DOT_FILLS) {
    if (f.ink !== ink) continue;
    const [x, y, w, h] = f.rect;
    c.save();
    c.beginPath();
    f.poly.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    c.closePath();
    c.clip();
    if (f.maxY !== undefined) {
      c.beginPath();
      c.rect(x - 1, y - 1, w + 2, f.maxY - y + 1);
      c.clip();
    }
    fillHalftone(c, x, y, w, h, INK[ink], f.density, f.cell, ANGLE[ink]);
    c.restore();
  }
}

function drawStrokes(c: Ctx, ink: InkName): void {
  for (const s of STROKES) {
    if (s.ink !== ink) continue;
    c.save();
    c.strokeStyle = INK[ink];
    c.lineWidth = s.width;
    c.lineCap = s.round ? 'round' : 'butt';
    c.lineJoin = 'round';
    c.setLineDash(s.dash ?? []);
    c.beginPath();
    for (const [x1, y1, x2, y2] of s.segs) { c.moveTo(x1, y1); c.lineTo(x2, y2); }
    c.stroke();
    c.restore();
  }
}

function yellowInk(c: Ctx): void {
  drawFills(c, 'yellow');
  drawStrokes(c, 'yellow');
  const R = RAY.outer + 2;
  mottleRect(c, SUN.x - R, SUN.y - R, R * 2, F - (SUN.y - R), 21, 0.3);
}

function pinkInk(c: Ctx): void {
  drawFills(c, 'pink');
  drawStrokes(c, 'pink');
  mottleRect(c, 0, ZIG.cy - 14, W, 28, 22, 0.25);
  mottleRect(c, 0, D - 3, W, 6, 25, 0.25);
}

function blueInk(c: Ctx): void {
  drawFills(c, 'blue');
  drawStrokes(c, 'blue');
  mottleRect(c, 0, BLUE_DISC.y - BLUE_DISC.r, BLUE_DISC.r, BLUE_DISC.r, 23, 0.3);
  // grid not mottled: the dotted hairlines are already broken; mottling 960×540 would cost ~0.5 s
}

function blackInk(c: Ctx): void {
  drawStrokes(c, 'black');
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
  c.fillText('Develop by Litt1eStar', 26, H - 9);
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
  mottleRect(c, 0, F, W, H - F, 24, 0.22);
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
