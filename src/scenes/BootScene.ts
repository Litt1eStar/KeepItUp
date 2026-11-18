import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { INK, INK_HEX, PAPER_HEX } from '../art/palette';
import { risoText } from '../art/type';
import { generateRisoTexturesAsync } from '../art/textures';

const BAR_W = 380;
const BAR_H = 22;

/**
 * Generates all riso textures from code with Canvas 2D at render resolution (RS),
 * displaying a stepped riso printing-press loading screen until assets are ready.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  async create(): Promise<void> {
    const cx = T.width / 2;
    const cy = T.height / 2;
    this.add.rectangle(0, 0, T.width, T.height, PAPER_HEX).setOrigin(0);
    const frame = this.add.graphics();
    frame.lineStyle(3, INK_HEX.black).strokeRect(24, 24, T.width - 48, T.height - 48);
    frame.lineStyle(1, INK_HEX.black).strokeRect(30, 30, T.width - 60, T.height - 60);

    this.add.text(cx + 3, cy - 64 + 3, 'KEEP IT UP!', risoText(52, INK.yellow)).setOrigin(0.5);
    this.add.text(cx - 2, cy - 64 + 1, 'KEEP IT UP!', risoText(52, INK.pink)).setOrigin(0.5);
    this.add.text(cx, cy - 64, 'KEEP IT UP!', risoText(52, INK.black)).setOrigin(0.5);

    const status = this.add
      .text(cx, cy - 6, 'WARMING UP PRESS...', risoText(13, INK.black, 'mono'))
      .setFontStyle('bold')
      .setOrigin(0.5);
    const pct = this.add
      .text(cx, cy + 56, '0%', risoText(12, INK.pink, 'mono'))
      .setFontStyle('bold')
      .setOrigin(0.5);

    const barX = cx - BAR_W / 2;
    const barY = cy + 16;
    this.add.graphics().lineStyle(2.5, INK_HEX.black).strokeRect(barX, barY, BAR_W, BAR_H);
    const fill = this.add.rectangle(barX + 4, barY + 4, 0, BAR_H - 8, INK_HEX.pink).setOrigin(0);

    await generateRisoTexturesAsync(this, (fraction, label) => {
      if (!this.sys.isActive()) return;
      status.setText(label);
      pct.setText(`${Math.round(fraction * 100)}%`);
      fill.width = Math.round((BAR_W - 8) * Math.max(0, Math.min(1, fraction)));
    });
    if (!this.sys.isActive()) return;

    this.scene.start(new URLSearchParams(location.search).has('styletile') ? 'StyleTile' : 'Menu');
  }
}
