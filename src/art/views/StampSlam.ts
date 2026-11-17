import Phaser from 'phaser';
import { S } from '../../config/render';
import { slamScale } from '../motion';
import { RISO_KEYS } from '../textures';
import { stampTint, type StampId } from '../ui';
import type { InkName } from '../palette';

/**
 * A tinted, rotated MULTIPLY stamp that slams down (scale 1.4 -> 1.0 in steps) when triggered. Position `image` yourself.
 * The ink goes through stampTint(), so a disallowed ink (yellow) prints black instead.
 */
export class StampSlam {
  readonly image: Phaser.GameObjects.Image;
  private slammedAt = -Infinity;
  private scale = NaN;

  constructor(scene: Phaser.Scene, id: StampId, ink: InkName | number, rotation: number, private readonly baseScale = 1) {
    this.image = scene.add.image(0, 0, RISO_KEYS.stamp(id)).setTint(stampTint(ink)).setRotation(rotation).setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setScale(S * baseScale);
  }

  destroy(): void {
    this.image.destroy();
  }

  trigger(tMs: number): void {
    this.slammedAt = tMs;
  }

  tick(tMs: number): void {
    const s = this.baseScale * slamScale(tMs - this.slammedAt);
    if (s !== this.scale) {
      this.scale = s;
      this.image.setScale(S * s);
    }
  }
}
