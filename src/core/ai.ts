import { isSafeSquare, tokensToWin } from './constants';
import { countFinished } from './moves';
import { progressScore } from './path';
import type { ColorId, GameState, LegalMove, Token } from './types';
import { chooseExtremeMove } from './ai-extreme';
import {
  attackersBehind,
  formsBlock,
  gutFeelBonus,
  isDumpLanding,
  isEscapeMove,
  landsSafe,
  tacticalPool,
} from './ai-tactics';

export type AiDifficulty = 'easy' | 'normal' | 'hard' | 'extreme';

/**
 * Pick a legal move for an AI seat.
 * Engine rules are identical at every difficulty — only the picker changes.
 * See DOCS.md § AI difficulty.
 *
 * - easy: uniform random legal move
 * - normal: greedy tiers (finish → capture → escape → …) + small noise
 * - hard: same tiers + shallow expectiminimax
 * - extreme: same tiers + deeper expectiminimax (strongest)
 */
export function chooseAiMove(
  moves: LegalMove[],
  state: GameState,
  difficulty: AiDifficulty = 'hard',
  rng: () => number = Math.random,
): LegalMove {
  if (moves.length === 1) return moves[0];

  if (difficulty === 'easy') {
    return moves[Math.floor(rng() * moves.length)];
  }

  if (difficulty === 'extreme') {
    return chooseExtremeMove(moves, state, rng);
  }

  if (difficulty === 'hard') {
    // Shallow search inside hard tactical tiers (finish → capture → escape → rest).
    return chooseExtremeMove(moves, state, rng, {
      depth: state.players.length <= 2 ? 2 : 1,
      maxBranch: 6,
    });
  }

  // normal: strict greedy tiers (never skip an eat / escape for an open)

  const pool = tacticalPool(moves, state);
  const scored = pool
    .map((m) => ({ move: m, score: scoreWithinTier(m, state) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0]!.score;
  const slack = 6;
  const ties = scored.filter((s) => s.score >= best - slack);

  if (rng() < 0.12 && scored.length > 1) {
    return scored[1]!.move;
  }
  return ties[Math.floor(rng() * ties.length)]!.move;
}

function scoreWithinTier(move: LegalMove, state: GameState): number {
  const color = state.currentColor;
  let score = gutFeelBonus(move, state);

  if (move.finishes) {
    score += 300;
    if (countFinished(state, color) + 1 >= tokensToWin(state.mode)) score += 100;
  }

  if (move.captures) {
    const victim = state.tokens.find((t) => t.id === move.captures);
    score +=
      200 +
      (victim ? progressScore(victim.color, victim.state) : 30);
  }

  if (move.to.kind === 'homeColumn') {
    score += 55 + move.to.index * 14;
  }

  if (move.to.kind === 'track') {
    if (isSafeSquare(move.to.index)) score += 30;
    else {
      const atk = attackersBehind(state, color, move.to.index, move.tokenId);
      for (const d of atk) {
        score -= d <= 3 ? 75 : 28;
      }
    }
    if (formsBlock(move, state)) score += 55;
  } else if (!move.entersBoard) {
    score += 20;
  }

  // Leaving a safe square into danger (within-tier penalty)
  if (
    move.from.kind === 'track' &&
    isSafeSquare(move.from.index) &&
    move.to.kind === 'track' &&
    !isSafeSquare(move.to.index) &&
    !move.captures
  ) {
    score -= 55;
  }

  // Advance the race leader — dump trailing tokens less
  const tok = state.tokens.find((t) => t.id === move.tokenId);
  if (tok && tok.state.kind === 'track') {
    const lead = furthestProgress(state, color);
    const prog = progressScore(color, tok.state);
    if (prog >= lead - 1) score += 14;
    else if (lead - prog >= 12) score -= 8;
  }

  // One-ply: after this move, can any opponent capture us with dice 1–6?
  if (move.to.kind === 'track' && !isSafeSquare(move.to.index) && !move.captures) {
    score -= opponentCanKillAfter(state, color, move) * 55;
  }

  if (isDumpLanding(move, state)) score -= 40;

  return score;
}

function furthestProgress(state: GameState, color: ColorId): number {
  let best = 0;
  for (const t of state.tokens) {
    if (t.color !== color) continue;
    best = Math.max(best, progressScore(color, t.state));
  }
  return best;
}

function opponentCanKillAfter(
  state: GameState,
  self: ColorId,
  move: LegalMove,
): number {
  if (move.to.kind !== 'track') return 0;
  if (isSafeSquare(move.to.index)) return 0;
  return attackersBehind(state, self, move.to.index, move.tokenId).length;
}

type AiGame = {
  getState: () => GameState;
  roll: () => number | null;
  play: (m: LegalMove) => boolean;
  legalMoves: () => LegalMove[];
};

/** One AI action (roll OR move). Returns true if an action was taken. */
export function playAiStep(
  game: AiGame,
  color: ColorId,
  difficulty: AiDifficulty = 'hard',
  rng?: () => number,
): boolean {
  const s = game.getState();
  if (s.phase === 'finished' || s.currentColor !== color) return false;

  if (s.phase === 'waiting_roll') {
    game.roll();
    return true;
  }
  if (s.phase === 'waiting_move') {
    const moves = game.legalMoves();
    if (moves.length === 0) return false;
    game.play(chooseAiMove(moves, s, difficulty, rng));
    return true;
  }
  return false;
}

/**
 * Miss / auto-play: complete the seat’s pending action.
 * If they still need to roll → roll, then pick a pin if the seat stays on move.
 * If they already rolled → pick a pin. Matches server `driveSeatOnce`.
 */
export function playAiSeatOnce(
  game: AiGame,
  color: ColorId,
  difficulty: AiDifficulty = 'hard',
  rng?: () => number,
): boolean {
  const before = game.getState();
  if (before.phase === 'finished' || before.currentColor !== color) return false;

  if (before.phase === 'waiting_roll') {
    game.roll();
    const mid = game.getState();
    if (mid.phase === 'waiting_move' && mid.currentColor === color) {
      const moves = game.legalMoves();
      if (moves.length) {
        game.play(chooseAiMove(moves, mid, difficulty, rng));
      }
    }
    return true;
  }

  if (before.phase === 'waiting_move') {
    return playAiStep(game, color, difficulty, rng);
  }
  return false;
}

/** @deprecated use playAiStep in a timed loop for animations */
export function playAiTurn(
  game: {
    getState: () => GameState;
    roll: () => number | null;
    play: (m: LegalMove) => boolean;
    legalMoves: () => LegalMove[];
  },
  color: ColorId,
  difficulty: AiDifficulty = 'hard',
  rng?: () => number,
): void {
  let guard = 0;
  while (guard++ < 20) {
    if (!playAiStep(game, color, difficulty, rng)) break;
    const s = game.getState();
    if (s.currentColor !== color || s.phase === 'finished') break;
  }
}

export function currentPlayerIsAi(state: GameState): boolean {
  const p = state.players.find((x) => x.color === state.currentColor);
  return p?.kind === 'ai';
}

export function findToken(state: GameState, id: string): Token | undefined {
  return state.tokens.find((t) => t.id === id);
}

// Re-export tactics helpers used by tests / docs examples
export {
  isEscapeMove,
  landsSafe,
  tacticalPool,
};
