import Phaser from 'phaser';
import { S } from '../../config/render';
import { TUNING as T } from '../../config/tuning';
import type { PlayerId } from '../../config/players';
import { ballMisreg, shadowTexSize } from '../ball';
import { boilVariant, inkPunch, shadowChoice, spinAngle } from '../motion';
import { RISO_KEYS } from '../textures';

/**
 * A riso ball: MULTIPLY ink fill (offset by its misregistration) + boiling black ring, spinning
 * in steps. Layout-free: position `container` at the ball center. Optionally owns a floor
 * shadow image (add `shadow` to the scene/container yourself, beneath the ball).
 */
export class RisoBallView {
  readonly container: Phaser.GameObjects.Container;
  /** Floor shadow (MULTIPLY); null if constructed with shadow: false. */
  readonly shadow: Phaser.GameObjects.Image | null;
  private readonly fill: Phaser.GameObjects.Image;
  private readonly line: Phaser.GameObjects.Image;
  private readonly shadowY: number;
  private variant = 0;
  private angle = NaN;
  private shadowKey = '';
  private inkChangedAt = -Infinity;
  private sx = 1;
  private sy = 1;
  private scaleMul = 1;

  constructor(scene: Phaser.Scene, inkId: PlayerId, opts: { shadow?: boolean } = {}) {
    const m = ballMisreg(inkId);
    this.fill = scene.add.image(m.dx, m.dy, RISO_KEYS.ballFill(inkId)).setScale(S).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.line = scene.add.image(0, 0, RISO_KEYS.ballLine(0)).setScale(S);
    this.container = scene.add.container(0, 0, [this.fill, this.line]);
    // the shadow texture's bottom edge sits on the floor
    this.shadowY = T.floorY - shadowTexSize(T.ballRadius).h / 2;
    this.shadow = opts.shadow ? scene.add.image(0, this.shadowY, RISO_KEYS.shadow(0)).setScale(S).setBlendMode(Phaser.BlendModes.MULTIPLY) : null;
  }

  /** Change the ink with a quick stamp-squash punch (tMs = now). */
  setInk(id: PlayerId, tMs: number): void {
    const m = ballMisreg(id);
    this.fill.setTexture(RISO_KEYS.ballFill(id)).setPosition(m.dx, m.dy);
    this.inkChangedAt = tMs;
  }

  /** Extra uniform scale on top of the ink punch (e.g. a stepped spawn pulse); applied on the next tick. */
  setScaleMul(k: number): void {
    this.scaleMul = k;
  }

  /** Boil, stepped spin and ink-change punch. */
  tick(tMs: number): void {
    const v = boilVariant(tMs);
    if (v !== this.variant) {
      this.variant = v;
      this.line.setTexture(RISO_KEYS.ballLine(v));
    }
    const a = spinAngle(tMs);
    if (a !== this.angle) {
      this.angle = a;
      this.line.setRotation(a);
      this.fill.setRotation(a);
    }
    const p = inkPunch(tMs - this.inkChangedAt);
    const sx = p.sx * this.scaleMul;
    const sy = p.sy * this.scaleMul;
    if (sx !== this.sx || sy !== this.sy) {
      this.sx = sx;
      this.sy = sy;
      this.container.setScale(sx, sy);
    }
  }

  /**
   * Place the shadow under x and pick density from the ball's bottom edge. `danger` (e.g. Ball.inDanger)
   * selects the pink version; omitted → bottom below the danger line.
   */
  updateShadow(x: number, ballBottomY: number, danger?: boolean): void {
    const sh = this.shadow;
    if (!sh) return;
    const choice = danger === undefined ? shadowChoice(ballBottomY) : shadowChoice(ballBottomY, danger);
    if (choice.key !== this.shadowKey) {
      this.shadowKey = choice.key;
      sh.setTexture(choice.key);
    }
    sh.setPosition(x, this.shadowY);
  }

  destroy(): void {
    this.shadow?.destroy();
    this.container.destroy();
  }
}
