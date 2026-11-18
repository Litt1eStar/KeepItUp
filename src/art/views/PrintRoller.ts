import type Phaser from 'phaser';
import { TUNING as T } from '../../config/tuning';
import { INK_HEX } from '../palette';
import { rollerCoverWidth } from '../screens';

const ROLLER_DEPTH = 90;

/**
 * Stepped "print roller" entry wipe: sweeps a solid black ink roller with pink/blue
 * registration rules off the right edge in ROLLER_STEPS ticks, then destroys itself.
 */
export class PrintRoller {
  private cover: Phaser.GameObjects.Rectangle | null;
  private pinkRule: Phaser.GameObjects.Rectangle | null;
  private blueRule: Phaser.GameObjects.Rectangle | null;
  private startMs = -1;
  private lastW: number = T.width;

  constructor(scene: Phaser.Scene) {
    this.cover = scene.add.rectangle(0, 0, T.width, T.height, INK_HEX.black).setOrigin(0).setDepth(ROLLER_DEPTH);
    this.pinkRule = scene.add.rectangle(0, 0, 5, T.height, INK_HEX.pink).setOrigin(1, 0).setDepth(ROLLER_DEPTH);
    this.blueRule = scene.add.rectangle(-6, 0, 3, T.height, INK_HEX.blue).setOrigin(1, 0).setDepth(ROLLER_DEPTH);
  }

  tick(tMs: number): void {
    if (!this.cover) return;
    if (this.startMs < 0) this.startMs = tMs;
    const w = rollerCoverWidth(tMs - this.startMs);
    if (w === this.lastW) return;
    this.lastW = w;
    if (w <= 0) {
      this.destroy();
      return;
    }
    const x = T.width - w;
    this.cover.setPosition(x, 0).setSize(w, T.height);
    this.pinkRule?.setPosition(x, 0);
    this.blueRule?.setPosition(x - 6, 0);
  }

  destroy(): void {
    this.cover?.destroy();
    this.pinkRule?.destroy();
    this.blueRule?.destroy();
    this.cover = null;
    this.pinkRule = null;
    this.blueRule = null;
  }
}
