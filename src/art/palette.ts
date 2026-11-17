/** Riso palette: paper plus exactly four inks. Dependency-free (no Phaser/DOM). */
import type { PlayerId } from '../config/players';

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

export const PLAYER_INK: Record<PlayerId, InkName> = {
  0: 'pink',
  1: 'blue',
  2: 'yellow',
};
