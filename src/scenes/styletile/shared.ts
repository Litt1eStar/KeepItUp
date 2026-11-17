import Phaser from 'phaser';
import { INK } from '../../art/palette';
import { risoText } from '../../art/type';

/** One page of the style tile: a hidden-able container plus a per-frame update (t in ms since scene start). */
export interface TilePage {
  root: Phaser.GameObjects.Container;
  update(tMs: number): void;
}

export const MULTIPLY = Phaser.BlendModes.MULTIPLY;

/** Small Space Mono caption in black ink. */
export function caption(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  text: string,
  originX = 0,
): Phaser.GameObjects.Text {
  const t = scene.add.text(x, y, text, risoText(11, INK.black, 'mono')).setOrigin(originX, 0).setFontStyle('bold');
  parent.add(t);
  return t;
}
