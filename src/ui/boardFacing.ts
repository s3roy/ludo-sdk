import type { ColorId } from '../core/types';

/** Screen corners in board order starting at bottom-left, going CCW. */
export const BOARD_CORNERS = ['bl', 'tl', 'tr', 'br'] as const;
export type BoardCorner = (typeof BOARD_CORNERS)[number];

/**
 * CSS rotation (degrees) so `facing` yard lands at bottom-left.
 * Red(0)=0°, Green(1)=−90°, Yellow(2)=180°, Blue(3)=90°.
 */
export function boardRotationDeg(facing: ColorId): number {
  return -facing * 90;
}

/** Where `color` appears on screen when the board faces `facing`. */
export function visualCornerForColor(
  color: ColorId,
  facing: ColorId,
): BoardCorner {
  const offset = (((color - facing) % 4) + 4) % 4;
  return BOARD_CORNERS[offset]!;
}
