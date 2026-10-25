import {
  ARENA_DEFAULT_DURATION_MS,
  emptyScores,
  pointsForMove,
  rankByArenaScore,
} from './arena';
import {
  COLOR_NAMES,
  seatColorsForCount,
  tokenId,
  tokensToWin,
} from './constants';
import { hasWon, listLegalMoves, rollDice, rollDiceUpTo } from './moves';
import type {
  ColorId,
  EngineOptions,
  GameEvent,
  GameState,
  LegalMove,
  PlayerConfig,
  Token,
} from './types';

function defaultPlayers(count = 4): PlayerConfig[] {
  return seatColorsForCount(count, 0).map((color, i) => ({
    id: `p-${COLOR_NAMES[color]}`,
    name: i === 0 ? 'You' : 'Bot',
    kind: i === 0 ? 'human' : 'ai',
    color,
  }));
}

function buildTokens(players: PlayerConfig[]): Token[] {
  const tokens: Token[] = [];
  for (const p of players) {
    for (let slot = 0; slot < 4; slot++) {
      tokens.push({
        id: tokenId(p.color, slot as 0 | 1 | 2 | 3),
        color: p.color,
        slot: slot as 0 | 1 | 2 | 3,
        state: { kind: 'yard' },
      });
    }
  }
  return tokens;
}

/**
 * Rules (Classic Indian Ludo / Ludo King–style):
 * - Leave yard only on 6 (all modes); token opens to start only
 * - Exact count into home / finish
 * - Safe squares: all starts + star cells — no capture
 * - 2+ same-color tokens on a track cell = block (immune, impassable to others)
 * - Roll 6 → extra roll only if the 6 was used (a legal move was played)
 * - Void 6 (no legal moves, e.g. home needs 1–5) → turn passes, no bonus roll
 * - A third consecutive 6 in one turn is impossible (P=0)
 * - Capture or finish a token → extra roll
 * - First to tokensToWin (classic 4 / rush 2 / blitz 1) wins
 * - Arena: match clock + points; highest score when time ends wins
 */
export class LudoGame {
  private state: GameState;
  private rng: () => number;
  private now: () => number;
  private listeners = new Set<(s: GameState, e: GameEvent | null) => void>();

  constructor(opts: EngineOptions) {
    const players = opts.players?.length ? opts.players : defaultPlayers(4);
    this.rng = opts.rng ?? Math.random;
    this.now = opts.now ?? Date.now;
    const isArena = opts.mode === 'arena';
    const matchDurationMs = isArena
      ? Math.max(15_000, opts.matchDurationMs ?? ARENA_DEFAULT_DURATION_MS)
      : null;
    const t0 = this.now();
    this.state = {
      mode: opts.mode,
      players,
      tokens: buildTokens(players),
      currentColor: players[0].color,
      phase: 'waiting_roll',
      dice: null,
      consecutiveSixes: 0,
      ranking: [],
      winner: null,
      lastEvent: { type: 'turn', color: players[0].color },
      turnId: 1,
      scores: emptyScores(players.map((p) => p.color)),
      matchDurationMs,
      matchEndsAt: matchDurationMs != null ? t0 + matchDurationMs : null,
    };
  }

  getState(): GameState {
    return structuredClone(this.state);
  }

