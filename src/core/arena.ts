import { countFinished } from './moves';
import type { ColorId, GameState } from './types';

/** Default Arena match length (3 minutes). */
export const ARENA_DEFAULT_DURATION_MS = 180_000;

/** Points awarded in Arena mode. */
export const ARENA_POINTS = {
  /** Any legal token move */
  move: 1,
  /** Leave yard onto the board */
  open: 2,
  /** Capture an opponent */
  capture: 10,
  /** Finish a token (home) */
  finish: 25,
} as const;

export type ArenaScoreReason = keyof typeof ARENA_POINTS;

export function emptyScores(colors: ColorId[]): Record<ColorId, number> {
  const scores = { 0: 0, 1: 0, 2: 0, 3: 0 } as Record<ColorId, number>;
  for (const c of colors) scores[c] = 0;
  return scores;
}

/** Points for one resolved move (move always counts; bonuses stack). */
export function pointsForMove(move: {
  entersBoard?: boolean;
  captures?: string;
  finishes?: boolean;
}): { delta: number; parts: ArenaScoreReason[] } {
  const parts: ArenaScoreReason[] = ['move'];
  let delta = ARENA_POINTS.move;
  if (move.entersBoard) {
    parts.push('open');
    delta += ARENA_POINTS.open;
  }
  if (move.captures) {
    parts.push('capture');
    delta += ARENA_POINTS.capture;
  }
  if (move.finishes) {
    parts.push('finish');
    delta += ARENA_POINTS.finish;
  }
  return { delta, parts };
}

/** Highest score first; ties → more finished tokens, then seat order. */
export function rankByArenaScore(state: GameState): ColorId[] {
  const colors = state.players.map((p) => p.color);
  return [...colors].sort((a, b) => {
    const sa = state.scores?.[a] ?? 0;
    const sb = state.scores?.[b] ?? 0;
    if (sb !== sa) return sb - sa;
    const fa = countFinished(state, a);
    const fb = countFinished(state, b);
    if (fb !== fa) return fb - fa;
    return a - b;
  });
}

export function formatMatchClock(msLeft: number): string {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
