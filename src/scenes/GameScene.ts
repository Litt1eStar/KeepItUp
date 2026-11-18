import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { S } from '../config/render';
import type { PlayerId } from '../config/players';
import { InputManager, type InputSource } from '../input/InputManager';
import { BotInput } from '../input/BotInput';
import { World, type BumpEvent, type HitEvent, type TargetHitEvent } from '../game/World';
import { drawStage } from '../game/stage';
import { Juice } from '../systems/Juice';
import { AudioManager } from '../systems/AudioManager';
import { comboMultiplier, hitPoints, timePoints } from '../logic/Scoring';
import { leaderboard } from '../services/Leaderboard';
import type { Ball } from '../entities/Ball';
import type { Player } from '../entities/Player';
import { INK, PAPER, PLAYER_INK } from '../art/palette';
import { risoText } from '../art/type';
import { RISO_KEYS, refreshTicketTextures } from '../art/textures';
import { formatScore } from '../art/ui';
import {
  FLOOR_SPLAT_Y, HUD, bestLabel, demoStripVisible, dotX, dotsFilled, formatClock, isComboMilestone, localStampFor, niceDue,
} from '../art/hud';
import { ComboLabel } from '../art/views/ComboLabel';
import { PauseMenu } from '../art/views/PauseMenu';
import { PrintRoller } from '../art/views/PrintRoller';

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

const HUD_DEPTH = 45;

export class GameScene extends Phaser.Scene {
  private data_!: GameData;
  private inputMgr!: InputManager;
  private bot: BotInput | null = null;
  private world!: World;
  private juice!: Juice;
  private roller!: PrintRoller;
  private pauseMenu: PauseMenu | null = null;

  private score = 0;
  private elapsed = 0;
  private nextBallAt: number = T.extraBallInterval;
  private correctHits = 0;
  /** Consecutive correct hits (reset by a wrong hit), drives the NICE stamp cadence. */
  private streak = 0;
  private hitStopMs = 0;
  private timeScale = 1;
  private over = false;
  private best = 0;
  /** Scene time (ms) of the current frame; every effect is timed from it. */
  private now = 0;

  private hud!: {
    score: Phaser.GameObjects.Text;
    combo: ComboLabel;
    time: Phaser.GameObjects.Text;
    best: Phaser.GameObjects.Text;
    dots: Phaser.GameObjects.Image[];
    demo?: Phaser.GameObjects.Text;
  };
  /** Last values shown in the HUD: Phaser objects only change when these do. */
  private shown = { score: -1, secs: -1, best: -1, dots: -1, demo: true };

  constructor() {
    super('Game');
  }

  init(data: GameData): void {
    this.data_ = { mode: data.mode ?? 'play', players: data.players?.length ? data.players : [0] };
    this.score = 0;
    this.elapsed = 0;
    this.nextBallAt = T.extraBallInterval;
    this.correctHits = 0;
    this.streak = 0;
    this.hitStopMs = 0;
    this.timeScale = 1;
    this.over = false;
    this.bot = null;
    this.pauseMenu = null;
    this.now = 0;
    this.shown = { score: -1, secs: -1, best: -1, dots: -1, demo: true };
  }

  private get attract() {
    return this.data_.mode === 'attract';
  }
  private get multiplayer() {
    return this.data_.players.length > 1;
  }

  create(): void {
    AudioManager.init(this);
    drawStage(this);
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
    this.roller = new PrintRoller(this);
    if (!this.attract) {
      this.pauseMenu = new PauseMenu(this, {
        onResume: () => this.inputMgr.clearLatched(),
        onLobby: () => this.roller.exitTo('Lobby'),
        onRebind: () => {
          this.inputMgr.rebind();
          refreshTicketTextures(this);
        },
        canPause: () => !this.over && !this.roller.isExiting,
      });
    }
    leaderboard.best().then((b) => {
      this.best = b;
    });
    this.events.once('shutdown', () => {
      this.roller.destroy();
      this.world.destroy();
    });
  }

