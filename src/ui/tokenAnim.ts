import { moveWaypoints } from '../core/path';
import type { ColorId, LegalMove, Token, TokenState } from '../core/types';
import {
  cellPixel,
  tokenPixel,
  trackStepCells,
  type Pt,
} from './boardLayout';

const STEP_MS = 130;
const ENTER_MS = 220;
const CAPTURE_MS = 280;

function wait(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms));
}

function frames(n = 1) {
  return new Promise<void>((resolve) => {
    let left = n;
    const tick = () => {
      left -= 1;
      if (left <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function place(
  node: SVGGElement,
  x: number,
  y: number,
  animate: boolean,
  durationMs: number,
) {
  // Pin guti tip is at local (0,0); classic pawns sit slightly above cell center
  const lift = node.classList.contains('ludo-sdk__pawn--pin') ? 0 : 2;
  if (!animate) {
    node.style.transition = 'none';
    node.style.transform = `translate(${x}px, ${y + lift}px)`;
    return;
  }
  node.style.transition = `transform ${durationMs}ms cubic-bezier(0.25, 0.85, 0.35, 1)`;
  node.style.transform = `translate(${x}px, ${y + lift}px)`;
}

async function hopTo(
  node: SVGGElement,
  x: number,
  y: number,
  durationMs: number,
) {
  node.classList.add('ludo-sdk__token--hopping');
  place(node, x, y, true, durationMs);
  await wait(durationMs);
  node.classList.remove('ludo-sdk__token--hopping');
}

/**
 * Expand logical TokenState hops into pixel hops, inserting orthogonal
 * corner bridges so pawns never cut diagonally through a yard.
 */
export function visualHopPixels(
  color: ColorId,
  slot: 0 | 1 | 2 | 3,
  from: TokenState,
  to: TokenState,
  dice: number,
): Pt[] {
  const states = moveWaypoints(color, from, to, dice);
  const pixels: Pt[] = [];
  let prev = from;

  for (const next of states) {
    if (prev.kind === 'track' && next.kind === 'track') {
      if ((prev.index + 1) % 52 === next.index) {
        for (const cell of trackStepCells(prev.index)) {
          pixels.push(cellPixel(cell));
        }
      } else {
        pixels.push(tokenPixel(color, slot, next));
      }
    } else {
      pixels.push(tokenPixel(color, slot, next));
    }
    prev = next;
  }

  if (!pixels.length) {
    pixels.push(tokenPixel(color, slot, to));
  }
  return pixels;
}

/**
 * Walk a pawn cell-by-cell along the legal move path.
 * Call after nodes exist; snaps mover (and captive) to pre-move spots first.
 */
export async function animateLegalMove(
  layer: SVGGElement,
  color: ColorId,
  slot: 0 | 1 | 2 | 3,
  move: LegalMove,
  tokens: Token[],
  opts?: {
    onStep?: (step: number, total: number) => void;
    onCapture?: (x: number, y: number) => void;
  },
): Promise<void> {
  const mover = layer.querySelector<SVGGElement>(
    `[data-token-id="${move.tokenId}"]`,
  );
  if (!mover) return;

  const fromPx = tokenPixel(color, slot, move.from);
  place(mover, fromPx.x, fromPx.y, false, 0);

  let victimNode: SVGGElement | null = null;
  let victim: Token | undefined;
  if (move.captures) {
    victim = tokens.find((t) => t.id === move.captures);
    victimNode = layer.querySelector<SVGGElement>(
      `[data-token-id="${move.captures}"]`,
    );
    if (victim && victimNode) {
      const capPx = tokenPixel(color, slot, move.to);
      place(victimNode, capPx.x, capPx.y, false, 0);
    }
  }

  await frames(2);

  const hops = visualHopPixels(color, slot, move.from, move.to, move.dice);
  const stepMs =
    move.entersBoard && hops.length === 1 ? ENTER_MS : STEP_MS;

  for (let i = 0; i < hops.length; i++) {
    const { x, y } = hops[i];
    opts?.onStep?.(i + 1, hops.length);
    await hopTo(mover, x, y, stepMs);
  }

  const end = tokenPixel(color, slot, move.to);
  place(mover, end.x, end.y, false, 0);

  if (move.captures && victim && victimNode) {
    opts?.onCapture?.(end.x, end.y);
    const yard = tokenPixel(victim.color, victim.slot, { kind: 'yard' });
    victimNode.classList.add('ludo-sdk__token--hopping');
    await hopTo(victimNode, yard.x, yard.y, CAPTURE_MS);
    victimNode.classList.remove('ludo-sdk__token--hopping');
  }

  mover.style.transition = '';
  if (victimNode) victimNode.style.transition = '';
}
