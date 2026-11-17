import Phaser from 'phaser';
import { S, setupCamera } from '../config/render';
import { INK } from '../art/palette';
import { RISO_KEYS, allRisoKeys } from '../art/textures';
import { risoText } from '../art/type';
import { buildPage1 } from './styletile/page1';
import { buildPage2 } from './styletile/page2';
import type { TilePage } from './styletile/shared';

const TITLES = ['STYLE TILE 1/2 — CHARACTERS & PLAY', 'STYLE TILE 2/2 — INTERFACE'];

/** Hidden preview (`?styletile`): every riso element animated on one sheet, for look approval. */
export class StyleTileScene extends Phaser.Scene {
  private pages: TilePage[] = [];
  private page = 0;
  private title!: Phaser.GameObjects.Text;
  private t0 = 0;
  private started = false;

  constructor() {
    super('StyleTile');
  }

  create(): void {
    setupCamera(this);
    this.page = 0;
    this.started = false;
    this.add.image(0, 0, RISO_KEYS.bg).setOrigin(0).setScale(S);

    this.pages = [buildPage1(this), buildPage2(this)];
    this.title = this.add.text(16, 8, '', risoText(12, INK.black, 'mono')).setOrigin(0, 0).setFontStyle('bold').setDepth(10);
    this.add.text(944, 44, 'SPACE / → NEXT   ← PREV', risoText(11, INK.black, 'mono')).setOrigin(1, 0).setDepth(10);
    this.showPage(0);

    const missing = allRisoKeys().filter((k) => !this.textures.exists(k));
    if (missing.length) {
      console.warn('[StyleTile] missing riso textures:', missing);
      this.add.text(16, 62, `MISSING TEXTURES (${missing.length}): ${missing.slice(0, 4).join(' ')}…`, risoText(11, INK.pink, 'mono')).setDepth(10);
    }

    const kb = this.input.keyboard!;
    const next = () => this.showPage((this.page + 1) % this.pages.length);
    const prev = () => this.showPage((this.page + this.pages.length - 1) % this.pages.length);
    kb.on('keydown-SPACE', next);
    kb.on('keydown-RIGHT', next);
    kb.on('keydown-LEFT', prev);
    const onPad = (_pad: Phaser.Input.Gamepad.Gamepad, button: Phaser.Input.Gamepad.Button) => {
      if (button.index === 0) next();
    };
    this.input.gamepad?.on('down', onPad);
    this.events.once('shutdown', () => {
      kb.off('keydown-SPACE', next);
      kb.off('keydown-RIGHT', next);
      kb.off('keydown-LEFT', prev);
      this.input.gamepad?.off('down', onPad);
    });
  }

  private showPage(i: number): void {
    this.page = i;
    this.pages.forEach((p, n) => p.root.setVisible(n === i));
    this.title.setText(TITLES[i]).setPosition(i === 0 ? 16 : 330, i === 0 ? 8 : 24);
  }

  update(time: number): void {
    if (!this.started) {
      this.started = true;
      this.t0 = time;
    }
    this.pages[this.page].update(time - this.t0);
  }
}