  /** Riso HUD in the quiet top band: black Anton score, pink combo stamp, Space Mono clock/best, next-ball dots. */
  private buildHud(): void {
    const mono = (x: number, y: number, text: string, size: number, color: string = INK.black) =>
      this.add.text(x, y, text, risoText(size, color, 'mono')).setFontStyle('bold').setDepth(HUD_DEPTH);
    const dots: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < T.extraBallInterval; i++) {
      dots.push(this.add.image(dotX(i), HUD.dots.y, RISO_KEYS.dotEmpty).setScale(S * HUD.dots.scale).setDepth(HUD_DEPTH));
    }
    this.hud = {
      score: this.add.text(HUD.score.x, HUD.score.y, '0', risoText(HUD.score.size, INK.black)).setOrigin(0, 0).setDepth(HUD_DEPTH),
      combo: new ComboLabel(this),
      time: mono(HUD.time.x, HUD.time.y, formatClock(0), HUD.time.size).setOrigin(0.5, 0),
      best: mono(HUD.best.x, HUD.best.y, bestLabel(0), HUD.best.size).setOrigin(1, 0),
      dots,
    };
    this.hud.combo.container.setDepth(HUD_DEPTH);
    mono(HUD.nextCaption.x, HUD.nextCaption.y, 'NEXT BALL', HUD.nextCaption.size).setOrigin(0.5, 0);

