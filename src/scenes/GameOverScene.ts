import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { PLAYERS } from '../config/players';
import { InputManager } from '../input/InputManager';
import { drawStage, textStyle } from '../game/stage';
import { AudioManager } from '../systems/AudioManager';
import { leaderboard } from '../services/Leaderboard';
import type { GameResult } from './GameScene';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -!';
const NAME_LEN = 8;
const DEFAULT_NAMES = ['BOUNCERS', 'SKYHIGH', 'NOFLOOR', 'JUGGLERS', 'AIRTIME', 'UPUPUP', 'BALLERS', 'FLOATERS'];

/**
 * Game over: stats, arcade-style team-name entry (works with gamepads), leaderboard.
 * Auto-submits and returns to the lobby when left alone so the booth never gets stuck.
 */
export class GameOverScene extends Phaser.Scene {
  private result!: GameResult;
  private inputMgr!: InputManager;
  private state: 'loading' | 'entry' | 'board' = 'loading';
  private name: string[] = [];
  private cursor = 0;
  private idle = 0;
  private slots: Phaser.GameObjects.Text[] = [];
  private underline!: Phaser.GameObjects.Rectangle;
  private countdown!: Phaser.GameObjects.Text;
  private entryLayer: Phaser.GameObjects.GameObject[] = [];
  private prevLeft = false;
  private prevRight = false;

  constructor() {
    super('GameOver');
  }

