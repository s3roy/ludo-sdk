import { HOME_ENTRY_INDEX, HOME_LEN, START_INDEX, TRACK_LEN } from '../core/constants';
import type { ColorId, TokenState } from '../core/types';

/** Board is a 15×15 grid (classic Ludo layout). Cell size in SVG units. */
export const GRID = 15;
export const CELL = 24;
export const BOARD_PX = GRID * CELL;

export type Pt = { x: number; y: number };

/**
 * Inner-cross corner cells skipped by the classic 52-index track.
 * Without these, tokens take a diagonal hop through yard corners
 * (looks like “can’t cross” red→green / etc.).
 */
export const CORNER_BRIDGES: ReadonlyArray<{
  from: number;
  to: number;
  via: Pt;
}> = [
  { from: 4, to: 5, via: { x: 6, y: 8 } },
  { from: 17, to: 18, via: { x: 6, y: 6 } },
  { from: 30, to: 31, via: { x: 8, y: 6 } },
  { from: 43, to: 44, via: { x: 8, y: 8 } },
];

/** Map absolute track index 0..51 → grid cell (col, row). Red start at bottom arm. */
export function trackToCell(index: number): Pt {
  const path: Pt[] = buildTrackPath();
  return path[((index % TRACK_LEN) + TRACK_LEN) % TRACK_LEN];
}

/**
 * Grid cells visited when stepping from track index `from` → next index
 * (includes orthogonal corner bridge when the 52-path shortcuts diagonally).
 */
export function trackStepCells(fromIndex: number): Pt[] {
  const toIndex = (fromIndex + 1) % TRACK_LEN;
  const from = trackToCell(fromIndex);
  const to = trackToCell(toIndex);
  const bridge = CORNER_BRIDGES.find(
    (b) => b.from === fromIndex && b.to === toIndex,
  );
  if (bridge) return [bridge.via, to];
  // Safety: if any other diagonal appears, synthesize a corner
  const manhattan = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
  if (manhattan > 1) {
    return [{ x: from.x, y: to.y }, to];
  }
  return [to];
}

function buildTrackPath(): Pt[] {
  // Coordinates are grid cells 0..14 — classic 52-square clockwise loop.
  // Note: four inner corners (6,8)/(6,6)/(8,6)/(8,8) are NOT in this list;
  // they are painted + walked via CORNER_BRIDGES for orthogonal UI motion.
  const p: Pt[] = [];

  // Bottom vertical (going up): (6,13) → (6,9) — red start at (6,13)
  for (let r = 13; r >= 9; r--) p.push({ x: 6, y: r });
  // Into left arm (diagonal gap → bridge at 6,8): (5,8) → (1,8)
  for (let c = 5; c >= 1; c--) p.push({ x: c, y: 8 });
  p.push({ x: 0, y: 8 });
  p.push({ x: 0, y: 7 }); // green home-entry (idx 11)
  p.push({ x: 0, y: 6 });
  // Left arm top row going right: (1,6) green start → (5,6)
  for (let c = 1; c <= 5; c++) p.push({ x: c, y: 6 });
  // Up top corridor left col (gap → bridge 6,6): (6,5) → (6,1)
  for (let r = 5; r >= 1; r--) p.push({ x: 6, y: r });
  p.push({ x: 6, y: 0 });
  p.push({ x: 7, y: 0 }); // yellow home-entry (idx 24)
  p.push({ x: 8, y: 0 });
  // Top corridor right col down: (8,1) → (8,5)
  for (let r = 1; r <= 5; r++) p.push({ x: 8, y: r });
  // Right arm top (gap → bridge 8,6): (9,6) → (13,6)
  for (let c = 9; c <= 13; c++) p.push({ x: c, y: 6 });
  p.push({ x: 14, y: 6 });
  p.push({ x: 14, y: 7 }); // blue home-entry (idx 37)
  p.push({ x: 14, y: 8 });
  // Right arm bottom going left: (13,8) → (9,8)
  for (let c = 13; c >= 9; c--) p.push({ x: c, y: 8 });
  // Bottom corridor right col down (gap → bridge 8,8): (8,9) → (8,13)
  for (let r = 9; r <= 13; r++) p.push({ x: 8, y: r });
  p.push({ x: 8, y: 14 });
  p.push({ x: 7, y: 14 }); // red home-entry (idx 50)
  p.push({ x: 6, y: 14 });

  while (p.length < TRACK_LEN) {
    p.push(p[p.length - 1] ?? { x: 7, y: 7 });
  }
  return p.slice(0, TRACK_LEN);
}

