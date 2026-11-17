import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { S } from '../config/render';
import type { PlayerDef } from '../config/players';
import type { PlayerInput } from '../input/InputManager';

/**
 * Player with hand-rolled kinematics (instead of Arcade bodies) so stacking on heads
 * and side-pushing are deterministic and jitter-free. Position (x, y) = bottom-center.
 */
export class Player {
  x: number;
  y: number; // feet
  vx = 0;
  vy = 0;
  prevY: number;
  facing: 1 | -1 = 1;
  grounded = true;
  standingOn: Player | null = null;
  dashTime = 0;
  dashCooldown = 0;
  dashDir: 1 | -1 = 1;
  dxThisFrame = 0;
  readonly sprite: Phaser.GameObjects.Image;
  private squash = 0;

  readonly w = T.playerWidth;
  readonly h = T.playerHeight;

  constructor(scene: Phaser.Scene, readonly def: PlayerDef, x = def.spawnX) {
    this.x = x;
    this.y = T.floorY;
    this.prevY = this.y;
    this.sprite = scene.add.image(x, this.y, `player${def.id}`).setOrigin(0.5, 1).setScale(S).setDepth(10);
    this.shadow = scene.add.ellipse(x, T.floorY + 2, this.w * 1.1, 10, 0x0a0614, 0.45).setDepth(3);
  }

  private readonly shadow: Phaser.GameObjects.Ellipse;

  get id() {
    return this.def.id;
  }
  get left() {
    return this.x - this.w / 2;
  }
  get right() {
    return this.x + this.w / 2;
  }
  get top() {
    return this.y - this.h;
  }
  get dashing() {
    return this.dashTime > 0;
  }

  /** Apply input + gravity and move horizontally. Vertical move happens in integrateY. */
  applyInput(input: PlayerInput, dt: number): { jumped: boolean; dashed: boolean } {
    let jumped = false;
    let dashed = false;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) this.facing = dir as 1 | -1;

    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (input.dashPressed && this.dashCooldown <= 0 && !this.dashing) {
      this.dashTime = T.dashDuration;
      this.dashCooldown = T.dashCooldown;
      this.dashDir = dir !== 0 ? (dir as 1 | -1) : this.facing;
      dashed = true;
    }

    if (input.jumpPressed && this.grounded) {
      this.vy = -T.jumpSpeed;
      this.grounded = false;
      this.standingOn = null;
      jumped = true;
      this.squash = -0.25;
    }

    if (this.dashing) {
      this.dashTime -= dt;
      this.vx = this.dashDir * T.dashSpeed;
      this.vy = Math.min(this.vy, 0) * 0.5; // brief hang: kill fall, damp rise
    } else {
      this.vx = dir * T.moveSpeed;
      this.vy += T.playerGravity * dt;
    }

    const before = this.x;
    this.x = Phaser.Math.Clamp(this.x + this.vx * dt, this.w / 2, T.width - this.w / 2);
    this.dxThisFrame = this.x - before;
    return { jumped, dashed };
  }

  integrateY(dt: number): void {
    this.prevY = this.y;
    this.y += this.vy * dt;
    this.grounded = false;
    this.standingOn = null;
    if (this.y >= T.floorY) {
      if (this.vy > 300) this.squash = 0.2;
      this.y = T.floorY;
      this.vy = 0;
      this.grounded = true;
    }
  }

  /** Called by World when this player lands on another player's head. */
  landOn(base: Player): void {
    if (this.vy > 300) this.squash = 0.2;
    this.y = base.top;
    this.vy = 0;
    this.grounded = true;
    this.standingOn = base;
  }

  render(dt: number): void {
    this.squash = Phaser.Math.Linear(this.squash, 0, Math.min(1, dt * 12));
    const sx = 1 + this.squash;
    const sy = 1 - this.squash;
    this.sprite.setPosition(this.x, this.y).setScale(sx * this.facing * S, sy * S);
    this.sprite.setAlpha(this.dashing ? 0.75 : 1);
    // Contact shadow: shrinks and fades as the player gets higher off the floor.
    const lift = Phaser.Math.Clamp((T.floorY - this.y) / 220, 0, 1);
    this.shadow.setPosition(this.x, T.floorY + 2).setScale(1 - lift * 0.5, 1 - lift * 0.4).setAlpha(0.45 * (1 - lift * 0.7));
  }

  destroy(): void {
    this.shadow.destroy();
    this.sprite.destroy();
  }
}
