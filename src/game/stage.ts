import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { RS, S, setupCamera } from '../config/render';

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

/** Camera setup, painted background, ambient motes and a faint danger line. Shared by all scenes. */
export function drawStage(scene: Phaser.Scene, showDangerLine: boolean): void {
  setupCamera(scene);
  scene.add.image(0, 0, 'bg').setOrigin(0).setScale(S).setDepth(0);

  // Slow drifting light motes for a bit of life in the background.
  scene.add
    .particles(0, 0, 'spark', {
      x: { min: 0, max: T.width },
      y: T.floorY - 4,
      speedY: { min: -18, max: -40 },
      speedX: { min: -8, max: 8 },
      lifespan: 9000,
      frequency: 450,
      alpha: { start: 0.35, end: 0 },
      scale: { start: 0.45 * S, end: 0.1 * S },
      tint: [0xffb3e6, 0xb9a6ff, 0xffe9a8],
      blendMode: Phaser.BlendModes.ADD,
    })
    .setDepth(1);

  if (showDangerLine) {
    const g = scene.add.graphics().setDepth(1);
    g.lineStyle(2, 0xff5a7a, 0.22);
    for (let x = 0; x < T.width; x += 24) g.lineBetween(x, T.dangerLineY, x + 12, T.dangerLineY);
  }
}
