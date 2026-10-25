import type { ColorId, GameMode } from './types';

export const COLORS: ColorId[] = [0, 1, 2, 3];

export const COLOR_NAMES = ['red', 'green', 'yellow', 'blue'] as const;

/** Design-system player primaries (red / green / yellow / blue). */
export const COLOR_HEX = ['#FF303D', '#18D653', '#FFC21A', '#0785FF'] as const;

export const COLOR_HIGHLIGHT = ['#FF5964', '#49F879', '#FFE45C', '#45B4FF'] as const;
export const COLOR_DARK = ['#B51224', '#008C37', '#D98B00', '#0054D6'] as const;
export const COLOR_PANEL = ['#3B1828', '#10362F', '#382C1C', '#11284B'] as const;
export const COLOR_BORDER = ['#FF4D55', '#149B68', '#E99A17', '#2165C2'] as const;

/** Home-path tile fills (slightly distinct from pawn primaries). */
export const HOME_PATH_HEX = ['#F52D38', '#16B84A', '#FFB900', '#087BEB'] as const;

/** Main track length (standard Ludo). */
export const TRACK_LEN = 52;

/** Home column cells before finished (indices 0..HOME_LEN-1). */
export const HOME_LEN = 5;

export const TOKENS_PER_PLAYER = 4;

/**
 * Entry square on the shared track for each color.
 * Layout matches common Indian Ludo boards (start after yard exit).
 */
export const START_INDEX: Record<ColorId, number> = {
  0: 0, // red
  1: 13, // green
  2: 26, // yellow
  3: 39, // blue
};

/** Absolute track index where each color turns into home column. */
export const HOME_ENTRY_INDEX: Record<ColorId, number> = {
  0: 50,
  1: 11,
  2: 24,
  3: 37,
};

/** Globally safe track cells (stars + starts). */
export const SAFE_TRACK = new Set<number>([
  ...Object.values(START_INDEX),
  8,
  21,
  34,
  47,
]);

export function isSafeSquare(index: number): boolean {
  return SAFE_TRACK.has(index);
}

export function tokensToWin(mode: GameMode): number {
  if (mode === 'arena') return Number.POSITIVE_INFINITY;
  if (mode === 'blitz') return 1;
  if (mode === 'rush') return 2;
  return 4;
}

/** All modes: leave yard only on a 6. Modes differ by win condition. */
export function canEnterOnRoll(_mode: GameMode, dice: number): boolean {
  return dice === 6;
}

export const GAME_MODES: GameMode[] = ['classic', 'rush', 'blitz', 'arena'];

export function nextColor(c: ColorId): ColorId {
  return ((c + 1) % 4) as ColorId;
}

/**
 * Seat colours for N players (classic board etiquette):
 * - 2 → diagonal opposites (Red↔Yellow or Green↔Blue)
 * - 3 → human + next two clockwise
 * - 4 → all four
 */
export function seatColorsForCount(
  count: number,
  humanColor: ColorId = 0,
): ColorId[] {
  const n = Math.min(4, Math.max(2, count));
  const h = humanColor;
  if (n === 2) {
    // Opposite corner — never adjacent
    return [h, ((h + 2) % 4) as ColorId];
  }
  if (n === 3) {
    return [h, ((h + 1) % 4) as ColorId, ((h + 2) % 4) as ColorId];
  }
  return [0, 1, 2, 3];
}

export function tokenId(color: ColorId, slot: 0 | 1 | 2 | 3): string {
  return `${COLOR_NAMES[color]}-${slot}`;
}
