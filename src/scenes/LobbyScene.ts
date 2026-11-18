import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { S } from '../config/render';
import { PLAYERS, type PlayerId } from '../config/players';
import { InputManager } from '../input/InputManager';
import { World, type HitEvent } from '../game/World';
import { drawStage } from '../game/stage';
import { Juice } from '../systems/Juice';
import { AudioManager } from '../systems/AudioManager';
import { leaderboard } from '../services/Leaderboard';
import { INK, INK_HEX, PAPER, PLAYER_INK } from '../art/palette';
import { risoText } from '../art/type';
import { RISO_KEYS, refreshTicketTextures, renderLobbyReceipt } from '../art/textures';
import { TICKET, stampTint } from '../art/ui';
import { demoStripVisible, readableInk } from '../art/hud';
import { StampSlam } from '../art/views/StampSlam';
import { PrintRoller } from '../art/views/PrintRoller';
import { PauseMenu } from '../art/views/PauseMenu';
import { LOBBY, joinPrompt, padLabel, promptBlinkVisible, ticketX } from '../art/screens';
import type { Ball } from '../entities/Ball';

const MULTIPLY = Phaser.BlendModes.MULTIPLY;

interface TicketCard {
  ticket: Phaser.GameObjects.Image;
  slam: StampSlam;
  status: Phaser.GameObjects.Text;
  pad: Phaser.GameObjects.Text;
  lastPad: string;
  lastVis: boolean;
}

/**
 * Lobby ("zine cover") with a practice area: joined players appear on the floor and can bounce a
 * practice ball that can't fail, so visitors learn the controls while the team assembles.
 */
export class LobbyScene extends Phaser.Scene {
  private inputMgr!: InputManager;
  private world!: World;
  private juice!: Juice;
  private roller!: PrintRoller;
  private controlsMenu!: PauseMenu;
  private joined = new Set<PlayerId>();
  private idle = 0;
  private now = 0;
  private cards: TicketCard[] = [];
  private receiptImg!: Phaser.GameObjects.Image;
  private startHint!: Phaser.GameObjects.Text;
  private lastHintVis = true;

  constructor() {
    super('Lobby');
  }

  create(): void {
    this.joined.clear();
    this.idle = 0;
    this.now = 0;
    this.cards = [];
    this.lastHintVis = true;
    AudioManager.init(this);
    drawStage(this);
    this.inputMgr = new InputManager(this);
    this.world = new World(this, false);
    this.juice = new Juice(this);

    this.buildCoverHeader();
    refreshTicketTextures(this);
    this.buildTickets();
    this.buildBoard();

    this.startHint = this.add
      .text(LOBBY.startHint.x, LOBBY.startHint.y, LOBBY.startHint.text, risoText(LOBBY.startHint.size, PAPER, 'mono'))
      .setFontStyle('bold')
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

    this.roller = new PrintRoller(this);
    this.controlsMenu = new PauseMenu(this, {
      controlsOnly: true,
      onResume: () => this.inputMgr.clearLatched(),
      onRebind: () => this.onRebindKeys(),
    });
    this.events.once('shutdown', () => {
      this.roller.destroy();
      this.world.destroy();
    });
  }

  private onRebindKeys(): void {
    this.inputMgr.rebind();
    refreshTicketTextures(this);
    for (const p of PLAYERS) {
      const card = this.cards[p.id];
      card.ticket.setTexture(RISO_KEYS.ticket(p.id));
      if (!this.joined.has(p.id)) card.status.setText(joinPrompt(p.id, false));
    }
  }

  private buildCoverHeader(): void {
    const { title: t, masthead: m } = LOBBY;
    const layers: readonly [string, string, number, number][] = [
      [INK.yellow, INK.pink, -2, 2],
      [INK.pink, INK.blue, 2, -1],
      [INK.blue, INK.black, -2, 1],
    ];
    t.words.forEach((word, i) => {
      const y = t.y + i * t.lineStep;
      const [under, over, dx, dy] = layers[i];
      this.add.text(t.x + dx, y + dy, word, risoText(t.size, under)).setBlendMode(MULTIPLY).setDepth(5);
      this.add.text(t.x, y, word, risoText(t.size, over)).setBlendMode(MULTIPLY).setDepth(5);
    });

    this.add
      .text(m.x, m.issueY, 'ISSUE 01 · UNIVERSITY OPEN HOUSE · CO-OP ZINE', risoText(m.issueSize, INK.black, 'mono'))
      .setFontStyle('bold')
      .setBlendMode(MULTIPLY)
      .setDepth(5);
    this.add
      .text(m.x, m.headlineY, 'KEEP EVERY BALL OFF THE FLOOR', risoText(m.headlineSize, INK.pink))
      .setBlendMode(MULTIPLY)
      .setDepth(5);
    this.add
      .text(m.x, m.subY, 'HIT BALLS THAT MATCH YOUR INK & SHAPE · DASH TO PASS', risoText(m.subSize, INK.black, 'mono'))
      .setFontStyle('bold')
      .setBlendMode(MULTIPLY)
      .setDepth(5);
    this.add.graphics().setBlendMode(MULTIPLY).setDepth(5).lineStyle(2, INK_HEX.black).lineBetween(m.x, m.ruleY, m.x + m.ruleW, m.ruleY);
  }

