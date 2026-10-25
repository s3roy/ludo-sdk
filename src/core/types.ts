/** Player seat / color order: Red → Green → Yellow → Blue (clockwise). */
export type ColorId = 0 | 1 | 2 | 3;

/**
 * classic = open on 6 / win 4 · rush = win 2 · blitz = win 1
 * arena = timed match · points for moves/captures/finishes · highest score wins
 */
export type GameMode = 'classic' | 'rush' | 'blitz' | 'arena';

export type PlayerKind = 'human' | 'ai';

/**
 * Multiplayer seat lifecycle (host sets via `setSeatPresence` / sync).
 * - `empty` — open slot in the lobby / queue
 * - `joining` — reserved, client connecting
 * - `joined` — in room, may not be ready
 * - `ready` — ready to start / playing
 * - `disconnected` — was in, dropped (host may skip or AI-fill)
 */
export type SeatPresence =
  | 'empty'
  | 'joining'
  | 'joined'
  | 'ready'
  | 'disconnected';

export type TokenState =
  | { kind: 'yard' }
  | { kind: 'track'; index: number }
  | { kind: 'homeColumn'; index: number }
  | { kind: 'finished' };

export type PlayerConfig = {
  id: string;
  name: string;
  kind: PlayerKind;
  color: ColorId;
  /** Join / queue status. Default: AI → `ready`, human → `joined`. */
  presence?: SeatPresence;
};

export type Token = {
  id: string;
  color: ColorId;
  slot: 0 | 1 | 2 | 3;
  state: TokenState;
};

export type LegalMove = {
  tokenId: string;
  /** Dice value this move consumes (always current roll in v1). */
  dice: number;
  from: TokenState;
  to: TokenState;
  captures?: string;
  entersBoard?: boolean;
  finishes?: boolean;
};

export type GamePhase =
  | 'waiting_roll'
  | 'waiting_move'
  | 'animating'
  | 'finished';

export type GameEvent =
  | { type: 'roll'; color: ColorId; value: number }
  | { type: 'move'; color: ColorId; tokenId: string; move: LegalMove }
  | { type: 'capture'; by: ColorId; victimTokenId: string }
  | { type: 'extra_turn'; color: ColorId; reason: 'six' | 'capture' | 'finish' }
  | { type: 'turn'; color: ColorId }
  | { type: 'win'; color: ColorId; ranking: ColorId[] }
  | { type: 'no_moves'; color: ColorId }
  /** Arena: points awarded after a move. */
  | {
      type: 'score';
      color: ColorId;
      delta: number;
      total: number;
      reasons: Array<'move' | 'open' | 'capture' | 'finish'>;
    }
  /** Arena: match clock hit zero. */
  | { type: 'match_over'; ranking: ColorId[] }
  /** Seat ran out of time (forfeit / miss). */
  | {
      type: 'timeout';
      color: ColorId;
      phase: 'waiting_roll' | 'waiting_move';
    }
  /** Host / lobby updated seat join status. */
  | {
      type: 'presence';
      color: ColorId;
      presence: SeatPresence;
    };

export type GameState = {
  mode: GameMode;
  players: PlayerConfig[];
  tokens: Token[];
  currentColor: ColorId;
  phase: GamePhase;
  dice: number | null;
  consecutiveSixes: number;
  ranking: ColorId[];
  winner: ColorId | null;
  lastEvent: GameEvent | null;
  turnId: number;
  /** Arena: running score per color (0 for non-arena). */
  scores: Record<ColorId, number>;
  /** Arena: match length in ms (`null` if not arena). */
  matchDurationMs: number | null;
  /** Arena: epoch ms when the match ends (`null` if not arena). */
  matchEndsAt: number | null;
};

export type EngineOptions = {
  mode: GameMode;
  players: PlayerConfig[];
  /** Optional seeded RNG for tests / replays. */
  rng?: () => number;
  /** Arena only — total match time (default 3 minutes). */
  matchDurationMs?: number;
  /** Injectable clock (tests). */
  now?: () => number;
};
