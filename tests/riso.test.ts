import { describe, it, expect } from 'vitest';
import { seeded, halftoneDots, misregOffset, wobblePoints } from '../src/art/riso';
import { PAPER, PAPER_HEX, INK, INK_HEX, PLAYER_INK } from '../src/art/palette';

describe('seeded', () => {
  it('is deterministic and in [0,1)', () => {
    const a = seeded(42), b = seeded(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('differs for different seeds', () => {
    const a = seeded(1), b = seeded(2);
    const sa = [a(), a(), a()], sb = [b(), b(), b()];
    expect(sa).not.toEqual(sb);
  });
});

describe('halftoneDots', () => {
  const avgR = (d: number) => {
    const dots = halftoneDots(200, 200, d, 10);
    return dots.reduce((s, p) => s + p.r, 0) / dots.length;
  };
  it('density 0 gives no dots', () => {
    expect(halftoneDots(100, 100, 0, 10)).toEqual([]);
  });
  it('keeps centers inside the rect', () => {
    for (const p of halftoneDots(120, 80, 0.5, 8, 30)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(120);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(80);
    }
  });
  it('radius grows with density and is capped', () => {
    expect(avgR(0.2)).toBeLessThan(avgR(0.6));
    expect(avgR(0.6)).toBeLessThan(avgR(1.0));
    for (const p of halftoneDots(200, 200, 1, 10)) expect(p.r).toBeLessThanOrEqual(6.2 + 1e-9);
  });
  it('dot count is roughly area / cell^2', () => {
    const n = halftoneDots(200, 200, 0.5, 10).length;
    expect(n).toBeGreaterThan(400 * 0.6);
    expect(n).toBeLessThan(400 * 1.4);
  });
});

describe('misregOffset', () => {
  it('has magnitude in [1,2] and is deterministic', () => {
    for (let s = 0; s < 50; s++) {
      const o = misregOffset(s);
      const m = Math.hypot(o.dx, o.dy);
      expect(m).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(m).toBeLessThanOrEqual(2 + 1e-9);
      expect(misregOffset(s)).toEqual(o);
    }
  });
});

describe('wobblePoints', () => {
  const pts: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  it('is deterministic, bounded, and seed-dependent', () => {
    const a = wobblePoints(pts, 5, 1.5);
    expect(wobblePoints(pts, 5, 1.5)).toEqual(a);
    a.forEach((p, i) => {
      expect(Math.abs(p[0] - pts[i][0])).toBeLessThanOrEqual(1.5);
      expect(Math.abs(p[1] - pts[i][1])).toBeLessThanOrEqual(1.5);
    });
    expect(wobblePoints(pts, 6, 1.5)).not.toEqual(a);
  });
});

describe('palette', () => {
  it('has exactly 4 inks matching hex', () => {
    expect(Object.keys(INK)).toHaveLength(4);
    for (const k of Object.keys(INK) as (keyof typeof INK)[]) {
      expect(parseInt(INK[k].slice(1), 16)).toBe(INK_HEX[k]);
    }
    expect(parseInt(PAPER.slice(1), 16)).toBe(PAPER_HEX);
  });
  it('maps players to inks', () => {
    expect(PLAYER_INK[0]).toBe('pink');
    expect(PLAYER_INK[1]).toBe('blue');
    expect(PLAYER_INK[2]).toBe('yellow');
  });
});
