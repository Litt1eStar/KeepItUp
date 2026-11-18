/**
 * Pure layout, formatting and stepped timing for the Lobby, Game Over and PrintRoller screens.
 * Phaser-free so every coordinate and schedule is unit-tested in node.
 */
import { PLAYERS, formatKeyName, type PlayerId } from '../config/players';
import { TUNING as T } from '../config/tuning';
import { MOTION_STEP_MS, STEP_MS } from './motion';
import { BOARD_CARD, CHAR_NAMES, PAUSE_CARD, REPORT_CARD, TICKET } from './ui';

export { CHAR_NAMES };

// ---------------------------------------------------------------- lobby ("zine cover")

export const LOBBY = {
  title: { x: 28, y: 6, lineStep: 28, size: 32, words: ['KEEP', 'IT', 'UP!'] as const },
  masthead: { x: 132, issueY: 14, issueSize: 11, headlineY: 32, headlineSize: 24, subY: 64, subSize: 11, ruleY: 90, ruleW: 494 },
  tickets: { x0: 28, y: 112, gap: 14, scale: 1, stampOffsetX: 115, stampOffsetY: 50, stampRot: -0.18, stampScale: 0.72, statusY: 234, padY: 252 },
  receipt: { x: 664, y: 18 },
  startHint: { x: 444, y: (T.floorY + T.height) / 2 + 2, size: 12, text: 'SPACE / START TO PLAY · SOLO IF 1P · F FULLSCREEN' },
} as const;

/** Left edge of player `id`'s ticket stub on the lobby zine cover. */
export function ticketX(id: PlayerId): number {
  return LOBBY.tickets.x0 + id * (TICKET.w * LOBBY.tickets.scale + LOBBY.tickets.gap);
}

/** Label printed under a player's lobby ticket stub. */
export function joinPrompt(id: PlayerId, joined: boolean): string {
  if (joined) return 'READY · BOUNCE!';
  const jump = formatKeyName(PLAYERS[id].keys.jump);
  return PLAYERS[id].gamepadIndex === null ? `PRESS ${jump} TO JOIN` : `PRESS ${jump} / PAD A`;
}

/** Gamepad status label printed below the join prompt. */
export function padLabel(gamepadIndex: number | null, connected: boolean): string {
  if (gamepadIndex === null) return 'KEYBOARD';
  return connected ? `GAMEPAD ${gamepadIndex + 1} READY` : 'KEYBOARD (NO PAD)';
}

export const PROMPT_BLINK_PERIOD = 10;
export const PROMPT_BLINK_ON = 7;

/** Stepped visibility blink for unjoined player prompts (visibility only, never alpha). */
export function promptBlinkVisible(tMs: number, phase = 0): boolean {
  return (Math.floor(Math.max(0, tMs) / STEP_MS) + phase * 3) % PROMPT_BLINK_PERIOD < PROMPT_BLINK_ON;
}

// ---------------------------------------------------------------- game over ("round report")

export const GAME_OVER = {
  report: {
    x: 36, y: 20, w: REPORT_CARD.w, h: REPORT_CARD.h,
    scoreY: 112, scoreSize: 52, newBestX: 318, newBestY: 126,
    lineX: 60, lineY0: 196, lineStep: 32, lineSize: 12, cols: 44,
  },
  entry: {
    x: 464, titleY: 36, titleSize: 38, subY: 86, subSize: 12,
    slotX0: 476, slotY: 184, slotSpacing: 54, slotFontSize: 32, hintY: 256, hintSize: 11,
  },
  board: { x: 472, y: 20, w: BOARD_CARD.w, h: BOARD_CARD.h },
  countdown: { x: 444, y: (T.floorY + T.height) / 2 + 2, size: 12 },
} as const;

export const REPORT_LINE_STEP_MS = STEP_MS * 2;

