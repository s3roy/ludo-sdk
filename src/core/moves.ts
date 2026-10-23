import {
  canEnterOnRoll,
  isSafeSquare,
  tokensToWin,
} from './constants';
import { advanceToken, enterBoard } from './path';
import type {
  ColorId,
  GameMode,
  GameState,
  LegalMove,
  Token,
  TokenState,
} from './types';

function tokensOf(state: GameState, color: ColorId): Token[] {
  return state.tokens.filter((t) => t.color === color);
}

/**
 * Capture only when landing on a single opponent token on a non-safe square.
 * Stacks (blocks) are immune; safe squares (stars + starts) are immune.
 */
function captureVictim(
  state: GameState,
  mover: ColorId,
  to: TokenState,
): Token | null {
  if (to.kind !== 'track') return null;
  if (isSafeSquare(to.index)) return null;

  const onSquare = state.tokens.filter(
    (t) =>
      t.color !== mover &&
      t.state.kind === 'track' &&
      t.state.index === to.index,
  );
  // Block of 2+ is immune; mixed rare — need exactly one opponent token total
  if (onSquare.length !== 1) return null;
  return onSquare[0];
}

export function listLegalMoves(state: GameState): LegalMove[] {
  if (state.phase !== 'waiting_move' || state.dice == null) return [];

  const dice = state.dice;
  const color = state.currentColor;
  const mine = tokensOf(state, color);
  const moves: LegalMove[] = [];

  for (const token of mine) {
    const from = token.state;
    if (from.kind === 'finished') continue;

    if (from.kind === 'yard') {
      if (!canEnterOnRoll(state.mode, dice)) continue;
      const to = enterBoard(color);
      // Opening always lands on own start (safe). No further steps on open.
      const victim = captureVictim(state, color, to);
      moves.push({
        tokenId: token.id,
        dice,
        from,
        to,
        captures: victim?.id,
        entersBoard: true,
        finishes: false,
      });
      continue;
    }

    const result = advanceToken(color, from, dice, state.tokens, token.id);
    if (!result.ok) continue;

    const victim = captureVictim(state, color, result.to);
    moves.push({
      tokenId: token.id,
      dice,
      from,
      to: result.to,
      captures: victim?.id,
      finishes: result.to.kind === 'finished',
    });
  }

  return moves;
}

export function countFinished(state: GameState, color: ColorId): number {
  return tokensOf(state, color).filter((t) => t.state.kind === 'finished').length;
}

export function hasWon(state: GameState, color: ColorId, mode: GameMode): boolean {
  return countFinished(state, color) >= tokensToWin(mode);
}

/** Fair d6. */
export function rollDice(rng: () => number = Math.random): number {
  return 1 + Math.floor(rng() * 6);
}

/**
 * Roll a face in `1..maxFace` (inclusive).
 * Used to forbid a third consecutive 6 in one turn (maxFace = 5).
 */
export function rollDiceUpTo(
  maxFace: number,
  rng: () => number = Math.random,
): number {
  const hi = Math.max(1, Math.min(6, Math.floor(maxFace)));
  return 1 + Math.floor(rng() * hi);
}
