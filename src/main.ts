import Phaser from 'phaser';
import '@fontsource/anton/400.css'; // bundled locally: works offline at the booth
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import { TUNING as T } from './config/tuning';
import { RS } from './config/render';
import { PAPER } from './art/palette';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { LobbyScene } from './scenes/LobbyScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { StyleTileScene } from './scenes/StyleTileScene';

async function start(): Promise<void> {
  // Make sure the font is ready before any text is rasterized, otherwise the first
  // screen renders with the fallback font.
  try {
    await Promise.all([
      document.fonts.load('40px "Anton"'),
      document.fonts.load('20px "Space Mono"'),
      document.fonts.load('bold 20px "Space Mono"'),
    ]);
  } catch {
    /* fall back to system font */
  }

  // Remove initial HTML splash right as Phaser takes over the canvas.
  document.getElementById('boot-splash')?.remove();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: T.width * RS,
    height: T.height * RS,
    backgroundColor: PAPER,
    antialias: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { gamepad: true },
    scene: [BootScene, MenuScene, LobbyScene, GameScene, GameOverScene, StyleTileScene],
  });

  // Handy for debugging/playtesting from the browser console.
  (window as unknown as { game: Phaser.Game }).game = game;
}

void start();
