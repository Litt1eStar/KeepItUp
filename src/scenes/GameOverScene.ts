import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { S } from '../config/render';
import { PLAYERS } from '../config/players';
import { InputManager } from '../input/InputManager';
import { drawStage } from '../game/stage';
import { AudioManager } from '../systems/AudioManager';
import { leaderboard } from '../services/Leaderboard';
import { INK, INK_HEX, PAPER } from '../art/palette';
import { risoText } from '../art/type';
import { RISO_KEYS, ensureReportTextures, renderGameOverReceipt } from '../art/textures';
import { slamScale } from '../art/motion';
import { formatClock } from '../art/hud';
import { formatScore } from '../art/ui';
import { StampSlam } from '../art/views/StampSlam';
import { PrintRoller } from '../art/views/PrintRoller';
import {
  GAME_OVER, boardCountdownLabel, entryCountdownLabel, formatDotRow,
  reportLinesVisible, slotRotation, slotX, teamLabel,
} from '../art/screens';
import type { GameResult } from './GameScene';

const MULTIPLY = Phaser.BlendModes.MULTIPLY;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -!';
const NAME_LEN = 8;
const DEFAULT_NAMES = ['BOUNCERS', 'SKYHIGH', 'NOFLOOR', 'JUGGLERS', 'AIRTIME', 'UPUPUP', 'BALLERS', 'FLOATERS'];
type ReportItem = Phaser.GameObjects.Text | Phaser.GameObjects.Image;

/**
 * Game over ("ROUND REPORT" receipt): stats print line by line in steps,
 * arcade rubber-stamp name entry (works with gamepads), and full Top 10 receipt.
 * Auto-submits and returns to the lobby when left alone so the booth never gets stuck.
 */
