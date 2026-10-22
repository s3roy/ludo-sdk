import { HOME_ENTRY_INDEX, HOME_LEN, START_INDEX, TRACK_LEN } from './constants';
import type { ColorId, Token, TokenState } from './types';

export function enterBoard(color: ColorId): TokenState {
  return { kind: 'track', index: START_INDEX[color] };
}

/** Track squares with 2+ tokens of the same color form a block. */
export function blockedTrackSquares(
  tokens: Token[],
  ignoreTokenId?: string,
): Set<number> {
  const counts = new Map<string, number>(); // `${color}:${index}`
  for (const t of tokens) {
    if (ignoreTokenId && t.id === ignoreTokenId) continue;
    if (t.state.kind !== 'track') continue;
    const key = `${t.color}:${t.state.index}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const blocked = new Set<number>();
  for (const [key, n] of counts) {
    if (n >= 2) blocked.add(Number(key.split(':')[1]));
  }
  return blocked;
}

export type AdvanceResult =
  | { ok: true; to: TokenState; path: number[] }
  | { ok: false; reason: 'overshoot' | 'blocked' | 'invalid' };

/**
 * Advance by `dice` with proper Ludo pathing:
 * - Clockwise on shared track
 * - Must turn into own home column at HOME_ENTRY (cannot lap again)
 * - Exact count to finish
 * - Cannot pass through / land on an opponent block (2+ stacked)
 */
export function advanceToken(
  color: ColorId,
  from: TokenState,
  dice: number,
  tokens: Token[] = [],
  movingTokenId?: string,
): AdvanceResult {
  if (dice < 1 || dice > 6) return { ok: false, reason: 'invalid' };
  if (from.kind === 'finished' || from.kind === 'yard') {
    return { ok: false, reason: 'invalid' };
  }

  const blocked = blockedTrackSquares(tokens, movingTokenId);

  if (from.kind === 'homeColumn') {
    const dest = from.index + dice;
    if (dest === HOME_LEN) return { ok: true, to: { kind: 'finished' }, path: [] };
    if (dest < HOME_LEN) {
      return { ok: true, to: { kind: 'homeColumn', index: dest }, path: [] };
    }
    return { ok: false, reason: 'overshoot' };
  }

  // On shared track — walk step by step
  let cur = from.index;
  const path: number[] = [];

  for (let step = 0; step < dice; step++) {
    // Sitting on home-entry: remaining steps go into home stretch
    if (cur === HOME_ENTRY_INDEX[color]) {
      const rem = dice - step;
      if (rem === HOME_LEN + 1) {
        return { ok: true, to: { kind: 'finished' }, path };
      }
      if (rem >= 1 && rem <= HOME_LEN) {
        return {
          ok: true,
          to: { kind: 'homeColumn', index: rem - 1 },
          path,
        };
      }
      return { ok: false, reason: 'overshoot' };
    }

    const next = (cur + 1) % TRACK_LEN;

    // Opponent block (2+): cannot land on or jump over.
    // Own block: may pass through / stack (Ludo King–style).
    if (blocked.has(next)) {
      const isOwnBlock = tokens.some(
        (t) =>
          t.id !== movingTokenId &&
          t.color === color &&
          t.state.kind === 'track' &&
          t.state.index === next,
      );
      if (!isOwnBlock) return { ok: false, reason: 'blocked' };
    }

    cur = next;
    path.push(cur);
  }

  return { ok: true, to: { kind: 'track', index: cur }, path };
}

/**
 * Cell-by-cell states for UI animation (excludes start, includes landing).
 * Mirrors `advanceToken` / enter rules — for display only.
 */
export function moveWaypoints(
  color: ColorId,
  from: TokenState,
  to: TokenState,
  dice: number,
): TokenState[] {
  if (from.kind === 'yard') {
    return [to];
  }

  if (from.kind === 'finished') return [];

  if (from.kind === 'homeColumn') {
    const steps: TokenState[] = [];
    let idx = from.index;
    for (let s = 0; s < dice; s++) {
      idx += 1;
      if (idx === HOME_LEN) {
        steps.push({ kind: 'finished' });
        break;
      }
      if (idx > HOME_LEN) break;
      steps.push({ kind: 'homeColumn', index: idx });
    }
    return steps.length ? steps : [to];
  }

  // Shared track — same step rules as advanceToken
  const steps: TokenState[] = [];
  let cur = from.index;

  for (let step = 0; step < dice; step++) {
    if (cur === HOME_ENTRY_INDEX[color]) {
      const rem = dice - step;
      for (let h = 0; h < rem; h++) {
        if (h === HOME_LEN) {
          steps.push({ kind: 'finished' });
          break;
        }
        steps.push({ kind: 'homeColumn', index: h });
      }
      break;
    }
    cur = (cur + 1) % TRACK_LEN;
    steps.push({ kind: 'track', index: cur });
  }

  return steps.length ? steps : [to];
}

/** Higher = closer to finish (AI heuristic). */
export function progressScore(color: ColorId, state: TokenState): number {
  if (state.kind === 'yard') return 0;
  if (state.kind === 'finished') return 200;
  if (state.kind === 'homeColumn') return 100 + state.index * 10;
  const start = START_INDEX[color];
  const traveled = (state.index - start + TRACK_LEN) % TRACK_LEN;
  // Past home entry without entering is impossible; clamp
  const homeDist = (HOME_ENTRY_INDEX[color] - start + TRACK_LEN) % TRACK_LEN;
  if (traveled > homeDist) return 10 + homeDist;
  return 10 + traveled;
}
