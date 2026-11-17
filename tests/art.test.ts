import { describe, it, expect } from 'vitest';
import {
  BODY_R, CHAR_R, CHAR_TEX, EYE_LAYOUT, EYE_LINE_W, OUTLINE_W, PUPIL_TEX_R,
  charMisreg, charOutlineExtent, eyeOutline, pupilPos, pupilScale,
} from '../src/art/characters';
import { SHADOW_STEPS, ballArt, ballLineExtent, ballMisreg, ballSpinTicks, shadowDensity, shadowStep, shadowTexSize } from '../src/art/ball';
import { SPLAT_SIZE, STAMP_IDS, STAMP_TEXT, formatRank, formatScore, splatLineExtent, splatMaxExtent, splatShapes } from '../src/art/ui';
import { PLAY_FIELD, STAGE_QUIET_Y, stageInkCoverage, sunTopY } from '../src/art/stage';
import { polygonClearance, shapePoints, type Pt } from '../src/art/draw';
import { jitterDots, halftoneDots } from '../src/art/riso';
import { INK_ANGLE } from '../src/art/palette';
import { BOIL_VARIANTS, RISO_KEYS, allRisoKeys } from '../src/art/textures';
import { TUNING } from '../src/config/tuning';
import type { PlayerId } from '../src/config/players';

const IDS: PlayerId[] = [0, 1, 2];

describe('characters', () => {
  it('has two eyes for every player', () => {
    for (const id of IDS) expect(EYE_LAYOUT[id].eyes).toHaveLength(2);
  });
  it('body outline never leaves the texture', () => {
    expect(charOutlineExtent()).toBeLessThanOrEqual(CHAR_R + 1e-9);
    expect(charOutlineExtent()).toBeCloseTo(CHAR_R, 9); // feet touch the bottom edge
  });
  it('eye whites sit inside the outline (BODY_R minus half the line width)', () => {
    const inner = BODY_R - OUTLINE_W / 2;
    for (const id of IDS) {
      for (let i = 0; i < 2; i++) {
        for (const [x, y] of eyeOutline(id, i).pts) expect(Math.hypot(x, y) + EYE_LINE_W / 2).toBeLessThan(inner);
      }
    }
  });
  it('pupil stays inside its eye white at every look direction, for both facings', () => {
    for (const id of IDS) {
      const L = EYE_LAYOUT[id];
      expect(L.maxPupilOffset).toBeLessThan(L.eyeRadius);
      for (const facing of [1, -1] as const) {
        for (let i = 0; i < 2; i++) {
          const poly: Pt[] = eyeOutline(id, i).pts.map(([x, y]) => [facing * x, y - CHAR_R]);
          const dirs: Pt[] = [[0, 0]];
          for (let a = 0; a < 32; a++) dirs.push([Math.cos((a / 32) * Math.PI * 2), Math.sin((a / 32) * Math.PI * 2)]);
          for (const [lx, ly] of dirs) {
            const p = pupilPos(id, i, lx, ly, facing);
            expect(polygonClearance(poly, [p.x, p.y])).toBeGreaterThanOrEqual(L.pupilRadius + EYE_LINE_W / 2 - 1e-6);
          }
        }
      }
    }
  });
  it("PIK's narrow eyes allow less vertical travel than BLOOP's round ones", () => {
    expect(EYE_LAYOUT[0].maxPupilOffsetY).toBeLessThan(EYE_LAYOUT[1].maxPupilOffsetY);
  });
  it('pupilPos: rest when not looking, mirrored by facing, relative to bottom-center origin', () => {
    const e = EYE_LAYOUT[1].eyes[0];
    expect(pupilPos(1, 0, 0, 0, 1)).toEqual({ x: e.x, y: e.y - CHAR_R });
    expect(pupilPos(1, 0, 0, 0, -1)).toEqual({ x: -e.x, y: e.y - CHAR_R });
    const right = pupilPos(1, 0, 100, 0, 1);
    expect(right.x - e.x).toBeCloseTo(EYE_LAYOUT[1].maxPupilOffset);
    const left = pupilPos(1, 0, -100, 0, -1);
    expect(left.x + e.x).toBeCloseTo(-EYE_LAYOUT[1].maxPupilOffset);
  });
  it('pupil scale maps the shared texture to each pupil radius', () => {
    for (const id of IDS) expect(pupilScale(id) * PUPIL_TEX_R).toBeCloseTo(EYE_LAYOUT[id].pupilRadius);
  });
  it('body texture: diameter + side/top padding, body on the bottom edge', () => {
    expect(CHAR_TEX.w).toBe(TUNING.playerWidth + 8);
    expect(CHAR_TEX.cy + CHAR_R).toBe(CHAR_TEX.h);
    expect(CHAR_TEX.originY).toBe(1);
  });
  it('misregistration offsets are fixed and 1–2 px', () => {
    for (const id of IDS) {
      for (const m of [charMisreg(id), ballMisreg(id)]) {
        const d = Math.hypot(m.dx, m.dy);
        expect(d).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(d).toBeLessThanOrEqual(2 + 1e-9);
      }
      expect(charMisreg(id)).toEqual(charMisreg(id));
    }
  });
});

