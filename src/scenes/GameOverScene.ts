import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { S } from '../config/render';
import { InputManager } from '../input/InputManager';
import { drawStage } from '../game/stage';
import { AudioManager } from '../systems/AudioManager';
import { leaderboard } from '../services/Leaderboard';
import { INK, INK_HEX, PAPER, PAPER_HEX } from '../art/palette';
import { risoText } from '../art/type';
import { RISO_KEYS, ensureReportTextures, renderGameOverReceipt } from '../art/textures';
import { slamScale } from '../art/motion';
import { formatClock } from '../art/hud';
import { formatScore } from '../art/ui';
import { StampSlam } from '../art/views/StampSlam';
import { PrintRoller } from '../art/views/PrintRoller';
import {
  GAME_OVER, boardCountdownLabel, entryCountdownLabel, formatDotRow,
  mvpAwardLabel, promptBlinkVisible, reportLinesVisible, teamLabel,
} from '../art/screens';
import type { GameResult } from './GameScene';

const MULTIPLY = Phaser.BlendModes.MULTIPLY;
const ALLOWED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -!';
const MAX_NAME_LEN = 12;
const INPUT_W = 432;
const INPUT_H = 62;
const DEFAULT_NAMES = ['BOUNCERS', 'SKYHIGH', 'NOFLOOR', 'JUGGLERS', 'AIRTIME', 'UPUPUP', 'BALLERS', 'FLOATERS'];
type ReportItem = Phaser.GameObjects.Text | Phaser.GameObjects.Image;

/**
 * Game over ("ROUND REPORT" receipt): stats print line by line in steps,
 * direct keyboard team-name entry (Enter or Gamepad Start to stamp), and full Top 10 receipt.
 * Auto-submits and returns to the lobby when left alone so the booth never gets stuck.
 */
