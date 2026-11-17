import Phaser from 'phaser';
import { S } from '../../config/render';
import type { PlayerId } from '../../config/players';
import { charMisreg, pupilPos, pupilScale } from '../characters';
import { boilVariant } from '../motion';
import { RISO_KEYS } from '../textures';

export interface CharPose {
  /** Which way the character faces (flips fill + line, mirrors pupils). */
  face: 1 | -1;
  /** Direction the eyes look (world units; zero = rest). */
  lookX: number;
  lookY: number;
  /** Extra fill-layer offset on top of the fixed misregistration (e.g. joltOffset). */
  extraMisreg?: { readonly dx: number; readonly dy: number };
  blink?: boolean;
}

const ZERO = { dx: 0, dy: 0 } as const;
const BLINK_SCALE_Y = 0.9;

/**
 * A riso character: MULTIPLY ink fill (offset by its misregistration), boiling black linework
 * and two tracking pupils. Layout-free: the container's origin is the character's feet
 * (bottom-center); position/rotate/scale `container` for idle motion.
 */
export class RisoCharacterView {
  readonly container: Phaser.GameObjects.Container;
  private readonly fill: Phaser.GameObjects.Image;
  private readonly line: Phaser.GameObjects.Image;
  private readonly pupils: Phaser.GameObjects.Image[];
  private readonly misreg: { dx: number; dy: number };
  private readonly tmp = { x: 0, y: 0 };
  private variant = 0;

  constructor(scene: Phaser.Scene, readonly id: PlayerId) {
    this.misreg = charMisreg(id);
    this.fill = scene.add.image(0, 0, RISO_KEYS.charFill(id)).setOrigin(0.5, 1).setScale(S).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.line = scene.add.image(0, 0, RISO_KEYS.charLine(id, 0)).setOrigin(0.5, 1).setScale(S);
    this.pupils = [0, 1].map(() => scene.add.image(0, 0, RISO_KEYS.pupil).setScale(pupilScale(id) * S));
    this.container = scene.add.container(0, 0, [this.fill, this.line, ...this.pupils]);
  }

  /** Apply facing, look direction, misregistration (+ extra) and blink. */
  pose(p: CharPose): void {
    const extra = p.extraMisreg ?? ZERO;
    const blink = p.blink === true;
    this.fill.setFlipX(p.face < 0).setPosition(this.misreg.dx + extra.dx, this.misreg.dy + extra.dy);
    this.line.setFlipX(p.face < 0);
    const sy = S * (blink ? BLINK_SCALE_Y : 1);
    this.line.setScale(S, sy);
    this.fill.setScale(S, sy);
    for (let i = 0; i < this.pupils.length; i++) {
      const pos = pupilPos(this.id, i, p.lookX, p.lookY, p.face, this.tmp);
      this.pupils[i].setPosition(pos.x, pos.y).setVisible(!blink);
    }
  }

  /** Linework boil (swaps variant only when it changes). */
  tick(tMs: number): void {
    const v = boilVariant(tMs, this.id);
    if (v !== this.variant) {
      this.variant = v;
      this.line.setTexture(RISO_KEYS.charLine(this.id, v));
    }
  }
}
