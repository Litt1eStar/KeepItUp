import Phaser from 'phaser';
import { S } from '../../config/render';
import { TUNING as T } from '../../config/tuning';
import {
  CONTROL_ACTIONS, PLAYERS, cyclePlayerGamepad, eventToKeyName, formatKeyName, resetPlayerKeys, setPlayerKey,
  type PlayerId,
} from '../../config/players';
import type { InputManager } from '../../input/InputManager';
import { AudioManager } from '../../systems/AudioManager';
import { INK, INK_HEX, PLAYER_INK } from '../palette';
import { risoText } from '../type';
import { RISO_KEYS, ensurePauseTextures } from '../textures';
import { slamScale } from '../motion';
import { readableInk } from '../hud';
import { CHAR_NAMES } from '../ui';
import {
  PAUSE_ITEMS, PAUSE_LAYOUT, padSlotLabel, pauseCtrlColX, pauseCtrlRowY, pauseItemY, promptBlinkVisible,
} from '../screens';

const MULTIPLY = Phaser.BlendModes.MULTIPLY;
const ACTION_LABELS = ['LEFT', 'RIGHT', 'JUMP', 'DASH', 'PAD'] as const;
const CTRL_KEY_ROWS = 4;
const CTRL_PAD_ROW = 4;
const CTRL_BTN_ROW = 5;
const CELL_SX = 1.45;
const CELL_SY = 0.46;

