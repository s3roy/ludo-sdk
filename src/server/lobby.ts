/**
 * Authoritative multiplayer lobby.
 * Dice, legality, win, destroy — all server-side via `createLudoRoomHost`.
 * Clients only send intents + render host commands.
 */
import { chooseAiMove, type AiDifficulty } from '../core/ai';
import { COLOR_NAMES, seatColorsForCount } from '../core/constants';
import { listLegalMoves } from '../core/moves';
import type {
  ColorId,
  GameEvent,
  GameMode,
  GameState,
  PlayerConfig,
} from '../core/types';
import { createLudoRoomHost, type LudoRoomHost } from '../sdk/host';
import type { RoomDestroyReason } from '../sdk/lifecycle';
import type {
  LudoClientAction,
  LudoHostCommand,
  LudoRoomConfig,
} from '../sdk/room';
import type { TurnTimerConfig } from '../sdk/turnTimer';

export type LobbyRoomStatus = 'lobby' | 'playing' | 'finished' | 'destroyed';

export type LobbyPlayer = {
  playerId: string;
  name: string;
  color: ColorId;
  ready: boolean;
};

export type CreateLobbyRoomInput = {
  roomId?: string;
  mode?: GameMode;
  /** 2–4 seats. */
  maxPlayers?: 2 | 3 | 4;
  /** Fill empty seats with AI when starting. Default true. */
  fillAi?: boolean;
  aiDifficulty?: AiDifficulty;
  turnTimer?: TurnTimerConfig | false;
  /** Opaque table metadata (stake, currency, table name) — unused by rules. */
  meta?: Record<string, unknown>;
};

export type JoinOk = {
  ok: true;
  roomId: string;
  color: ColorId;
  config: LudoRoomConfig;
  players: LobbyPlayer[];
  status: LobbyRoomStatus;
};

export type JoinErr = { ok: false; error: string };

export type LudoLobbyOptions = {
  /** Fan-out to every client in the room (WS room / Redis pubsub). */
  broadcast: (roomId: string, cmd: LudoHostCommand) => void;
  /** Optional per-player push (private seat assign). */
  sendTo?: (playerId: string, cmd: LudoHostCommand) => void;
  rng?: () => number;
  onRoomDestroyed?: (
    roomId: string,
    reason: RoomDestroyReason,
    state: GameState | null,
  ) => void;
  onWin?: (
    roomId: string,
    winner: ColorId,
    ranking: ColorId[],
    state: GameState,
  ) => void;
  onEvent?: (roomId: string, event: GameEvent | null, state: GameState) => void;
};

type InternalRoom = {
  id: string;
  status: LobbyRoomStatus;
  maxPlayers: 2 | 3 | 4;
  mode: GameMode;
  fillAi: boolean;
  aiDifficulty: AiDifficulty;
  turnTimer?: TurnTimerConfig | false;
  meta?: Record<string, unknown>;
  players: Map<string, LobbyPlayer>;
  host: LudoRoomHost | null;
  colors: ColorId[];
};

export type LudoLobby = {
  createRoom: (input?: CreateLobbyRoomInput) => {
    roomId: string;
    status: LobbyRoomStatus;
  };
  join: (
    roomId: string,
    player: { playerId: string; name?: string },
  ) => JoinOk | JoinErr;
  ready: (roomId: string, playerId: string, ready?: boolean) => JoinOk | JoinErr;
  /** Start match — requires ≥1 human; fills AI if configured. */
  start: (roomId: string) => JoinOk | JoinErr;
  leave: (roomId: string, playerId: string) => { ok: boolean; error?: string };
  /** Authenticated action — color must belong to playerId. */
  action: (
    roomId: string,
    playerId: string,
    action: LudoClientAction,
  ) => { ok: boolean; error?: string };
  destroy: (roomId: string, reason?: RoomDestroyReason) => void;
  getRoom: (roomId: string) => {
    roomId: string;
    status: LobbyRoomStatus;
    players: LobbyPlayer[];
    config: LudoRoomConfig | null;
    state: GameState | null;
    meta?: Record<string, unknown>;
  } | null;
  listRooms: () => Array<{
    roomId: string;
    status: LobbyRoomStatus;
    seatsTaken: number;
    maxPlayers: number;
    mode: GameMode;
  }>;
};

function randomId(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]!;
  return s;
}

function buildSeats(room: InternalRoom): PlayerConfig[] {
  const byColor = new Map<ColorId, LobbyPlayer>();
  for (const p of room.players.values()) byColor.set(p.color, p);

  return room.colors.map((color) => {
    const human = byColor.get(color);
    if (human) {
      return {
        id: human.playerId,
        name: human.name,
        kind: 'human' as const,
        color,
        presence: human.ready ? ('ready' as const) : ('joined' as const),
      };
    }
    return {
      id: `ai-${color}`,
      name: COLOR_NAMES[color],
      kind: 'ai' as const,
      color,
      presence: 'ready' as const,
    };
  });
}