export class GameOverScene extends Phaser.Scene {
  private result!: GameResult;
  private inputMgr!: InputManager;
  private roller!: PrintRoller;
  private state: 'loading' | 'entry' | 'board' = 'loading';
  private name: string[] = [];
  private cursor = 0;
  private shownCursor = 0;
  private idle = 0;
  private now = 0;
  private reportStartMs = -1;
  private reportRevealed = 0;
  private reportLines: ReportItem[][] = [];
  private newBestSlam: StampSlam | null = null;
  private slotBoxes: Phaser.GameObjects.Image[] = [];
  private slots: Phaser.GameObjects.Text[] = [];
  private slotSlammedAt: number[] = [];
  private slotShownScale: number[] = [];
  private cursorMarker!: Phaser.GameObjects.Image;
  private countdown!: Phaser.GameObjects.Text;
  private shownCountdown = '';
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
    this.shownCursor = 0;
    this.idle = 0;
    this.now = 0;
    this.reportStartMs = -1;
    this.reportRevealed = 0;
    this.reportLines = [];
    this.newBestSlam = null;
    this.slotBoxes = [];
    this.slots = [];
    this.slotSlammedAt = [];
    this.slotShownScale = [];
    this.shownCountdown = '';
    this.entryLayer = [];
    this.prevLeft = false;
    this.prevRight = false;
    const def = DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)].padEnd(NAME_LEN, ' ');
    this.name = def.split('');
  }

  async create(): Promise<void> {
    AudioManager.init(this);
    drawStage(this);
    ensureReportTextures(this);
    this.inputMgr = new InputManager(this);
    this.roller = new PrintRoller(this);
    this.events.once('shutdown', () => this.roller.destroy());

    const r = this.result;
    const prevBest = await leaderboard.best();
    if (!this.sys.isActive()) return;

    this.buildReport(r, prevBest);
    this.countdown = this.add
      .text(GAME_OVER.countdown.x, GAME_OVER.countdown.y, '', risoText(GAME_OVER.countdown.size, PAPER, 'mono'))
      .setFontStyle('bold')
      .setOrigin(0.5)
      .setDepth(10);

    if (await leaderboard.qualifies(r.score)) this.showEntry();
    else void this.showBoard(null);
  }

  private buildReport(r: GameResult, prevBest: number): void {
    const rep = GAME_OVER.report;
    this.add.image(rep.x, rep.y, RISO_KEYS.reportCard).setOrigin(0).setScale(S).setDepth(5);

    const monoLine = (y: number, text: string, color: string = INK.black, alignCenter = false) =>
      this.add
        .text(alignCenter ? rep.x + rep.w / 2 : rep.lineX, y, text, risoText(rep.lineSize, color, 'mono'))
        .setFontStyle('bold')
        .setOrigin(alignCenter ? 0.5 : 0, 0)
        .setBlendMode(MULTIPLY)
        .setDepth(6)
        .setVisible(false);

    const isNewBest = r.score > prevBest && r.score > 0;
    const scoreCaption = this.add
      .text(rep.lineX, rep.scoreY - 14, 'FINAL SCORE', risoText(10, INK.black, 'mono'))
      .setFontStyle('bold')
      .setBlendMode(MULTIPLY)
      .setDepth(6)
      .setVisible(false);
    const scoreVal = this.add
      .text(rep.lineX, rep.scoreY, formatScore(r.score), risoText(rep.scoreSize, INK.black))
      .setBlendMode(MULTIPLY)
      .setDepth(6)
      .setVisible(false);

    const scoreGroup: ReportItem[] = [scoreCaption, scoreVal];
    if (isNewBest) {
      const slam = new StampSlam(this, 'NICE', INK_HEX.pink, -0.1, 0.78);
      slam.image.setPosition(rep.newBestX, rep.newBestY).setDepth(7).setVisible(false);
      this.newBestSlam = slam;
      scoreGroup.push(slam.image);
    }

    const rowY = (idx: number) => rep.lineY0 + idx * rep.lineStep;
    this.reportLines = [
      scoreGroup,
      [monoLine(rowY(0), formatDotRow('CREW', teamLabel(r.players)))],
      [monoLine(rowY(1), formatDotRow('TIME SURVIVED', formatClock(r.time)))],
      [monoLine(rowY(2), formatDotRow('BEST COMBO', `×${r.bestCombo}`))],
      [monoLine(rowY(3), formatDotRow('GOOD HITS', formatScore(r.correctHits)))],
      [
        monoLine(rowY(4), formatDotRow('BEST ON RECORD', formatScore(Math.max(prevBest, r.score)))),
        monoLine(rowY(5), isNewBest ? '★ NEW RECORD PRINTED ★' : 'END OF REPORT', isNewBest ? INK.pink : INK.black, true),
      ],
    ];
  }

  private showEntry(): void {
    this.state = 'entry';
    const e = GAME_OVER.entry;
    this.entryLayer.push(
      this.add.text(e.x + 2, e.titleY + 2, 'MADE THE BOARD!', risoText(e.titleSize, INK.black)).setBlendMode(MULTIPLY).setDepth(6),
      this.add.text(e.x, e.titleY, 'MADE THE BOARD!', risoText(e.titleSize, INK.pink)).setBlendMode(MULTIPLY).setDepth(6),
      this.add.text(e.x, e.subY, 'STAMP YOUR TEAM NAME', risoText(e.subSize, INK.black, 'mono')).setFontStyle('bold').setBlendMode(MULTIPLY).setDepth(6),
    );

    for (let i = 0; i < NAME_LEN; i++) {
      const sx = slotX(i);
      const rot = slotRotation(i);
      const active = i === this.cursor;
      const box = this.add
        .image(sx, e.slotY, RISO_KEYS.letterBox)
        .setScale(S)
        .setRotation(rot)
        .setTint(active ? INK_HEX.pink : INK_HEX.black)
        .setBlendMode(MULTIPLY)
        .setDepth(6);
      const letter = this.add
        .text(sx, e.slotY + 1, this.name[i], risoText(e.slotFontSize, active ? INK.pink : INK.black))
        .setOrigin(0.5)
        .setRotation(rot)
        .setBlendMode(MULTIPLY)
        .setDepth(7);
      this.slotBoxes.push(box);
      this.slots.push(letter);
      this.slotSlammedAt.push(-Infinity);
      this.slotShownScale.push(1);
      this.entryLayer.push(box, letter);
    }

    this.cursorMarker = this.add
      .image(slotX(this.cursor), e.slotY - 48, RISO_KEYS.arrow(0))
      .setScale(S * 0.75)
      .setBlendMode(MULTIPLY)
      .setDepth(7);
    this.entryLayer.push(
      this.cursorMarker,
      this.add
        .text(e.x, e.hintY, '◀ ▶  MOVE     JUMP = NEXT LETTER     DASH = PREV\nSPACE / ENTER / START = STAMP TEAM', risoText(e.hintSize, INK.black, 'mono'))
        .setFontStyle('bold')
        .setBlendMode(MULTIPLY)
        .setDepth(6),
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
    this.entryLayer = [];
    this.slotBoxes = [];
    this.slots = [];
    void this.showBoard(rank);
  }

  private async showBoard(rank: number | null): Promise<void> {
    const top = await leaderboard.top(10);
    if (!this.sys.isActive()) return;
    this.state = 'board';
    this.idle = 0;
    renderGameOverReceipt(this, top, rank);
    this.add.image(GAME_OVER.board.x, GAME_OVER.board.y, RISO_KEYS.gameOverReceipt).setOrigin(0).setScale(S).setDepth(5);
  }

  update(time: number, delta: number): void {
    this.now = time;
    this.roller.tick(time);
    this.tickReport(time);
    if (!this.inputMgr) return;
    this.inputMgr.update();
    const dt = Math.min(delta, 50) / 1000;
    if (this.inputMgr.anyPressed()) this.idle = 0;
    else this.idle += dt;

    if (this.state === 'entry') {
      this.updateEntry();
      this.setCountdownText(entryCountdownLabel(T.gameOverAutoReturnS - this.idle));
      if (this.idle > T.gameOverAutoReturnS) void this.submit();
    } else if (this.state === 'board') {
      this.setCountdownText(boardCountdownLabel(T.gameOverAutoReturnS - this.idle));
      if (this.inputMgr.startPressed()) {
        this.scene.start('Game', { mode: 'play', players: this.result.players });
      } else if (this.idle > T.gameOverAutoReturnS) {
        this.scene.start('Lobby');
      }
    }
  }

  private tickReport(time: number): void {
    if (this.reportLines.length === 0) return;
    if (this.reportStartMs < 0) this.reportStartMs = time;
    const n = reportLinesVisible(time - this.reportStartMs, this.reportLines.length);
    if (n > this.reportRevealed) {
      for (let i = this.reportRevealed; i < n; i++) {
        for (const o of this.reportLines[i]) o.setVisible(true);
        if (i === 0) this.newBestSlam?.trigger(time);
      }
      this.reportRevealed = n;
    }
    this.newBestSlam?.tick(time);
  }

  private setCountdownText(text: string): void {
    if (!this.countdown || text === this.shownCountdown) return;
    this.shownCountdown = text;
    this.countdown.setText(text);
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

    if (this.cursor !== this.shownCursor) {
      this.slotBoxes[this.shownCursor].setTint(INK_HEX.black);
      this.slots[this.shownCursor].setColor(INK.black);
      this.slotBoxes[this.cursor].setTint(INK_HEX.pink);
      this.slots[this.cursor].setColor(INK.pink);
      this.cursorMarker.setX(slotX(this.cursor));
      this.slotSlammedAt[this.cursor] = this.now;
      this.shownCursor = this.cursor;
    }

    if (up || down) {
      const idx = ALPHABET.indexOf(this.name[this.cursor]);
      const next = (idx + (up ? 1 : -1) + ALPHABET.length) % ALPHABET.length;
      this.name[this.cursor] = ALPHABET[next];
      this.slots[this.cursor].setText(ALPHABET[next]);
      this.slotSlammedAt[this.cursor] = this.now;
    }
    if (leftEdge || rightEdge || up || down) AudioManager.play('select');

    for (let i = 0; i < NAME_LEN; i++) {
      const k = slamScale(this.now - this.slotSlammedAt[i]);
      if (k !== this.slotShownScale[i]) {
        this.slotShownScale[i] = k;
        this.slotBoxes[i].setScale(S * k);
        this.slots[i].setScale(k);
      }
    }

    if (this.inputMgr.startPressed()) void this.submit();
  }
}
