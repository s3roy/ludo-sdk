import type { ColorId, GameEvent, GameState, LegalMove, SeatPresence } from '../core/types';

/** Why a room / board session ended. */
export type RoomDestroyReason =
  | 'host'
  | 'client'
  | 'finished'
  | 'abandoned'
  | 'error'
  | string;

export type TurnChangeContext = {
  color: ColorId;
  turnId: number;
  /** True when this client can act (interactive seat). */
  isMine: boolean;
  phase: GameState['phase'];
  state: GameState;
  previousColor: ColorId | null;
};

export type WinContext = {
  winner: ColorId;
  ranking: ColorId[];
  state: GameState;
};

export type DestroyContext = {
  reason: RoomDestroyReason;
  roomId?: string;
  state: GameState | null;
};

export type LegalMovesContext = {
  color: ColorId;
  dice: number;
  moves: LegalMove[];
  isMine: boolean;
  state: GameState;
};

export type PresenceChangeContext = {
  color: ColorId;
  presence: SeatPresence;
  previous: SeatPresence | undefined;
  state: GameState;
};

/** Convenience wrappers around engine events (also still delivered via `onEvent`). */
export type LudoLifecycleCallbacks = {
  /** Any seat’s turn started (after `turn` event). */
  onTurn?: (ctx: TurnChangeContext) => void;
  /** Only when an interactive seat must act. */
  onMyTurn?: (ctx: TurnChangeContext) => void;
  /** Dice landed (after roll animation starts / event). */
  onRoll?: (color: ColorId, value: number, state: GameState) => void;
  /** Token moved. */
  onMove?: (
    color: ColorId,
    tokenId: string,
    state: GameState,
    event: Extract<GameEvent, { type: 'move' }>,
  ) => void;
  /** Capture happened. */
  onCapture?: (by: ColorId, victimTokenId: string, state: GameState) => void;
  /** Legal moves available for the current seat. */
  onLegalMoves?: (ctx: LegalMovesContext) => void;
  /** Someone won. */
  onWin?: (ctx: WinContext) => void;
  /** Room / mount torn down (`destroyRoom` or `destroy`). */
  onDestroy?: (ctx: DestroyContext) => void;
  /** Seat presence changed. */
  onPresenceChange?: (ctx: PresenceChangeContext) => void;
};
