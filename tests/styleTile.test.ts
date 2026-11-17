import { describe, it, expect } from 'vitest';
import {
  BOIL_MS, STEP_MS, ballInkAt, boilVariant, demoBallPos, dotsFilledAt, facingToward, idlePose, inkPunch,
  joltAt, quantizeTime, shadowChoice, slamScale,
} from '../src/art/styleTileMotion';
import { RISO_KEYS, allRisoKeys } from '../src/art/textures';
import { TUNING as T } from '../src/config/tuning';
import { STAGE_QUIET_Y } from '../src/art/stage';

describe('style tile motion', () => {
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
    for (let t = 0; t < 20000; t += 20) flags.add(shadowChoice(demoBallPos(t, r).y, r).danger);
    expect(flags.size).toBe(2);
  });
  it('shadow switches to danger exactly below dangerLineY', () => {
    const r = 40;
    const atLine = T.dangerLineY - r;
    expect(shadowChoice(atLine, r).danger).toBe(false);
    expect(shadowChoice(atLine + 0.01, r).danger).toBe(true);
    expect(shadowChoice(atLine + 0.01, r).key).toMatch(/^riso:shadowDanger:\d$/);
    expect(shadowChoice(atLine, r).key).toMatch(/^riso:shadow:\d$/);
  });
  it('shadow step increases as the ball falls and keys exist', () => {
    const r = 40;
    const keys = new Set(allRisoKeys());
    let prev = -1;
    for (let y = 100; y <= T.floorY - r; y += 5) {
      const s = shadowChoice(y, r);
      expect(s.step).toBeGreaterThanOrEqual(prev);
      prev = s.step;
      expect(keys.has(s.key)).toBe(true);
    }
    expect(prev).toBe(7);
  });
  it('quantizes time to steps', () => {
    expect(quantizeTime(0)).toBe(0);
    expect(quantizeTime(STEP_MS - 1)).toBe(0);
    expect(quantizeTime(STEP_MS * 3 + 5)).toBe(STEP_MS * 3);
    expect(quantizeTime(-5)).toBe(0);
  });
  it('boil cycles 0,1,2 every 125 ms', () => {
    expect([0, 1, 2, 3].map((i) => boilVariant(i * BOIL_MS + 1))).toEqual([0, 1, 2, 0]);
  });
  it('facing, ink cycle and punches', () => {
    expect(facingToward(100, 200)).toBe(1);
    expect(facingToward(100, 50)).toBe(-1);
    expect([0, 1999, 2000, 4000, 6000].map(ballInkAt)).toEqual([0, 0, 1, 2, 0]);
    expect(inkPunch(10).sx).toBeGreaterThan(1);
    expect(inkPunch(500)).toEqual({ sx: 1, sy: 1 });
    expect(slamScale(0)).toBe(1.4);
    expect(slamScale(10000)).toBe(1);
  });
  it('slam scale never increases', () => {
    let prev = 2;
    for (let t = 0; t < 300; t += 10) { const s = slamScale(t); expect(s).toBeLessThanOrEqual(prev); prev = s; }
  });
  it('jolt is active for 120 ms each 3 s and rotates characters', () => {
    expect(joltAt(0).active).toBe(true);
    expect(joltAt(119).active).toBe(true);
    expect(joltAt(121).active).toBe(false);
    expect(joltAt(3050).id).toBe(1);
    expect(joltAt(6050).id).toBe(2);
    expect(joltAt(121).dx).toBe(0);
  });
  it('dots advance once per second and loop within 1..30', () => {
    expect(dotsFilledAt(0)).toBe(12);
    expect(dotsFilledAt(999)).toBe(12);
    expect(dotsFilledAt(1000)).toBe(13);
    expect(dotsFilledAt(18000)).toBe(30);
    expect(dotsFilledAt(19000)).toBe(1);
  });
  it('idle poses are stepped and BRICK blinks briefly', () => {
    for (const id of [0, 1, 2] as const) {
      expect(idlePose(id, 100)).toEqual(idlePose(id, 150));
    }
    expect(idlePose(2, 50).blink).toBe(true);
    expect(idlePose(2, 1000).blink).toBe(false);
    expect(RISO_KEYS.bg).toBe('riso:bg');
  });
});
