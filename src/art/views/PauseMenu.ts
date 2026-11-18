import Phaser from 'phaser';
import { S } from '../../config/render';
import { TUNING as T } from '../../config/tuning';
import {
  CONTROL_ACTIONS, PLAYERS, eventToKeyName, formatKeyName, resetPlayerKeys, setPlayerKey, type PlayerId,
} from '../../config/players';
import { AudioManager } from '../../systems/AudioManager';
import { INK, INK_HEX, PLAYER_INK } from '../palette';
import { risoText } from '../type';
import { RISO_KEYS, ensurePauseTextures } from '../textures';
import { slamScale } from '../motion';
import { readableInk } from '../hud';
import { CHAR_NAMES } from '../ui';
import {
  PAUSE_ITEMS, PAUSE_LAYOUT, pauseCtrlColX, pauseCtrlRowY, pauseItemY, promptBlinkVisible,
} from '../screens';

const MULTIPLY = Phaser.BlendModes.MULTIPLY;
const ACTION_LABELS = ['LEFT', 'RIGHT', 'JUMP', 'DASH'] as const;
const CELL_SX = 1.45;
const CELL_SY = 0.52;

export interface PauseMenuCallbacks {
  onResume: () => void;
  onLobby: () => void;
  onRebind: () => void;
  canPause?: () => boolean;
}

interface CtrlCell {
  box: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
}

/**
 * Riso pause overlay (toggled with ESC): main menu (Resume, Control, Back to Lobby)
 * and a 3×4 key-binding matrix with swap-on-conflict and stepped slam feedback.
 */
export class PauseMenu {
  private readonly root: Phaser.GameObjects.Container;
  private readonly mainGroup: Phaser.GameObjects.Container;
  private readonly ctrlGroup: Phaser.GameObjects.Container;
  private readonly tag: Phaser.GameObjects.Text;
  private readonly titleShadow: Phaser.GameObjects.Text;
  private readonly titleFront: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly mainTexts: Phaser.GameObjects.Text[] = [];
  private readonly mainArrow: Phaser.GameObjects.Image;
  private readonly cells: CtrlCell[][] = [];
  private readonly bottomBtns: Phaser.GameObjects.Text[] = [];

