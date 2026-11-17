import Phaser from 'phaser';
import { S } from '../../config/render';
import { TUNING as T } from '../../config/tuning';
import { PLAYERS, type PlayerId } from '../../config/players';
import { CHAR_R, charMisreg, pupilPos, pupilScale } from '../../art/characters';
import { ballMisreg, SHADOW_STEPS } from '../../art/ball';
import { RISO_KEYS } from '../../art/textures';
import {
  ballInkAt, boilVariant, demoBallPos, facingToward, idlePose, inkPunch, joltAt, quantizeTime, shadowChoice,
  INK_CYCLE_MS,
} from '../../art/styleTileMotion';
import { MULTIPLY, caption, type TilePage } from './shared';

const CHAR_X: Record<PlayerId, number> = { 0: 150, 1: 320, 2: 490 };
const NAMES = ['PIK', 'BLOOP', 'BRICK'];
type Img = Phaser.GameObjects.Image;

interface Char {
  id: PlayerId;
  box: Phaser.GameObjects.Container;
  fill: Img;
  line: Img;
  pupils: Img[];
  variant: number;
}

function makeChar(scene: Phaser.Scene, root: Phaser.GameObjects.Container, id: PlayerId, x: number): Char {
  const fill = scene.add.image(0, 0, RISO_KEYS.charFill(id)).setOrigin(0.5, 1).setScale(S).setBlendMode(MULTIPLY);
  const line = scene.add.image(0, 0, RISO_KEYS.charLine(id, 0)).setOrigin(0.5, 1).setScale(S);
  const pupils = [0, 1].map(() => scene.add.image(0, 0, RISO_KEYS.pupil).setScale(pupilScale(id) * S));
  const box = scene.add.container(x, T.floorY, [fill, line, ...pupils]);
  root.add(box);
  return { id, box, fill, line, pupils, variant: 0 };
}

/** Pose a character: facing, look direction, boil, misreg (+ jolt) and an idle pose. */
function poseChar(c: Char, face: 1 | -1, lookX: number, lookY: number, variant: number, extra: { dx: number; dy: number }, blink: boolean): void {
  const m = charMisreg(c.id);
  c.fill.setFlipX(face < 0).setPosition(m.dx + extra.dx, m.dy + extra.dy);
  c.line.setFlipX(face < 0);
  if (variant !== c.variant) {
    c.variant = variant;
    c.line.setTexture(RISO_KEYS.charLine(c.id, variant));
  }
  c.line.setScale(S, S * (blink ? 0.9 : 1));
  c.fill.setScale(S, S * (blink ? 0.9 : 1));
  c.pupils.forEach((p, i) => {
    const pos = pupilPos(c.id, i, lookX, lookY, face);
    p.setPosition(pos.x, pos.y).setVisible(!blink);
  });
}

