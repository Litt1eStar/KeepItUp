import { describe, it, expect } from 'vitest';
import {
  GAME_OVER, LOBBY, MENU_ITEMS, MENU_LAYOUT, PAUSE_ITEMS, PAUSE_LAYOUT, PROMPT_BLINK_ON, PROMPT_BLINK_PERIOD, REPORT_LINE_STEP_MS, ROLLER_STEP_MS, ROLLER_STEPS,
  boardCountdownLabel, entryCountdownLabel, formatDotRow, joinPrompt, menuItemY, padLabel, padSlotLabel, pauseCtrlColX, pauseCtrlRowY, pauseItemY, promptBlinkVisible,
  reportLinesVisible, rollerCoverWidth, rollerExitWidth, slotRotation, slotX, teamLabel, ticketX,
} from '../src/art/screens';
import { STEP_MS } from '../src/art/motion';
import { LETTER_BOX, RECEIPT, TICKET } from '../src/art/ui';
import { TUNING as T } from '../src/config/tuning';
import {
  CHAR_STYLE_COUNT, DEFAULT_GAMEPADS, DEFAULT_KEYS, PLAYERS, cyclePlayerCharStyle, cyclePlayerGamepad, eventToKeyName, formatKeyName,
  formatTicketControls, resetPlayerCharStyles, resetPlayerKeys, setPlayerKey, type PlayerId,
} from '../src/config/players';

describe('lobby helpers & layout', () => {
  it('places 3 tickets left-to-right clear of the receipt and floor', () => {
    const xs = ([0, 1, 2] as PlayerId[]).map(ticketX);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
    expect(xs[2] + TICKET.w).toBeLessThan(LOBBY.receipt.x);
    expect(LOBBY.receipt.x + RECEIPT.w).toBeLessThan(T.width);
    expect(LOBBY.tickets.y + TICKET.h).toBeLessThan(LOBBY.tickets.statusY);
    expect(LOBBY.tickets.padY + 16).toBeLessThan(T.floorY);
    expect(LOBBY.receipt.y + RECEIPT.h).toBeLessThan(T.floorY);
    const titleBottom = LOBBY.title.y + (LOBBY.title.words.length - 1) * LOBBY.title.lineStep + LOBBY.title.size;
    expect(titleBottom).toBeLessThan(LOBBY.tickets.y);
    expect(LOBBY.masthead.ruleY).toBeLessThan(LOBBY.tickets.y);
  });

  it('formats join prompts and gamepad labels', () => {
    expect(joinPrompt(0, false)).toContain('W');
    expect(joinPrompt(1, false)).toContain('PAD A');
    expect(joinPrompt(2, false)).toContain('PAD A');
    expect(joinPrompt(0, true)).toBe(joinPrompt(2, true));
    expect(padLabel(null, false)).toBe('KEYBOARD');
    expect(padLabel(0, true)).toBe('GAMEPAD 1 READY');
    expect(padLabel(1, false)).toBe('PAD 2 (NO PAD)');
  });

  it('step-blinks unjoined prompts in whole STEP_MS ticks with bounded duty cycle', () => {
    let on = 0;
    const total = PROMPT_BLINK_PERIOD * 50;
    for (let s = 0; s < total; s++) {
      const v = promptBlinkVisible(s * STEP_MS + 1, 0);
      expect(promptBlinkVisible(s * STEP_MS + STEP_MS - 1, 0)).toBe(v);
      if (v) on++;
    }
    expect(on / total).toBeCloseTo(PROMPT_BLINK_ON / PROMPT_BLINK_PERIOD, 5);
  });
});

