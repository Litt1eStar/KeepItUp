import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { S } from '../config/render';
import type { PlayerId } from '../config/players';

/**
 * Ball with custom physics. Each ball has its own speed multiplier which scales *time*
 * for that ball, so a sped-up ball keeps the same arc shape but plays faster.
 */
export class Ball {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  speedMult = 1;
  target: PlayerId;
  hitCooldown = 0;
  /** While > 0 the ball floats (telegraphed spawn) and ignores gravity. */
  floatTime: number;
  prevBottom: number;
  inDanger = false;
  readonly r = T.ballRadius;

  readonly sprite: Phaser.GameObjects.Image;
  readonly shadow: Phaser.GameObjects.Ellipse;
  private spin = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, target: PlayerId, floatTime = 1.2) {
    this.x = x;
    this.y = y;
    this.target = target;
    this.floatTime = floatTime;
    this.prevBottom = y + this.r;
    this.shadow = scene.add.ellipse(x, T.floorY + 4, this.r * 2, 12, 0x000000, 0.2).setDepth(2);
    this.sprite = scene.add.image(x, y, `ball${target}`).setScale(S).setDepth(20);
  }

  get bottom() {
    return this.y + this.r;
  }

  setTarget(target: PlayerId): void {
    this.target = target;
    this.sprite.setTexture(`ball${target}`);
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
    this.vy += T.ballGravity * sdt;
    this.x += this.vx * sdt;
    this.y += this.vy * sdt;

    if (this.x - this.r < 0) {
      this.x = this.r;
      this.vx = Math.abs(this.vx) * T.wallBounce;
    } else if (this.x + this.r > T.width) {
      this.x = T.width - this.r;
      this.vx = -Math.abs(this.vx) * T.wallBounce;
    }
  }

  render(dt: number, time: number): void {
    this.spin += this.vx * dt * 0.02;
    const pulse = this.floatTime > 0 ? 1 + Math.sin(time * 0.02) * 0.08 : 1;
    this.sprite.setPosition(this.x, this.y).setRotation(this.spin).setScale(pulse * S);
    this.sprite.setAlpha(this.floatTime > 0 ? 0.6 + 0.4 * Math.abs(Math.sin(time * 0.01)) : 1);

    // Fall warning: shadow darkens and grows as the ball nears the floor; red in the danger zone.
    const h = Phaser.Math.Clamp(T.floorY - this.bottom, 0, 420);
    const t = 1 - h / 420;
    this.shadow.setPosition(this.x, T.floorY + 4);
    this.shadow.setSize(this.r * (0.8 + 1.4 * t), 8 + 8 * t);
    this.shadow.setFillStyle(this.inDanger ? 0xff2a2a : 0x000000, 0.12 + 0.68 * t);
  }

  destroy(): void {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
