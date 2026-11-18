import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { S } from '../config/render';
import type { PlayerDef } from '../config/players';
import type { PlayerInput } from '../input/InputManager';
import { CHAR_R, charShadowScale, charShadowStep } from '../art/characters';
import { joltOffset, stepSquash } from '../art/motion';
import { RISO_KEYS } from '../art/textures';
import { RisoCharacterView, type CharPose } from '../art/views/RisoCharacterView';

/** Where the eyes should look this frame (world coords), or null to look forward. */
export interface LookTarget {
  x: number;
  y: number;
}

const DASH_LEAN = 0.12;
const DASH_STRETCH = { sx: 1.15, sy: 0.88 } as const;

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
  /** Riso character (fill + boiling line + pupils); container origin = feet. */
  readonly view: RisoCharacterView;
  private readonly shadow: Phaser.GameObjects.Image;
  private squash = 0;
  // render cache: only touch Phaser objects when the stepped value changes
  private readonly pose: CharPose = { face: 1, lookX: 0, lookY: 0 };
  private shownSquash = NaN;
  private shownDash = false;
  private shownFace: 1 | -1 = 1;
  private shadowStep = -1;
  private joltAt = -Infinity;

  readonly w = T.playerWidth;
  readonly h = T.playerHeight;

  constructor(scene: Phaser.Scene, readonly def: PlayerDef, x = def.spawnX) {
    this.x = x;
    this.y = T.floorY;
    this.prevY = this.y;
    this.view = new RisoCharacterView(scene, def.id);
    this.view.container.setPosition(x, this.y).setDepth(10);
    // halftone contact shadow: bottom edge pinned to the floor line at every scale
    this.shadow = scene.add.image(x, T.floorY, RISO_KEYS.charShadow(0))
      .setOrigin(0.5, 1).setScale(S).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(3);
  }

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

  /** Wrong hit at scene time tMs: the ink layer jumps out of register for JOLT_MS (see joltOffset). */
  jolt(tMs: number): void {
    this.joltAt = tMs;
  }

  /**
   * Draw at the feet. `look` = the ball the eyes should follow (null → look forward); tMs drives the boil.
   * Squash/stretch, dash lean and the shadow only update the view when their stepped value changes.
   */
  render(dt: number, tMs: number, look: LookTarget | null): void {
    this.squash = Phaser.Math.Linear(this.squash, 0, Math.min(1, dt * 12));
    const dashing = this.dashing;
    const face = dashing ? this.dashDir : this.facing;
    const c = this.view.container;
    c.setPosition(this.x, this.y);

    const sq = stepSquash(this.squash);
    if (sq !== this.shownSquash || dashing !== this.shownDash || face !== this.shownFace) {
      this.shownSquash = sq;
      this.shownDash = dashing;
      this.shownFace = face;
      if (dashing) c.setScale(DASH_STRETCH.sx, DASH_STRETCH.sy).setRotation(face * DASH_LEAN);
      else c.setScale(1 + sq, 1 - sq).setRotation(0);
      this.view.setSpeedlines(dashing);
    }

    const p = this.pose;
    p.face = face;
    if (look) {
      p.lookX = look.x - this.x;
      p.lookY = look.y - (this.y - CHAR_R);
    } else {
      p.lookX = face;
      p.lookY = 0;
    }
    p.extraMisreg = joltOffset(tMs - this.joltAt);
    this.view.pose(p);
    this.view.tick(tMs);

    // Contact shadow: sparser and smaller as the feet rise off the floor.
    const step = charShadowStep(T.floorY - this.y);
    if (step !== this.shadowStep) {
      this.shadowStep = step;
      this.shadow.setTexture(RISO_KEYS.charShadow(step)).setScale(S * charShadowScale(step));
    }
    this.shadow.x = this.x;
  }

  destroy(): void {
    this.shadow.destroy();
    this.view.destroy();
  }
}
