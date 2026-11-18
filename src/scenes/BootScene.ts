import Phaser from 'phaser';
import { generateRisoTextures } from '../art/textures';

/**
 * Generates all riso textures from code with Canvas 2D at render resolution (RS), so they stay
 * sharp on big booth screens. Images using these textures are displayed at scale S = 1/RS.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generateRisoTextures(this);
    this.scene.start(new URLSearchParams(location.search).has('styletile') ? 'StyleTile' : 'Lobby');
  }
}