  private open = false;
  private view: 'main' | 'controls' = 'main';
  private mainCursor = 0;
  private ctrlRow = 0;
  private ctrlCol = 0;
  private listening = false;
  private now = 0;
  private slammedAt = -Infinity;
  private lastMainScale = 1;
  private lastCtrlScale = 1;
  private lastBlinkVis = true;
  private destroyed = false;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.destroyed) return;
    if (!this.open) {
      if ((event.code === 'Escape' || event.key === 'Escape') && (this.callbacks.canPause?.() ?? true)) {
        event.preventDefault?.();
        this.show(this.now);
      }
      return;
    }

    if (this.listening) {
      event.preventDefault?.();
      if (event.code === 'Escape' || event.key === 'Escape') {
        this.listening = false;
        AudioManager.play('select');
        this.refreshControlVisuals();
        return;
      }
      const keyName = eventToKeyName(event);
      if (!keyName) return;
      setPlayerKey(this.ctrlCol as PlayerId, CONTROL_ACTIONS[this.ctrlRow], keyName);
      this.callbacks.onRebind();
      this.listening = false;
      this.slammedAt = this.now;
      AudioManager.play('join');
      this.refreshControlLabels();
      this.refreshControlVisuals();
      return;
    }

    if (this.view === 'main') this.handleMainKey(event);
    else this.handleCtrlKey(event);
  };

  constructor(private readonly scene: Phaser.Scene, private readonly callbacks: PauseMenuCallbacks) {
    ensurePauseTextures(scene);
    const L = PAUSE_LAYOUT;
    const cx = T.width / 2;

    const card = scene.add.image(L.card.x, L.card.y, RISO_KEYS.pauseCard).setOrigin(0).setScale(S);
    this.tag = scene.add.text(cx, L.tagY, '', risoText(9, INK.black, 'mono')).setFontStyle('bold').setOrigin(0.5).setBlendMode(MULTIPLY);
    this.titleShadow = scene.add.text(cx + 2, L.titleY + 2, '', risoText(L.titleSize, INK.black)).setOrigin(0.5, 0).setBlendMode(MULTIPLY);
    this.titleFront = scene.add.text(cx, L.titleY, '', risoText(L.titleSize, INK.pink)).setOrigin(0.5, 0).setBlendMode(MULTIPLY);
    this.hint = scene.add.text(cx, L.hintY, '', risoText(L.hintSize, INK.black, 'mono')).setFontStyle('bold').setOrigin(0.5).setBlendMode(MULTIPLY);

    this.mainGroup = scene.add.container(0, 0);
    this.mainArrow = scene.add
      .image(L.mainArrowX, pauseItemY(0), RISO_KEYS.arrow(0))
      .setScale(S * 0.72)
      .setRotation(-Math.PI / 2)
      .setBlendMode(MULTIPLY);
    this.mainGroup.add(this.mainArrow);

    PAUSE_ITEMS.forEach((label, i) => {
      const item = scene.add
        .text(cx, pauseItemY(i), label, risoText(L.mainItemSize, INK.black))
        .setOrigin(0.5)
        .setBlendMode(MULTIPLY)
        .setInteractive({ useHandCursor: true });
      item.on('pointerover', () => {
        if (!this.open || this.view !== 'main' || this.mainCursor === i) return;
        this.mainCursor = i;
        this.slammedAt = this.now;
        AudioManager.play('select');
        this.refreshMainVisuals();
      });
      item.on('pointerdown', () => {
        if (!this.open || this.view !== 'main') return;
        this.mainCursor = i;
        this.activateMainItem();
      });
      this.mainTexts.push(item);
      this.mainGroup.add(item);
    });

    this.ctrlGroup = scene.add.container(0, 0).setVisible(false);
    this.buildControlsGroup(scene);

    this.root = scene.add
      .container(0, 0, [card, this.tag, this.titleShadow, this.titleFront, this.mainGroup, this.ctrlGroup, this.hint])
      .setDepth(80)
      .setVisible(false);

    scene.input.keyboard?.on('keydown', this.onKeyDown);
    scene.events.once('shutdown', () => this.destroy());
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(tMs: number): void {
    if (this.destroyed || this.open) return;
    this.now = tMs;
    this.open = true;
    this.mainCursor = 0;
    this.listening = false;
    this.root.setVisible(true);
    this.setView('main');
    AudioManager.play('select');
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.listening = false;
    this.root.setVisible(false);
  }

  tick(tMs: number): void {
    this.now = tMs;
    if (!this.open) return;

    const s = slamScale(tMs - this.slammedAt);
    if (this.view === 'main') {
      if (s !== this.lastMainScale) {
        this.lastMainScale = s;
        this.mainTexts.forEach((t, i) => t.setScale(i === this.mainCursor ? s : 1));
      }
      return;
    }

    if (s !== this.lastCtrlScale) {
      this.lastCtrlScale = s;
      if (this.ctrlRow < 4) {
        const cell = this.cells[this.ctrlRow][this.ctrlCol];
        cell.box.setScale(S * CELL_SX * s, S * CELL_SY * s);
        cell.text.setScale(s);
      } else {
        this.bottomBtns[this.ctrlCol].setScale(s);
      }
    }

    if (this.listening && this.ctrlRow < 4) {
      const vis = promptBlinkVisible(tMs);
      if (vis !== this.lastBlinkVis) {
        this.lastBlinkVis = vis;
        this.cells[this.ctrlRow][this.ctrlCol].text.setVisible(vis);
      }
    } else if (!this.lastBlinkVis) {
      this.lastBlinkVis = true;
      if (this.ctrlRow < 4) this.cells[this.ctrlRow][this.ctrlCol].text.setVisible(true);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.input.keyboard?.off('keydown', this.onKeyDown);
    this.root.destroy();
  }

  private buildControlsGroup(scene: Phaser.Scene): void {
    const L = PAUSE_LAYOUT;
    for (const p of PLAYERS) {
      const x = pauseCtrlColX(p.id);
      const color = INK[readableInk(PLAYER_INK[p.id])];
      this.ctrlGroup.add(
        scene.add
          .text(x, L.ctrlHeaderY, `${p.name} ${CHAR_NAMES[p.id]} ${p.glyph}`, risoText(11, color, 'mono'))
          .setFontStyle('bold')
          .setOrigin(0.5)
          .setBlendMode(MULTIPLY),
      );
    }

    ACTION_LABELS.forEach((label, row) => {
      const y = pauseCtrlRowY(row);
      this.ctrlGroup.add(
        scene.add.text(L.ctrlRowLabelX, y, label, risoText(12, INK.black, 'mono')).setFontStyle('bold').setOrigin(0, 0.5).setBlendMode(MULTIPLY),
      );
      const rowCells: CtrlCell[] = [];
      for (const p of PLAYERS) {
        const col = p.id;
        const x = pauseCtrlColX(col);
        const box = scene.add
          .image(x, y, RISO_KEYS.letterBox)
          .setScale(S * CELL_SX, S * CELL_SY)
          .setTint(INK_HEX.black)
          .setBlendMode(MULTIPLY)
          .setInteractive({ useHandCursor: true });
        const text = scene.add
          .text(x, y, '', risoText(12, INK.black, 'mono'))
          .setFontStyle('bold')
          .setOrigin(0.5)
          .setBlendMode(MULTIPLY);
        box.on('pointerover', () => {
          if (!this.open || this.view !== 'controls' || this.listening) return;
          if (this.ctrlRow === row && this.ctrlCol === col) return;
          this.ctrlRow = row;
          this.ctrlCol = col;
          this.slammedAt = this.now;
          AudioManager.play('select');
          this.refreshControlVisuals();
        });
        box.on('pointerdown', () => {
          if (!this.open || this.view !== 'controls' || this.listening) return;
          this.ctrlRow = row;
          this.ctrlCol = col;
          this.listening = true;
          this.slammedAt = this.now;
          AudioManager.play('select');
          this.refreshControlVisuals();
        });
        rowCells.push({ box, text });
        this.ctrlGroup.add([box, text]);
      }
      this.cells.push(rowCells);
    });

    const bottomDefs: readonly [number, string][] = [
      [L.ctrlResetX, 'RESET DEFAULTS'],
      [L.ctrlBackX, '← BACK'],
    ];
    bottomDefs.forEach(([x, label], col) => {
      const btn = scene.add
        .text(x, L.ctrlBtnY, label, risoText(12, INK.black, 'mono'))
        .setFontStyle('bold')
        .setOrigin(0.5)
        .setBlendMode(MULTIPLY)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => {
        if (!this.open || this.view !== 'controls' || this.listening) return;
        if (this.ctrlRow === 4 && this.ctrlCol === col) return;
        this.ctrlRow = 4;
        this.ctrlCol = col;
        this.slammedAt = this.now;
        AudioManager.play('select');
        this.refreshControlVisuals();
      });
      btn.on('pointerdown', () => {
        if (!this.open || this.view !== 'controls' || this.listening) return;
        this.ctrlRow = 4;
        this.ctrlCol = col;
        this.activateCtrlSelection();
      });
      this.bottomBtns.push(btn);
      this.ctrlGroup.add(btn);
    });

    this.refreshControlLabels();
  }

  private setView(view: 'main' | 'controls'): void {
    this.view = view;
    this.listening = false;
    this.slammedAt = this.now;
    this.lastMainScale = NaN;
    this.lastCtrlScale = NaN;
    const isMain = view === 'main';
    this.mainGroup.setVisible(isMain);
    this.ctrlGroup.setVisible(!isMain);
    this.tag.setText(isMain ? 'KIU-01 · GAME PAUSED' : 'KIU-01 · KEY BINDINGS');
    const title = isMain ? 'PAUSED' : 'CONTROLS';
    this.titleShadow.setText(title);
    this.titleFront.setText(title);
    if (isMain) {
      this.refreshMainVisuals();
    } else {
      this.ctrlRow = 0;
      this.ctrlCol = 0;
      this.refreshControlLabels();
      this.refreshControlVisuals();
    }
  }

  private refreshMainVisuals(): void {
    this.lastMainScale = NaN;
    this.mainArrow.setY(pauseItemY(this.mainCursor));
    this.mainTexts.forEach((t, i) => {
      t.setColor(i === this.mainCursor ? INK.pink : INK.black);
      if (i !== this.mainCursor) t.setScale(1);
    });
    this.hint.setText('↑ ↓ MOVE · ENTER / SPACE SELECT · ESC RESUME');
  }

  private refreshControlLabels(): void {
    CONTROL_ACTIONS.forEach((act, row) => {
      for (const p of PLAYERS) {
        this.cells[row][p.id].text.setText(formatKeyName(p.keys[act]));
      }
    });
  }

  private refreshControlVisuals(): void {
    this.lastCtrlScale = NaN;
    this.lastBlinkVis = true;
    CONTROL_ACTIONS.forEach((act, row) => {
      for (const p of PLAYERS) {
        const col = p.id;
        const cell = this.cells[row][col];
        const active = this.ctrlRow === row && this.ctrlCol === col;
        const isListening = active && this.listening;
        cell.box.setTint(active ? INK_HEX.pink : INK_HEX.black);
        cell.text.setColor(active ? INK.pink : INK.black);
        cell.text.setText(isListening ? 'PRESS' : formatKeyName(p.keys[act]));
        cell.text.setVisible(true);
        if (!active) {
          cell.box.setScale(S * CELL_SX, S * CELL_SY);
          cell.text.setScale(1);
        }
      }
    });
    this.bottomBtns.forEach((btn, col) => {
      const active = this.ctrlRow === 4 && this.ctrlCol === col;
      btn.setColor(active ? INK.pink : INK.black);
      if (!active) btn.setScale(1);
    });
    this.hint.setText(
      this.listening
        ? 'PRESS ANY KEY FOR NEW BINDING · ESC CANCEL'
        : 'ARROWS MOVE · ENTER REBIND · ESC BACK',
    );
  }

  private handleMainKey(event: KeyboardEvent): void {
    const code = event.code;
    if (code === 'Escape' || event.key === 'Escape') {
      event.preventDefault?.();
      this.hide();
      this.callbacks.onResume();
      return;
    }
    if (code === 'ArrowUp' || code === 'KeyW') {
      event.preventDefault?.();
      this.mainCursor = (this.mainCursor + PAUSE_ITEMS.length - 1) % PAUSE_ITEMS.length;
      this.slammedAt = this.now;
      AudioManager.play('select');
      this.refreshMainVisuals();
      return;
    }
    if (code === 'ArrowDown' || code === 'KeyS') {
      event.preventDefault?.();
      this.mainCursor = (this.mainCursor + 1) % PAUSE_ITEMS.length;
      this.slammedAt = this.now;
      AudioManager.play('select');
      this.refreshMainVisuals();
      return;
    }
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      event.preventDefault?.();
      this.activateMainItem();
    }
  }

  private activateMainItem(): void {
    if (this.mainCursor === 0) {
      AudioManager.play('select');
      this.hide();
      this.callbacks.onResume();
    } else if (this.mainCursor === 1) {
      AudioManager.play('select');
      this.setView('controls');
    } else {
      AudioManager.play('select');
      this.hide();
      this.callbacks.onLobby();
    }
  }

  private handleCtrlKey(event: KeyboardEvent): void {
    const code = event.code;
    if (code === 'Escape' || event.key === 'Escape') {
      event.preventDefault?.();
      AudioManager.play('select');
      this.setView('main');
      return;
    }
    if (code === 'ArrowUp' || code === 'KeyW') {
      event.preventDefault?.();
      this.ctrlRow = (this.ctrlRow + 4) % 5;
      if (this.ctrlRow === 4 && this.ctrlCol > 1) this.ctrlCol = 1;
      this.slammedAt = this.now;
      AudioManager.play('select');
      this.refreshControlVisuals();
      return;
    }
    if (code === 'ArrowDown' || code === 'KeyS') {
      event.preventDefault?.();
      this.ctrlRow = (this.ctrlRow + 1) % 5;
      if (this.ctrlRow === 4 && this.ctrlCol > 1) this.ctrlCol = 1;
      this.slammedAt = this.now;
      AudioManager.play('select');
      this.refreshControlVisuals();
      return;
    }
    if (code === 'ArrowLeft' || code === 'KeyA') {
      event.preventDefault?.();
      this.ctrlCol = this.ctrlRow === 4 ? (this.ctrlCol === 0 ? 1 : 0) : (this.ctrlCol + 2) % 3;
      this.slammedAt = this.now;
      AudioManager.play('select');
      this.refreshControlVisuals();
      return;
    }
    if (code === 'ArrowRight' || code === 'KeyD') {
      event.preventDefault?.();
      this.ctrlCol = this.ctrlRow === 4 ? (this.ctrlCol === 0 ? 1 : 0) : (this.ctrlCol + 1) % 3;
      this.slammedAt = this.now;
      AudioManager.play('select');
      this.refreshControlVisuals();
      return;
    }
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      event.preventDefault?.();
      this.activateCtrlSelection();
    }
  }

  private activateCtrlSelection(): void {
    if (this.ctrlRow < 4) {
      this.listening = true;
      this.slammedAt = this.now;
      AudioManager.play('select');
      this.refreshControlVisuals();
    } else if (this.ctrlCol === 0) {
      resetPlayerKeys();
      this.callbacks.onRebind();
      this.slammedAt = this.now;
      AudioManager.play('milestone');
      this.refreshControlLabels();
      this.refreshControlVisuals();
    } else {
      AudioManager.play('select');
      this.setView('main');
    }
  }
}
