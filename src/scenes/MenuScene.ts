import Phaser from 'phaser';
import { TUNING as T } from '../config/tuning';
import { S } from '../config/render';
import { CHAR_STYLE_IDS, type PlayerId } from '../config/players';
import { InputManager } from '../input/InputManager';
import { BotInput } from '../input/BotInput';
import { World, type BumpEvent, type HitEvent } from '../game/World';
import { drawStage } from '../game/stage';
import { Juice } from '../systems/Juice';
import { AudioManager } from '../systems/AudioManager';
import { leaderboard } from '../services/Leaderboard';
import { INK, INK_HEX, PAPER, PAPER_HEX, playerColor, styleColor } from '../art/palette';
import { risoText } from '../art/type';
import { RISO_KEYS, refreshTicketTextures, renderLobbyReceipt } from '../art/textures';
import { RECEIPT } from '../art/ui';
import { slamScale } from '../art/motion';
import { demoStripVisible } from '../art/hud';
import { PrintRoller } from '../art/views/PrintRoller';
import { PauseMenu } from '../art/views/PauseMenu';
import { MENU_ITEMS, MENU_LAYOUT, menuItemY } from '../art/screens';
import type { Ball } from '../entities/Ball';
import type { Player } from '../entities/Player';

const MULTIPLY = Phaser.BlendModes.MULTIPLY;
const CARD_W = 276;
const CARD_H = 176;
const FLOOR_CHAR_XS = [110, 255, 400, 545, 690, 835] as const;

/**
 * Booth Main Menu ("zine poster cover"): all 6 character variants run, jump and juggle a live ball
 * across the floor behind a bold riso masthead, a 3-item menu card (Play, Controls, Top Teams) and the receipt.
 */
export class MenuScene extends Phaser.Scene {
  private inputMgr!: InputManager;
  private world!: World;
  private bot!: BotInput;
  private juice!: Juice;
  private roller!: PrintRoller;
  private controlsMenu!: PauseMenu;

  private cursor = 0;
  private now = 0;
  private slammedAt = -Infinity;
  private lastItemScale = 1;
  private receiptSlammedAt = -Infinity;
  private lastReceiptScale = 1;
  private lastHintVis = true;

