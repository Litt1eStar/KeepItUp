import Phaser from 'phaser';
import { INK, INK_HEX } from '../palette';
import { risoText } from '../type';
import { slamScale } from '../motion';
import { HUD, comboCountLabel, comboMultLabel } from '../hud';

const PAD_X = 10;
const H = HUD.combo.h;

/**
 * HUD combo: a small rotated pink stamp-style label ("×2.3" in Anton over "COMBO 13" in Space Mono)
 * inside a double rounded border, all MULTIPLY. Re-slams (stepped slamScale) when the combo goes up,
 * hides at 0. Phaser objects only change when the combo or the slam step changes.
 */
export class ComboLabel {
  readonly container: Phaser.GameObjects.Container;
  private readonly border: Phaser.GameObjects.Graphics;
  private readonly mult: Phaser.GameObjects.Text;
  private readonly count: Phaser.GameObjects.Text;
  private shownCombo = 0;
  private borderW = 0;
  private slammedAt = -Infinity;
  private scale = 1;

  constructor(scene: Phaser.Scene) {
    const M = Phaser.BlendModes.MULTIPLY;
    const c = HUD.combo;
    this.border = scene.add.graphics().setBlendMode(M);
    this.mult = scene.add.text(0, -7, '', risoText(c.multSize, INK.pink)).setOrigin(0.5).setBlendMode(M);
    this.count = scene.add.text(0, 14, '', risoText(c.countSize, INK.pink, 'mono')).setFontStyle('bold').setOrigin(0.5).setBlendMode(M);
    this.container = scene.add.container(c.x, c.y, [this.border, this.mult, this.count]).setRotation(c.rot).setVisible(false);
  }

  /** Show `combo` (multiplier `mult`) at scene time tMs; a rise re-slams the label. */
  set(combo: number, mult: number, tMs: number): void {
    if (combo !== this.shownCombo) {
      if (combo > this.shownCombo) this.slammedAt = tMs;
      this.shownCombo = combo;
      this.container.setVisible(combo > 0);
      if (combo > 0) {
        this.mult.setText(comboMultLabel(mult));
        this.count.setText(comboCountLabel(combo));
        const w = Math.ceil((Math.max(this.mult.width, this.count.width) + PAD_X * 2) / 8) * 8;
        if (w !== this.borderW) {
          this.borderW = w;
          this.border.clear()
            .lineStyle(2.5, INK_HEX.pink).strokeRoundedRect(-w / 2, -H / 2, w, H, 6)
            .lineStyle(1, INK_HEX.pink).strokeRoundedRect(-w / 2 + 4, -H / 2 + 4, w - 8, H - 8, 4);
        }
      }
    }
    const s = slamScale(tMs - this.slammedAt);
    if (s !== this.scale) {
      this.scale = s;
      this.container.setScale(s);
    }
  }
}