  subscribe(fn: (s: GameState, e: GameEvent | null) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(event: GameEvent | null) {
    this.state.lastEvent = event;
    const snap = this.getState();
    for (const fn of this.listeners) fn(snap, event);
  }

  legalMoves(): LegalMove[] {
    return listLegalMoves(this.state);
  }

  /** Local RNG roll. After two sixes this turn, only 1–5 (third 6 has P=0). */
  roll(): number | null {
    if (this.checkMatchClock()) return null;
    if (this.state.phase !== 'waiting_roll') return null;
    const face =
      this.state.consecutiveSixes >= 2
        ? rollDiceUpTo(5, this.rng)
        : rollDice(this.rng);
    return this.applyDice(face);
  }

  /**
   * Apply a server-authored dice value (1–6).
   * Use from backend sync so all clients share the same roll.
   * A third consecutive 6 in the same turn is rejected (P=0).
   */
  applyDice(value: number): number | null {
    if (this.checkMatchClock()) return null;
    if (this.state.phase !== 'waiting_roll') return null;
    if (!Number.isInteger(value) || value < 1 || value > 6) return null;
    if (value === 6 && this.state.consecutiveSixes >= 2) return null;

    if (value === 6) {
      this.state.consecutiveSixes += 1;
    } else {
      this.state.consecutiveSixes = 0;
    }

    this.state.dice = value;
    this.state.phase = 'waiting_move';
    this.emit({ type: 'roll', color: this.state.currentColor, value });

    const moves = listLegalMoves(this.state);
    if (moves.length === 0) {
      // Void roll (e.g. 1–5 with all tokens in yard — need a 6 to enter).
      // Pass turn immediately so AI/humans never stall on waiting_move.
      this.emit({ type: 'no_moves', color: this.state.currentColor });
      this.state.dice = null;
      this.state.phase = 'waiting_roll';
      this.advanceTurn();
    }
    return value;
  }

  /**
   * Replace full state from an authoritative backend snapshot.
   * - `syncState(next)` — silent catch-up (listeners get `null` event; no animation replay)
   * - `syncState(next, event)` — emit that event (`null` clears lastEvent)
   *
   * Never auto-replays `next.lastEvent` — that caused double dice/move animations
   * when hosts broadcast `{dice|play}` then `{sync}`.
   */
  syncState(next: GameState, event?: GameEvent | null): void {
    const cloned = structuredClone(next);
    if (!cloned.scores) {
      cloned.scores = emptyScores(cloned.players.map((p) => p.color));
    }
    if (cloned.mode !== 'arena') {
      cloned.matchDurationMs = cloned.matchDurationMs ?? null;
      cloned.matchEndsAt = cloned.matchEndsAt ?? null;
    }
    this.state = cloned;
    if (arguments.length < 2) {
      const snap = this.getState();
      for (const fn of this.listeners) fn(snap, null);
      return;
    }
    this.emit(event ?? null);
  }

  move(tokenIdStr: string): boolean {
    if (this.checkMatchClock()) return false;
    if (this.state.phase !== 'waiting_move' || this.state.dice == null) return false;
    const chosen = listLegalMoves(this.state).find((m) => m.tokenId === tokenIdStr);
    if (!chosen) return false;
    return this.applyChosen(chosen);
  }

  play(move: LegalMove): boolean {
    if (this.checkMatchClock()) return false;
    if (this.state.phase !== 'waiting_move') return false;
    const legal = listLegalMoves(this.state);
    const ok = legal.some(
      (m) =>
        m.tokenId === move.tokenId &&
        m.dice === move.dice &&
        JSON.stringify(m.to) === JSON.stringify(move.to),
    );
    if (!ok) return false;
    return this.applyChosen(move);
  }

  private applyChosen(move: LegalMove): boolean {
    const color = this.state.currentColor;
    const rolledSix = this.state.dice === 6;
    const token = this.state.tokens.find((t) => t.id === move.tokenId);
    if (!token) return false;

    token.state = { ...move.to };

    if (move.captures) {
      const victim = this.state.tokens.find((t) => t.id === move.captures);
      if (victim) {
        victim.state = { kind: 'yard' };
        this.emit({
          type: 'capture',
          by: color,
          victimTokenId: victim.id,
        });
      }
    }

    this.emit({ type: 'move', color, tokenId: move.tokenId, move });

    if (this.state.mode === 'arena') {
      const { delta, parts } = pointsForMove(move);
      this.state.scores[color] = (this.state.scores[color] ?? 0) + delta;
      this.emit({
        type: 'score',
        color,
        delta,
        total: this.state.scores[color]!,
        reasons: parts,
      });
    }

    if (hasWon(this.state, color, this.state.mode)) {
      if (!this.state.ranking.includes(color)) {
        this.state.ranking = [...this.state.ranking, color];
      }
      this.state.winner = color;
      this.state.phase = 'finished';
      this.state.dice = null;
      this.emit({
        type: 'win',
        color,
        ranking: [...this.state.ranking],
      });
      return true;
    }

    const extra =
      rolledSix || !!move.captures || !!move.finishes;

    this.state.dice = null;
    this.state.phase = 'waiting_roll';

    if (extra) {
      const reason = move.captures
        ? 'capture'
        : move.finishes
          ? 'finish'
          : 'six';
      this.emit({ type: 'extra_turn', color, reason });
      this.emit({ type: 'turn', color });
    } else {
      this.advanceTurn();
    }
    return true;
  }

  /**
   * Forfeit the current seat’s action window (turn timer miss).
   * Clears dice and advances to the next player.
   */
  forfeitTurn(): boolean {
    if (this.state.phase === 'finished') return false;
    if (
      this.state.phase !== 'waiting_roll' &&
      this.state.phase !== 'waiting_move'
    ) {
      return false;
    }
    const phase = this.state.phase;
    const color = this.state.currentColor;
    this.state.dice = null;
    this.state.consecutiveSixes = 0;
    this.state.phase = 'waiting_roll';
    this.emit({ type: 'timeout', color, phase });
    this.advanceTurn();
    return true;
  }

  /**
   * Arena: end the match now (timer / host). Highest score wins.
   * Returns true if the game transitioned to finished.
   */
  endMatch(): boolean {
    if (this.state.mode !== 'arena') return false;
    if (this.state.phase === 'finished') return false;
    const ranking = rankByArenaScore(this.state);
    this.state.ranking = ranking;
    this.state.winner = ranking[0] ?? null;
    this.state.phase = 'finished';
    this.state.dice = null;
    this.state.consecutiveSixes = 0;
    this.emit({ type: 'match_over', ranking: [...ranking] });
    if (this.state.winner != null) {
      this.emit({
        type: 'win',
        color: this.state.winner,
        ranking: [...ranking],
      });
    }
    return true;
  }

  /** If the Arena clock has elapsed, end the match. */
  checkMatchClock(nowMs?: number): boolean {
    if (this.state.mode !== 'arena') return false;
    if (this.state.phase === 'finished') return true;
    const ends = this.state.matchEndsAt;
    if (ends == null) return false;
    if ((nowMs ?? this.now()) < ends) return false;
    return this.endMatch();
  }

  private advanceTurn() {
    const order = this.state.players.map((p) => p.color);
    const idx = Math.max(0, order.indexOf(this.state.currentColor));
    let next = this.state.currentColor;
    if (this.state.mode === 'arena') {
      next = order[(idx + 1) % order.length]!;
    } else {
      for (let i = 1; i <= order.length; i++) {
        const cand = order[(idx + i) % order.length]!;
        if (
          !this.state.ranking.includes(cand) &&
          countFinishedLocal(this.state, cand) < tokensToWin(this.state.mode)
        ) {
          next = cand;
          break;
        }
      }
    }
    this.state.currentColor = next;
    this.state.consecutiveSixes = 0;
    this.state.turnId += 1;
    this.state.phase = 'waiting_roll';
    this.state.dice = null;
    this.emit({ type: 'turn', color: next });
  }

  step(pickMove?: (moves: LegalMove[], s: GameState) => LegalMove): boolean {
    if (this.state.phase === 'finished') return false;
    if (this.state.phase === 'waiting_roll') {
      this.roll();
      return true;
    }
    if (this.state.phase === 'waiting_move') {
      const moves = listLegalMoves(this.state);
      if (moves.length === 0) return false;
      const m = pickMove ? pickMove(moves, this.state) : moves[0];
      return this.play(m);
    }
    return false;
  }
}

function countFinishedLocal(state: GameState, color: ColorId): number {
  return state.tokens.filter(
    (t) => t.color === color && t.state.kind === 'finished',
  ).length;
}

export function createGame(opts: EngineOptions): LudoGame {
  return new LudoGame(opts);
}
