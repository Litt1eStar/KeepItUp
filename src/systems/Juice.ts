import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { S } from '../config/render';
import { textStyle } from '../game/stage';

/** Game-feel helpers: particles, floating text popups, shakes and flashes. */
export class Juice {
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(private readonly scene: Phaser.Scene) {
    this.emitter = scene.add
      .particles(0, 0, 'spark', {
        speed: { min: 120, max: 340 },
        angle: { min: 200, max: 340 },
        lifespan: 500,
        scale: { start: 0.9 * S, end: 0 },
        gravityY: 700,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(30);
  }

  burst(x: number, y: number, color: number, count = 14): void {
    this.emitter.setParticleTint(color);
    this.emitter.explode(count, x, y);
  }

  popup(x: number, y: number, text: string, color = '#ffffff', size = 26, rise = 60): void {
    const t = this.scene.add
      .text(x, y, text, textStyle(size, color, 5))
      .setOrigin(0.5)
      .setDepth(50);
    this.scene.tweens.add({ targets: t, y: y - rise, alpha: 0, scale: 1.2, duration: 800, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private currentBanner: Phaser.GameObjects.Text | null = null;

  /** Big center message. A new banner replaces the current one so they never overlap. */
  banner(text: string, color = '#ffffff', size = 54): void {
    if (this.currentBanner?.active) {
      this.scene.tweens.killTweensOf(this.currentBanner);
      this.currentBanner.destroy();
    }
    const t = this.scene.add
      .text(T.width / 2, T.height / 2 - 60, text, textStyle(size, color, 8))
      .setOrigin(0.5)
      .setDepth(60)
      .setScale(0.3);
    this.currentBanner = t;
    this.scene.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, alpha: 0, delay: 900, duration: 400, onComplete: () => t.destroy() });
  }

  shakeWrong(): void {
    this.scene.cameras.main.shake(T.shakeWrongMs, T.shakeWrongIntensity);
  }

  flash(color = 0xffffff, ms = 120): void {
    const c = Phaser.Display.Color.IntegerToColor(color);
    this.scene.cameras.main.flash(ms, c.red, c.green, c.blue);
  }
}
