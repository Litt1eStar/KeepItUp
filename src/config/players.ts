export type PlayerId = 0 | 1 | 2;
export type Shape = 'triangle' | 'circle' | 'square';
export type ControlAction = 'left' | 'right' | 'jump' | 'dash';
export type PlayerKeys = Record<ControlAction, string>;
export type CharStyleId = 0 | 1 | 2 | 3 | 4 | 5;

export const CHAR_STYLE_COUNT = 6;
export const CHAR_STYLE_IDS: readonly CharStyleId[] = [0, 1, 2, 3, 4, 5] as const;
export const CHAR_STYLE_NAMES: Readonly<Record<CharStyleId, string>> = {
  0: 'PIK',
  1: 'BLOOP',
  2: 'BRICK',
  3: 'ZAP',
  4: 'MOMO',
  5: 'DOZER',
};

export const CONTROL_ACTIONS: readonly ControlAction[] = ['left', 'right', 'jump', 'dash'] as const;

export const DEFAULT_KEYS: Readonly<Record<PlayerId, Readonly<PlayerKeys>>> = {
  0: { left: 'A', right: 'D', jump: 'W', dash: 'S' },
  1: { left: 'LEFT', right: 'RIGHT', jump: 'UP', dash: 'DOWN' },
  2: { left: 'J', right: 'L', jump: 'I', dash: 'K' },
};

export const DEFAULT_GAMEPADS: Readonly<Record<PlayerId, number | null>> = {
  0: null,
  1: 0,
  2: 1,
};

export interface PlayerDef {
  id: PlayerId;
  name: string;
  shape: Shape;
  /** Visual character variant (face + eye layout) chosen in the lobby. */
  charStyle: CharStyleId;
  /** Shape glyph used in text (lobby, HUD, report). */
  glyph: string;
  keys: PlayerKeys;
  /** Index into the connected-gamepads list, or null for keyboard only. */
  gamepadIndex: number | null;
  spawnX: number;
}

// Keys use Phaser KeyCodes names. P2/P3 default to gamepad 1/2 (can be reassigned in Controls/Lobby).
export const PLAYERS: readonly PlayerDef[] = [
  {
    id: 0,
    name: 'P1',
    shape: 'triangle',
    charStyle: 0,
    glyph: '▲',
    keys: { ...DEFAULT_KEYS[0] },
    gamepadIndex: DEFAULT_GAMEPADS[0],
    spawnX: 240,
  },
  {
    id: 1,
    name: 'P2',
    shape: 'circle',
    charStyle: 1,
    glyph: '●',
    keys: { ...DEFAULT_KEYS[1] },
    gamepadIndex: DEFAULT_GAMEPADS[1],
    spawnX: 480,
  },
  {
    id: 2,
    name: 'P3',
    shape: 'square',
    charStyle: 2,
    glyph: '■',
    keys: { ...DEFAULT_KEYS[2] },
    gamepadIndex: DEFAULT_GAMEPADS[2],
    spawnX: 720,
  },
];

const KEYS_STORAGE_KEY = 'keepitup.keys.v1';

const DISPLAY_KEY_NAMES: Record<string, string> = {
  LEFT: '←',
  RIGHT: '→',
  UP: '↑',
  DOWN: '↓',
  SPACE: 'SPC',
  SHIFT: 'SHFT',
  CTRL: 'CTRL',
  ALT: 'ALT',
  TAB: 'TAB',
  BACKSPACE: 'BKSP',
  ZERO: '0',
  ONE: '1',
  TWO: '2',
  THREE: '3',
  FOUR: '4',
  FIVE: '5',
  SIX: '6',
  SEVEN: '7',
  EIGHT: '8',
  NINE: '9',
  NUMPAD_ZERO: 'NP0',
  NUMPAD_ONE: 'NP1',
  NUMPAD_TWO: 'NP2',
  NUMPAD_THREE: 'NP3',
  NUMPAD_FOUR: 'NP4',
  NUMPAD_FIVE: 'NP5',
  NUMPAD_SIX: 'NP6',
  NUMPAD_SEVEN: 'NP7',
  NUMPAD_EIGHT: 'NP8',
  NUMPAD_NINE: 'NP9',
  COMMA: ',',
  PERIOD: '.',
  FORWARD_SLASH: '/',
  SLASH: '/',
  SEMICOLON: ';',
  QUOTES: "'",
  OPEN_BRACKET: '[',
  CLOSED_BRACKET: ']',
  BACK_SLASH: '\\',
  MINUS: '-',
  PLUS: '=',
};

