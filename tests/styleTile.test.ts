import { describe, it, expect } from 'vitest';
import {
  BLINK_PERIOD_STEPS, BOIL_MS, JOLT_MS, JOLT_PX, STEP_MS, boilVariant, facingToward, idlePose, inkPunch, joltOffset,
  quantizeTime, shadowChoice, slamScale, spinAngle, arrowBob, arrowVisible, offscreenScale, spawnPulse, stepSquash,
} from '../src/art/motion';
import { INK_CYCLE_MS, ballInkAt, demoBallPos, demoWrongHit, dotsFilledAt, periodIndex } from '../src/art/styleTileMotion';
import { SHADOW_STEPS } from '../src/art/ball';
import { allRisoKeys } from '../src/art/textures';
import { STAMP_IDS, STAMP_INK, STAMP_INKS_ALLOWED, STAMP_INK_FALLBACK, stampTint } from '../src/art/ui';
import { splatNeedsKeyline } from '../src/art/splat';
import { INK_HEX, PLAYER_INK } from '../src/art/palette';
import { TUNING as T } from '../src/config/tuning';
import { STAGE_QUIET_Y } from '../src/art/stage';

describe('motion (runtime timing)', () => {
  it('quantizes time to steps', () => {
    expect(quantizeTime(0)).toBe(0);
    expect(quantizeTime(STEP_MS - 1)).toBe(0);
    expect(quantizeTime(STEP_MS * 3 + 5)).toBe(STEP_MS * 3);
    expect(quantizeTime(-5)).toBe(0);
  });
  it('boil cycles 0,1,2 every 125 ms', () => {
    expect([0, 1, 2, 3].map((i) => boilVariant(i * BOIL_MS + 1))).toEqual([0, 1, 2, 0]);
  });
  it('spin is stepped', () => {
    expect(spinAngle(5)).toBe(spinAngle(0));
    expect(spinAngle(500)).toBeGreaterThan(spinAngle(0));
  });
  it('shadow switches to danger exactly below dangerLineY', () => {
    const atLine = T.dangerLineY;
    expect(shadowChoice(atLine).danger).toBe(false);
    expect(shadowChoice(atLine + 0.01).danger).toBe(true);
    expect(shadowChoice(atLine + 0.01).key).toMatch(/^riso:shadowDanger:\d$/);
    expect(shadowChoice(atLine).key).toMatch(/^riso:shadow:\d$/);
  });
  it('shadow step increases as the ball falls and keys exist', () => {
    const keys = new Set(allRisoKeys());
    let prev = -1;
    for (let b = 100; b <= T.floorY; b += 5) {
      const s = shadowChoice(b);
      expect(s.step).toBeGreaterThanOrEqual(prev);
      prev = s.step;
      expect(keys.has(s.key)).toBe(true);
    }
    expect(prev).toBe(SHADOW_STEPS - 1);
    expect(shadowChoice(T.floorY - T.shadowMaxHeight).step).toBe(0);
  });
  it('facing and ink punch', () => {
    expect(facingToward(100, 200)).toBe(1);
    expect(facingToward(100, 50)).toBe(-1);
    expect(inkPunch(10).sx).toBeGreaterThan(1);
    expect(inkPunch(500)).toEqual({ sx: 1, sy: 1 });
  });
  it('slam scale steps down from 1.4 to 1 and never increases', () => {
    expect(slamScale(0)).toBe(1.4);
    expect(slamScale(Infinity)).toBe(1);
    let prev = 2;
    for (let t = 0; t < 300; t += 10) { const s = slamScale(t); expect(s).toBeLessThanOrEqual(prev); prev = s; }
  });
  it('joltOffset is active only for JOLT_MS after a wrong hit', () => {
    expect(joltOffset(0).dx).toBe(JOLT_PX);
    expect(joltOffset(JOLT_MS - 1).dx).toBe(JOLT_PX);
    expect(joltOffset(JOLT_MS)).toEqual({ dx: 0, dy: 0 });
    expect(joltOffset(-1)).toEqual({ dx: 0, dy: 0 });
    expect(joltOffset(Infinity)).toEqual({ dx: 0, dy: 0 });
  });
  it('idle poses are stepped; BRICK blinks for exactly 2 steps per period', () => {
    for (const id of [0, 1, 2] as const) expect(idlePose(id, 100)).toEqual(idlePose(id, 150));
    const blinks = Array.from({ length: BLINK_PERIOD_STEPS * 3 }, (_, i) => idlePose(2, i * STEP_MS + 1).blink);
    expect(blinks.filter(Boolean).length).toBe(6);
    expect(blinks.slice(0, 3)).toEqual([true, true, false]);
    expect(idlePose(0, 50).blink).toBe(false);
  });
});

