/** Player seat / color order: Red → Green → Yellow → Blue (clockwise). */
export type ColorId = 0 | 1 | 2 | 3;

/** classic = open on 6 / win 4 · rush = open any / win 2 · blitz = open any / win 1 */
export type GameMode = 'classic' | 'rush' | 'blitz';

export type PlayerKind = 'human' | 'ai';

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
  | { type: 'no_moves'; color: ColorId };

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
};

export type EngineOptions = {
  mode: GameMode;
  players: PlayerConfig[];
  /** Optional seeded RNG for tests / replays. */
  rng?: () => number;
};
