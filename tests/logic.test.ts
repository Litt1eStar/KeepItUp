import { describe, expect, it } from 'vitest';
import { pickNextTarget, pickSpawnTarget, resolveHit, entersDangerZone } from '../src/logic/TurnSystem';
import { comboMultiplier, hitPoints, timePoints } from '../src/logic/Scoring';
import { landingX, solveDashPass } from '../src/logic/dashPass';
import { LocalLeaderboard, type KeyValueStore } from '../src/services/Leaderboard';
import { TUNING } from '../src/config/tuning';

const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

describe('TurnSystem', () => {
  it('never targets the hitter in multiplayer', () => {
    for (let r = 0; r < 1; r += 0.05) {
      expect(pickNextTarget(0, [0, 1, 2], () => r)).not.toBe(0);
      expect(pickNextTarget(2, [0, 1, 2], () => r)).not.toBe(2);
    }
  });

  it('alternates with two players', () => {
    expect(pickNextTarget(0, [0, 1])).toBe(1);
    expect(pickNextTarget(1, [0, 1])).toBe(0);
  });

  it('always targets the solo player', () => {
    expect(pickNextTarget(0, [0])).toBe(0);
    expect(pickNextTarget(1, [1])).toBe(1);
  });

  it('handles rng returning exactly 1 without going out of range', () => {
    expect([1, 2]).toContain(pickNextTarget(0, [0, 1, 2], () => 1));
  });

  it('spawns new balls on the least-loaded player', () => {
    expect(pickSpawnTarget([0, 1, 2], [0, 1])).toBe(2);
    expect(pickSpawnTarget([0, 1, 2], [0, 0, 1, 2, 2], seq(0))).toBe(1);
  });

  it('correct hit raises combo and slows the ball, clamped at 1.0', () => {
    const r = resolveHit(1, 1, 3, 1.02, TUNING);
    expect(r).toEqual({ correct: true, combo: 4, speedMult: 1.0 });
    expect(resolveHit(1, 1, 0, 1.3, TUNING).speedMult).toBe(1.25);
  });

  it('wrong hit resets combo and speeds the ball, clamped at 1.8', () => {
    expect(resolveHit(0, 1, 7, 1.0, TUNING)).toEqual({ correct: false, combo: 0, speedMult: 1.15 });
    expect(resolveHit(0, 1, 0, 1.75, TUNING).speedMult).toBe(1.8);
  });

  it('danger zone fires only on entry', () => {
    expect(entersDangerZone(380, 395, 390)).toBe(true);
    expect(entersDangerZone(395, 400, 390)).toBe(false);
    expect(entersDangerZone(300, 389, 390)).toBe(false);
  });
});

describe('Scoring', () => {
  it('matches the doc formula', () => {
    expect(comboMultiplier(0, TUNING)).toBe(1);
    expect(comboMultiplier(5, TUNING)).toBeCloseTo(1.5);
    expect(timePoints(1, 0, TUNING)).toBe(10);
    expect(timePoints(2, 10, TUNING)).toBeCloseTo(40);
    expect(hitPoints(1, TUNING)).toBeCloseTo(55);
  });
});

describe('dashPass', () => {
  const g = TUNING.ballGravity;
  const vy = TUNING.dashPassVy;
  const cases = [
    { ballX: 200, ballY: 380, targetX: 700, landY: 400 },
    { ballX: 800, ballY: 350, targetX: 300, landY: 400 },
    { ballX: 480, ballY: 300, targetX: 560, landY: 420 },
  ];
  for (const c of cases) {
    it(`lands within ±40px of target from x=${c.ballX} to x=${c.targetX}`, () => {
      const { vx, vy: outVy } = solveDashPass({ ...c, launchVy: vy, gravity: g, vxMax: TUNING.dashPassVxMax });
      expect(outVy).toBe(-vy);
      expect(Math.abs(landingX(c.ballX, c.ballY, vx, vy, c.landY, g) - c.targetX)).toBeLessThan(40);
    });
  }

  it('clamps horizontal speed for very far passes', () => {
    const { vx } = solveDashPass({ ballX: 0, ballY: 100, targetX: 5000, landY: 120, launchVy: 100, gravity: g, vxMax: 520 });
    expect(vx).toBe(520);
  });
});

describe('LocalLeaderboard', () => {
  const memStore = (): KeyValueStore => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  };

  it('sorts and keeps top 10', async () => {
    const lb = new LocalLeaderboard(memStore(), 10);
    for (let i = 1; i <= 12; i++) await lb.submit({ team: `T${i}`, score: i * 100, players: 2, date: '' });
    const top = await lb.top();
    expect(top).toHaveLength(10);
    expect(top[0].score).toBe(1200);
    expect(top[9].score).toBe(300);
    expect(await lb.best()).toBe(1200);
  });

  it('reports rank and qualification', async () => {
    const lb = new LocalLeaderboard(memStore(), 3);
    await lb.submit({ team: 'A', score: 500, players: 1, date: '' });
    await lb.submit({ team: 'B', score: 300, players: 1, date: '' });
    expect((await lb.submit({ team: 'C', score: 400, players: 1, date: '' })).rank).toBe(2);
    expect(await lb.qualifies(200)).toBe(false);
    expect(await lb.qualifies(350)).toBe(true);
  });

  it('survives corrupt storage', async () => {
    const store = memStore();
    store.setItem('keepitup.leaderboard.v1', '{not json');
    expect(await new LocalLeaderboard(store).top()).toEqual([]);
  });
});