describe('game over report & entry', () => {
  it('reveals report lines monotonically in REPORT_LINE_STEP_MS steps', () => {
    expect(reportLinesVisible(0, 0)).toBe(0);
    expect(reportLinesVisible(-50, 6)).toBe(1);
    expect(reportLinesVisible(0, 6)).toBe(1);
    expect(reportLinesVisible(REPORT_LINE_STEP_MS - 1, 6)).toBe(1);
    expect(reportLinesVisible(REPORT_LINE_STEP_MS, 6)).toBe(2);
    expect(reportLinesVisible(REPORT_LINE_STEP_MS * 10, 6)).toBe(6);

    let prev = 0;
    for (let t = 0; t < 2000; t += 17) {
      const n = reportLinesVisible(t, 6);
      expect(n).toBeGreaterThanOrEqual(prev);
      expect(n).toBeLessThanOrEqual(6);
      prev = n;
    }
  });

  it('formats dot-leader rows, team labels, slots and countdowns', () => {
    const row = formatDotRow('TIME SURVIVED', '1:23');
    expect(row.length).toBe(GAME_OVER.report.cols);
    expect(row).toMatch(/^TIME SURVIVED \.{2,} 1:23$/);
    expect(formatDotRow('A VERY LONG LEFT LABEL', 'VERY LONG RIGHT')).toMatch(/\.{2}/);

    expect(teamLabel([])).toBe('PIK ▲');
    expect(teamLabel([0, 1, 2])).toBe('PIK ▲ · BLOOP ● · BRICK ■');

    for (let i = 1; i < 8; i++) expect(slotX(i)).toBeGreaterThan(slotX(i - 1));
    for (let i = 0; i < 8; i++) expect(Math.abs(slotRotation(i))).toBeLessThan(0.1);
    expect(entryCountdownLabel(4.2)).toBe('AUTO-STAMP IN 5S · ESC = LOBBY');
    expect(boardCountdownLabel(0.1)).toBe('SPACE / START = REMATCH · ESC = LOBBY (1S)');
    expect(LOBBY.startHint.text).toContain('ESC CONTROLS');
  });

  it('keeps report card, entry slots, board receipt and floor hints non-overlapping', () => {
    const repRight = GAME_OVER.report.x + GAME_OVER.report.w;
    expect(repRight).toBeLessThan(GAME_OVER.entry.x);
    expect(repRight).toBeLessThan(GAME_OVER.board.x);
    expect(GAME_OVER.board.x + GAME_OVER.board.w).toBeLessThan(T.width);
    expect(GAME_OVER.report.y + GAME_OVER.report.h).toBeLessThan(T.floorY);
    expect(GAME_OVER.board.y + GAME_OVER.board.h).toBeLessThan(T.floorY);

    expect(slotX(0) - LETTER_BOX.w / 2).toBeGreaterThan(repRight);
    expect(slotX(7) + LETTER_BOX.w / 2).toBeLessThan(T.width);

    for (const hint of [LOBBY.startHint, GAME_OVER.countdown]) {
      expect(hint.x).toBeGreaterThan(165);
      expect(hint.x).toBeLessThan(730);
      expect(hint.y).toBeGreaterThan(T.floorY);
      expect(hint.y).toBeLessThan(T.height);
    }
  });
});

describe('print-roller transition', () => {
  it('steps cover width down from full stage to 0 in ROLLER_STEPS ticks', () => {
    expect(rollerCoverWidth(-10)).toBe(T.width);
    expect(rollerCoverWidth(0)).toBe(T.width);
    const seen: number[] = [];
    for (let s = 0; s <= ROLLER_STEPS; s++) {
      const w = rollerCoverWidth(s * ROLLER_STEP_MS + 1);
      expect(rollerCoverWidth(s * ROLLER_STEP_MS + ROLLER_STEP_MS - 1)).toBe(w);
      seen.push(w);
    }
    expect(seen[0]).toBe(T.width);
    expect(seen[ROLLER_STEPS]).toBe(0);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeLessThan(seen[i - 1]);
  });

  it('steps exit cover width up from 0 to full stage in ROLLER_STEPS ticks', () => {
    expect(rollerExitWidth(-10)).toBe(0);
    const seen: number[] = [];
    for (let s = 0; s < ROLLER_STEPS; s++) {
      const w = rollerExitWidth(s * ROLLER_STEP_MS + 1);
      expect(rollerExitWidth(s * ROLLER_STEP_MS + ROLLER_STEP_MS - 1)).toBe(w);
      seen.push(w);
    }
    expect(seen[0]).toBeGreaterThan(0);
    expect(seen[ROLLER_STEPS - 1]).toBe(T.width);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
  });
});

describe('main menu layout', () => {
  it('exposes Play, Controls and Top Teams without overlapping the receipt or floor', () => {
    expect([...MENU_ITEMS]).toEqual(['PLAY GAME', 'CONTROLS', 'TOP TEAMS']);
    expect(MENU_LAYOUT.titleX + 280).toBeLessThan(MENU_LAYOUT.receiptX);
    expect(MENU_LAYOUT.receiptX + RECEIPT.w).toBeLessThan(T.width);
    expect(MENU_LAYOUT.receiptY + RECEIPT.h).toBeLessThan(T.floorY);
    for (let i = 0; i < MENU_ITEMS.length; i++) {
      expect(menuItemY(i)).toBeGreaterThan(MENU_LAYOUT.cardY);
      expect(menuItemY(i)).toBeLessThan(T.floorY);
      if (i > 0) expect(menuItemY(i)).toBeGreaterThan(menuItemY(i - 1));
    }
    expect(MENU_LAYOUT.hint.x).toBeGreaterThan(165);
    expect(MENU_LAYOUT.hint.x).toBeLessThan(730);
    expect(MENU_LAYOUT.hint.y).toBeGreaterThan(T.floorY);
  });
});