export class GameOverScene extends Phaser.Scene {
  private result!: GameResult;
  private inputMgr!: InputManager;
  private roller!: PrintRoller;
  private state: 'loading' | 'entry' | 'board' = 'loading';
  private teamName = '';
  private fallbackName = 'TEAM';
  private idle = 0;
  private now = 0;
  private reportStartMs = -1;
  private reportRevealed = 0;
  private reportLines: ReportItem[][] = [];
  private newBestSlam: StampSlam | null = null;
  private nameText!: Phaser.GameObjects.Text;
  private nameSlammedAt = -Infinity;
  private nameShownScale = 1;
  private lastCaretVis = true;
  private countdown!: Phaser.GameObjects.Text;
  private shownCountdown = '';
  private entryLayer: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('GameOver');
  }

  init(result: GameResult): void {
    this.result = result;
    this.state = 'loading';
    this.teamName = '';
    this.fallbackName = DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];
    this.idle = 0;
    this.now = 0;
    this.reportStartMs = -1;
    this.reportRevealed = 0;
    this.reportLines = [];
    this.newBestSlam = null;
    this.nameSlammedAt = -Infinity;
    this.nameShownScale = 1;
    this.lastCaretVis = true;
    this.shownCountdown = '';
    this.entryLayer = [];
  }

  async create(): Promise<void> {
    AudioManager.init(this);
    AudioManager.setMusic('menu');
    AudioManager.setMusicDucked(true);
    drawStage(this);
    ensureReportTextures(this);
    this.inputMgr = new InputManager(this);
    this.roller = new PrintRoller(this);
    const onKeyDown = (event: KeyboardEvent) => {
      if (this.roller.isExiting) return;
      if (event.code === 'Escape' || event.key === 'Escape') {
        event.preventDefault?.();
        AudioManager.play('select');
        this.roller.exitTo('Lobby');
        return;
      }
      if (this.state === 'entry') this.handleEntryKey(event);
    };
    this.input.keyboard?.on('keydown', onKeyDown);
    this.events.once('shutdown', () => {
      this.input.keyboard?.off('keydown', onKeyDown);
      this.roller.destroy();
    });

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

    const award = mvpAwardLabel(r);
    const rowY = (idx: number) => rep.lineY0 + idx * rep.lineStep;
    this.reportLines = [
      scoreGroup,
      [monoLine(rowY(0), formatDotRow('CREW', teamLabel(r.players)))],
      [monoLine(rowY(1), formatDotRow('TIME SURVIVED', formatClock(r.time)))],
      [monoLine(rowY(2), formatDotRow('BEST COMBO', `×${r.bestCombo}`))],
      [monoLine(rowY(3), formatDotRow('GOOD HITS', formatScore(r.correctHits)))],
      [monoLine(rowY(4), formatDotRow('BEST ON RECORD', formatScore(Math.max(prevBest, r.score))))],
      [monoLine(rowY(5), formatDotRow(award.left, award.right), INK.pink)],
      [monoLine(rowY(6), isNewBest ? '★ NEW RECORD PRINTED ★' : 'END OF REPORT', isNewBest ? INK.pink : INK.black, true)],
    ];
  }

  private showEntry(): void {
    this.state = 'entry';
    const e = GAME_OVER.entry;
    const boxY = e.slotY - INPUT_H / 2;
    const bg = this.add.rectangle(e.x, boxY, INPUT_W, INPUT_H, PAPER_HEX).setOrigin(0).setDepth(5);
    const frame = this.add.graphics().setDepth(6);
    frame.lineStyle(2.5, INK_HEX.pink).strokeRect(e.x, boxY, INPUT_W, INPUT_H);
    frame.lineStyle(1, INK_HEX.black).strokeRect(e.x + 4, boxY + 4, INPUT_W - 8, INPUT_H - 8);

    this.nameText = this.add
      .text(e.x + 18, e.slotY + 1, '_', risoText(34, INK.black))
      .setOrigin(0, 0.5)
      .setBlendMode(MULTIPLY)
      .setDepth(7);

    this.entryLayer.push(
      bg,
      frame,
      this.nameText,
      this.add.text(e.x + 2, e.titleY + 2, 'MADE THE BOARD!', risoText(e.titleSize, INK.black)).setBlendMode(MULTIPLY).setDepth(6),
      this.add.text(e.x, e.titleY, 'MADE THE BOARD!', risoText(e.titleSize, INK.pink)).setBlendMode(MULTIPLY).setDepth(6),
      this.add.text(e.x, e.subY, 'STAMP YOUR TEAM NAME', risoText(e.subSize, INK.black, 'mono')).setFontStyle('bold').setBlendMode(MULTIPLY).setDepth(6),
      this.add
        .text(
          e.x,
          e.hintY,
          'TYPE NAME ON KEYBOARD · BACKSPACE = DELETE\nENTER / PAD START = STAMP TEAM (BLANK = RANDOM)',
          risoText(e.hintSize, INK.black, 'mono'),
        )
        .setFontStyle('bold')
        .setBlendMode(MULTIPLY)
        .setDepth(6),
    );
    this.refreshNameText();
  }

  private refreshNameText(): void {
    const caret = promptBlinkVisible(this.now);
    this.lastCaretVis = caret;
    const display = this.teamName.length > 0 ? `${this.teamName}${caret ? '_' : ''}` : caret ? '_' : '';
    this.nameText?.setText(display);
  }

  private async submit(): Promise<void> {
    if (this.state !== 'entry') return;
    this.state = 'loading';
    const team = this.teamName.trim() || this.fallbackName;
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
    if (this.roller.isExiting) return;
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
      if (this.inputMgr.startPressed() || this.inputMgr.padConfirmPressed()) {
        this.roller.exitTo('Game', { mode: 'play', players: this.result.players });
      } else if (this.inputMgr.padBackPressed() || this.idle > T.gameOverAutoReturnS) {
        this.roller.exitTo('Lobby');
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

  private handleEntryKey(event: KeyboardEvent): void {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const code = event.code;
    if (code === 'Enter' || code === 'NumpadEnter') {
      event.preventDefault?.();
      void this.submit();
      return;
    }
    if (code === 'Backspace') {
      event.preventDefault?.();
      this.idle = 0;
      if (this.teamName.length > 0) {
        this.teamName = this.teamName.slice(0, -1);
        this.nameSlammedAt = this.now;
        this.refreshNameText();
        AudioManager.play('select');
      }
      return;
    }
    const ch = event.key.length === 1 ? event.key.toUpperCase() : '';
    if (ch && ALLOWED_CHARS.includes(ch) && this.teamName.length < MAX_NAME_LEN) {
      event.preventDefault?.();
      this.idle = 0;
      if (ch === ' ' && this.teamName.length === 0) return;
      this.teamName += ch;
      this.nameSlammedAt = this.now;
      this.refreshNameText();
      AudioManager.play('select');
    }
  }

  private updateEntry(): void {
    const caret = promptBlinkVisible(this.now);
    if (caret !== this.lastCaretVis) this.refreshNameText();

    const k = slamScale(this.now - this.nameSlammedAt);
    if (k !== this.nameShownScale) {
      this.nameShownScale = k;
      this.nameText.setScale(1, k);
    }

    if (this.inputMgr.padStartPressed()) void this.submit();
  }
}
