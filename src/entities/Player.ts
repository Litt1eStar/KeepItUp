import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { S } from '../config/render';
import type { CharStyleId, PlayerDef } from '../config/players';
import type { PlayerInput } from '../input/InputManager';
import { CHAR_R, charShadowScale, charShadowStep } from '../art/characters';
import { airPose, idlePose, joltOffset, runPose, stepSquash, type IdlePose } from '../art/motion';
import { RISO_KEYS } from '../art/textures';
import { RisoCharacterView, type CharPose } from '../art/views/RisoCharacterView';
import { applyJumpCut, effectivePlayerGravity, stepHorizontalVelocity } from '../logic/movement';

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
  landedThisFrame = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private jumpCutApplied = false;
  /** Riso character (fill + boiling line + pupils); container origin = feet. */
  readonly view: RisoCharacterView;
  private readonly shadow: Phaser.GameObjects.Image;
  private squash = 0;
  // render cache: only touch Phaser objects when the stepped value changes
  private readonly pose: CharPose = { face: 1, lookX: 0, lookY: 0 };
  private readonly idle: IdlePose = { dy: 0, rot: 0, sx: 1, sy: 1, blink: false };
  private shownDash = false;
  private shownSx = 1;
  private shownSy = 1;
  private shownRot = 0;
  private shadowStep = -1;
  private joltAt = -Infinity;

  readonly w = T.playerWidth;
  readonly h = T.playerHeight;
  readonly homeX: number;

  constructor(
    scene: Phaser.Scene,
    readonly def: PlayerDef,
    x = def.spawnX,
    readonly styleOverride?: CharStyleId,
  ) {
    this.x = x;
    this.homeX = x;
    this.y = T.floorY;
    this.prevY = this.y;
    const phase = (styleOverride ?? def.id) * 90;
    this.view = new RisoCharacterView(scene, def.id, phase, styleOverride);
    this.view.container.setPosition(x, this.y).setDepth(10);
    // halftone contact shadow: bottom edge pinned to the floor line at every scale
    this.shadow = scene.add.image(x, T.floorY, RISO_KEYS.charShadow(0))
      .setOrigin(0.5, 1).setScale(S).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(3);
  }

  get id() {
    return this.def.id;
  }
  get charStyle(): CharStyleId {
    return this.styleOverride ?? this.def.charStyle;
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

    this.coyoteTimer = this.grounded ? T.coyoteTime : Math.max(0, this.coyoteTimer - dt);
    this.jumpBufferTimer = input.jumpPressed ? T.jumpBufferTime : Math.max(0, this.jumpBufferTimer - dt);

    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (input.dashPressed && this.dashCooldown <= 0 && !this.dashing) {
      this.dashTime = T.dashDuration;
      this.dashCooldown = T.dashCooldown;
      this.dashDir = dir !== 0 ? (dir as 1 | -1) : this.facing;
      dashed = true;
    }

    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0 && !this.dashing) {
      this.vy = -T.jumpSpeed;
      this.grounded = false;
      this.standingOn = null;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      this.jumpCutApplied = false;
      jumped = true;
      this.squash = -0.25;
      if (!input.jumpHeld) {
        const cut = applyJumpCut(this.vy, false, this.jumpCutApplied, T);
        this.vy = cut.vy;
        this.jumpCutApplied = cut.cutApplied;
      }
    }

    if (this.dashing) {
      this.dashTime -= dt;
      if (this.dashTime <= 0) {
        this.vx = dir !== 0 ? dir * T.moveSpeed : this.dashDir * T.moveSpeed * T.dashExitSpeedMult;
      } else {
        this.vx = this.dashDir * (T.dashDistance / T.dashDuration);
        this.vy = Math.min(this.vy, 0) * T.dashVerticalDamp; // brief hang: kill fall, damp rise
      }
    } else {
      if (this.vy < 0) {
        const cut = applyJumpCut(this.vy, input.jumpHeld, this.jumpCutApplied, T);
        this.vy = cut.vy;
        this.jumpCutApplied = cut.cutApplied;
      }
      this.vx = stepHorizontalVelocity(this.vx, dir as -1 | 0 | 1, this.grounded, dt, T);
      this.vy += effectivePlayerGravity(this.vy, T) * dt;
    }

    const before = this.x;
    this.x = Phaser.Math.Clamp(this.x + this.vx * dt, this.w / 2, T.width - this.w / 2);
    this.dxThisFrame = this.x - before;
    return { jumped, dashed };
  }

  integrateY(dt: number): void {
    this.landedThisFrame = false;
    this.prevY = this.y;
    this.y += this.vy * dt;
    this.grounded = false;
    this.standingOn = null;
    if (this.y >= T.floorY) this.finishLanding(T.floorY, null);
  }

  /** Called by World when this player lands on another player's head. */
  landOn(base: Player): void {
    this.finishLanding(base.top, base);
  }

  private finishLanding(y: number, base: Player | null): void {
    if (this.vy > 320) {
      this.squash = 0.22;
      this.landedThisFrame = true;
    }
    this.y = y;
    this.vy = 0;
    this.grounded = true;
    this.standingOn = base;
    this.jumpCutApplied = false;
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
    if (dashing) {
      this.idle.dy = 0;
      this.idle.rot = 0;
      this.idle.sx = 1;
      this.idle.sy = 1;
      this.idle.blink = false;
    } else if (!this.grounded) {
      airPose(this.vx, this.vy, this.idle);
    } else if (Math.abs(this.vx) > 25) {
      runPose(tMs, face, this.idle);
    } else {
      idlePose((this.charStyle % 3) as PlayerDef['id'], tMs, this.idle);
    }

    const c = this.view.container;
    c.setPosition(this.x, this.y + this.idle.dy);

    const sq = stepSquash(this.squash);
    const sx = dashing ? DASH_STRETCH.sx : (1 + sq) * this.idle.sx;
    const sy = dashing ? DASH_STRETCH.sy : (1 - sq) * this.idle.sy;
    const rot = dashing ? face * DASH_LEAN : this.idle.rot;
    if (sx !== this.shownSx || sy !== this.shownSy) {
      this.shownSx = sx;
      this.shownSy = sy;
      c.setScale(sx, sy);
    }
    if (rot !== this.shownRot) {
      this.shownRot = rot;
      c.setRotation(rot);
    }
    if (dashing !== this.shownDash) {
      this.shownDash = dashing;
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
    p.blink = this.idle.blink;
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
