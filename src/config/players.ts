export type PlayerId = 0 | 1 | 2;
export type Shape = 'triangle' | 'circle' | 'square';

export interface PlayerDef {
  id: PlayerId;
  name: string;
  shape: Shape;
  /** Shape glyph used in text (lobby, HUD, report). */
  glyph: string;
  keys: { left: string; right: string; jump: string; dash: string };
  /** Index into the connected-gamepads list, or null for keyboard only. */
  gamepadIndex: number | null;
  spawnX: number;
}

// Keys use Phaser KeyCodes names. P2/P3 also accept gamepad 1/2 (doc controls table).
export const PLAYERS: readonly PlayerDef[] = [
  {
    id: 0,
    name: 'P1',
    shape: 'triangle',
    glyph: '▲',
    keys: { left: 'A', right: 'D', jump: 'W', dash: 'S' },
    gamepadIndex: null,
    spawnX: 240,
  },
  {
    id: 1,
    name: 'P2',
    shape: 'circle',
    glyph: '●',
    keys: { left: 'LEFT', right: 'RIGHT', jump: 'UP', dash: 'DOWN' },
    gamepadIndex: 0,
    spawnX: 480,
  },
  {
    id: 2,
    name: 'P3',
    shape: 'square',
    glyph: '■',
    keys: { left: 'J', right: 'L', jump: 'I', dash: 'K' },
    gamepadIndex: 1,
    spawnX: 720,
  },
];