export interface PauseMenuCallbacks {
  onResume: () => void;
  onLobby?: () => void;
  onRebind: () => void;
  canPause?: () => boolean;
  /** Open directly in the Controls key-binding grid (e.g. from the Lobby); ESC/Back closes the overlay. */
  controlsOnly?: boolean;
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
  private readonly ctrlHeaders: Phaser.GameObjects.Text[] = [];
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
    this.setView(this.callbacks.controlsOnly ? 'controls' : 'main');
    AudioManager.play('select');
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.listening = false;
    this.root.setVisible(false);
  }

  tick(tMs: number, inputMgr?: InputManager): void {
    this.now = tMs;
    if (!this.open) return;
    if (inputMgr && !this.listening) {
      this.handlePadInput(inputMgr);
      if (!this.open) return;
    }

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
      if (this.ctrlRow <= CTRL_PAD_ROW) {
        const cell = this.cells[this.ctrlRow][this.ctrlCol];
        cell.box.setScale(S * CELL_SX * s, S * CELL_SY * s);
        cell.text.setScale(s);
      } else {
        this.bottomBtns[this.ctrlCol].setScale(s);
      }
    }

    if (this.listening && this.ctrlRow < CTRL_KEY_ROWS) {
      const vis = promptBlinkVisible(tMs);
      if (vis !== this.lastBlinkVis) {
        this.lastBlinkVis = vis;
        this.cells[this.ctrlRow][this.ctrlCol].text.setVisible(vis);
      }
    } else if (!this.lastBlinkVis) {
      this.lastBlinkVis = true;
      if (this.ctrlRow <= CTRL_PAD_ROW) this.cells[this.ctrlRow][this.ctrlCol].text.setVisible(true);
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
      const hdr = scene.add
        .text(x, L.ctrlHeaderY, `${p.name} ${CHAR_NAMES[p.id]} ${p.glyph}`, risoText(11, color, 'mono'))
        .setFontStyle('bold')
        .setOrigin(0.5)
        .setBlendMode(MULTIPLY);
      this.ctrlHeaders.push(hdr);
      this.ctrlGroup.add(hdr);
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
          .text(x, y, '', risoText(11, INK.black, 'mono'))
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
          this.activateCtrlSelection();
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
        if (this.ctrlRow === CTRL_BTN_ROW && this.ctrlCol === col) return;
        this.ctrlRow = CTRL_BTN_ROW;
        this.ctrlCol = col;
        this.slammedAt = this.now;
        AudioManager.play('select');
        this.refreshControlVisuals();
      });
      btn.on('pointerdown', () => {
        if (!this.open || this.view !== 'controls' || this.listening) return;
        this.ctrlRow = CTRL_BTN_ROW;
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
    this.hint.setText('↑ ↓ / PAD MOVE · ENTER / A SELECT · ESC / B RESUME');
  }

  private refreshControlLabels(): void {
    for (const p of PLAYERS) {
      this.ctrlHeaders[p.id]?.setText(`${p.name} ${CHAR_NAMES[p.id]} ${p.glyph}`);
      CONTROL_ACTIONS.forEach((act, row) => {
        this.cells[row][p.id].text.setText(formatKeyName(p.keys[act]));
      });
      this.cells[CTRL_PAD_ROW][p.id].text.setText(padSlotLabel(p.gamepadIndex));
    }
  }

  private refreshControlVisuals(): void {
    this.lastCtrlScale = NaN;
    this.lastBlinkVis = true;
    for (const p of PLAYERS) {
      this.ctrlHeaders[p.id]?.setText(`${p.name} ${CHAR_NAMES[p.id]} ${p.glyph}`);
      const col = p.id;
      for (let row = 0; row <= CTRL_PAD_ROW; row++) {
        const cell = this.cells[row][col];
        const active = this.ctrlRow === row && this.ctrlCol === col;
        const isListening = active && this.listening && row < CTRL_KEY_ROWS;
        const label =
          isListening
            ? 'PRESS'
            : row < CTRL_KEY_ROWS
              ? formatKeyName(p.keys[CONTROL_ACTIONS[row]])
              : padSlotLabel(p.gamepadIndex);
        cell.box.setTint(active ? INK_HEX.pink : INK_HEX.black);
        cell.text.setColor(active ? INK.pink : INK.black);
        cell.text.setText(label);
        cell.text.setVisible(true);
        if (!active) {
          cell.box.setScale(S * CELL_SX, S * CELL_SY);
          cell.text.setScale(1);
        }
      }
    }
    this.bottomBtns.forEach((btn, col) => {
      const active = this.ctrlRow === CTRL_BTN_ROW && this.ctrlCol === col;
      btn.setColor(active ? INK.pink : INK.black);
      if (!active) btn.setScale(1);
    });
    this.hint.setText(
      this.listening
        ? 'PRESS ANY KEY FOR NEW BINDING · ESC CANCEL'
        : 'ARROWS / PAD MOVE · ENTER / A CHANGE · ESC / B BACK',
    );
  }

  private moveMainCursor(delta: -1 | 1): void {
    this.mainCursor = (this.mainCursor + delta + PAUSE_ITEMS.length) % PAUSE_ITEMS.length;
    this.slammedAt = this.now;
    AudioManager.play('select');
    this.refreshMainVisuals();
  }

  private moveCtrlCursor(dRow: -1 | 0 | 1, dCol: -1 | 0 | 1): void {
    if (dRow !== 0) {
      const rows = CTRL_BTN_ROW + 1;
      this.ctrlRow = (this.ctrlRow + dRow + rows) % rows;
      if (this.ctrlRow === CTRL_BTN_ROW && this.ctrlCol > 1) this.ctrlCol = 1;
    }
    if (dCol !== 0) {
      const cols = this.ctrlRow === CTRL_BTN_ROW ? 2 : 3;
      this.ctrlCol = (this.ctrlCol + dCol + cols) % cols;
    }
    this.slammedAt = this.now;
    AudioManager.play('select');
    this.refreshControlVisuals();
  }

  private handlePadInput(inputMgr: InputManager): void {
    const dir = inputMgr.padMenuDir();
    if (this.view === 'main') {
      if (inputMgr.padStartPressed() || inputMgr.padBackPressed()) {
        AudioManager.play('select');
        this.hide();
        this.callbacks.onResume();
        return;
      }
      if (dir.up) this.moveMainCursor(-1);
      else if (dir.down) this.moveMainCursor(1);
      if (inputMgr.padConfirmPressed()) this.activateMainItem();
      return;
    }
    if (inputMgr.padStartPressed() || inputMgr.padBackPressed()) {
      this.leaveControls();
      return;
    }
    if (dir.up) this.moveCtrlCursor(-1, 0);
    else if (dir.down) this.moveCtrlCursor(1, 0);
    else if (dir.left) this.moveCtrlCursor(0, -1);
    else if (dir.right) this.moveCtrlCursor(0, 1);
    if (inputMgr.padConfirmPressed()) this.activateCtrlSelection();
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
      this.moveMainCursor(-1);
      return;
    }
    if (code === 'ArrowDown' || code === 'KeyS') {
      event.preventDefault?.();
      this.moveMainCursor(1);
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
      this.callbacks.onLobby?.();
    }
  }

  private leaveControls(): void {
    AudioManager.play('select');
    if (this.callbacks.controlsOnly) {
      this.hide();
      this.callbacks.onResume();
    } else {
      this.setView('main');
    }
  }

  private handleCtrlKey(event: KeyboardEvent): void {
    const code = event.code;
    if (code === 'Escape' || event.key === 'Escape') {
      event.preventDefault?.();
      this.leaveControls();
      return;
    }
    if (code === 'ArrowUp' || code === 'KeyW') {
      event.preventDefault?.();
      this.moveCtrlCursor(-1, 0);
      return;
    }
    if (code === 'ArrowDown' || code === 'KeyS') {
      event.preventDefault?.();
      this.moveCtrlCursor(1, 0);
      return;
    }
    if (code === 'ArrowLeft' || code === 'KeyA') {
      event.preventDefault?.();
      this.moveCtrlCursor(0, -1);
      return;
    }
    if (code === 'ArrowRight' || code === 'KeyD') {
      event.preventDefault?.();
      this.moveCtrlCursor(0, 1);
      return;
    }
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      event.preventDefault?.();
      this.activateCtrlSelection();
    }
  }

  private activateCtrlSelection(): void {
    if (this.ctrlRow < CTRL_KEY_ROWS) {
      this.listening = true;
      this.slammedAt = this.now;
      AudioManager.play('select');
      this.refreshControlVisuals();
    } else if (this.ctrlRow === CTRL_PAD_ROW) {
      cyclePlayerGamepad(this.ctrlCol as PlayerId);
      this.callbacks.onRebind();
      this.slammedAt = this.now;
      AudioManager.play('join');
      this.refreshControlLabels();
      this.refreshControlVisuals();
    } else if (this.ctrlCol === 0) {
      resetPlayerKeys();
      this.callbacks.onRebind();
      this.slammedAt = this.now;
      AudioManager.play('milestone');
      this.refreshControlLabels();
      this.refreshControlVisuals();
    } else {
      this.leaveControls();
    }
  }
}