/** Short display label for a Phaser KeyCode name (e.g. `'LEFT'` -> `'←'`). */
export function formatKeyName(key: string): string {
  const upper = key.toUpperCase();
  return DISPLAY_KEY_NAMES[upper] ?? upper;
}

/** One-line control legend printed on the lobby ticket stub. */
export function formatTicketControls(keys: Readonly<PlayerKeys>): string {
  return `${formatKeyName(keys.left)}/${formatKeyName(keys.right)} · ${formatKeyName(keys.jump)} jump · ${formatKeyName(keys.dash)} dash`;
}

const CODE_TO_KEY: Record<string, string> = {
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  Space: 'SPACE',
  ShiftLeft: 'SHIFT',
  ShiftRight: 'SHIFT',
  ControlLeft: 'CTRL',
  ControlRight: 'CTRL',
  AltLeft: 'ALT',
  AltRight: 'ALT',
  Tab: 'TAB',
  Backspace: 'BACKSPACE',
  Comma: 'COMMA',
  Period: 'PERIOD',
  Slash: 'FORWARD_SLASH',
  Semicolon: 'SEMICOLON',
  Quote: 'QUOTES',
  BracketLeft: 'OPEN_BRACKET',
  BracketRight: 'CLOSED_BRACKET',
  Backslash: 'BACK_SLASH',
  Minus: 'MINUS',
  Equal: 'PLUS',
};

const DIGIT_NAMES = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'] as const;

/** Map a DOM KeyboardEvent to a Phaser KeyCodes name, or null for reserved/unsupported keys. */
export function eventToKeyName(e: { code?: string; key?: string }): string | null {
  const code = e.code ?? '';
  const k = e.key ?? '';
  if (
    code === 'Escape' || k === 'Escape' ||
    code === 'Enter' || code === 'NumpadEnter' || k === 'Enter' ||
    code === 'MetaLeft' || code === 'MetaRight' || code === 'OSLeft' || code === 'OSRight' || k === 'Meta' ||
    /^F\d{1,2}$/.test(code) || /^F\d{1,2}$/.test(k)
  ) {
    return null;
  }
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return DIGIT_NAMES[Number(code.slice(5))];
  if (/^Numpad[0-9]$/.test(code)) return `NUMPAD_${DIGIT_NAMES[Number(code.slice(6))]}`;
  if (code in CODE_TO_KEY) return CODE_TO_KEY[code];
  if (/^[a-zA-Z]$/.test(k)) return k.toUpperCase();
  if (/^[0-9]$/.test(k)) return DIGIT_NAMES[Number(k)];
  if (k in CODE_TO_KEY) return CODE_TO_KEY[k];
  return null;
}

function saveKeys(): void {
  try {
    if (typeof globalThis.localStorage === 'undefined') return;
    const data = { 0: PLAYERS[0].keys, 1: PLAYERS[1].keys, 2: PLAYERS[2].keys };
    globalThis.localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota/access errors.
  }
}

/** Rebind one player action to `rawKey`, swapping if another control already uses that key. */
export function setPlayerKey(id: PlayerId, action: ControlAction, rawKey: string, persist = true): void {
  const key = rawKey.trim().toUpperCase();
  if (!key) return;
  const prev = PLAYERS[id].keys[action];
  if (prev !== key) {
    for (const p of PLAYERS) {
      for (const act of CONTROL_ACTIONS) {
        if ((p.id !== id || act !== action) && p.keys[act] === key) {
          p.keys[act] = prev;
        }
      }
    }
    PLAYERS[id].keys[action] = key;
  }
  if (persist) saveKeys();
}

