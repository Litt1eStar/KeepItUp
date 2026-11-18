/** Riso palette: paper plus core four inks, plus extended riso drum colors for the 6 character variants. */
import { PLAYERS, type CharStyleId, type PlayerId } from '../config/players';

export const PAPER = '#EFE8DA';
export const PAPER_HEX = 0xefe8da;

export const INK = {
  pink: '#FF48B0',
  blue: '#0078BF',
  yellow: '#FFE800',
  black: '#1E1B1A',
} as const;

export const INK_HEX = {
  pink: 0xff48b0,
  blue: 0x0078bf,
  yellow: 0xffe800,
  black: 0x1e1b1a,
} as const;

export type InkName = keyof typeof INK;

/** 0xff48b0 → "#ff48b0". */
export function hexToCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

export const PLAYER_INK: Record<PlayerId, InkName> = {
  0: 'pink',
  1: 'blue',
  2: 'yellow',
};

/** Halftone screen angle per ink (like separate riso drums), so overprinted screens don't moiré. */
export const INK_ANGLE: Record<InkName, number> = {
  yellow: 0,
  pink: 75,
  blue: 15,
  black: 45,
};

export interface CharStyleColor {
  readonly css: string;
  readonly hex: number;
  readonly baseInk: InkName;
  readonly angle: number;
}

/** Distinct riso drum colors for all 6 character variants (PIK, BLOOP, BRICK, ZAP, MOMO, DOZER). */
export const CHAR_STYLE_COLORS: Readonly<Record<CharStyleId, CharStyleColor>> = {
  0: { css: '#FF48B0', hex: 0xff48b0, baseInk: 'pink', angle: 75 }, // PIK: Fluorescent Pink
  1: { css: '#0078BF', hex: 0x0078bf, baseInk: 'blue', angle: 15 }, // BLOOP: Riso Blue
  2: { css: '#FFE800', hex: 0xffe800, baseInk: 'yellow', angle: 0 }, // BRICK: Riso Yellow
  3: { css: '#00A95C', hex: 0x00a95c, baseInk: 'blue', angle: 30 }, // ZAP: Riso Kelly Green
  4: { css: '#FF6C2F', hex: 0xff6c2f, baseInk: 'pink', angle: 60 }, // MOMO: Riso Bright Orange
  5: { css: '#765BA7', hex: 0x765ba7, baseInk: 'blue', angle: 105 }, // DOZER: Riso Violet Purple
};

export function styleColor(style: CharStyleId): CharStyleColor {
  return CHAR_STYLE_COLORS[style];
}

export function playerColor(id: PlayerId): CharStyleColor {
  return CHAR_STYLE_COLORS[PLAYERS[id].charStyle];
}

/** Readable text color for a character style (yellow prints black on paper). */
export function styleReadableCss(style: CharStyleId): string {
  return style === 2 ? INK.black : CHAR_STYLE_COLORS[style].css;
}

export function playerReadableCss(id: PlayerId): string {
  return styleReadableCss(PLAYERS[id].charStyle);
}
