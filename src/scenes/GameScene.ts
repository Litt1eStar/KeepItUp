import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import type { PlayerId } from '../config/players';
import { InputManager, type InputSource } from '../input/InputManager';
import { BotInput } from '../input/BotInput';
import { World, type HitEvent } from '../game/World';
import { drawStage, textStyle } from '../game/stage';
import { Juice } from '../systems/Juice';
import { AudioManager } from '../systems/AudioManager';
import { comboMultiplier, hitPoints, timePoints } from '../logic/Scoring';
import { leaderboard } from '../services/Leaderboard';
import type { Ball } from '../entities/Ball';

export interface GameData {
  mode: 'play' | 'attract';
  players: PlayerId[];
}

export interface GameResult {
  score: number;
  time: number;
  bestCombo: number;
  correctHits: number;
  players: PlayerId[];
}

export class GameScene extends Phaser.Scene {
  private data_!: GameData;
  private inputMgr!: InputManager;
  private bot: BotInput | null = null;
  private world!: World;
  private juice!: Juice;

  private score = 0;
  private elapsed = 0;
  private nextBallAt: number = T.extraBallInterval;
  private correctHits = 0;
  private hitStopMs = 0;
  private timeScale = 1;
  private over = false;
  private best = 0;

  private hud!: {
    score: Phaser.GameObjects.Text;
    combo: Phaser.GameObjects.Text;
    time: Phaser.GameObjects.Text;
    best: Phaser.GameObjects.Text;
    bar: Phaser.GameObjects.Rectangle;
    demo?: Phaser.GameObjects.Text;
  };

  constructor() {
    super('Game');
  }

  init(data: GameData): void {
    this.data_ = { mode: data.mode ?? 'play', players: data.players?.length ? data.players : [0] };
    this.score = 0;
    this.elapsed = 0;
    this.nextBallAt = T.extraBallInterval;
    this.correctHits = 0;
    this.hitStopMs = 0;
    this.timeScale = 1;
    this.over = false;
    this.bot = null;
  }

  private get attract() {
    return this.data_.mode === 'attract';
  }
  private get multiplayer() {
    return this.data_.players.length > 1;
  }

  create(): void {
    AudioManager.init(this);
    drawStage(this, true);
    this.inputMgr = new InputManager(this);
    this.world = new World(this, true);
    this.juice = new Juice(this);
    for (const id of this.data_.players) this.world.addPlayer(id);
    if (this.attract) this.bot = new BotInput(this.world);

    const first = this.world.spawnBall(undefined, 1.0);
    const p = this.world.playerById(first.target);
    if (p) first.x = p.x;

    this.buildHud();
    this.wireEvents();
    leaderboard.best().then((b) => {
      this.best = b;
    });
    this.events.once('shutdown', () => this.world.destroy());
  }

  private buildHud(): void {
    this.hud = {
      score: this.add.text(16, 10, '0', textStyle(34)).setDepth(45),
      combo: this.add.text(18, 52, '', textStyle(18, '#ffd23f', 4)).setDepth(45),
      time: this.add.text(T.width / 2, 10, '0:00', textStyle(26)).setOrigin(0.5, 0).setDepth(45),
      best: this.add.text(T.width - 16, 14, 'BEST 0', textStyle(18, '#d8d0ff', 4)).setOrigin(1, 0).setDepth(45),
      bar: this.add.rectangle(T.width / 2 - 80, 50, 160, 6, 0xffffff, 0.8).setOrigin(0, 0.5).setDepth(45),
    };
    this.add.rectangle(T.width / 2, 50, 164, 10, 0x000000, 0.5).setDepth(44);
    this.add.text(T.width / 2, 58, 'NEXT BALL', textStyle(10, '#ffffff', 3)).setOrigin(0.5, 0).setDepth(45);

    if (this.attract) {
      // Kept in the floor strip so it never hides the balls.
      this.add.rectangle(T.width / 2, (T.floorY + T.height) / 2 + 2, T.width, T.height - T.floorY - 4, 0x000000, 0.6).setDepth(55);
      this.hud.demo = this.add
        .text(T.width / 2, (T.floorY + T.height) / 2 + 2, 'DEMO  ·  PRESS ANY BUTTON TO PLAY!', textStyle(20, '#ffd23f', 5))
        .setOrigin(0.5)
        .setDepth(56);
    }
  }