describe('style tile demo schedules', () => {
  it('demo ball path stays on stage, above the floor and below the quiet band', () => {
    const r = T.ballRadius;
    for (let t = 0; t < 120000; t += 37) {
      const p = demoBallPos(t, r);
      expect(p.x - r).toBeGreaterThanOrEqual(0);
      expect(p.x + r).toBeLessThanOrEqual(T.width);
      expect(p.y + r).toBeLessThanOrEqual(T.floorY);
      expect(p.y - r).toBeGreaterThanOrEqual(STAGE_QUIET_Y);
    }
  });
  it('path reaches both safe and danger heights', () => {
    const r = T.ballRadius;
    const flags = new Set<boolean>();
    for (let t = 0; t < 20000; t += 20) flags.add(shadowChoice(demoBallPos(t, r).y + r).danger);
    expect(flags.size).toBe(2);
  });
  it('wrong-hit scheduler rotates characters every 3 s', () => {
    expect(demoWrongHit(0)).toEqual({ id: 0, msSince: 0 });
    expect(demoWrongHit(3050)).toEqual({ id: 1, msSince: 50 });
    expect(demoWrongHit(6050).id).toBe(2);
    expect(demoWrongHit(9050).id).toBe(0);
  });
  it('ink cycle and period index', () => {
    expect([0, INK_CYCLE_MS - 1, INK_CYCLE_MS, 2 * INK_CYCLE_MS, 3 * INK_CYCLE_MS].map(ballInkAt)).toEqual([0, 0, 1, 2, 0]);
    expect(periodIndex(2999, 3000)).toBe(0);
    expect(periodIndex(3000, 3000)).toBe(1);
  });
  it('dots advance once per second and loop within 1..30', () => {
    expect(dotsFilledAt(0)).toBe(12);
    expect(dotsFilledAt(999)).toBe(12);
    expect(dotsFilledAt(1000)).toBe(13);
    expect(dotsFilledAt(18000)).toBe(30);
    expect(dotsFilledAt(19000)).toBe(1);
  });
});

describe('stamp inks', () => {
  it('every stamp has an ink', () => {
    for (const id of STAMP_IDS) expect(typeof STAMP_INK[id]).toBe('number');
  });
  it('no text stamp is yellow (too faint on paper): pink, blue or black only', () => {
    expect(STAMP_INKS_ALLOWED).not.toContain(INK_HEX.yellow);
    for (const id of STAMP_IDS) {
      expect(STAMP_INK[id]).not.toBe(INK_HEX.yellow);
      expect(STAMP_INKS_ALLOWED).toContain(STAMP_INK[id]);
    }
  });
  it('yellow splats get the black keyline, pink/blue do not', () => {
    expect(splatNeedsKeyline(INK_HEX.yellow)).toBe(true);
    expect(splatNeedsKeyline(INK_HEX.pink)).toBe(false);
    expect(splatNeedsKeyline(INK_HEX.blue)).toBe(false);
    expect(splatNeedsKeyline('yellow')).toBe(true);
    expect(splatNeedsKeyline('pink')).toBe(false);
    expect(splatNeedsKeyline('black')).toBe(false);
  });
  it('stampTint never returns yellow: allowed inks pass, yellow falls back to black', () => {
    expect(STAMP_INK_FALLBACK).toBe(INK_HEX.black);
    expect(stampTint('yellow')).toBe(INK_HEX.black);
    expect(stampTint(INK_HEX.yellow)).toBe(INK_HEX.black);
    expect(stampTint(0x123456)).toBe(INK_HEX.black);
    for (const ink of ['pink', 'blue', 'black'] as const) {
      expect(stampTint(ink)).toBe(INK_HEX[ink]);
      expect(stampTint(INK_HEX[ink])).toBe(INK_HEX[ink]);
    }
    // the natural lobby call: player ink for P3 is yellow
    expect(stampTint(PLAYER_INK[2])).not.toBe(INK_HEX.yellow);
    for (const id of STAMP_IDS) expect(stampTint(STAMP_INK[id])).toBe(STAMP_INK[id]);
  });
});

describe('play-field runtime timing', () => {
  it('turn-arrow blink is stepped visibility and faster with several balls', () => {
    const flips = (fast: boolean) => {
      let n = 0;
      for (let t = 0; t < 2000; t += 10) if (arrowVisible(t, fast) !== arrowVisible(t + 10, fast)) n++;
      return n;
    };
    expect(arrowVisible(0, false)).toBe(true);
    expect(flips(true)).toBeGreaterThan(flips(false));
    expect(flips(false)).toBeGreaterThan(0);
  });
  it('arrow bob takes only two positions', () => {
    const vals = new Set<number>();
    for (let t = 0; t < 3000; t += 7) vals.add(arrowBob(t));
    expect([...vals].sort()).toEqual([-3, 0]);
  });
  it('off-screen indicator scale is stepped, clamped and grows as the ball comes back', () => {
    expect(offscreenScale(-10000)).toBeCloseTo(0.6);
    expect(offscreenScale(0)).toBeCloseTo(1.2);
    expect(offscreenScale(-100)).toBeGreaterThanOrEqual(offscreenScale(-300));
    for (let y = -800; y <= 0; y += 13) expect(Math.round(offscreenScale(y) * 5)).toBeCloseTo(offscreenScale(y) * 5);
  });
  it('spawn pulse and squash are stepped', () => {
    const vals = new Set<number>();
    for (let t = 0; t < 2000; t += 5) vals.add(spawnPulse(t));
    expect(vals.size).toBeLessThanOrEqual(3);
    expect(Math.min(...vals)).toBe(1);
    expect(stepSquash(0.013)).toBe(0);
    expect(stepSquash(-0.25)).toBe(-0.25);
  });
});