export function buildPage1(scene: Phaser.Scene): TilePage {
  const root = scene.add.container(0, 0);
  const r = T.ballRadius;

  // static balls (all three inks visible together with the cycling one)
  const mkBall = (id: PlayerId) => {
    const m = ballMisreg(id);
    const fill = scene.add.image(m.dx, m.dy, RISO_KEYS.ballFill(id)).setScale(S).setBlendMode(MULTIPLY);
    const line = scene.add.image(0, 0, RISO_KEYS.ballLine(0)).setScale(S);
    const box = scene.add.container(0, 0, [fill, line]);
    root.add(box);
    return { box, fill, line, variant: 0, ink: id as PlayerId };
  };
  const chars = PLAYERS.map((p) => makeChar(scene, root, p.id, CHAR_X[p.id]));
  const dash = makeChar(scene, root, 1, 700);
  const speed = scene.add.image(0, 0, RISO_KEYS.speedlines).setOrigin(1, 0.5).setScale(S * 1.3).setBlendMode(MULTIPLY);
  root.addAt(speed, 0);

  const overlapBall = mkBall(0);
  overlapBall.box.setPosition(CHAR_X[1] + 44, T.floorY - 50);
  const staticBall = mkBall(2);
  staticBall.box.setPosition(880, 330);
  const mover = mkBall(0);
  const shadow = scene.add.image(0, 0, RISO_KEYS.shadow(0)).setScale(S).setBlendMode(MULTIPLY);
  root.addAt(shadow, 0);

  // fall-warning rows
  caption(scene, root, 16, 80, 'FALL WARNING 0→7  (top: normal · bottom: danger)');
  const sc = 0.5;
  for (let n = 0; n < SHADOW_STEPS; n++) {
    const x = 36 + n * 50;
    root.add(scene.add.image(x, 112, RISO_KEYS.shadow(n)).setScale(S * sc).setBlendMode(MULTIPLY));
    root.add(scene.add.image(x, 132, RISO_KEYS.shadowDanger(n)).setScale(S * sc).setBlendMode(MULTIPLY));
  }

  for (const p of PLAYERS) caption(scene, root, CHAR_X[p.id] - (p.id === 1 ? 14 : 0), T.floorY - 2 * CHAR_R - 24, NAMES[p.id], 0.5);
  caption(scene, root, 760, T.floorY - 2 * CHAR_R - 24, 'DASH', 0.5);
  caption(scene, root, 16, 392, 'WRONG HIT JOLT (fill jumps off line)');
  caption(scene, root, CHAR_X[1] + 44, T.floorY - 50 - r - 16, 'OVERPRINT', 0.5);
  caption(scene, root, 880, 330 + r + 8, 'INK SWAP', 0.5);
  caption(scene, root, 16, 152, 'IDLE · PUPILS TRACK THE BALL');

  let lastInk = -1;
  let inkChangedAt = 0;

  const update = (t: number): void => {
    const qt = quantizeTime(t, 42);
    const ball = demoBallPos(qt, r);
    const jolt = joltAt(t);

    chars.forEach((c) => {
      const pose = idlePose(c.id, t);
      c.box.setPosition(CHAR_X[c.id], T.floorY + pose.dy).setRotation(pose.rot).setScale(pose.sx, pose.sy);
      const face = facingToward(CHAR_X[c.id], ball.x);
      const extra = jolt.active && jolt.id === c.id ? jolt : { dx: 0, dy: 0 };
      poseChar(c, face, ball.x - CHAR_X[c.id], ball.y - (T.floorY - CHAR_R), boilVariant(t, c.id), extra, pose.blink);
    });

    // dash character sweeps right with speed lines trailing behind
    const cyc = (quantizeTime(t, 42) % 1600) / 1600;
    const dx = 620 + cyc * 240;
    dash.box.setPosition(dx, T.floorY - 4).setRotation(0.12).setScale(1.2, 0.85);
    poseChar(dash, 1, 1, 0, boilVariant(t, 2), { dx: 0, dy: 0 }, false);
    speed.setPosition(dx - CHAR_R * 1.1, T.floorY - CHAR_R).setVisible(true);
    speed.setScale(S * 1.3, S * 1.3).setFlipY(boilVariant(t) === 1);

    // balls: boil + spin
    const spin = (t / 1000) * 2.2;
    const v = boilVariant(t);
    for (const b of [overlapBall, staticBall, mover]) {
      if (b.variant !== v) {
        b.variant = v;
        b.line.setTexture(RISO_KEYS.ballLine(v));
      }
      b.line.setRotation(Math.round(spin * 6) / 6);
      b.fill.setRotation(Math.round(spin * 6) / 6);
    }
    overlapBall.box.y = T.floorY - 50 + chars[1].box.y - T.floorY;

    const ink = ballInkAt(t);
    if (ink !== lastInk) {
      lastInk = ink;
      inkChangedAt = t - (t % INK_CYCLE_MS);
      mover.fill.setTexture(RISO_KEYS.ballFill(ink));
      const m = ballMisreg(ink);
      mover.fill.setPosition(m.dx, m.dy);
    }
    const punch = inkPunch(t - inkChangedAt);
    mover.box.setPosition(ball.x, ball.y).setScale(punch.sx, punch.sy);

    const sh = shadowChoice(ball.y, r);
    shadow.setTexture(sh.key).setPosition(ball.x, T.floorY - 6);
  };

  return { root, update };
}
