import Phaser from 'phaser';
import { S } from '../../config/render';
import { slamScale } from '../motion';
import { RISO_KEYS } from '../textures';
import type { StampId } from '../ui';

/** A tinted, rotated MULTIPLY stamp that slams down (scale 1.4 -> 1.0 in steps) when triggered. Position `image` yourself. */
export class StampSlam {
  readonly image: Phaser.GameObjects.Image;
  private slammedAt = -Infinity;
  private scale = NaN;

  constructor(scene: Phaser.Scene, id: StampId, tint: number, rotation: number, private readonly baseScale = 1) {
    this.image = scene.add.image(0, 0, RISO_KEYS.stamp(id)).setTint(tint).setRotation(rotation).setBlendMode(Phaser.BlendModes.MULTIPLY);
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