  private menuTexts: Phaser.GameObjects.Text[] = [];
  private arrow!: Phaser.GameObjects.Image;
  private receiptImg!: Phaser.GameObjects.Image;
  private hintText!: Phaser.GameObjects.Text;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.controlsMenu.isOpen || this.roller.isExiting) return;
    const code = event.code;
    if (code === 'ArrowUp' || code === 'KeyW') {
      event.preventDefault?.();
      this.moveCursor(-1);
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      event.preventDefault?.();
      this.moveCursor(1);
    }
  };

  constructor() {
    super('Menu');
  }

  create(): void {
    this.cursor = 0;
    this.now = 0;
    this.slammedAt = -Infinity;
    this.lastItemScale = 1;
    this.receiptSlammedAt = -Infinity;
    this.lastReceiptScale = 1;
    this.lastHintVis = true;
    this.menuTexts = [];

    AudioManager.init(this);
    AudioManager.setMusicDucked(false);
    AudioManager.setMusic('menu');
    drawStage(this);
    this.inputMgr = new InputManager(this);
    this.world = new World(this, false);
    this.juice = new Juice(this);
    for (const style of CHAR_STYLE_IDS) {
      this.world.addPlayer((style % 3) as PlayerId, FLOOR_CHAR_XS[style], style);
    }
    this.bot = new BotInput(this.world);
    this.spawnDemoBall(480);

    this.wireWorldFx();
    this.buildMasthead();
    this.buildMenuCard();
    this.buildReceipt();

    this.hintText = this.add
      .text(MENU_LAYOUT.hint.x, MENU_LAYOUT.hint.y, MENU_LAYOUT.hint.text, risoText(MENU_LAYOUT.hint.size, PAPER, 'mono'))
      .setFontStyle('bold')
      .setOrigin(0.5)
      .setDepth(10);

    this.controlsMenu = new PauseMenu(this, {
      controlsOnly: true,
      onResume: () => this.inputMgr.clearLatched(),
      onRebind: () => {
        this.inputMgr.rebind();
        refreshTicketTextures(this);
      },
    });
    this.roller = new PrintRoller(this);

    this.input.keyboard?.on('keydown', this.onKeyDown);
    this.events.once('shutdown', () => {
      this.input.keyboard?.off('keydown', this.onKeyDown);
      this.roller.destroy();
      this.world.destroy();
    });
  }

  private spawnDemoBall(x?: number): void {
    if (!this.sys.isActive() || this.world.balls.length > 0) return;
    const b = this.world.spawnBall(x, 0.7);
    b.y = 220;
  }

  private wireWorldFx(): void {
    this.world.on('hit', (e: HitEvent) => {
      this.juice.splat(e.ball.x, e.ball.bottom, styleColor(e.player.charStyle).hex, e.jumpHit ? 'jump' : 'hit');
    });
    this.world.on('jump', (p: Player) => {
      this.juice.splat(p.x, p.y - 4, styleColor(p.charStyle).hex, 'small', 1);
    });
    this.world.on('dash', (p: Player) => {
      this.juice.splat(p.x, p.y - 16, styleColor(p.charStyle).hex, 'small', 1);
    });
    this.world.on('land', (p: Player) => {
      this.juice.splat(p.x, p.y - 4, styleColor(p.charStyle).hex, 'small', 1);
    });
    this.world.on('bump', (e: BumpEvent) => {
      this.juice.splat(e.x, e.y, playerColor(e.ink).hex, 'hit', 2);
    });
    this.world.on('floor', (ball: Ball) => {
      this.juice.splat(ball.x, T.floorY - 12, playerColor(ball.target).hex, 'small', 2);
      this.world.removeBall(ball);
      this.time.delayedCall(400, () => this.spawnDemoBall());
    });
  }

  private buildMasthead(): void {
    const L = MENU_LAYOUT;
    this.add
      .text(L.titleX, L.issueY, 'ISSUE 01 · UNIVERSITY OPEN HOUSE · CO-OP JUGGLING ZINE', risoText(10, INK.black, 'mono'))
      .setFontStyle('bold')
      .setBlendMode(MULTIPLY)
      .setDepth(5);

    const overprints: readonly [string, number, number][] = [
      [INK.yellow, 3, 3],
      [INK.pink, -2, 1],
      [INK.blue, 2, -1],
      [INK.black, 0, 0],
    ];
    for (const [color, dx, dy] of overprints) {
      this.add.text(L.titleX + dx, L.titleY + dy, 'KEEP IT UP!', risoText(L.titleSize, color)).setBlendMode(MULTIPLY).setDepth(5);
    }

    this.add
      .text(L.titleX, L.subY, '1–3 PLAYERS · DON’T LET ANY BALL HIT THE FLOOR', risoText(11, INK.black, 'mono'))
      .setFontStyle('bold')
      .setBlendMode(MULTIPLY)
      .setDepth(5);
  }

  private buildMenuCard(): void {
    const L = MENU_LAYOUT;
    this.add.rectangle(L.cardX, L.cardY, CARD_W, CARD_H, PAPER_HEX).setOrigin(0).setDepth(5);
    const frame = this.add.graphics().setDepth(6);
    frame.lineStyle(2.5, INK_HEX.black).strokeRect(L.cardX, L.cardY, CARD_W, CARD_H);
    frame.lineStyle(1, INK_HEX.black).strokeRect(L.cardX + 4, L.cardY + 4, CARD_W - 8, CARD_H - 8);
    frame.fillStyle(INK_HEX.pink).fillRect(L.cardX + 6, L.cardY + 6, CARD_W - 12, 8);

    this.arrow = this.add
      .image(L.arrowX, menuItemY(0), RISO_KEYS.arrow(0))
      .setScale(S * 0.72)
      .setRotation(-Math.PI / 2)
      .setBlendMode(MULTIPLY)
      .setDepth(7);

    MENU_ITEMS.forEach((label, i) => {
      const item = this.add
        .text(L.itemX, menuItemY(i), label, risoText(L.itemSize, i === 0 ? INK.pink : INK.black))
        .setOrigin(0.5)
        .setBlendMode(MULTIPLY)
        .setDepth(7)
        .setInteractive({ useHandCursor: true });
      item.on('pointerover', () => {
        if (this.controlsMenu.isOpen || this.roller.isExiting || this.cursor === i) return;
        this.cursor = i;
        this.slammedAt = this.now;
        AudioManager.play('select');
        this.refreshMenuVisuals();
      });
      item.on('pointerdown', () => {
        if (this.controlsMenu.isOpen || this.roller.isExiting) return;
        this.cursor = i;
        this.refreshMenuVisuals();
        this.activateItem();
      });
      this.menuTexts.push(item);
    });
  }

  private async buildReceipt(): Promise<void> {
    const L = MENU_LAYOUT;
    renderLobbyReceipt(this, []);
    this.receiptImg = this.add
      .image(L.receiptX + RECEIPT.w / 2, L.receiptY + RECEIPT.h / 2, RISO_KEYS.lobbyReceipt)
      .setOrigin(0.5)
      .setScale(S)
      .setDepth(5);
    const loading = this.add
      .text(L.receiptX + RECEIPT.w / 2, L.receiptY + RECEIPT.h - 32, 'LOADING...', risoText(10, INK.pink, 'mono'))
      .setFontStyle('bold')
      .setOrigin(0.5)
      .setBlendMode(MULTIPLY)
      .setDepth(7);
    const top = await leaderboard.top(5);
    loading.destroy();
    if (!this.sys.isActive()) return;
    renderLobbyReceipt(this, top);
    this.receiptImg.setTexture(RISO_KEYS.lobbyReceipt);
  }

  private moveCursor(delta: -1 | 1): void {
    this.cursor = (this.cursor + delta + MENU_ITEMS.length) % MENU_ITEMS.length;
    this.slammedAt = this.now;
    AudioManager.play('select');
    this.refreshMenuVisuals();
  }

  private refreshMenuVisuals(): void {
    this.lastItemScale = NaN;
    this.arrow.setY(menuItemY(this.cursor));
    this.menuTexts.forEach((t, i) => {
      t.setColor(i === this.cursor ? INK.pink : INK.black);
      if (i !== this.cursor) t.setScale(1);
    });
  }

  private activateItem(): void {
    if (this.cursor === 0) {
      AudioManager.play('join');
      this.roller.exitTo('Lobby');
    } else if (this.cursor === 1) {
      this.controlsMenu.show(this.now);
    } else {
      this.receiptSlammedAt = this.now;
      this.lastReceiptScale = NaN;
      AudioManager.play('milestone');
    }
  }

  update(time: number, delta: number): void {
    this.now = time;
    this.roller.tick(time);
    if (this.roller.isExiting) return;
    this.inputMgr.update();
    this.controlsMenu.tick(time, this.inputMgr);

    this.juice.update(time);
    const dt = Math.min(delta, 50) / 1000;

    if (!this.controlsMenu.isOpen) {
      const dir = this.inputMgr.padMenuDir();
      if (dir.up) this.moveCursor(-1);
      else if (dir.down) this.moveCursor(1);
      if (this.inputMgr.startPressed() || this.inputMgr.padConfirmPressed()) {
        this.activateItem();
        if (this.controlsMenu.isOpen) this.inputMgr.clearLatched();
        return;
      }
    }

    const itemS = slamScale(time - this.slammedAt);
    if (itemS !== this.lastItemScale) {
      this.lastItemScale = itemS;
      this.menuTexts[this.cursor]?.setScale(itemS);
    }

    const recS = slamScale(time - this.receiptSlammedAt);
    if (recS !== this.lastReceiptScale && this.receiptImg) {
      this.lastReceiptScale = recS;
      this.receiptImg.setScale(S * recS);
    }

    const hintVis = demoStripVisible(time);
    if (hintVis !== this.lastHintVis) {
      this.lastHintVis = hintVis;
      this.hintText.setVisible(hintVis);
    }

    this.bot.update();
    this.world.step(dt, this.bot);
    this.world.render(dt, time);
  }
}
