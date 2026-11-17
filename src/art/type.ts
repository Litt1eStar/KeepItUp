import type Phaser from 'phaser';
import { RS } from '../config/render';

export const DISPLAY_FONT = '"Anton", Impact, "Arial Narrow", sans-serif';
export const MONO_FONT = '"Space Mono", "Courier New", monospace';

/** Flat riso text style: no stroke, no shadow. */
export function risoText(
  size: number,
  color: string,
  font: 'display' | 'mono' = 'display',
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: font === 'display' ? DISPLAY_FONT : MONO_FONT,
    fontSize: `${size}px`,
    color,
    resolution: RS,
  };
}
