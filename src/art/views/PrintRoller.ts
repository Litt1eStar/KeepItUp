import type Phaser from 'phaser';
import { TUNING as T } from '../../config/tuning';
import { INK_HEX } from '../palette';
import { rollerCoverWidth, rollerExitWidth } from '../screens';

const ROLLER_DEPTH = 90;

interface ExitTarget {
  scene: string;
  data?: object;
}

/**
 * Stepped two-way "print roller" wipe:
 * - On entry, sweeps solid black ink + pink/blue registration rules off the right edge.
 * - Via `exitTo(scene, data)`, sweeps ink across from the left edge, then starts the target scene.
 */
export class PrintRoller {
  private cover: Phaser.GameObjects.Rectangle | null = null;
  private pinkRule: Phaser.GameObjects.Rectangle | null = null;
  private blueRule: Phaser.GameObjects.Rectangle | null = null;
  private startMs = -1;
  private lastW: number = T.width;
  private exiting: ExitTarget | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    this.spawnRects(T.width, 1);
  }

  get isExiting(): boolean {
    return this.exiting !== null;
  }

  /** Sweep the ink roller across the screen, then transition to `targetScene`. */
  exitTo(targetScene: string, data?: object): void {
    if (this.exiting) return;
    this.exiting = { scene: targetScene, data };
    this.startMs = -1;
    this.lastW = 0;
    this.spawnRects(0, 0);
  }

  tick(tMs: number): void {
    if (this.exiting) {
      if (this.startMs < 0) this.startMs = tMs;
      const w = rollerExitWidth(tMs - this.startMs);
      if (w !== this.lastW) {
        this.lastW = w;
        this.cover?.setSize(w, T.height);
        this.pinkRule?.setPosition(w, 0);
        this.blueRule?.setPosition(w + 6, 0);
      }
      if (w >= T.width) {
        const target = this.exiting;
        this.exiting = null;
        this.destroy();
        this.scene.scene.start(target.scene, target.data);
      }
      return;
    }

    if (!this.cover) return;
    if (this.startMs < 0) this.startMs = tMs;
    const w = rollerCoverWidth(tMs - this.startMs);
    if (w === this.lastW) return;
    this.lastW = w;
    if (w <= 0) {
      this.destroyRects();
      return;
    }
    const x = T.width - w;
    this.cover.setPosition(x, 0).setSize(w, T.height);
    this.pinkRule?.setPosition(x, 0);
    this.blueRule?.setPosition(x - 6, 0);
  }

  private spawnRects(initW: number, ruleOriginX: number): void {
    this.destroyRects();
    this.cover = this.scene.add.rectangle(0, 0, initW, T.height, INK_HEX.black).setOrigin(0).setDepth(ROLLER_DEPTH);
    this.pinkRule = this.scene.add.rectangle(0, 0, 5, T.height, INK_HEX.pink).setOrigin(ruleOriginX, 0).setDepth(ROLLER_DEPTH);
    this.blueRule = this.scene.add.rectangle(ruleOriginX === 1 ? -6 : 6, 0, 3, T.height, INK_HEX.blue).setOrigin(ruleOriginX, 0).setDepth(ROLLER_DEPTH);
  }

  private destroyRects(): void {
    this.cover?.destroy();
    this.pinkRule?.destroy();
    this.blueRule?.destroy();
    this.cover = null;
    this.pinkRule = null;
    this.blueRule = null;
  }

  destroy(): void {
    this.exiting = null;
    this.destroyRects();
  }
}
