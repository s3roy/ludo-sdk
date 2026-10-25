import { createGame, type LudoGame } from '../core/game';
import { listLegalMoves } from '../core/moves';
import type {
  ColorId,
  GameEvent,
  GameMode,
  GameState,
  PlayerConfig,
  SeatPresence,
} from '../core/types';
import type { RoomDestroyReason } from './lifecycle';
import { isSeatAbsent, normalizePresence, withPresence } from './presence';
import type {
  LudoClientAction,
  LudoHostCommand,
  LudoRoomConfig,
} from './room';

export type LudoRoomHostOptions = {
  room: LudoRoomConfig;
  /** Push every host command to connected clients (WS / SSE / etc.). */
  broadcast: (cmd: LudoHostCommand, roomId: string) => void;
  /** Authoritative RNG (optional). */
  rng?: () => number;
  onDestroyed?: (reason: RoomDestroyReason, state: GameState | null) => void;
  onEvent?: (event: GameEvent | null, state: GameState) => void;
  onTurn?: (color: ColorId, state: GameState) => void;
  onWin?: (winner: ColorId, ranking: ColorId[], state: GameState) => void;
};

export type LudoRoomHost = {
  roomId: string;
  getConfig: () => LudoRoomConfig;
  getState: () => GameState;
  getGame: () => LudoGame;
  isDestroyed: () => boolean;
  /** Whose turn (null if finished / destroyed). */
  whoseTurn: () => ColorId | null;
  /** Validate + apply a client intent; broadcasts sync/dice/play as needed. */
  handleAction: (action: LudoClientAction) => {
    ok: boolean;
    error?: string;
  };
  /** Backend closes the room for everyone. */
  destroy: (reason?: RoomDestroyReason) => void;
  setPresence: (
    color: ColorId,
    presence: SeatPresence,
    patch?: Partial<Pick<PlayerConfig, 'name' | 'id' | 'kind'>>,
  ) => void;
  setSeats: (seats: PlayerConfig[]) => void;
  /** Host-authored dice (same as handling a validated roll). */
  applyDice: (value: number) => number | null;
  applyMove: (tokenId: string) => boolean;
  /** Full resync broadcast. */
  sync: (event?: GameEvent | null) => void;
  /** Arena: end match by score (match clock). */
  endMatch: () => boolean;
};

/**
 * Headless authoritative room for your Node/backend.
 * Clients mount with `controlled: true` and apply whatever you `broadcast`.
 *
 * @example
 * ```ts
 * const host = createLudoRoomHost({
 *   room,
 *   broadcast: (cmd, roomId) => io.to(roomId).emit('ludo', cmd),
 * })
 * // client rolled →
 * host.handleAction({ type: 'roll', roomId, color: 0 })
 * // admin / idle timeout →
 * host.destroy('host')
 * ```
 */
