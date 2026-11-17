import type Phaser from 'phaser';
import { TUNING as T } from './tuning';

/**
 * Render scale: the canvas is created at (960×540) × RS real pixels and every scene's camera
 * zooms by RS, so gameplay still uses 960×540 logical coordinates but nothing gets stretched
 * (stretching a small canvas is what made the game look blurry).
 *
 * Based on the *screen* size, not the window, so it is already sharp after going fullscreen.
 * 1080p → 2, 1440p → 3, 4K → 3 (capped for performance).
 */
export const RS: number = (() => {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  const fit = Math.max(window.screen.width / T.width, window.screen.height / T.height) * dpr;
  return Math.max(1, Math.min(3, Math.ceil(fit - 0.05)));
})();

/** Scale to apply to images whose textures were generated at RS resolution. */
export const S = 1 / RS;

/** Every scene calls this first: zoom so 960×540 logical units fill the hi-res canvas. */
export function setupCamera(scene: Phaser.Scene): void {
  scene.cameras.main.setZoom(RS).centerOn(T.width / 2, T.height / 2);
}