describe('ball art', () => {
  it('shadow density rises monotonically from ~0.08 to ~0.85', () => {
    expect(shadowDensity(0)).toBeCloseTo(0.08, 5);
    expect(shadowDensity(SHADOW_STEPS - 1)).toBeCloseTo(0.85, 5);
    for (let n = 1; n < SHADOW_STEPS; n++) expect(shadowDensity(n)).toBeGreaterThan(shadowDensity(n - 1));
  });
  it('shadowStep: high → 0, on the floor → max, clamped and monotonic', () => {
    expect(shadowStep(400, 400)).toBe(0);
    expect(shadowStep(9999, 400)).toBe(0);
    expect(shadowStep(0, 400)).toBe(SHADOW_STEPS - 1);
    expect(shadowStep(-20, 400)).toBe(SHADOW_STEPS - 1);
    let prev = Infinity;
    for (let h = 0; h <= 400; h += 5) {
      const s = shadowStep(h, 400);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeLessThanOrEqual(prev);
      prev = s;
    }
  });
  it('sizes scale with the radius and the ring never clips', () => {
    const small = ballArt(20), big = ballArt(70);
    for (const k of ['size', 'inkR', 'shapeSize', 'shadowW', 'shadowH'] as const) {
      expect(big[k]).toBeGreaterThan(small[k]);
    }
    for (const r of [20, 44, 70]) {
      const a = ballArt(r);
      expect(ballLineExtent(r)).toBeLessThanOrEqual(a.size / 2);
      expect(a.shadowW).toBeCloseTo(2 * r);
      expect(a.shadowH).toBeCloseTo(0.35 * r);
      const s = shadowTexSize(r);
      expect(s.w).toBeGreaterThanOrEqual(a.shadowW);
      expect(s.h).toBeGreaterThanOrEqual(a.shadowH);
    }
  });
  it('spin mark is two straight ticks on the upper-left only (never a face)', () => {
    for (const r of [20, 44, 70]) {
      const a = ballArt(r);
      const c = a.size / 2;
      for (let v = 0; v < BOIL_VARIANTS; v++) {
        const ticks = ballSpinTicks(r, v);
        expect(ticks).toHaveLength(2);
        for (const [x1, y1, x2, y2] of ticks) {
          for (const [x, y] of [[x1, y1], [x2, y2]]) {
            expect(x).toBeLessThan(c); // left half
            expect(y).toBeLessThan(c); // top half: nothing below the shape that could read as a mouth
            const d = Math.hypot(x - c, y - c);
            expect(d).toBeGreaterThan(a.shapeSize * 1.2); // clear of the player-shape knockout
            expect(d).toBeLessThan(r - a.ring); // inside the ring
          }
        }
        // parallel (same direction)
        const dir = ticks.map(([x1, y1, x2, y2]) => Math.atan2(y2 - y1, x2 - x1));
        expect(dir[0]).toBeCloseTo(dir[1], 6);
      }
    }
  });
});