describe('pause menu & key rebinding', () => {
  it('exposes the 3 pause options and fits inside stage bounds', () => {
    expect([...PAUSE_ITEMS]).toEqual(['RESUME', 'CONTROL', 'BACK TO LOBBY']);
    const c = PAUSE_LAYOUT.card;
    expect(c.x).toBeGreaterThan(0);
    expect(c.x + c.w).toBeLessThan(T.width);
    expect(c.y).toBeGreaterThan(0);
    expect(c.y + c.h).toBeLessThan(T.floorY);

    for (let i = 0; i < PAUSE_ITEMS.length; i++) {
      expect(pauseItemY(i)).toBeGreaterThan(PAUSE_LAYOUT.titleY + PAUSE_LAYOUT.titleSize);
      expect(pauseItemY(i)).toBeLessThan(PAUSE_LAYOUT.hintY);
    }
    for (const id of [0, 1, 2] as PlayerId[]) {
      expect(pauseCtrlColX(id)).toBeGreaterThan(PAUSE_LAYOUT.ctrlRowLabelX);
      expect(pauseCtrlColX(id)).toBeLessThan(c.x + c.w);
    }
    for (let r = 0; r < 5; r++) {
      expect(pauseCtrlRowY(r)).toBeGreaterThan(PAUSE_LAYOUT.ctrlHeaderY);
      expect(pauseCtrlRowY(r)).toBeLessThan(PAUSE_LAYOUT.ctrlBtnY);
    }
  });

  it('cycles character styles and swaps gamepad assignments cleanly', () => {
    try {
      expect(padSlotLabel(null)).toBe('KEY ONLY');
      expect(padSlotLabel(0)).toBe('PAD 1');
      expect(padSlotLabel(1)).toBe('PAD 2');

      expect(cyclePlayerCharStyle(0, 1)).toBe(1);
      expect(cyclePlayerCharStyle(0, -1)).toBe(0);
      expect(cyclePlayerCharStyle(0, -1)).toBe(CHAR_STYLE_COUNT - 1);
      resetPlayerCharStyles();
      expect(PLAYERS[0].charStyle).toBe(0);
      expect(PLAYERS[1].charStyle).toBe(1);
      expect(PLAYERS[2].charStyle).toBe(2);

      // P1 starts as KEY ONLY (null); cycling assigns PAD 1 (0) and swaps P2 to null
      expect(cyclePlayerGamepad(0)).toBe(0);
      expect(PLAYERS[0].gamepadIndex).toBe(0);
      expect(PLAYERS[1].gamepadIndex).toBeNull();
    } finally {
      resetPlayerCharStyles();
      resetPlayerKeys(false);
    }
    expect(PLAYERS[0].gamepadIndex).toBe(DEFAULT_GAMEPADS[0]);
    expect(PLAYERS[1].gamepadIndex).toBe(DEFAULT_GAMEPADS[1]);
    expect(PLAYERS[2].gamepadIndex).toBe(DEFAULT_GAMEPADS[2]);
  });

  it('formats key names, ticket controls and maps DOM key events', () => {
    expect(formatKeyName('LEFT')).toBe('←');
    expect(formatKeyName('SPACE')).toBe('SPC');
    expect(formatKeyName('FORWARD_SLASH')).toBe('/');
    expect(formatTicketControls(DEFAULT_KEYS[0])).toBe('A/D · W jump · S dash');
    expect(formatTicketControls(DEFAULT_KEYS[1])).toBe('←/→ · ↑ jump · ↓ dash');
    expect(formatTicketControls(DEFAULT_KEYS[2])).toBe('J/L · I jump · K dash');

    expect(eventToKeyName({ code: 'KeyQ', key: 'q' })).toBe('Q');
    expect(eventToKeyName({ code: 'ArrowUp', key: 'ArrowUp' })).toBe('UP');
    expect(eventToKeyName({ code: 'Digit5', key: '5' })).toBe('FIVE');
    expect(eventToKeyName({ code: 'Slash', key: '/' })).toBe('FORWARD_SLASH');
    expect(eventToKeyName({ code: 'Escape', key: 'Escape' })).toBeNull();
    expect(eventToKeyName({ code: 'Enter', key: 'Enter' })).toBeNull();
    expect(eventToKeyName({ code: 'F11', key: 'F11' })).toBeNull();
  });

  it('rebinds player keys, swaps conflicting bindings, updates joinPrompt and resets', () => {
    try {
      setPlayerKey(0, 'jump', 'Q', false);
      expect(PLAYERS[0].keys.jump).toBe('Q');
      expect(joinPrompt(0, false)).toBe('PRESS Q TO JOIN');

      // Assigning P2's UP key to P1 jump swaps Q into P2 jump (no duplicates)
      setPlayerKey(0, 'jump', 'UP', false);
      expect(PLAYERS[0].keys.jump).toBe('UP');
      expect(PLAYERS[1].keys.jump).toBe('Q');
    } finally {
      resetPlayerKeys(false);
    }
    expect(PLAYERS[0].keys).toEqual(DEFAULT_KEYS[0]);
    expect(PLAYERS[1].keys).toEqual(DEFAULT_KEYS[1]);
    expect(PLAYERS[2].keys).toEqual(DEFAULT_KEYS[2]);
  });
});
