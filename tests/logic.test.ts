import { describe, expect, it } from 'vitest';
import { pickNextTarget, pickSpawnTarget, resolveHit, entersDangerZone } from '../src/logic/TurnSystem';
import { comboMultiplier, hitPoints, timePoints } from '../src/logic/Scoring';
import { landingX, solveDashPass } from '../src/logic/dashPass';
import { pickLookTarget } from '../src/logic/lookTarget';
import {
  applyJumpCut, computeHitSpin, effectivePlayerGravity, resolveBallCollision, resolvePlayerBump,
  stepBallSpin, stepHorizontalVelocity,
} from '../src/logic/movement';
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

describe('pickLookTarget', () => {
  const out = { x: 0, y: 0 };
  it('follows the lowest ball targeting the player, even if another ball is nearer', () => {
    const balls = [
      { x: 105, y: 400, target: 1 }, // nearest, but not ours
      { x: 800, y: 150, target: 0 },
      { x: 600, y: 300, target: 0 }, // lowest of ours
    ];
    expect(pickLookTarget(100, 470, 0, balls, out)).toEqual({ x: 600, y: 300 });
  });
  it('falls back to the nearest ball when none targets the player', () => {
    const balls = [
      { x: 700, y: 200, target: 2 },
      { x: 150, y: 380, target: 1 },
    ];
    expect(pickLookTarget(100, 470, 0, balls, out)).toEqual({ x: 150, y: 380 });
  });
  it('returns null with no balls, and reuses the out object (no allocation)', () => {
    expect(pickLookTarget(100, 470, 0, [], out)).toBeNull();
    expect(pickLookTarget(0, 0, 0, [{ x: 1, y: 2, target: 0 }], out)).toBe(out);
  });
});

describe('movement physics', () => {
  it('accelerates, turns faster when reversing, and decelerates toward 0', () => {
    const accel = stepHorizontalVelocity(0, 1, true, 0.05, TUNING);
    expect(accel).toBeGreaterThan(0);
    expect(accel).toBeLessThan(TUNING.moveSpeed);
    const full = stepHorizontalVelocity(0, 1, true, 1, TUNING);
    expect(full).toBe(TUNING.moveSpeed);

    const forwardStep = Math.abs(stepHorizontalVelocity(0, 1, true, 0.02, TUNING));
    const turnStep = Math.abs(stepHorizontalVelocity(TUNING.moveSpeed, -1, true, 0.02, TUNING) - TUNING.moveSpeed);
    expect(turnStep).toBeGreaterThan(forwardStep);

    expect(stepHorizontalVelocity(100, 0, true, 1, TUNING)).toBe(0);
    expect(stepHorizontalVelocity(100, 0, false, 0.02, TUNING)).toBeGreaterThan(
      stepHorizontalVelocity(100, 0, true, 0.02, TUNING),
    );
  });

  it('shapes gravity with lighter apex hang and heavier falling', () => {
    expect(effectivePlayerGravity(0, TUNING)).toBeLessThan(TUNING.playerGravity);
    expect(effectivePlayerGravity(-300, TUNING)).toBe(TUNING.playerGravity);
    expect(effectivePlayerGravity(300, TUNING)).toBeGreaterThan(TUNING.playerGravity);
  });

  it('cuts jump upward velocity when released early while holding preserves max jump', () => {
    expect(applyJumpCut(-TUNING.jumpSpeed, true, false, TUNING)).toEqual({
      vy: -TUNING.jumpSpeed,
      cutApplied: false,
    });
    const cut = applyJumpCut(-TUNING.jumpSpeed, false, false, TUNING);
    expect(cut.cutApplied).toBe(true);
    expect(cut.vy).toBeCloseTo(-TUNING.jumpSpeed * TUNING.jumpCutMultiplier);
    // Cut only applies once per jump
    expect(applyJumpCut(cut.vy, false, true, TUNING)).toEqual({ vy: cut.vy, cutApplied: true });
    // Near peak, no further cut
    expect(applyJumpCut(-50, false, false, TUNING)).toEqual({ vy: -50, cutApplied: false });
  });

  it('resolvePlayerBump launches stationary teammates on dash and bounces mutual dashers', () => {
    const a = { vx: 1100, vy: 0, dashing: true, dashDir: 1 as const, dashTime: 0.1 };
    const b = { vx: 0, vy: 0, dashing: false, dashDir: -1 as const, dashTime: 0 };
    expect(resolvePlayerBump(a, b, 1, TUNING)).toBe(true);
    expect(b.vx).toBe(TUNING.dashBumpVx);
    expect(b.vy).toBe(-TUNING.dashBumpVy);
    expect(a.vx).toBe(-TUNING.dashBumpRecoilVx);
    expect(a.dashTime).toBe(0);

    const c = { vx: 1100, vy: 0, dashing: true, dashDir: 1 as const, dashTime: 0.1 };
    const d = { vx: -1100, vy: 0, dashing: true, dashDir: -1 as const, dashTime: 0.1 };
    expect(resolvePlayerBump(c, d, 1, TUNING)).toBe(true);
    expect(c.vx).toBeCloseTo(-TUNING.dashBumpVx * 0.65);
    expect(d.vx).toBeCloseTo(TUNING.dashBumpVx * 0.65);
  });

  it('imparts bounded spin on hit and curves/decays velocity via Magnus force', () => {
    const spin = computeHitSpin(240, 200, 72, TUNING.moveSpeed, TUNING);
    expect(spin).toBeGreaterThan(0);
    expect(Math.abs(spin)).toBeLessThanOrEqual(TUNING.ballSpinMax);
    expect(Math.abs(computeHitSpin(500, 0, 10, TUNING.moveSpeed * 5, TUNING))).toBe(TUNING.ballSpinMax);

    const stepped = stepBallSpin(100, spin, 0.25, TUNING);
    expect(stepped.vx).toBeGreaterThan(100);
    expect(stepped.spin).toBeLessThan(spin);
    expect(stepped.spin).toBeGreaterThan(0);
  });

  it('resolveBallCollision separates overlapping balls and exchanges normal velocity', () => {
    const farA = { x: 100, y: 200, vx: 100, vy: 0, r: 44, spin: 0 };
    const farB = { x: 300, y: 200, vx: -100, vy: 0, r: 44, spin: 0 };
    expect(resolveBallCollision(farA, farB)).toBe(false);

    const a = { x: 100, y: 200, vx: 120, vy: 0, r: 44, spin: 0 };
    const b = { x: 170, y: 200, vx: -80, vy: 0, r: 44, spin: 0 };
    expect(resolveBallCollision(a, b)).toBe(true);
    expect(b.x - a.x).toBeGreaterThanOrEqual(88 - 1e-6);
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
  });
});
