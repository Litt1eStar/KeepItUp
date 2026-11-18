import type Phaser from 'phaser';
import { S } from '../../config/render';
import { TUNING as T } from '../../config/tuning';
import { PLAYERS, type PlayerId } from '../../config/players';
import { CHAR_R } from '../../art/characters';
import { SHADOW_STEPS } from '../../art/shadow';
import { RISO_KEYS } from '../../art/textures';
import { MOTION_STEP_MS, facingToward, idlePose, joltOffset, quantizeTime, type IdlePose } from '../../art/motion';
import { ballInkAt, demoBallPos, demoWrongHit } from '../../art/styleTileMotion';
import { RisoCharacterView, type CharPose } from '../../art/views/RisoCharacterView';
import { RisoBallView } from '../../art/views/RisoBallView';
import { MULTIPLY, caption, type TilePage } from './shared';

const CHAR_X: Record<PlayerId, number> = { 0: 150, 1: 320, 2: 490 };
const NAMES = ['PIK', 'BLOOP', 'BRICK'];
const DASH_X0 = 620;
const DASH_SPAN = 240;
const DASH_CYCLE_MS = 1600;
const OVERLAP_BALL = { x: CHAR_X[1] + 44, y: T.floorY - 50 };
const STATIC_BALL = { x: 880, y: 330 };

export function buildPage1(scene: Phaser.Scene): TilePage {
  const root = scene.add.container(0, 0);
  const r = T.ballRadius;

  const chars = PLAYERS.map((p) => {
    const view = new RisoCharacterView(scene, p.id);
    view.container.setPosition(CHAR_X[p.id], T.floorY);
    root.add(view.container);
    return view;
  });

  // dash character: its speed lines follow its squash/tilt
  const dash = new RisoCharacterView(scene, 1, 250);
  dash.setSpeedlines(true);
  dash.container.setRotation(0.12).setScale(1.2, 0.85);
  root.add(dash.container);

  const mover = new RisoBallView(scene, 0, { shadow: true });
  const overlapBall = new RisoBallView(scene, 0);
  overlapBall.container.setPosition(OVERLAP_BALL.x, OVERLAP_BALL.y);
  const staticBall = new RisoBallView(scene, 2);
  staticBall.container.setPosition(STATIC_BALL.x, STATIC_BALL.y);
  root.add(mover.shadow!);
  root.add([mover.container, overlapBall.container, staticBall.container]);
  const balls = [mover, overlapBall, staticBall];

  // fall-warning rows
  caption(scene, root, 16, 80, 'FALL WARNING 0→7  (top: normal · bottom: danger)');
  for (let n = 0; n < SHADOW_STEPS; n++) {
    const x = 36 + n * 50;
    root.add(scene.add.image(x, 112, RISO_KEYS.shadow(n)).setScale(S * 0.5).setBlendMode(MULTIPLY));
    root.add(scene.add.image(x, 132, RISO_KEYS.shadowDanger(n)).setScale(S * 0.5).setBlendMode(MULTIPLY));
  }

  for (const p of PLAYERS) caption(scene, root, CHAR_X[p.id] - (p.id === 1 ? 14 : 0), T.floorY - 2 * CHAR_R - 24, NAMES[p.id], 0.5);
  caption(scene, root, 760, T.floorY - 2 * CHAR_R - 24, 'DASH', 0.5);
  caption(scene, root, 16, 392, 'WRONG HIT JOLT (fill jumps off line)');
  caption(scene, root, OVERLAP_BALL.x, OVERLAP_BALL.y - r - 16, 'OVERPRINT', 0.5);
  caption(scene, root, STATIC_BALL.x, STATIC_BALL.y + r + 8, 'STATIC INK', 0.5);
  caption(scene, root, 16, 152, 'IDLE · PUPILS TRACK THE BALL');
  caption(scene, root, 944, 80, 'BOUNCING BALL: INK SWAP EVERY 2 S + FLOOR SHADOW', 1);

  // reused per-frame scratch (no allocations in update)
  const ballPos = { x: 0, y: 0 };
  const idle: IdlePose = { dy: 0, rot: 0, sx: 1, sy: 1, blink: false };
  const pose: CharPose = { face: 1, lookX: 0, lookY: 0 };
  const dashPose: CharPose = { face: 1, lookX: 1, lookY: 0 };
  let lastInk = -1;

  const update = (t: number): void => {
    const ball = demoBallPos(quantizeTime(t, MOTION_STEP_MS), r, ballPos);
    const hit = demoWrongHit(t);
    const jolt = joltOffset(hit.msSince);

    for (const c of chars) {
      idlePose(c.id, t, idle);
      c.container.setPosition(CHAR_X[c.id], T.floorY + idle.dy).setRotation(idle.rot).setScale(idle.sx, idle.sy);
      pose.face = facingToward(CHAR_X[c.id], ball.x);
      pose.lookX = ball.x - CHAR_X[c.id];
      pose.lookY = ball.y - (T.floorY - CHAR_R);
      pose.extraMisreg = hit.id === c.id ? jolt : undefined;
      pose.blink = idle.blink;
      c.pose(pose);
      c.tick(t);
    }

    // dash character sweeps right (speed lines ride along)
    const cyc = (quantizeTime(t, MOTION_STEP_MS) % DASH_CYCLE_MS) / DASH_CYCLE_MS;
    dash.container.setPosition(DASH_X0 + cyc * DASH_SPAN, T.floorY - 4);
    dash.pose(dashPose);
    dash.tick(t);

    const ink = ballInkAt(t);
    if (ink !== lastInk) {
      lastInk = ink;
      mover.setInk(ink, t);
    }
    mover.container.setPosition(ball.x, ball.y);
    mover.updateShadow(ball.x, ball.y + r);
    for (const b of balls) b.tick(t);
  };

  return { root, update };
}