export function createLudoRoomHost(opts: LudoRoomHostOptions): LudoRoomHost {
  const room: LudoRoomConfig = {
    ...opts.room,
    controlled: true,
    seats: opts.room.seats.slice(0, 4).map((s) => ({
      ...s,
      presence: normalizePresence(s),
    })),
  };

  let destroyed = false;
  let game = createGame({
    mode: room.mode,
    players: room.seats,
    rng: opts.rng,
    matchDurationMs: room.matchDurationMs,
  });

  const unsub = game.subscribe((state, event) => {
    if (destroyed) return;
    opts.onEvent?.(event, state);
    if (event?.type === 'turn') opts.onTurn?.(event.color, state);
    if (event?.type === 'win') {
      opts.onWin?.(event.color, event.ranking, state);
    }
  });

  function broadcast(cmd: LudoHostCommand) {
    if (destroyed && cmd.type !== 'destroy') return;
    opts.broadcast(cmd, room.roomId);
  }

  /**
   * Push authoritative state. Omit `event` for silent catch-up (preferred after
   * dice/play). Pass an event when clients should run lifecycle (e.g. forfeit → turn).
   */
  function sync(event?: GameEvent | null) {
    if (destroyed) return;
    if (arguments.length >= 1) {
      broadcast({ type: 'sync', state: game.getState(), event: event ?? null });
    } else {
      broadcast({ type: 'sync', state: game.getState() });
    }
  }

  function destroy(reason: RoomDestroyReason = 'host') {
    if (destroyed) return;
    const snap = game.getState();
    destroyed = true;
    unsub();
    broadcast({ type: 'destroy', reason });
    opts.onDestroyed?.(reason, snap);
  }

  function setPresence(
    color: ColorId,
    presence: SeatPresence,
    patch?: Partial<Pick<PlayerConfig, 'name' | 'id' | 'kind'>>,
  ) {
    if (destroyed) return;
    const s = game.getState();
    const players = withPresence(s.players, color, presence, patch);
    room.seats = players;
    game.syncState({ ...s, players }, { type: 'presence', color, presence });
    broadcast({
      type: 'presence',
      color,
      presence,
      name: patch?.name,
      id: patch?.id,
    });
    // Presence already broadcast — silent state align only
    sync();
  }

  function setSeats(seats: PlayerConfig[]) {
    if (destroyed) return;
    const next = seats.slice(0, 4).map((p) => ({
      ...p,
      presence: normalizePresence(p),
    }));
    room.seats = next;
    const s = game.getState();
    game.syncState({ ...s, players: next });
    broadcast({ type: 'seats', seats: next });
    sync();
  }

  function applyDice(value: number): number | null {
    if (destroyed) return null;
    const roller = game.getState().currentColor;
    const v = game.applyDice(value);
    if (v == null) return null;
    broadcast({ type: 'dice', value: v, color: roller });
    const after = game.getState();
    // Void roll already advanced — push turn/no_moves so clients don't stick
    if (after.currentColor !== roller || after.dice == null) {
      sync(after.lastEvent);
    } else {
      sync(); // silent — clients already applied dice
    }
    return v;
  }

  function applyMove(tokenId: string): boolean {
    if (destroyed) return false;
    const ok = game.move(tokenId);
    if (!ok) return false;
    broadcast({ type: 'play', tokenId });
    const after = game.getState();
    // Winning move: clients need the `win` event (silent sync skips overlay)
    if (after.phase === 'finished' && after.lastEvent?.type === 'win') {
      sync(after.lastEvent);
    } else {
      sync(); // silent — clients already applied play
    }
    return true;
  }

  function handleAction(action: LudoClientAction): { ok: boolean; error?: string } {
    if (destroyed) return { ok: false, error: 'room_destroyed' };
    if (action.roomId && action.roomId !== room.roomId) {
      return { ok: false, error: 'room_mismatch' };
    }

    const state = game.getState();

    if (action.type === 'destroy') {
      destroy(action.reason ?? 'client');
      return { ok: true };
    }

    if (action.type === 'leave') {
      setPresence(action.color, 'disconnected');
      // Optional: auto-destroy when no humans left present
      const humans = game
        .getState()
        .players.filter((p) => p.kind === 'human');
      const anyLeft = humans.some((p) => !isSeatAbsent(p.presence, p.kind));
      if (!anyLeft) destroy('abandoned');
      return { ok: true };
    }

    if (action.type === 'presence') {
      setPresence(action.color, action.presence);
      return { ok: true };
    }

    if (action.type === 'forfeit') {
      if (state.phase === 'finished') {
        return { ok: false, error: 'finished' };
      }
      if (state.currentColor !== action.color) {
        return { ok: false, error: 'not_your_turn' };
      }
      const ok = game.forfeitTurn();
      if (!ok) return { ok: false, error: 'forfeit_failed' };
      // Clients need the turn advance — emit lastEvent (usually `turn`)
      sync(game.getState().lastEvent);
      return { ok: true };
    }

    if (action.type === 'roll') {
      if (state.phase !== 'waiting_roll') {
        return { ok: false, error: 'not_waiting_roll' };
      }
      if (state.currentColor !== action.color) {
        return { ok: false, error: 'not_your_turn' };
      }
      const roller = action.color;
      const v = game.roll();
      if (v == null) return { ok: false, error: 'roll_failed' };
      broadcast({ type: 'dice', value: v, color: roller });
      const after = game.getState();
      // Need a 6 to leave yard — void rolls advance immediately; sync the turn
      if (after.currentColor !== roller || after.dice == null) {
        sync(after.lastEvent);
      } else {
        sync();
      }
      return { ok: true };
    }

    if (action.type === 'move') {
      if (state.phase !== 'waiting_move') {
        return { ok: false, error: 'not_waiting_move' };
      }
      if (state.currentColor !== action.color) {
        return { ok: false, error: 'not_your_turn' };
      }
      const legal = listLegalMoves(state);
      if (!legal.some((m) => m.tokenId === action.tokenId)) {
        return { ok: false, error: 'illegal_move' };
      }
      const ok = applyMove(action.tokenId);
      return ok ? { ok: true } : { ok: false, error: 'move_failed' };
    }

    return { ok: false, error: 'unknown_action' };
  }

  return {
    roomId: room.roomId,
    getConfig: () => ({ ...room, seats: [...room.seats] }),
    getState: () => game.getState(),
    getGame: () => game,
    isDestroyed: () => destroyed,
    whoseTurn: () => {
      if (destroyed) return null;
      const s = game.getState();
      return s.phase === 'finished' ? null : s.currentColor;
    },
    handleAction,
    destroy,
    setPresence,
    setSeats,
    applyDice,
    applyMove,
    sync,
    endMatch: () => {
      if (destroyed) return false;
      const ok = game.endMatch();
      if (ok) sync(game.getState().lastEvent);
      return ok;
    },
  };
}

/** Build a controlled room config for clients from host state. */
export function roomConfigFromHost(
  host: LudoRoomHost,
  interactiveColors: ColorId[],
): LudoRoomConfig {
  const cfg = host.getConfig();
  return {
    ...cfg,
    interactiveColors,
    controlled: true,
  };
}

export type { GameMode };