/** Number of Round Report lines printed at `elapsedMs` after scene start (stepped, 1..totalLines). */
export function reportLinesVisible(elapsedMs: number, totalLines: number): number {
  if (totalLines <= 0) return 0;
  return Math.min(totalLines, Math.floor(Math.max(0, elapsedMs) / REPORT_LINE_STEP_MS) + 1);
}

/** Dot-leader line for Space Mono till rows: `CREW .............. PIK ▲`. */
export function formatDotRow(left: string, right: string, cols = GAME_OVER.report.cols): string {
  const dots = Math.max(2, cols - left.length - right.length - 2);
  return `${left} ${'.'.repeat(dots)} ${right}`;
}

/** Team roster summary (`PIK ▲ · BLOOP ●`) using character names and shapes. */
export function teamLabel(players: readonly PlayerId[]): string {
  const list = players.length > 0 ? players : ([0] as const);
  return list.map((id) => `${CHAR_NAMES[id]} ${PLAYERS[id].glyph}`).join(' · ');
}

/** Horizontal centre of rubber-stamp name slot `i` (0..NAME_LEN-1). */
export function slotX(i: number): number {
  return GAME_OVER.entry.slotX0 + i * GAME_OVER.entry.slotSpacing;
}

/** Slight fixed tilt (radians) per rubber-stamp slot so the letters look hand-stamped. */
export function slotRotation(i: number): number {
  return (((i * 5 + 2) % 7) - 3) * 0.014;
}

/** Floor-band countdown prompt while entering a team name. */
export function entryCountdownLabel(secsLeft: number): string {
  return `AUTO-STAMP IN ${Math.max(0, Math.ceil(secsLeft))}S`;
}

/** Floor-band countdown prompt while viewing the high-score receipt. */
export function boardCountdownLabel(secsLeft: number): string {
  return `SPACE / START = REMATCH · LOBBY IN ${Math.max(0, Math.ceil(secsLeft))}S`;
}

// ---------------------------------------------------------------- print roller transition

export const ROLLER_STEPS = 5;
export const ROLLER_STEP_MS = MOTION_STEP_MS;

/** Remaining black-ink roller width (px) `elapsedMs` into a scene entry wipe; 0 once uncovered. */
export function rollerCoverWidth(elapsedMs: number, totalW: number = T.width): number {
  if (elapsedMs < 0) return totalW;
  const step = Math.floor(elapsedMs / ROLLER_STEP_MS);
  if (step >= ROLLER_STEPS) return 0;
  return Math.round((totalW * (ROLLER_STEPS - step)) / ROLLER_STEPS);
}

// ---------------------------------------------------------------- pause menu

export const PAUSE_ITEMS = ['RESUME', 'CONTROL', 'BACK TO LOBBY'] as const;
export type PauseItem = (typeof PAUSE_ITEMS)[number];

export const PAUSE_LAYOUT = {
  card: { x: (T.width - PAUSE_CARD.w) / 2, y: 64, w: PAUSE_CARD.w, h: PAUSE_CARD.h },
  tagY: 82,
  titleY: 96,
  titleSize: 36,
  mainItemY0: 188,
  mainItemStep: 54,
  mainItemSize: 32,
  mainArrowX: 332,
  ctrlHeaderY: 150,
  ctrlColX0: 368,
  ctrlColStep: 118,
  ctrlRowLabelX: 242,
  ctrlRowY0: 182,
  ctrlRowStep: 36,
  ctrlBtnY: 344,
  ctrlResetX: 376,
  ctrlBackX: 596,
  hintY: 406,
  hintSize: 10,
} as const;

export function pauseItemY(i: number): number {
  return PAUSE_LAYOUT.mainItemY0 + i * PAUSE_LAYOUT.mainItemStep;
}

export function pauseCtrlColX(id: PlayerId): number {
  return PAUSE_LAYOUT.ctrlColX0 + id * PAUSE_LAYOUT.ctrlColStep;
}

export function pauseCtrlRowY(row: number): number {
  return PAUSE_LAYOUT.ctrlRowY0 + row * PAUSE_LAYOUT.ctrlRowStep;
}