    if (this.attract) {
      // Printed in paper colour on the black floor band (part of the bg), so it never hides the balls.
      this.hud.demo = mono(HUD.demo.x, HUD.demo.y, 'DEMO · PRESS ANY BUTTON TO PLAY', HUD.demo.size, PAPER).setOrigin(0.5).setDepth(56);
    }
  }

  private wireEvents(): void {
    this.world.on('hit', (e: HitEvent) => this.onHit(e));
    this.world.on('jump', (p: Player) => this.juice.splat(p.x, p.y - 4, PLAYER_INK[p.id], 'small', 1));
    this.world.on('land', (p: Player) => this.juice.splat(p.x, p.y - 4, PLAYER_INK[p.id], 'small', 1));
    this.world.on('dash', (p: Player) => {
      AudioManager.play('dash');
      this.juice.splat(p.x, p.y - 16, PLAYER_INK[p.id], 'small', 1);
    });
    this.world.on('bump', (e: BumpEvent) => {
      AudioManager.play('hit');
      this.juice.splat(e.x, e.y, PLAYER_INK[e.ink], 'hit', 2);
    });
    this.world.on('ballCollide', (e: BumpEvent) => {
      AudioManager.play('hit');
      this.juice.splat(e.x, e.y, PLAYER_INK[e.ink], 'small', 2);
    });
    this.world.on('targetHit', (e: TargetHitEvent) => this.onTargetHit(e));
    this.world.on('comboBreak', (ball: Ball) => {
      AudioManager.play('comboBreak');
      this.juice.popup(ball.x, ball.y - 50, 'COMBO BREAK', 'pink', 20);
    });
    this.world.on('floor', (ball: Ball) => this.onDrop(ball));
  }

  private onTargetHit(e: TargetHitEvent): void {
    if (this.over) return;
    AudioManager.play('milestone');
    if (e.kind === 'calm') {
      for (const b of this.world.balls) b.speedMult = Math.max(T.speedMin, b.speedMult - 0.25);
      const pts = Math.round(T.targetCalmPoints * comboMultiplier(this.world.combo, T));
      this.score += pts;
      this.juice.splat(e.x, e.y, 'blue', 'jump');
      this.juice.popup(e.x, e.y, `SLOW +${pts}`, 'blue', 20);
    } else {
      this.world.combo++;
      this.world.bestCombo = Math.max(this.world.bestCombo, this.world.combo);
      const pts = Math.round(T.targetBonusPoints * comboMultiplier(this.world.combo, T));
      this.score += pts;
      this.juice.splat(e.x, e.y, 'pink', 'jump');
      this.juice.popup(e.x, e.y, `★ +${pts}`, 'pink', 22);
    }
  }

  private onHit(e: HitEvent): void {
    if (this.over) return;
    this.hitStopMs = T.hitStopMs;
    const ink = PLAYER_INK[e.player.id];
    this.juice.splat(e.ball.x, e.ball.bottom, ink, e.jumpHit ? 'jump' : 'hit');
    AudioManager.play(e.jumpHit ? 'jumpHit' : 'hit');

    let nice = false;
    if (e.correct) {
      this.correctHits++;
      this.streak++;
      const pts = hitPoints(e.combo, T);
      this.score += pts;
      this.juice.popup(e.ball.x, e.ball.y - 40, `+${Math.round(pts)}`, ink, 22);
      if (this.multiplayer) AudioManager.play('correct');
      const milestone = isComboMilestone(e.combo);
      if (milestone) {
        this.juice.banner('COMBO', { label: String(e.combo) });
        AudioManager.play('milestone');
      }
      nice = this.multiplayer && niceDue(this.streak, milestone);
    } else {
      this.streak = 0;
      AudioManager.play('wrong');
      // Wrong hit: the hitter's ink jumps out of register (no camera shake: the whole print would move).
      e.player.jolt(this.now);
      this.juice.popup(e.ball.x, e.ball.y - 40, 'SPEED UP', 'black', 18);
    }
    // At most one small stamp above the hitter (they'd overprint): WRONG > NICE > PASS.
    const local = localStampFor({ correct: e.correct, nice, pass: e.dashPass && this.multiplayer });
    if (local === 'WRONG') this.juice.stamp('WRONG', e.player.x, e.player.top - 46);
    else if (local) this.juice.stamp(local, e.player.x, e.player.top - 46, ink, 0.8);
  }

  private onDrop(ball: Ball): void {
    if (this.over) return;
    this.over = true;
    this.pauseMenu?.hide();
    this.timeScale = T.slowMoScale;
    AudioManager.play('gameover');
    // Big pink ink splat on the floor line under the dropped ball + DROPPED stamp. No flash; one tiny
    // camera bump (80 ms, 0.003) lands with the stamp so the slam has weight.
    this.juice.splat(ball.x, FLOOR_SPLAT_Y, 'pink', 'floor', Infinity);
    this.juice.banner('DROPPED', { holdMs: Infinity, scale: 2.2 });
    this.cameras.main.shake(80, 0.003);

    this.time.delayedCall(T.slowMoMs + 400, () => {
      if (this.attract) {
        this.roller.exitTo('Lobby');
        return;
      }
      const result: GameResult = {
        score: Math.floor(this.score),
        time: this.elapsed,
        bestCombo: this.world.bestCombo,
        correctHits: this.correctHits,
        players: this.data_.players,
      };
      this.roller.exitTo('GameOver', result);
    });
  }

  update(time: number, delta: number): void {
    this.now = time;
    this.roller.tick(time);
    if (this.roller.isExiting) return;
    this.pauseMenu?.tick(time);
    if (this.pauseMenu?.isOpen) return;
    this.juice.update(time);
    this.inputMgr.update();
    if (this.attract) {
      if (this.inputMgr.anyPressed() || this.elapsed > T.attractMaxS) {
        this.roller.exitTo('Lobby');
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
        this.juice.banner('PLUS_BALL');
      }
    }

    const source: InputSource = this.bot ?? this.inputMgr;
    this.world.step(dt, source);
    this.world.render(dt, time);
    this.updateHud(time);
  }

  /** Touches Phaser objects only when a shown value changes (strings are built only then). */
  private updateHud(time: number): void {
    const h = this.hud;
    const sh = this.shown;
    const s = Math.floor(this.score);
    if (s !== sh.score) {
      sh.score = s;
      h.score.setText(formatScore(s));
    }
    const c = this.world.combo;
    h.combo.set(c, comboMultiplier(c, T), time);
    const secs = Math.floor(this.elapsed);
    if (secs !== sh.secs) {
      sh.secs = secs;
      h.time.setText(formatClock(secs));
    }
    const best = Math.max(this.best, this.attract ? 0 : s);
    if (best !== sh.best) {
      sh.best = best;
      h.best.setText(bestLabel(best));
    }
    const n = dotsFilled(this.elapsed, this.nextBallAt);
    if (n !== sh.dots) {
      sh.dots = n;
      for (let i = 0; i < h.dots.length; i++) h.dots[i].setTexture(i < n ? RISO_KEYS.dot : RISO_KEYS.dotEmpty);
    }
    if (h.demo) {
      const on = demoStripVisible(time);
      if (on !== sh.demo) {
        sh.demo = on;
        h.demo.setVisible(on);
      }
    }
  }
}