  private buildTickets(): void {
    const tk = LOBBY.tickets;
    for (const p of PLAYERS) {
      const x = ticketX(p.id);
      const ticket = this.add.image(x, tk.y, RISO_KEYS.ticket(p.id)).setOrigin(0).setScale(S * tk.scale).setDepth(5);
      const slam = new StampSlam(this, 'JOINED', stampTint(PLAYER_INK[p.id]), tk.stampRot, tk.stampScale);
      slam.image.setPosition(x + tk.stampOffsetX, tk.y + tk.stampOffsetY).setDepth(7).setVisible(false);

      const cx = x + (TICKET.w * tk.scale) / 2;
      const statusColor = INK[readableInk(PLAYER_INK[p.id])];
      const status = this.add
        .text(cx, tk.statusY, joinPrompt(p.id, false), risoText(11, statusColor, 'mono'))
        .setFontStyle('bold')
        .setOrigin(0.5, 0)
        .setBlendMode(MULTIPLY)
        .setDepth(6);
      const initialPad = padLabel(p.gamepadIndex, false);
      const pad = this.add
        .text(cx, tk.padY, initialPad, risoText(10, INK.black, 'mono'))
        .setOrigin(0.5, 0)
        .setBlendMode(MULTIPLY)
        .setDepth(6);
      this.cards.push({ ticket, slam, status, pad, lastPad: initialPad, lastVis: true });
    }
  }

  private async buildBoard(): Promise<void> {
    renderLobbyReceipt(this, []);
    this.receiptImg = this.add.image(LOBBY.receipt.x, LOBBY.receipt.y, RISO_KEYS.lobbyReceipt).setOrigin(0).setScale(S).setDepth(5);
    const top = await leaderboard.top(5);
    if (!this.sys.isActive()) return;
    renderLobbyReceipt(this, top);
    this.receiptImg.setTexture(RISO_KEYS.lobbyReceipt);
  }

  private join(id: PlayerId): void {
    if (this.joined.has(id)) return;
    this.joined.add(id);
    this.world.addPlayer(id);
    AudioManager.play('join');
    const card = this.cards[id];
    card.status.setText(joinPrompt(id, true));
    if (!card.lastVis) {
      card.lastVis = true;
      card.status.setVisible(true);
    }
    card.slam.image.setVisible(true);
    card.slam.trigger(this.now);
    card.slam.tick(this.now);
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
    this.now = time;
    this.roller.tick(time);
    this.controlsMenu.tick(time);
    if (this.controlsMenu.isOpen) {
      this.idle = 0;
      return;
    }
    this.juice.update(time);
    this.inputMgr.update();
    const dt = Math.min(delta, 50) / 1000;

    for (const p of PLAYERS) {
      if (this.inputMgr.get(p.id).jumpPressed) this.join(p.id);
      const card = this.cards[p.id];
      const padText = padLabel(p.gamepadIndex, this.inputMgr.padConnected(p.gamepadIndex));
      if (padText !== card.lastPad) {
        card.lastPad = padText;
        card.pad.setText(padText);
      }
      if (this.joined.has(p.id)) {
        card.slam.tick(time);
      } else {
        const vis = promptBlinkVisible(time, p.id);
        if (vis !== card.lastVis) {
          card.lastVis = vis;
          card.status.setVisible(vis);
        }
      }
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

    const hintVis = demoStripVisible(time);
    if (hintVis !== this.lastHintVis) {
      this.lastHintVis = hintVis;
      this.startHint.setVisible(hintVis);
    }

    this.world.step(dt, this.inputMgr);
    this.world.render(dt, time);
  }
}