  private wireEvents(): void {
    this.world.on('hit', (e: HitEvent) => this.onHit(e));
    this.world.on('dash', () => AudioManager.play('dash'));
    this.world.on('comboBreak', (ball: Ball) => {
      AudioManager.play('comboBreak');
      this.juice.popup(ball.x, ball.y - 50, 'COMBO BREAK', '#ff9f43', 20);
    });
    this.world.on('floor', (ball: Ball) => this.onDrop(ball));
  }

  private onHit(e: HitEvent): void {
    if (this.over) return;
    this.hitStopMs = T.hitStopMs;
    this.juice.burst(e.ball.x, e.ball.bottom, e.player.def.color, e.jumpHit ? 20 : 12);
    AudioManager.play(e.jumpHit ? 'jumpHit' : 'hit');

    if (e.correct) {
      this.correctHits++;
      const pts = hitPoints(e.combo, T);
      this.score += pts;
      this.juice.popup(e.ball.x, e.ball.y - 40, `+${Math.round(pts)}`, e.player.def.colorCss, 22);
      if (this.multiplayer) AudioManager.play('correct');
      if (e.combo > 0 && e.combo % 10 === 0) {
        this.juice.banner(`COMBO ${e.combo}!`, '#ffd23f');
        AudioManager.play('milestone');
      }
    } else {
      AudioManager.play('wrong');
      this.juice.shakeWrong();
      this.juice.popup(e.ball.x, e.ball.y - 40, 'WRONG! SPEED UP', '#ff4d4d', 20);
    }
    if (e.dashPass && this.multiplayer) this.juice.popup(e.player.x, e.player.top - 50, 'PASS!', '#ffffff', 18);
  }

  private onDrop(ball: Ball): void {
    if (this.over) return;
    this.over = true;
    this.timeScale = T.slowMoScale;
    AudioManager.play('gameover');
    this.juice.flash(0xff2a2a, 200);
    this.cameras.main.shake(300, 0.01);
    this.juice.burst(ball.x, T.floorY, 0xff4d4d, 30);
    this.juice.banner(this.attract ? 'DROPPED!' : 'GAME OVER', '#ff4d4d', 64);

    this.time.delayedCall(T.slowMoMs + 400, () => {
      if (this.attract) {
        this.scene.start('Lobby');
        return;
      }
      const result: GameResult = {
        score: Math.floor(this.score),
        time: this.elapsed,
        bestCombo: this.world.bestCombo,
        correctHits: this.correctHits,
        players: this.data_.players,
      };
      this.scene.start('GameOver', result);
    });
  }

  update(time: number, delta: number): void {
    this.inputMgr.update();
    if (this.attract) {
      if (this.inputMgr.anyPressed() || this.elapsed > T.attractMaxS) {
        this.scene.start('Lobby');
        return;
      }
      this.bot!.update();
    }

    const realDt = Math.min(delta, 50) / 1000;
    if (this.hitStopMs > 0) {
      this.hitStopMs -= delta;
      this.world.render(0, time);
      return;
    }
    const dt = realDt * this.timeScale;

    if (!this.over) {
      this.elapsed += dt;
      this.score += timePoints(dt, this.world.combo, T);
      if (this.elapsed >= this.nextBallAt) {
        this.nextBallAt += T.extraBallInterval;
        this.world.spawnBall();
        AudioManager.play('spawn');
        this.juice.banner('+1 BALL!', '#ffffff', 44);
      }
    }

    const source: InputSource = this.bot ?? this.inputMgr;
    this.world.step(dt, source);
    this.world.render(dt, time);
    this.updateHud(time);
  }

  private updateHud(time: number): void {
    const s = Math.floor(this.score);
    this.hud.score.setText(`${s}`);
    const c = this.world.combo;
    this.hud.combo.setText(c > 0 ? `COMBO ${c}   ×${comboMultiplier(c, T).toFixed(1)}` : '');
    const secs = Math.floor(this.elapsed);
    this.hud.time.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    this.hud.best.setText(`BEST ${Math.max(this.best, this.attract ? 0 : s)}`);
    const progress = 1 - (this.nextBallAt - this.elapsed) / T.extraBallInterval;
    this.hud.bar.setScale(Phaser.Math.Clamp(progress, 0, 1), 1);
    this.hud.demo?.setAlpha(0.5 + 0.5 * Math.abs(Math.sin(time * 0.004)));
  }
}
