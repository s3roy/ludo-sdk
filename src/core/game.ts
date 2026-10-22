import {
  COLOR_NAMES,
  seatColorsForCount,
  tokenId,
  tokensToWin,
} from './constants';
import { hasWon, listLegalMoves, rollDice } from './moves';
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
    name: COLOR_NAMES[color][0].toUpperCase() + COLOR_NAMES[color].slice(1),
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
 * - Classic: leave yard only on 6; Rush: leave on any roll (token opens to start only)
 * - Exact count into home / finish
 * - Safe squares: all starts + star cells — no capture
 * - 2+ same-color tokens on a track cell = block (immune, impassable to others)
 * - Roll 6 → extra roll; 3 sixes in a row → turn forfeited
 * - Capture or finish a token → extra roll
 * - First to tokensToWin (classic 4 / rush 2) wins
 */
export class LudoGame {
  private state: GameState;
  private rng: () => number;
  private listeners = new Set<(s: GameState, e: GameEvent | null) => void>();

  constructor(opts: EngineOptions) {
    const players = opts.players?.length ? opts.players : defaultPlayers(4);
    this.rng = opts.rng ?? Math.random;
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

  /** Local RNG roll. */
  roll(): number | null {
    if (this.state.phase !== 'waiting_roll') return null;
    return this.applyDice(rollDice(this.rng));
  }

  /**
   * Apply a server-authored dice value (1–6).
   * Use from backend sync so all clients share the same roll.
   */
  applyDice(value: number): number | null {
    if (this.state.phase !== 'waiting_roll') return null;
    if (!Number.isInteger(value) || value < 1 || value > 6) return null;

    this.state.dice = value;
    this.emit({ type: 'roll', color: this.state.currentColor, value });

    if (value === 6) {
      this.state.consecutiveSixes += 1;
      if (this.state.consecutiveSixes >= 3) {
        this.state.consecutiveSixes = 0;
        this.state.dice = null;
        this.state.phase = 'waiting_roll';
        this.emit({ type: 'no_moves', color: this.state.currentColor });
        this.advanceTurn();
        return value;
      }
    } else {
      this.state.consecutiveSixes = 0;
    }

    this.state.phase = 'waiting_move';
    const moves = listLegalMoves(this.state);
    if (moves.length === 0) {
      this.emit({ type: 'no_moves', color: this.state.currentColor });
      const rolledSix = value === 6;
      this.state.dice = null;
      this.state.phase = 'waiting_roll';
      if (rolledSix) {
        this.emit({
          type: 'extra_turn',
          color: this.state.currentColor,
          reason: 'six',
        });
      } else {
        this.advanceTurn();
      }
    }
    return value;
  }

  /** Replace full state from an authoritative backend snapshot. */
  syncState(next: GameState, event: GameEvent | null = null): void {
    this.state = structuredClone(next);
    this.emit(event ?? this.state.lastEvent);
  }

  move(tokenIdStr: string): boolean {
    if (this.state.phase !== 'waiting_move' || this.state.dice == null) return false;
    const chosen = listLegalMoves(this.state).find((m) => m.tokenId === tokenIdStr);
    if (!chosen) return false;
    return this.applyChosen(chosen);
  }

  play(move: LegalMove): boolean {
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

  private advanceTurn() {
    const order = this.state.players.map((p) => p.color);
    const idx = Math.max(0, order.indexOf(this.state.currentColor));
    let next = this.state.currentColor;
    for (let i = 1; i <= order.length; i++) {
      const cand = order[(idx + i) % order.length];
      if (
        !this.state.ranking.includes(cand) &&
        countFinishedLocal(this.state, cand) < tokensToWin(this.state.mode)
      ) {
        next = cand;
        break;
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