describe('ui + stage', () => {
  it('lists every stamp id with its text', () => {
    expect([...STAMP_IDS]).toEqual(['NICE', 'PASS', 'WRONG', 'PLUS_BALL', 'COMBO', 'DROPPED', 'JOINED']);
    expect(STAMP_TEXT.PLUS_BALL).toBe('+1 BALL');
  });
  it('formats receipt numbers like a till', () => {
    expect(formatScore(12840)).toBe('12 840');
    expect(formatScore(950)).toBe('950');
    expect(formatScore(1234567)).toBe('1 234 567');
    expect(formatRank(1)).toBe('01');
    expect(formatRank(12)).toBe('12');
  });
  it('splat ink stays inside its texture', () => {
    expect(splatMaxExtent()).toBeLessThanOrEqual(SPLAT_SIZE / 2);
    expect(splatLineExtent()).toBeLessThanOrEqual(SPLAT_SIZE / 2);
  });
  it('splat keyline traces the same outlines as the fill, per variant', () => {
    for (let v = 0; v < BOIL_VARIANTS; v++) {
      const a = splatShapes(v);
      expect(a).toEqual(splatShapes(v));
      expect(a.length).toBeGreaterThanOrEqual(3); // blot + 2..3 drops
      for (const s of a) for (const [x, y] of s) expect(Math.hypot(x - SPLAT_SIZE / 2, y - SPLAT_SIZE / 2)).toBeLessThanOrEqual(splatMaxExtent());
    }
    expect(splatShapes(0)).not.toEqual(splatShapes(1));
  });
  it('the sun keeps the HUD band quiet', () => {
    expect(sunTopY()).toBeGreaterThanOrEqual(STAGE_QUIET_Y);
  });
  it('play field stays calm: each decorative ink covers ≤ 12% of it', () => {
    expect(PLAY_FIELD.y).toBe(STAGE_QUIET_Y);
    expect(PLAY_FIELD.y + PLAY_FIELD.h).toBe(TUNING.floorY);
    const cov = stageInkCoverage();
    for (const ink of ['pink', 'blue', 'yellow', 'black'] as const) {
      expect(cov[ink]).toBeGreaterThanOrEqual(0);
      expect(cov[ink]).toBeLessThanOrEqual(0.12);
    }
    // not a blank page: the poster shapes are still there
    expect(cov.yellow + cov.pink + cov.blue).toBeGreaterThan(0.005);
  });
  it('no ball-sized patch of the play field is busy (≤ 12% per ink in any 120 px window)', () => {
    for (let y = PLAY_FIELD.y; y + 120 <= PLAY_FIELD.y + PLAY_FIELD.h; y += 20) {
      for (let x = 0; x + 120 <= PLAY_FIELD.w; x += 40) {
        const cov = stageInkCoverage({ x, y, w: 120, h: 120 });
        for (const v of Object.values(cov)) expect(v).toBeLessThanOrEqual(0.12);
      }
    }
  });
  it('coverage measures what is there (a window over the sun sees yellow)', () => {
    expect(stageInkCoverage({ x: 780, y: 420, w: 120, h: 80 }).yellow).toBeGreaterThan(0.03);
    expect(stageInkCoverage({ x: 300, y: 100, w: 120, h: 120 }).yellow).toBe(0);
  });
});

describe('shapes, halftone jitter, keys', () => {
  it('shape outlines stay within ~size of the center', () => {
    for (const shape of ['triangle', 'circle', 'square'] as const) {
      for (const [x, y] of shapePoints(shape, 10, 10, 5)) expect(Math.hypot(x - 10, y - 10)).toBeLessThanOrEqual(5 * 1.3);
    }
  });
  it('jitterDots is deterministic and bounded (±0.2 px, ±10% radius)', () => {
    const dots = halftoneDots(60, 60, 0.4, 6);
    const a = jitterDots(dots, 3), b = jitterDots(dots, 3);
    expect(a).toEqual(b);
    a.forEach((d, i) => {
      expect(Math.abs(d.x - dots[i].x)).toBeLessThanOrEqual(0.2);
      expect(Math.abs(d.y - dots[i].y)).toBeLessThanOrEqual(0.2);
      expect(Math.abs(d.r / dots[i].r - 1)).toBeLessThanOrEqual(0.1 + 1e-9);
    });
  });
  it('every ink has a distinct screen angle', () => {
    expect(new Set(Object.values(INK_ANGLE)).size).toBe(4);
  });
  it('enumerates every riso key once, all prefixed', () => {
    const keys = allRisoKeys();
    const expected = 6 + 3 + 3 * BOIL_VARIANTS + 3 + BOIL_VARIANTS + 2 * SHADOW_STEPS + STAMP_IDS.length + 2 * BOIL_VARIANTS + 3;
    expect(keys).toHaveLength(expected);
    expect(expected).toBe(56);
    for (let v = 0; v < BOIL_VARIANTS; v++) expect(keys).toContain(RISO_KEYS.splatLine(v));
    for (const k of keys) expect(k.startsWith('riso:')).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(RISO_KEYS.stamp('PLUS_BALL'));
  });
});