/** True when `style` is already selected by another player (excluding `excludeId`). */
export function isCharStyleTaken(style: CharStyleId, excludeId?: PlayerId): boolean {
  return PLAYERS.some((p) => p.id !== excludeId && p.charStyle === style);
}

/** Assign a player's character style variant (0..5), rejecting duplicates already used by another player. */
export function setPlayerCharStyle(id: PlayerId, style: CharStyleId): CharStyleId {
  if (isCharStyleTaken(style, id)) return PLAYERS[id].charStyle;
  PLAYERS[id].charStyle = style;
  return style;
}

/** Cycle a player's character style variant forward or backward, skipping styles taken by other players. */
export function cyclePlayerCharStyle(id: PlayerId, delta: 1 | -1 = 1): CharStyleId {
  const cur = PLAYERS[id].charStyle;
  for (let step = 1; step <= CHAR_STYLE_COUNT; step++) {
    const next = ((cur + delta * step + CHAR_STYLE_COUNT * 2) % CHAR_STYLE_COUNT) as CharStyleId;
    if (!isCharStyleTaken(next, id)) {
      PLAYERS[id].charStyle = next;
      return next;
    }
  }
  return cur;
}

/** Restore default character styles (0=PIK, 1=BLOOP, 2=BRICK). */
export function resetPlayerCharStyles(): void {
  for (const p of PLAYERS) p.charStyle = p.id as CharStyleId;
}

/** Assign `padIndex` (0, 1, or null) to player `id`, swapping if another player uses it. */
export function setPlayerGamepad(id: PlayerId, padIndex: number | null): void {
  const prev = PLAYERS[id].gamepadIndex;
  if (prev === padIndex) return;
  if (padIndex !== null) {
    for (const p of PLAYERS) {
      if (p.id !== id && p.gamepadIndex === padIndex) {
        p.gamepadIndex = prev;
      }
    }
  }
  PLAYERS[id].gamepadIndex = padIndex;
}

/** Cycle a player's gamepad slot: Keyboard Only -> Pad 1 -> Pad 2 -> Keyboard Only. */
export function cyclePlayerGamepad(id: PlayerId): number | null {
  const order: readonly (number | null)[] = [null, 0, 1];
  const idx = order.indexOf(PLAYERS[id].gamepadIndex);
  const next = order[(idx + 1) % order.length];
  setPlayerGamepad(id, next);
  return next;
}

/** Restore all player key bindings to `DEFAULT_KEYS` and gamepads to `DEFAULT_GAMEPADS`. */
export function resetPlayerKeys(persist = true): void {
  for (const p of PLAYERS) {
    const def = DEFAULT_KEYS[p.id];
    for (const act of CONTROL_ACTIONS) p.keys[act] = def[act];
    p.gamepadIndex = DEFAULT_GAMEPADS[p.id];
  }
  if (persist) saveKeys();
}

/** Load saved key bindings from localStorage if available. */
export function loadSavedKeys(): void {
  try {
    if (typeof globalThis.localStorage === 'undefined') return;
    const raw = globalThis.localStorage.getItem(KEYS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, Partial<PlayerKeys>>;
    if (!parsed || typeof parsed !== 'object') return;
    for (const p of PLAYERS) {
      const saved = parsed[String(p.id)];
      if (!saved || typeof saved !== 'object') continue;
      for (const act of CONTROL_ACTIONS) {
        const val = saved[act];
        if (typeof val === 'string' && val.trim()) setPlayerKey(p.id, act, val, false);
      }
    }
  } catch {
    // Corrupt storage falls back to defaults.
  }
}

if (typeof window !== 'undefined') loadSavedKeys();
