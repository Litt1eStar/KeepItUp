import { describe, it, expect } from 'vitest';
import { CHAR_R, CHAR_TEX, EYE_LAYOUT } from '../src/art/characters';
import { SHADOW_STEPS, ballArt, shadowDensity, shadowTexSize } from '../src/art/ball';
import { STAMP_IDS, STAMP_TEXT, formatRank, formatScore } from '../src/art/ui';
import { shapePoints } from '../src/art/draw';
import { RISO_KEYS } from '../src/art/textures';
import { TUNING } from '../src/config/tuning';
import type { PlayerId } from '../src/config/players';

const IDS: PlayerId[] = [0, 1, 2];

describe('EYE_LAYOUT', () => {
  it('has two eyes for every player', () => {
    for (const id of IDS) expect(EYE_LAYOUT[id].eyes).toHaveLength(2);
  });
  it('keeps eyes (and pupil travel) inside the body', () => {
    for (const id of IDS) {
      const L = EYE_LAYOUT[id];
      for (const e of L.eyes) expect(Math.hypot(e.x, e.y) + L.eyeRadius).toBeLessThan(CHAR_R);
    }
  });
  it('pupil travel stays inside the eye', () => {
    for (const id of IDS) {
      const L = EYE_LAYOUT[id];
      expect(L.maxPupilOffset).toBeLessThan(L.eyeRadius);
      expect(L.maxPupilOffsetY).toBeLessThanOrEqual(L.maxPupilOffset + 1e-9);
      expect(L.pupilRadius).toBeLessThan(L.eyeRadius);
    }
  });
  it("PIK's narrow eyes allow less vertical travel than BLOOP's round ones", () => {
    expect(EYE_LAYOUT[0].maxPupilOffsetY).toBeLessThan(EYE_LAYOUT[1].maxPupilOffsetY);
  });
  it('body texture: diameter + side/top padding, body on the bottom edge', () => {
    expect(CHAR_TEX.w).toBe(TUNING.playerWidth + 8);
    expect(CHAR_TEX.cy + CHAR_R).toBe(CHAR_TEX.h);
    expect(CHAR_TEX.originY).toBe(1);
  });
});

describe('ball art', () => {
  it('shadow density rises monotonically from ~0.08 to ~0.85', () => {
    expect(shadowDensity(0)).toBeCloseTo(0.08, 5);
    expect(shadowDensity(SHADOW_STEPS - 1)).toBeCloseTo(0.85, 5);
    for (let n = 1; n < SHADOW_STEPS; n++) expect(shadowDensity(n)).toBeGreaterThan(shadowDensity(n - 1));
  });
  it('sizes scale with the radius', () => {
    const small = ballArt(20), big = ballArt(70);
    for (const k of ['size', 'inkR', 'shapeSize', 'shadowW', 'shadowH'] as const) {
      expect(big[k]).toBeGreaterThan(small[k]);
    }
    for (const r of [20, 44, 70]) {
      const a = ballArt(r);
      expect(a.size).toBeGreaterThanOrEqual(2 * r);
      expect(a.shadowW).toBeCloseTo(2 * r);
      expect(a.shadowH).toBeCloseTo(0.35 * r);
      const s = shadowTexSize(r);
      expect(s.w).toBeGreaterThanOrEqual(a.shadowW);
      expect(s.h).toBeGreaterThanOrEqual(a.shadowH);
    }
  });
});

describe('ui', () => {
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
});

describe('shapes + keys', () => {
  it('shape outlines stay within ~size of the center', () => {
    for (const shape of ['triangle', 'circle', 'square'] as const) {
      for (const [x, y] of shapePoints(shape, 10, 10, 5)) expect(Math.hypot(x - 10, y - 10)).toBeLessThanOrEqual(5 * 1.3);
    }
  });
  it('all riso keys are prefixed and distinct', () => {
    const keys = [
      RISO_KEYS.bg, RISO_KEYS.pupil, RISO_KEYS.speedlines, RISO_KEYS.receipt, RISO_KEYS.dot, RISO_KEYS.dotEmpty,
      ...IDS.flatMap((id) => [RISO_KEYS.charFill(id), RISO_KEYS.charLine(id, 0), RISO_KEYS.ballFill(id), RISO_KEYS.ticket(id)]),
      RISO_KEYS.ballLine(0), RISO_KEYS.shadow(0), RISO_KEYS.shadowDanger(0), RISO_KEYS.stamp('NICE'), RISO_KEYS.splat(0),
    ];
    for (const k of keys) expect(k.startsWith('riso:')).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
