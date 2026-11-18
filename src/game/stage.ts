import type Phaser from 'phaser';
import { S, setupCamera } from '../config/render';
import { RISO_KEYS } from '../art/textures';

/** Camera setup and the riso stage background (paper, floor band, ruler and danger rule are printed in it). Shared by all scenes. */
export function drawStage(scene: Phaser.Scene): void {
  setupCamera(scene);
  scene.add.image(0, 0, RISO_KEYS.bg).setOrigin(0).setScale(S).setDepth(0);
}