  init(result: GameResult): void {
    this.result = result;
    this.state = 'loading';
    this.cursor = 0;
    this.idle = 0;
    this.slots = [];
    this.entryLayer = [];
    const def = DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)].padEnd(NAME_LEN, ' ');
    this.name = def.split('');
  }

  async create(): Promise<void> {
    AudioManager.init(this);
    drawStage(this);
    this.add.rectangle(T.width / 2, T.height / 2, T.width, T.height, 0x000000, 0.45);
    this.inputMgr = new InputManager(this);

    const r = this.result;
    const prevBest = await leaderboard.best();
    if (!this.sys.isActive()) return;

    this.add.text(T.width / 2, 40, 'GAME OVER', textStyle(48, '#ff4d4d', 9)).setOrigin(0.5);
    this.add.text(T.width / 2, 98, `${r.score}`, textStyle(52, '#ffffff', 9)).setOrigin(0.5);
    const team = r.players.map((id) => PLAYERS[id].glyph).join(' ');
    const mins = Math.floor(r.time / 60);
    const secs = Math.floor(r.time % 60);
    this.add
      .text(T.width / 2, 140, `${team}   ·   ${mins}:${String(secs).padStart(2, '0')} survived   ·   best combo ${r.bestCombo}   ·   ${r.correctHits} good hits`, textStyle(15, '#d8d0ff', 4))
      .setOrigin(0.5);
    if (r.score > prevBest && r.score > 0) {
      const nb = this.add.text(T.width / 2, 178, '★ NEW BEST! ★', textStyle(24, '#ffd23f', 6)).setOrigin(0.5);
      this.tweens.add({ targets: nb, scale: 1.12, yoyo: true, repeat: -1, duration: 400 });
    }

    this.countdown = this.add.text(T.width / 2, T.height - 22, '', textStyle(14, '#ffffff', 4)).setOrigin(0.5);

    if (await leaderboard.qualifies(r.score)) this.showEntry();
    else this.showBoard(null);
  }

  private showEntry(): void {
    this.state = 'entry';
    const y = 280;
    this.entryLayer.push(this.add.text(T.width / 2, 222, 'YOU MADE THE BOARD!  ENTER YOUR TEAM NAME', textStyle(18, '#ffffff', 5)).setOrigin(0.5));
    const spacing = 46;
    const x0 = T.width / 2 - ((NAME_LEN - 1) * spacing) / 2;
    for (let i = 0; i < NAME_LEN; i++) {
      const t = this.add.text(x0 + i * spacing, y, this.name[i], textStyle(40, '#ffffff', 6)).setOrigin(0.5);
      this.slots.push(t);
      this.entryLayer.push(t, this.add.rectangle(x0 + i * spacing, y + 28, 34, 4, 0xffffff, 0.3));
    }
    this.underline = this.add.rectangle(x0, y + 28, 38, 6, 0xffd23f);
    this.entryLayer.push(this.underline);
    this.entryLayer.push(
      this.add
        .text(T.width / 2, 350, '◀ ▶  move     JUMP = next letter     DASH = previous letter\nSPACE / ENTER / START = save', textStyle(14, '#d8d0ff', 4))
        .setOrigin(0.5)
        .setAlign('center'),
    );
  }

  private async submit(): Promise<void> {
    if (this.state !== 'entry') return;
    this.state = 'loading';
    const team = this.name.join('').trim() || 'TEAM';
    const { rank } = await leaderboard.submit({
      team,
      score: this.result.score,
      players: this.result.players.length,
      date: new Date().toISOString(),
    });
    if (!this.sys.isActive()) return;
    AudioManager.play('milestone');
    for (const o of this.entryLayer) o.destroy();
    this.showBoard(rank);
  }

  private async showBoard(rank: number | null): Promise<void> {
    const top = await leaderboard.top(10);
    if (!this.sys.isActive()) return;
    this.state = 'board';
    this.idle = 0;
    const x = T.width / 2;
    const y0 = 214;
    this.add.rectangle(x, y0 + 128, 420, 290, 0x000000, 0.45).setStrokeStyle(2, 0xffffff, 0.2);
    this.add.text(x, y0, 'TOP TEAMS', textStyle(20, '#ffd23f')).setOrigin(0.5);
    top.forEach((e, i) => {
      const ry = y0 + 32 + i * 25;
      const me = rank === i + 1;
      const color = me ? '#ffd23f' : '#ffffff';
      if (me) this.add.rectangle(x, ry, 400, 24, 0xffd23f, 0.18);
      this.add.text(x - 190, ry, `${i + 1}.`, textStyle(15, color, 3)).setOrigin(0, 0.5);
      this.add.text(x - 150, ry, e.team, textStyle(15, color, 3)).setOrigin(0, 0.5);
      this.add.text(x + 110, ry, '●'.repeat(e.players), textStyle(10, '#d8d0ff', 2)).setOrigin(0.5);
      this.add.text(x + 190, ry, `${Math.floor(e.score)}`, textStyle(15, color, 3)).setOrigin(1, 0.5);
    });
    if (top.length === 0) this.add.text(x, y0 + 100, 'No scores yet', textStyle(16)).setOrigin(0.5);
  }

  update(_time: number, delta: number): void {
    if (!this.inputMgr) return;
    this.inputMgr.update();
    const dt = Math.min(delta, 50) / 1000;
    if (this.inputMgr.anyPressed()) this.idle = 0;
    else this.idle += dt;

    if (this.state === 'entry') {
      this.updateEntry();
      const left = Math.ceil(T.gameOverAutoReturnS - this.idle);
      this.countdown.setText(`auto-save in ${left}s`);
      if (this.idle > T.gameOverAutoReturnS) void this.submit();
    } else if (this.state === 'board') {
      const left = Math.ceil(T.gameOverAutoReturnS - this.idle);
      this.countdown.setText(`SPACE / START = play again with same team   ·   lobby in ${left}s`);
      if (this.inputMgr.startPressed()) {
        this.scene.start('Game', { mode: 'play', players: this.result.players });
      } else if (this.idle > T.gameOverAutoReturnS) {
        this.scene.start('Lobby');
      }
    }
  }

  private updateEntry(): void {
    let left = false;
    let right = false;
    let up = false;
    let down = false;
    for (const p of PLAYERS) {
      const i = this.inputMgr.get(p.id);
      left ||= i.left;
      right ||= i.right;
      up ||= i.jumpPressed;
      down ||= i.dashPressed;
    }
    const leftEdge = left && !this.prevLeft;
    const rightEdge = right && !this.prevRight;
    this.prevLeft = left;
    this.prevRight = right;

    if (leftEdge) this.cursor = (this.cursor + NAME_LEN - 1) % NAME_LEN;
    if (rightEdge) this.cursor = (this.cursor + 1) % NAME_LEN;
    if (up || down) {
      const idx = ALPHABET.indexOf(this.name[this.cursor]);
      const next = (idx + (up ? 1 : -1) + ALPHABET.length) % ALPHABET.length;
      this.name[this.cursor] = ALPHABET[next];
      this.slots[this.cursor].setText(ALPHABET[next]);
    }
    if (leftEdge || rightEdge || up || down) AudioManager.play('select');

    const slot = this.slots[this.cursor];
    this.underline.setX(slot.x);
    this.slots.forEach((s, i) => s.setColor(i === this.cursor ? '#ffd23f' : '#ffffff'));

    if (this.inputMgr.startPressed()) void this.submit();
  }
}