/** Home column cell for color + index 0..HOME_LEN-1 */
export function homeColumnCell(color: ColorId, index: number): Pt {
  const i = Math.max(0, Math.min(HOME_LEN - 1, index));
  switch (color) {
    case 0: // red — up center from bottom
      return { x: 7, y: 13 - i };
    case 1: // green — right from left
      return { x: 1 + i, y: 7 };
    case 2: // yellow — down from top
      return { x: 7, y: 1 + i };
    case 3: // blue — left from right
      return { x: 13 - i, y: 7 };
  }
}

export function yardSlots(color: ColorId): Pt[] {
  // 2×2 grid cells (legacy / non-flat themes)
  const bases: Record<ColorId, Pt> = {
    0: { x: 2, y: 11 }, // red bottom-left
    1: { x: 2, y: 2 }, // green top-left
    2: { x: 11, y: 2 }, // yellow top-right
    3: { x: 11, y: 11 }, // blue bottom-right
  };
  const b = bases[color];
  return [
    { x: b.x, y: b.y },
    { x: b.x + 1, y: b.y },
    { x: b.x, y: b.y + 1 },
    { x: b.x + 1, y: b.y + 1 },
  ];
}

/** Yard top-left grid origin (6×6 block). */
export function yardOrigin(color: ColorId): Pt {
  const origins: Record<ColorId, Pt> = {
    0: { x: 0, y: 9 },
    1: { x: 0, y: 0 },
    2: { x: 9, y: 0 },
    3: { x: 9, y: 9 },
  };
  return origins[color];
}

/**
 * Exact 2×2 pin seats centered in the white yard well (Ludo King).
 * Slot order: TL, TR, BL, BR. Returns SVG pixel centers.
 */
export function yardSlotPixels(
  color: ColorId,
  wellInsetPx = 8,
): Pt[] {
  const o = yardOrigin(color);
  const x0 = (o.x + 1) * CELL + wellInsetPx;
  const y0 = (o.y + 1) * CELL + wellInsetPx;
  const size = 4 * CELL - wellInsetPx * 2;
  // Perfect square grid: centers at 28% / 72% of the well
  const a = size * 0.28;
  const b = size * 0.72;
  return [
    { x: x0 + a, y: y0 + a },
    { x: x0 + b, y: y0 + a },
    { x: x0 + a, y: y0 + b },
    { x: x0 + b, y: y0 + b },
  ];
}

const STACK_FAN: Pt[][] = [
  [{ x: 0, y: 0 }],
  [
    { x: -3, y: 0 },
    { x: 3, y: 0 },
  ],
  [
    { x: -3.5, y: -2 },
    { x: 3.5, y: -2 },
    { x: 0, y: 3 },
  ],
  [
    { x: -3.5, y: -3 },
    { x: 3.5, y: -3 },
    { x: -3.5, y: 3 },
    { x: 3.5, y: 3 },
  ],
];

export function stackPixelOffset(stackIndex: number, stackCount: number): Pt {
  const n = Math.max(1, Math.min(4, stackCount));
  const i = Math.max(0, Math.min(n - 1, stackIndex));
  return STACK_FAN[n - 1][i];
}

/** White-well inset used by Ludo King flat yards (must match board paint). */
export const YARD_WELL_INSET_FLAT = 8;

export function tokenPixel(
  color: ColorId,
  slot: 0 | 1 | 2 | 3,
  state: TokenState,
  stack?: { index: number; count: number },
): Pt {
  let base: Pt;
  if (state.kind === 'yard') {
    // Exact 2×2 seats in the white well (same coords as painted discs)
    base = yardSlotPixels(color, YARD_WELL_INSET_FLAT)[slot];
  } else if (state.kind === 'finished') {
    const offsets = [
      { x: -6, y: -6 },
      { x: 6, y: -6 },
      { x: -6, y: 6 },
      { x: 6, y: 6 },
    ];
    base = {
      x: 7.5 * CELL + offsets[slot].x,
      y: 7.5 * CELL + offsets[slot].y,
    };
  } else if (state.kind === 'homeColumn') {
    const c = homeColumnCell(color, state.index);
    base = { x: c.x * CELL + CELL / 2, y: c.y * CELL + CELL / 2 };
  } else {
    const c = trackToCell(state.index);
    base = { x: c.x * CELL + CELL / 2, y: c.y * CELL + CELL / 2 };
  }

  if (stack && stack.count > 1 && state.kind !== 'yard' && state.kind !== 'finished') {
    const o = stackPixelOffset(stack.index, stack.count);
    return { x: base.x + o.x, y: base.y + o.y };
  }
  return base;
}

/** Pixel center of a raw grid cell (for corner-bridge hops). */
export function cellPixel(cell: Pt): Pt {
  return { x: cell.x * CELL + CELL / 2, y: cell.y * CELL + CELL / 2 };
}

export function isStartIndex(index: number): boolean {
  return (Object.values(START_INDEX) as number[]).includes(index);
}

export function isHomeEntry(index: number): boolean {
  return (Object.values(HOME_ENTRY_INDEX) as number[]).includes(index);
}
