import Phaser from 'phaser';
import { RS, S, setupCamera } from '../config/render';
import { RISO_KEYS } from '../art/textures';

// Lilita One is bundled (see main.ts). The shape glyphs ▲●■ aren't in it, so the
// browser falls back to Arial per-glyph automatically.
export const FONT = '"Lilita One", "Arial Black", Arial, sans-serif';

export const textStyle = (size: number, color = '#ffffff', stroke = 5): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT,
  fontSize: `${size}px`,
  color,
  stroke: '#1a1030',
  strokeThickness: stroke,
  resolution: RS, // rasterize text at render resolution so it stays crisp
  shadow: { offsetX: 0, offsetY: Math.max(1, stroke * 0.4), color: 'rgba(0,0,0,0.45)', blur: 0, stroke: true, fill: true },
});

/** Camera setup and the riso stage background (paper, floor band, ruler and danger rule are printed in it). Shared by all scenes. */
export function drawStage(scene: Phaser.Scene): void {
  setupCamera(scene);
  scene.add.image(0, 0, RISO_KEYS.bg).setOrigin(0).setScale(S).setDepth(0);
}
