import { describe, it, expect } from 'vitest';
import {
  HUD, NICE_EVERY, POPUP_MS, POPUP_RISE, POPUP_STEP_MS, SPLAT_HOLD_STEPS, bestLabel, comboCountLabel, comboMultLabel,
  demoStripVisible, dotX, dotsFilled, formatClock, hudInQuietBand, isComboMilestone, niceDue, popupRise, readableInk, splatScale,
} from '../src/art/hud';
import { STEP_MS } from '../src/art/motion';
import { TUNING as T } from '../src/config/tuning';
import { comboMultiplier } from '../src/logic/Scoring';

describe('HUD labels + layout', () => {
  it('fills one next-ball dot per elapsed second, 0..interval', () => {
    const I = T.extraBallInterval;
    expect(dotsFilled(0, I)).toBe(0);
    expect(dotsFilled(0.99, I)).toBe(0);
    expect(dotsFilled(1, I)).toBe(1);
    expect(dotsFilled(29.9, I)).toBe(29);
    expect(dotsFilled(30, 60)).toBe(0); // just after the spawn, nextBallAt moved on
    expect(dotsFilled(45.5, 60)).toBe(15);
    expect(dotsFilled(99, 60)).toBe(I); // clamped
    expect(dotsFilled(-5, I)).toBe(0);
  });

  it('formats clock, combo and best', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(83.7)).toBe('1:23');
    expect(formatClock(600)).toBe('10:00');
    expect(comboMultLabel(comboMultiplier(13, T))).toBe('×2.3');
    expect(comboMultLabel(1)).toBe('×1.0');
    expect(comboCountLabel(12)).toBe('COMBO 12');
    expect(bestLabel(12840)).toBe('BEST 12 840');
    expect(bestLabel(0)).toBe('BEST 0');
  });

  it('keeps the HUD in the quiet top band and the dot row centered on stage', () => {
    expect(hudInQuietBand()).toBe(true);
    const n = T.extraBallInterval;
    expect(dotX(0, n) + dotX(n - 1, n)).toBeCloseTo(T.width);
    expect(dotX(n - 1, n) - dotX(0, n)).toBeLessThan(400);
    expect(HUD.demo.y).toBeGreaterThan(T.floorY);
    expect(HUD.demo.y).toBeLessThan(T.height);
  });

  it('prints yellow type in black', () => {
    expect(readableInk('yellow')).toBe('black');
    expect(readableInk('pink')).toBe('pink');
    expect(readableInk('blue')).toBe('blue');
  });
});

describe('stamp cadence', () => {
  it('combo milestones every 10', () => {
    expect(isComboMilestone(0)).toBe(false);
    expect(isComboMilestone(9)).toBe(false);
    expect(isComboMilestone(10)).toBe(true);
    expect(isComboMilestone(30)).toBe(true);
  });

  it('NICE every 5th consecutive correct hit, never on top of a milestone banner', () => {
    const hits = Array.from({ length: 20 }, (_, i) => i + 1).filter((s) => niceDue(s, false));
    expect(hits).toEqual([5, 10, 15, 20]);
    expect(NICE_EVERY).toBe(5);
    expect(niceDue(0, false)).toBe(false);
    expect(niceDue(10, true)).toBe(false);
  });
});

describe('stepped effect schedules', () => {
  it('splat holds full size, shrinks in two steps, then is done', () => {
    const seq = [0, 1, 2, 3, 4, 5, 6].map((s) => splatScale(s * STEP_MS + 1));
    expect(SPLAT_HOLD_STEPS).toBe(3);
    expect(seq).toEqual([1, 1, 1, 0.6, 0.3, 0, 0]);
    expect(splatScale(-10)).toBe(1);
    expect(splatScale(1e7, Infinity)).toBe(1); // floor splat stays
    expect(splatScale(2 * STEP_MS, 1)).toBe(0.3);
  });

  it('only ever shows a handful of distinct splat scales (stepped, not smooth)', () => {
    const vals = new Set<number>();
    for (let t = 0; t < 1000; t += 3) vals.add(splatScale(t));
    expect([...vals].sort()).toEqual([0, 0.3, 0.6, 1]);
  });

  it('popup rises in discrete jumps, then disappears', () => {
    expect(popupRise(0)).toBe(0);
    expect(popupRise(POPUP_STEP_MS)).toBe(POPUP_RISE[1]);
    expect(popupRise(POPUP_STEP_MS * 2 + 5)).toBe(POPUP_RISE[2]);
    expect(popupRise(POPUP_MS - 1)).toBe(POPUP_RISE[POPUP_RISE.length - 1]);
    expect(popupRise(POPUP_MS)).toBeNaN();
    for (let i = 1; i < POPUP_RISE.length; i++) expect(POPUP_RISE[i]).toBeLessThan(POPUP_RISE[i - 1]);
    expect(POPUP_RISE.length - 1).toBeGreaterThanOrEqual(2);
    expect(POPUP_RISE.length - 1).toBeLessThanOrEqual(3);
  });

  it('attract strip blinks in whole idle steps, mostly on', () => {
    let on = 0;
    const N = 1100;
    for (let s = 0; s < N; s++) {
      const v = demoStripVisible(s * STEP_MS + 1);
      expect(demoStripVisible(s * STEP_MS + STEP_MS - 1)).toBe(v); // constant within a step
      if (v) on++;
    }
    expect(on / N).toBeGreaterThan(0.6);
    expect(on / N).toBeLessThan(0.9);
  });
});