function toConfig(room: InternalRoom): LudoRoomConfig {
  return {
    roomId: room.id,
    mode: room.mode,
    seats: buildSeats(room),
    controlled: true,
    autoAi: false,
    aiDifficulty: room.aiDifficulty,
    turnTimer: room.turnTimer,
  };
}

function snapshot(
  room: InternalRoom,
): JoinOk {
  return {
    ok: true,
    roomId: room.id,
    color: 0, // overwritten by callers
    config: toConfig(room),
    players: [...room.players.values()],
    status: room.status,
  };
}

/**
 * Multi-room lobby. Wire `broadcast` to your realtime layer.
 *
 * @example
 * ```ts
 * const lobby = createLudoLobby({
 *   broadcast: (roomId, cmd) => io.to(roomId).emit('ludo', cmd),
 * })
 * const { roomId } = lobby.createRoom({ mode: 'rush', maxPlayers: 4 })
 * lobby.join(roomId, { playerId: 'u1', name: 'Alice' })
 * lobby.start(roomId)
 * lobby.action(roomId, 'u1', { type: 'roll', roomId, color: 0 })
 * ```
 */
export function createLudoLobby(opts: LudoLobbyOptions): LudoLobby {
  const rooms = new Map<string, InternalRoom>();

  function get(roomId: string): InternalRoom | null {
    return rooms.get(roomId) ?? null;
  }

  function createRoom(input: CreateLobbyRoomInput = {}) {
    let id = input.roomId ?? randomId();
    while (rooms.has(id)) id = randomId();
    const maxPlayers = input.maxPlayers ?? 4;
    const colors = seatColorsForCount(maxPlayers, 0);
    const room: InternalRoom = {
      id,
      status: 'lobby',
      maxPlayers,
      mode: input.mode ?? 'rush',
      fillAi: input.fillAi !== false,
      aiDifficulty: input.aiDifficulty ?? 'hard',
      turnTimer: input.turnTimer,
      meta: input.meta,
      players: new Map(),
      host: null,
      colors,
    };
    rooms.set(id, room);
    return { roomId: id, status: room.status as LobbyRoomStatus };
  }

  function join(
    roomId: string,
    player: { playerId: string; name?: string },
  ): JoinOk | JoinErr {
    const room = get(roomId);
    if (!room) return { ok: false, error: 'room_not_found' };
    if (room.status === 'destroyed') return { ok: false, error: 'room_destroyed' };
    if (room.status === 'playing' || room.status === 'finished') {
      // Rejoin only if already seated
      const existing = room.players.get(player.playerId);
      if (!existing) return { ok: false, error: 'game_already_started' };
      existing.ready = true;
      room.host?.setPresence(existing.color, 'ready', {
        name: player.name ?? existing.name,
      });
      const snap = snapshot(room);
      snap.color = existing.color;
      return snap;
    }
    const existing = room.players.get(player.playerId);
    if (existing) {
      const snap = snapshot(room);
      snap.color = existing.color;
      return snap;
    }
    if (room.players.size >= room.maxPlayers) {
      return { ok: false, error: 'room_full' };
    }
    const taken = new Set([...room.players.values()].map((p) => p.color));
    const color = room.colors.find((c) => !taken.has(c));
    if (color == null) return { ok: false, error: 'no_seat' };

    room.players.set(player.playerId, {
      playerId: player.playerId,
      name: player.name ?? `Player ${color + 1}`,
      color,
      ready: false,
    });

    opts.broadcast(roomId, {
      type: 'seats',
      seats: toConfig(room).seats,
    });

    const snap = snapshot(room);
    snap.color = color;
    return snap;
  }

  function ready(
    roomId: string,
    playerId: string,
    isReady = true,
  ): JoinOk | JoinErr {
    const room = get(roomId);
    if (!room) return { ok: false, error: 'room_not_found' };
    const p = room.players.get(playerId);
    if (!p) return { ok: false, error: 'not_in_room' };
    p.ready = isReady;
    if (room.host) {
      room.host.setPresence(p.color, isReady ? 'ready' : 'joined');
    } else {
      opts.broadcast(roomId, {
        type: 'presence',
        color: p.color,
        presence: isReady ? 'ready' : 'joined',
      });
    }
    const snap = snapshot(room);
    snap.color = p.color;
    return snap;
  }

  function start(roomId: string): JoinOk | JoinErr {
    const room = get(roomId);
    if (!room) return { ok: false, error: 'room_not_found' };
    if (room.status === 'playing') {
      const snap = snapshot(room);
      return snap;
    }
    if (room.status !== 'lobby') return { ok: false, error: 'bad_status' };
    if (room.players.size < 1) return { ok: false, error: 'need_players' };

    if (!room.fillAi && room.players.size < room.maxPlayers) {
      return { ok: false, error: 'waiting_players' };
    }

    // Mark humans ready
    for (const p of room.players.values()) p.ready = true;

    const config = toConfig(room);
    const host = createLudoRoomHost({
      room: config,
      rng: opts.rng,
      broadcast: (cmd, id) => opts.broadcast(id, cmd),
      onDestroyed: (reason, state) => {
        room.status = 'destroyed';
        opts.onRoomDestroyed?.(roomId, reason, state);
      },
      onWin: (winner, ranking, state) => {
        room.status = 'finished';
        opts.onWin?.(roomId, winner, ranking, state);
      },
      onEvent: (event, state) => opts.onEvent?.(roomId, event, state),
    });

    room.host = host;
    room.status = 'playing';
    host.sync();
    opts.broadcast(roomId, { type: 'seats', seats: config.seats });
    driveAi(room);

    return snapshot(room);
  }

  /** Server-side AI seats — never run on the client in hosted mode. */
  function driveAi(room: InternalRoom) {
    if (!room.host) return;
    const rng = opts.rng ?? Math.random;
    let guard = 0;
    while (guard++ < 48) {
      const s = room.host.getState();
      if (s.phase === 'finished') break;
      const seat = s.players.find((p) => p.color === s.currentColor);
      if (!seat || seat.kind !== 'ai') break;
      if (s.phase === 'waiting_roll') {
        room.host.handleAction({
          type: 'roll',
          roomId: room.id,
          color: s.currentColor,
        });
        continue;
      }
      if (s.phase === 'waiting_move') {
        const legal = listLegalMoves(s);
        if (!legal.length) break;
        const pick = chooseAiMove(legal, s, room.aiDifficulty, rng);
        room.host.handleAction({
          type: 'move',
          roomId: room.id,
          color: s.currentColor,
          tokenId: pick.tokenId,
        });
        continue;
      }
      break;
    }
  }

  function leave(roomId: string, playerId: string) {
    const room = get(roomId);
    if (!room) return { ok: false, error: 'room_not_found' };
    const p = room.players.get(playerId);
    if (!p) return { ok: false, error: 'not_in_room' };

    if (room.host && room.status === 'playing') {
      room.host.handleAction({
        type: 'leave',
        roomId,
        color: p.color,
      });
    }
    room.players.delete(playerId);

    if (room.status === 'lobby') {
      opts.broadcast(roomId, { type: 'seats', seats: toConfig(room).seats });
    }
    if (room.players.size === 0 && room.status !== 'playing') {
      rooms.delete(roomId);
    }
    return { ok: true };
  }

  function action(
    roomId: string,
    playerId: string,
    raw: LudoClientAction,
  ): { ok: boolean; error?: string } {
    const room = get(roomId);
    if (!room) return { ok: false, error: 'room_not_found' };
    if (!room.host || room.status !== 'playing') {
      return { ok: false, error: 'not_playing' };
    }
    const p = room.players.get(playerId);
    if (!p) return { ok: false, error: 'not_in_room' };

    // Seat ownership — never trust client color alone
    if (
      raw.type === 'roll' ||
      raw.type === 'move' ||
      raw.type === 'forfeit' ||
      raw.type === 'leave' ||
      raw.type === 'presence'
    ) {
      if (raw.color !== p.color) {
        return { ok: false, error: 'seat_mismatch' };
      }
    }

    // Destroy only from lobby.destroy(), not client intents
    if (raw.type === 'destroy') {
      return { ok: false, error: 'forbidden' };
    }

    let sealed: LudoClientAction;
    switch (raw.type) {
      case 'roll':
        sealed = { type: 'roll', roomId, color: p.color };
        break;
      case 'move':
        sealed = {
          type: 'move',
          roomId,
          color: p.color,
          tokenId: raw.tokenId,
        };
        break;
      case 'forfeit':
        sealed = { type: 'forfeit', roomId, color: p.color };
        break;
      case 'leave':
        sealed = { type: 'leave', roomId, color: p.color };
        break;
      case 'presence':
        sealed = {
          type: 'presence',
          roomId,
          color: p.color,
          presence: raw.presence,
        };
        break;
      default:
        return { ok: false, error: 'unknown_action' };
    }

    const result = room.host.handleAction(sealed);
    if (result.ok) driveAi(room);
    return result;
  }

  function destroy(roomId: string, reason: RoomDestroyReason = 'host') {
    const room = get(roomId);
    if (!room) return;
    if (room.host) room.host.destroy(reason);
    else {
      opts.broadcast(roomId, { type: 'destroy', reason });
      room.status = 'destroyed';
      opts.onRoomDestroyed?.(roomId, reason, null);
    }
    rooms.delete(roomId);
  }

  return {
    createRoom,
    join,
    ready,
    start,
    leave,
    action,
    destroy,
    getRoom: (roomId) => {
      const room = get(roomId);
      if (!room) return null;
      return {
        roomId: room.id,
        status: room.status,
        players: [...room.players.values()],
        config: toConfig(room),
        state: room.host?.getState() ?? null,
        meta: room.meta,
      };
    },
    listRooms: () =>
      [...rooms.values()].map((r) => ({
        roomId: r.id,
        status: r.status,
        seatsTaken: r.players.size,
        maxPlayers: r.maxPlayers,
        mode: r.mode,
      })),
  };
}
