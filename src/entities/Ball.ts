import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import type { PlayerId } from '../config/players';
import { spawnPulse } from '../art/motion';
import { RisoBallView } from '../art/views/RisoBallView';
import { stepBallSpin } from '../logic/movement';

/**
 * Ball with custom physics. Each ball has its own speed multiplier which scales *time*
 * for that ball, so a sped-up ball keeps the same arc shape but plays faster.
 */
export class Ball {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  spin = 1.8;
  speedMult = 1;
  target: PlayerId;
  hitCooldown = 0;
  /** While > 0 the ball floats (telegraphed spawn) and ignores gravity. */
  floatTime: number;
  prevBottom: number;
  inDanger = false;
  readonly r = T.ballRadius;

  /** Riso ball (MULTIPLY ink + boiling ring, stepped spin) with its halftone floor shadow. */
  readonly view: RisoBallView;
  private shownInk: PlayerId;

  constructor(scene: Phaser.Scene, x: number, y: number, target: PlayerId, floatTime = 1.2) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.floatTime = floatTime;
    this.prevBottom = y + this.r;
    this.shownInk = target;
    this.view = new RisoBallView(scene, target, { shadow: true });
    this.view.container.setPosition(x, y).setDepth(20);
    this.view.shadow!.setDepth(2);
  }

  get bottom() {
    return this.y + this.r;
  }

  setTarget(target: PlayerId): void {
    this.target = target; // the view re-inks (with its stamp punch) on the next render
  }

  step(dt: number): void {
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.prevBottom = this.bottom;

    if (this.floatTime > 0) {
      this.floatTime -= dt;
      this.y += T.spawnDropSpeed * dt;
      return;
    }

    const sdt = dt * this.speedMult;
    const sp = stepBallSpin(this.vx, this.spin, sdt, T);
    this.vx = sp.vx;
    this.spin = sp.spin;
    this.vy += T.ballGravity * sdt;
    this.x += this.vx * sdt;
    this.y += this.vy * sdt;

    if (this.x - this.r < 0) {
      this.x = this.r;
      this.vx = Math.abs(this.vx) * T.wallBounce;
      this.spin = -this.spin * 0.75;
    } else if (this.x + this.r > T.width) {
      this.x = T.width - this.r;
      this.vx = -Math.abs(this.vx) * T.wallBounce;
      this.spin = -this.spin * 0.75;
    }
  }

  /** Draw the ball; `time` (ms) drives boil, stepped spin, ink punch and the spawn pulse. */
  render(dt: number, time: number): void {
    const v = this.view;
    if (this.target !== this.shownInk) {
      this.shownInk = this.target;
      v.setInk(this.target, time);
    }
    v.container.setPosition(this.x, this.y);
    // Floating spawn telegraph: stepped scale pulse + incoming halftone halo (no alpha fades).
    const spawning = this.floatTime > 0;
    v.setSpawning(spawning);
    v.setScaleMul(spawning ? spawnPulse(time) : 1);
    v.stepSpin(this.spin, dt * this.speedMult);
    v.tick(time);
    // Fall warning: halftone shadow gets denser as the ball drops, pink while the ball is in danger.
    v.updateShadow(this.x, this.bottom, this.inDanger);
  }

  destroy(): void {
    this.view.destroy();
  }
}
