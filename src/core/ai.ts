import { isSafeSquare, TRACK_LEN, tokensToWin } from './constants';
import { countFinished } from './moves';
import { progressScore } from './path';
import type { ColorId, GameState, LegalMove, Token } from './types';
import { chooseExtremeMove } from './ai-extreme';

export type AiDifficulty = 'easy' | 'normal' | 'hard' | 'extreme';

/**
 * Pick a legal move for an AI seat.
 * - easy: random
 * - normal: tiered greedy heuristics
 * - hard: shallow expectiminimax (fixes “dump” greedy blunders)
 * - extreme: deeper expectiminimax — strongest
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
    // Shallow search — still greedy-seeded, but won’t walk into 1–3 kills
    // or open a 4th pin when a race move exists.
    return chooseExtremeMove(moves, state, rng, {
      depth: state.players.length <= 2 ? 2 : 1,
      maxBranch: 6,
    });
  }

  const pool = hardPool(moves, state);
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

/**
 * Tiered candidate filter — higher tiers completely outrank lower ones.
 * 1 Finish / win
 * 2 Capture
 * 3 Escape a piece under attack (1–6 behind, not on safe)
 * 4 Enter home stretch
 * 5 Move onto safe / form block (when available among remaining)
 * 6 Everything else
 */
function hardPool(moves: LegalMove[], state: GameState): LegalMove[] {
  const finish = moves.filter((m) => m.finishes);
  if (finish.length) return finish;

  const caps = moves.filter((m) => m.captures);
  if (caps.length) return caps;

  const escapes = moves.filter((m) => isEscapeMove(m, state));
  if (escapes.length) return escapes;

  const intoHome = moves.filter(
    (m) =>
      m.to.kind === 'homeColumn' ||
      (m.from.kind === 'homeColumn' && m.to.kind !== 'yard'),
  );
  if (intoHome.length) {
    // Prefer entering from the track over shuffling an already-safe home pin
    const entering = intoHome.filter((m) => m.from.kind === 'track');
    return entering.length ? entering : intoHome;
  }

  // If we already have pieces in play, don't open just to open
  // unless every on-board move is suicidal.
  {
    const onBoardMoves = moves.filter((m) => !m.entersBoard);
    if (onBoardMoves.length) {
      const safeish = onBoardMoves.filter((m) => !isSuicidal(m, state));
      if (safeish.length) {
        const preferSafe = safeish.filter(
          (m) => landsSafe(m) || formsBlock(m, state),
        );
        return preferSafe.length ? preferSafe : safeish;
      }
      // all on-board moves suicidal — allow open as bailout
      const opens = moves.filter((m) => m.entersBoard);
      if (opens.length) return opens;
      return onBoardMoves;
    }
  }

  // Prefer safe landings / opens when still choosing freely
  const safeLand = moves.filter(
    (m) => m.entersBoard || landsSafe(m) || formsBlock(m, state),
  );
  if (safeLand.length) return safeLand;

  return moves;
}

function landsSafe(m: LegalMove): boolean {
  if (m.to.kind !== 'track') return true;
  return isSafeSquare(m.to.index);
}

function formsBlock(m: LegalMove, state: GameState): boolean {
  if (m.to.kind !== 'track') return false;
  return (
    ownCountOn(state, state.currentColor, m.to.index, m.tokenId) >= 1
  );
}

/** True if this move leaves a square that opponents can hit this turn. */
function isEscapeMove(m: LegalMove, state: GameState): boolean {
  if (m.from.kind !== 'track') return false;
  if (isSafeSquare(m.from.index)) return false;
  const danger = attackersBehind(state, state.currentColor, m.from.index);
  if (!danger.length) return false;
  // Must actually leave that square (always true for a move) and not land
  // into equal/worse danger unless capturing (captures already tier-2).
  if (m.to.kind === 'track' && !isSafeSquare(m.to.index)) {
    const after = attackersBehind(
      state,
      state.currentColor,
      m.to.index,
      m.tokenId,
    );
    // Still an escape if we break immediate 1–3 range even if some threat remains
    const imminent = danger.some((d) => d <= 3);
    if (imminent && after.every((d) => d > 3)) return true;
    if (after.length === 0) return true;
    if (landsSafe(m)) return true;
    return false;
  }
  return true; // home / finish / safe
}

function isSuicidal(m: LegalMove, state: GameState): boolean {
  if (m.captures || m.finishes || m.entersBoard) return false;
  if (m.to.kind !== 'track') return false;
  if (isSafeSquare(m.to.index)) return false;
  if (formsBlock(m, state)) return false;
  const atk = attackersBehind(state, state.currentColor, m.to.index, m.tokenId);
  return atk.some((d) => d <= 3);
}

function scoreWithinTier(move: LegalMove, state: GameState): number {
  const color = state.currentColor;
  let score = 0;

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

  if (isEscapeMove(move, state)) score += 80;

  if (move.entersBoard) {
    const active = state.tokens.filter(
      (t) =>
        t.color === color &&
        t.state.kind !== 'yard' &&
        t.state.kind !== 'finished',
    ).length;
    const need = tokensToWin(state.mode);
    if (active === 0) score += 70;
    else if (active >= need) score -= 50; // rush/blitz: extra open is dump
    else score += 10;
  }

  score +=
    (progressScore(color, move.to) - progressScore(color, move.from)) * 3.5;

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
  } else {
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

  return score;
}

/** Distances (1–6) of enemy tokens sitting behind `index`. */
function attackersBehind(
  state: GameState,
  self: ColorId,
  index: number,
  ignoreId?: string,
): number[] {
  const out: number[] = [];
  for (const t of state.tokens) {
    if (t.color === self || t.state.kind !== 'track') continue;
    if (ignoreId && t.id === ignoreId) continue;
    const dist = (index - t.state.index + TRACK_LEN) % TRACK_LEN;
    if (dist >= 1 && dist <= 6) out.push(dist);
  }
  return out;
}

function ownCountOn(
  state: GameState,
  color: ColorId,
  index: number,
  ignoreId: string,
): number {
  return state.tokens.filter(
    (t) =>
      t.id !== ignoreId &&
      t.color === color &&
      t.state.kind === 'track' &&
      t.state.index === index,
  ).length;
}

function furthestProgress(state: GameState, color: ColorId): number {
  let best = 0;
  for (const t of state.tokens) {
    if (t.color !== color) continue;
    best = Math.max(best, progressScore(color, t.state));
  }
  return best;
}

/**
 * Rough one-ply: count enemy tokens that could land exactly on our
 * destination with some roll 1–6 (we already sit there after the move).
 */
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
