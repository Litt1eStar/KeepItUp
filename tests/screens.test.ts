import { describe, it, expect } from 'vitest';
import {
  GAME_OVER, LOBBY, PROMPT_BLINK_ON, PROMPT_BLINK_PERIOD, REPORT_LINE_STEP_MS, ROLLER_STEP_MS, ROLLER_STEPS,
  boardCountdownLabel, entryCountdownLabel, formatDotRow, joinPrompt, padLabel, promptBlinkVisible,
  reportLinesVisible, rollerCoverWidth, slotRotation, slotX, teamLabel, ticketX,
} from '../src/art/screens';
import { STEP_MS } from '../src/art/motion';
import { LETTER_BOX, RECEIPT, TICKET } from '../src/art/ui';
import { TUNING as T } from '../src/config/tuning';
import type { PlayerId } from '../src/config/players';

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
    expect(padLabel(1, false)).toBe('KEYBOARD (NO PAD)');
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
    expect(entryCountdownLabel(4.2)).toBe('AUTO-STAMP IN 5S');
    expect(boardCountdownLabel(0.1)).toBe('SPACE / START = REMATCH · LOBBY IN 1S');
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
});
