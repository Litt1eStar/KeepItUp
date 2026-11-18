import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { PLAYERS, type PlayerId } from '../config/players';
import { InputManager } from '../input/InputManager';
import { World, type HitEvent } from '../game/World';
import { drawStage, textStyle } from '../game/stage';
import { Juice } from '../systems/Juice';
import { AudioManager } from '../systems/AudioManager';
import { leaderboard } from '../services/Leaderboard';
import { PLAYER_INK } from '../art/palette';
import type { Ball } from '../entities/Ball';

const CONTROLS = ['A / D   jump W   dash S', '← / →   jump ↑   dash ↓', 'J / L   jump I   dash K'];
const JOIN_KEY = ['W', '↑ or pad A', 'I or pad A'];

/**
 * Lobby with a practice area: joined players appear on the floor and can bounce a
 * practice ball that can't fail, so visitors learn the controls while the team assembles.
 */
export class LobbyScene extends Phaser.Scene {
  private inputMgr!: InputManager;
  private world!: World;
  private juice!: Juice;
  private joined = new Set<PlayerId>();
  private idle = 0;
  private cards: { status: Phaser.GameObjects.Text; pad: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Rectangle }[] = [];
  private startHint!: Phaser.GameObjects.Text;

  constructor() {
    super('Lobby');
  }

  create(): void {
    this.joined.clear();
    this.idle = 0;
    this.cards = [];
    AudioManager.init(this);
    drawStage(this);
    this.inputMgr = new InputManager(this);
    this.world = new World(this, false);
    this.juice = new Juice(this);

    this.add.text(T.width / 2, 44, 'KEEP IT UP!', textStyle(58, '#ffffff', 10)).setOrigin(0.5).setDepth(5);
    this.add
      .text(T.width / 2, 92, 'Keep every ball in the air.  Hit the balls that show YOUR color & shape!', textStyle(16, '#d8d0ff', 4))
      .setOrigin(0.5)
      .setDepth(5);

    PLAYERS.forEach((p, i) => {
      const cx = 135 + i * 205;
      const cy = 190;
      const bg = this.add.rectangle(cx, cy, 190, 116, 0x000000, 0.35).setStrokeStyle(3, p.color, 0.5).setDepth(5);
      this.add.text(cx, cy - 38, `${p.name} ${p.glyph}`, textStyle(26, p.colorCss)).setOrigin(0.5).setDepth(6);
      this.add.text(cx, cy - 6, CONTROLS[i], textStyle(13, '#ffffff', 3)).setOrigin(0.5).setDepth(6);
      const status = this.add.text(cx, cy + 22, `press ${JOIN_KEY[i]} to join`, textStyle(13, '#ffffff', 4)).setOrigin(0.5).setDepth(6);
      const pad = this.add.text(cx, cy + 44, '', textStyle(11, '#9effa0', 3)).setOrigin(0.5).setDepth(6);
      this.cards.push({ status, pad, bg });
    });

    this.buildBoard();

    this.startHint = this.add
      .text(T.width / 2, T.height - 20, 'SPACE / START to play   ·   no one joined = solo   ·   F = fullscreen', textStyle(15, '#ffffff', 4))
      .setOrigin(0.5)
      .setDepth(6);

    this.world.on('hit', (e: HitEvent) => {
      AudioManager.play(e.jumpHit ? 'jumpHit' : 'hit');
      this.juice.splat(e.ball.x, e.ball.bottom, PLAYER_INK[e.player.id], 'small');
      if (e.dashPass && this.joined.size > 1) this.juice.stamp('PASS', e.player.x, e.player.top - 46, PLAYER_INK[e.player.id], 0.8);
    });
    this.world.on('dash', () => AudioManager.play('dash'));
    this.world.on('floor', (ball: Ball) => {
      this.juice.popup(ball.x, T.floorY - 30, 'oops! (practice)', 'black', 16);
      this.world.removeBall(ball);
      this.time.delayedCall(500, () => this.ensurePracticeBall());
    });

    this.events.once('shutdown', () => this.world.destroy());
  }

  private async buildBoard(): Promise<void> {
    const x = 830;
    const y = 140;
    this.add.rectangle(x, y + 82, 200, 200, 0x000000, 0.35).setStrokeStyle(2, 0xffffff, 0.2).setDepth(5);
    this.add.text(x, y, 'TOP TEAMS', textStyle(18, '#ffd23f')).setOrigin(0.5).setDepth(6);
    const top = await leaderboard.top(5);
    if (!this.sys.isActive()) return;
    if (top.length === 0) {
      this.add.text(x, y + 70, 'No scores yet —\nbe the first!', textStyle(14, '#ffffff', 3)).setOrigin(0.5).setAlign('center').setDepth(6);
    }
    top.forEach((e, i) => {
      const ry = y + 34 + i * 30;
      this.add.text(x - 88, ry, `${i + 1}. ${e.team}`, textStyle(14, '#ffffff', 3)).setOrigin(0, 0.5).setDepth(6);
      this.add.text(x + 88, ry, `${Math.floor(e.score)}`, textStyle(14, '#ffd23f', 3)).setOrigin(1, 0.5).setDepth(6);
    });
  }

  private join(id: PlayerId): void {
    if (this.joined.has(id)) return;
    this.joined.add(id);
    this.world.addPlayer(id);
    AudioManager.play('join');
    const card = this.cards[id];
    card.status.setText('READY!').setColor(PLAYERS[id].colorCss);
    card.bg.setStrokeStyle(4, PLAYERS[id].color, 1).setFillStyle(PLAYERS[id].color, 0.18);
    this.tweens.add({ targets: card.bg, scale: { from: 1.08, to: 1 }, duration: 200 });
    this.ensurePracticeBall();
  }

  private ensurePracticeBall(): void {
    if (!this.sys.isActive() || this.world.balls.length > 0 || this.world.players.length === 0) return;
    const ball = this.world.spawnBall(undefined, 0.8);
    const p = this.world.playerById(ball.target);
    if (p) ball.x = p.x;
    ball.y = 230;
  }

  update(time: number, delta: number): void {
    this.juice.update(time);
    this.inputMgr.update();
    const dt = Math.min(delta, 50) / 1000;

    for (const p of PLAYERS) {
      if (this.inputMgr.get(p.id).jumpPressed) this.join(p.id);
      const pad = this.inputMgr.padConnected(p.gamepadIndex);
      this.cards[p.id].pad.setText(p.gamepadIndex === null ? 'keyboard' : pad ? `gamepad ${p.gamepadIndex + 1} connected` : 'keyboard (no gamepad)');
    }

    if (this.inputMgr.anyPressed()) this.idle = 0;
    else this.idle += dt;

    if (this.inputMgr.startPressed()) {
      const players = this.joined.size > 0 ? [...this.joined].sort() : [0 as PlayerId];
      this.scene.start('Game', { mode: 'play', players });
      return;
    }
    if (this.idle > T.lobbyIdleToAttractS) {
      this.scene.start('Game', { mode: 'attract', players: [0, 1, 2] });
      return;
    }

    this.startHint.setAlpha(0.6 + 0.4 * Math.sin(time * 0.005));
    for (const p of PLAYERS) {
      if (!this.joined.has(p.id)) this.cards[p.id].status.setAlpha(0.5 + 0.5 * Math.abs(Math.sin(time * 0.004 + p.id)));
    }

    this.world.step(dt, this.inputMgr);
    this.world.render(dt, time);
  }
}
