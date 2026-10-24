/**
 * Multiplayer rooms — dice, legality, win, turn clock, auto-turn on the server.
 * Clients send intents and render host commands.
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
import {
  normalizeRoomPolicy,
  type NormalizedRoomPolicy,
  type RoomLifecyclePolicy,
} from './policy';

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
  /** Client HUD turn ring (cosmetic + optional offline). */
  turnTimer?: TurnTimerConfig | false;
  /** Opaque table metadata (stake, currency, table name). */
  meta?: Record<string, unknown>;
  /** Backend lifecycle: miss-turn, auto-turn cap, leave. */
  policy?: RoomLifecyclePolicy;
};

/** One human you already decided belongs in this match. */
export type CreateMatchPlayer = {
  playerId: string;
  name?: string;
  /** Pin a seat colour; omit to assign next free seat. */
  color?: ColorId;
};

/** Seat these players and start the room. */
export type CreateMatchInput = CreateLobbyRoomInput & {
  players: CreateMatchPlayer[];
};

export type CreateMatchOk = {
  ok: true;
  roomId: string;
  players: LobbyPlayer[];
  config: LudoRoomConfig;
  policy: NormalizedRoomPolicy;
  /** playerId → seat colour */
  seats: Record<string, ColorId>;
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

export type MissTurnAction = 'skip' | 'auto';

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
  /** Fired when a seat’s turn begins (after start). */
  onTurn?: (roomId: string, color: ColorId, state: GameState) => void;
  /** Server clock expired for a human seat. */
  onMissTurn?: (
    roomId: string,
    color: ColorId,
    streak: number,
    action: MissTurnAction,
    state: GameState,
  ) => void;
  /** Seat converted to AI after maxAutoTurns or leave. */
  onSeatConverted?: (
    roomId: string,
    color: ColorId,
    reason: 'max_auto_turns' | 'leave',
    state: GameState | null,
  ) => void;
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
  policy: NormalizedRoomPolicy;
  players: Map<string, LobbyPlayer>;
  host: LudoRoomHost | null;
  colors: ColorId[];
  /** Consecutive miss/auto turns per color. */
  missStreak: Map<ColorId, number>;
  turnTimerHandle: ReturnType<typeof setTimeout> | null;
  turnArmedFor: { color: ColorId; turnId: number } | null;
};

export type LudoLobby = {
  /** Seat players and start. */
  createMatch: (input: CreateMatchInput) => CreateMatchOk | JoinErr;
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
  /** Backend/admin remove a player (no player-host). */
  kick: (
    roomId: string,
    targetPlayerId: string,
  ) => { ok: boolean; error?: string; kickedColor?: ColorId };
  /** Authenticated action — color must belong to playerId. */
  action: (
    roomId: string,
    playerId: string,
    action: LudoClientAction,
  ) => { ok: boolean; error?: string };
  /** Backend tears down the room. */
  destroy: (roomId: string, reason?: RoomDestroyReason) => void;
  getRoom: (roomId: string) => {
    roomId: string;
    status: LobbyRoomStatus;
    players: LobbyPlayer[];
    policy: NormalizedRoomPolicy;
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
  const duration =
    room.policy.turnDurationMs === false
      ? false
      : ({
          enabled: true,
          durationMs: room.policy.turnDurationMs,
          onTimeout: 'none',
          appliesTo: 'all',
        } satisfies TurnTimerConfig);

  return {
    roomId: room.id,
    mode: room.mode,
    seats: buildSeats(room),
    controlled: true,
    autoAi: false,
    aiDifficulty: room.aiDifficulty,
    turnTimer: room.turnTimer !== undefined ? room.turnTimer : duration,
  };
}

function snapshot(room: InternalRoom): JoinOk {
  return {
    ok: true,
    roomId: room.id,
    color: 0,
    config: toConfig(room),
    players: [...room.players.values()],
    status: room.status,
  };
}

/** Multi-room lobby. Wire `broadcast` to your realtime layer. */
export function createLudoLobby(opts: LudoLobbyOptions): LudoLobby {
  const rooms = new Map<string, InternalRoom>();

  function get(roomId: string): InternalRoom | null {
    return rooms.get(roomId) ?? null;
  }

  function clearTurnTimer(room: InternalRoom) {
    if (room.turnTimerHandle) {
      clearTimeout(room.turnTimerHandle);
      room.turnTimerHandle = null;
    }
    room.turnArmedFor = null;
  }

  function convertSeatToAi(
    room: InternalRoom,
    color: ColorId,
    reason: 'max_auto_turns' | 'leave',
  ) {
    const player = [...room.players.values()].find((p) => p.color === color);
    if (player) room.players.delete(player.playerId);
    room.missStreak.delete(color);
    if (room.host) {
      room.host.setPresence(color, 'ready', {
        kind: 'ai',
        id: `ai-${color}`,
        name: COLOR_NAMES[color],
      });
      opts.broadcast(room.id, {
        type: 'seats',
        seats: room.host.getConfig().seats,
      });
      opts.onSeatConverted?.(
        room.id,
        color,
        reason,
        room.host.getState(),
      );
    }
  }

  function armTurnTimer(room: InternalRoom) {
    clearTurnTimer(room);
    if (!room.host || room.status !== 'playing') return;
    if (room.policy.turnDurationMs === false) return;

    const state = room.host.getState();
    if (state.phase === 'finished') return;
    const color = state.currentColor;
    const seat = state.players.find((p) => p.color === color);
    if (!seat || seat.kind !== 'human') return;
    if (state.phase !== 'waiting_roll' && state.phase !== 'waiting_move') {
      return;
    }

    const turnId = state.turnId;
    room.turnArmedFor = { color, turnId };
    room.turnTimerHandle = setTimeout(() => {
      handleMissTurn(room, color, turnId);
    }, room.policy.turnDurationMs);
  }

  function handleMissTurn(
    room: InternalRoom,
    color: ColorId,
    turnId: number,
  ) {
    room.turnTimerHandle = null;
    if (!room.host || room.status !== 'playing') return;
    const state = room.host.getState();
    if (state.turnId !== turnId || state.currentColor !== color) return;
    const seat = state.players.find((p) => p.color === color);
    if (!seat || seat.kind !== 'human') return;

    const streak = (room.missStreak.get(color) ?? 0) + 1;
    room.missStreak.set(color, streak);
    const action = room.policy.onTurnTimeout;

    if (action === 'auto') {
      driveSeatOnce(room, color);
    } else {
      room.host.handleAction({
        type: 'forfeit',
        roomId: room.id,
        color,
      });
    }

    const after = room.host.getState();
    opts.onMissTurn?.(room.id, color, streak, action, after);

    const stillHuman = [...room.players.values()].some((p) => p.color === color);
    if (
      room.policy.maxAutoTurns > 0 &&
      streak >= room.policy.maxAutoTurns &&
      stillHuman
    ) {
      convertSeatToAi(room, color, 'max_auto_turns');
    }

    driveAi(room);
    armTurnTimer(room);
  }

  /** One roll or one move for a seat (auto-turn / AI). */
  function driveSeatOnce(room: InternalRoom, color: ColorId) {
    if (!room.host) return;
    const rng = opts.rng ?? Math.random;
    const s = room.host.getState();
    if (s.currentColor !== color) return;
    if (s.phase === 'waiting_roll') {
      room.host.handleAction({ type: 'roll', roomId: room.id, color });
      const s2 = room.host.getState();
      if (s2.phase === 'waiting_move' && s2.currentColor === color) {
        const legal = listLegalMoves(s2);
        if (legal.length) {
          const pick = chooseAiMove(legal, s2, room.aiDifficulty, rng);
          room.host.handleAction({
            type: 'move',
            roomId: room.id,
            color,
            tokenId: pick.tokenId,
          });
        }
      }
      return;
    }
    if (s.phase === 'waiting_move') {
      const legal = listLegalMoves(s);
      if (!legal.length) {
        room.host.handleAction({ type: 'forfeit', roomId: room.id, color });
        return;
      }
      const pick = chooseAiMove(legal, s, room.aiDifficulty, rng);
      room.host.handleAction({
        type: 'move',
        roomId: room.id,
        color,
        tokenId: pick.tokenId,
      });
    }
  }

  function createRoom(input: CreateLobbyRoomInput = {}) {
    let id = input.roomId ?? randomId();
    while (rooms.has(id)) id = randomId();
    const maxPlayers = input.maxPlayers ?? 4;
    const rng = opts.rng ?? Math.random;
    // Random diagonal pair (2p) / seat set — first human is not always red
    const anchor = Math.floor(rng() * 4) as ColorId;
    const colors = seatColorsForCount(maxPlayers, anchor);
    const policy = normalizeRoomPolicy(input.policy);
    const room: InternalRoom = {
      id,
      status: 'lobby',
      maxPlayers,
      mode: input.mode ?? 'rush',
      fillAi: input.fillAi !== false,
      aiDifficulty: input.aiDifficulty ?? 'hard',
      turnTimer: input.turnTimer,
      meta: input.meta,
      policy,
      players: new Map(),
      host: null,
      colors,
      missStreak: new Map(),
      turnTimerHandle: null,
      turnArmedFor: null,
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
    const free = room.colors.filter((c) => !taken.has(c));
    if (!free.length) return { ok: false, error: 'no_seat' };
    const rng = opts.rng ?? Math.random;
    const color = free[Math.floor(rng() * free.length)]!;

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
      return snapshot(room);
    }
    if (room.status !== 'lobby') return { ok: false, error: 'bad_status' };
    if (room.players.size < 1) return { ok: false, error: 'need_players' };

    if (!room.fillAi && room.players.size < room.maxPlayers) {
      return { ok: false, error: 'waiting_players' };
    }

    for (const p of room.players.values()) p.ready = true;

    const config = toConfig(room);
    const host = createLudoRoomHost({
      room: config,
      rng: opts.rng,
      broadcast: (cmd, id) => opts.broadcast(id, cmd),
      onDestroyed: (reason, state) => {
        clearTurnTimer(room);
        room.status = 'destroyed';
        opts.onRoomDestroyed?.(roomId, reason, state);
      },
      onWin: (winner, ranking, state) => {
        clearTurnTimer(room);
        room.status = 'finished';
        opts.onWin?.(roomId, winner, ranking, state);
      },
      onEvent: (event, state) => opts.onEvent?.(roomId, event, state),
      onTurn: (color, state) => {
        opts.onTurn?.(roomId, color, state);
        armTurnTimer(room);
      },
    });

    room.host = host;
    room.status = 'playing';
    host.sync();
    opts.broadcast(roomId, { type: 'seats', seats: config.seats });
    driveAi(room);
    armTurnTimer(room);

    return snapshot(room);
  }

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
    const color = p.color;

    if (room.host && room.status === 'playing') {
      const policy = room.policy.onLeave;
      if (policy === 'convert_ai') {
        convertSeatToAi(room, color, 'leave');
        driveAi(room);
        armTurnTimer(room);
        return { ok: true };
      }
      room.host.handleAction({
        type: 'leave',
        roomId,
        color,
      });
      room.players.delete(playerId);
      if (policy === 'destroy_if_empty' && room.players.size === 0) {
        destroy(roomId, 'abandoned');
      }
      return { ok: true };
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

  function kick(roomId: string, targetPlayerId: string) {
    const room = get(roomId);
    if (!room) return { ok: false, error: 'room_not_found' };
    const target = room.players.get(targetPlayerId);
    if (!target) return { ok: false, error: 'target_not_in_room' };
    const kickedColor = target.color;
    const left = leave(roomId, targetPlayerId);
    if (!left.ok) return { ok: false, error: left.error };
    return { ok: true, kickedColor };
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

    const beforeTurn = room.host.getState().turnId;
    const beforeColor = room.host.getState().currentColor;
    const result = room.host.handleAction(sealed);
    if (result.ok) {
      // Successful human act resets miss streak for that seat
      if (raw.type === 'roll' || raw.type === 'move') {
        room.missStreak.set(p.color, 0);
      }
      driveAi(room);
      const after = room.host.getState();
      if (
        after.turnId !== beforeTurn ||
        after.currentColor !== beforeColor ||
        after.phase === 'waiting_roll'
      ) {
        armTurnTimer(room);
      }
    }
    return result;
  }

  function destroy(roomId: string, reason: RoomDestroyReason = 'host') {
    const room = get(roomId);
    if (!room) return;
    clearTurnTimer(room);
    if (room.host) room.host.destroy(reason);
    else {
      opts.broadcast(roomId, { type: 'destroy', reason });
      room.status = 'destroyed';
      opts.onRoomDestroyed?.(roomId, reason, null);
    }
    rooms.delete(roomId);
  }

  function createMatch(input: CreateMatchInput): CreateMatchOk | JoinErr {
    const list = input.players ?? [];
    if (list.length < 1) return { ok: false, error: 'need_players' };

    const ids = new Set(list.map((p) => p.playerId));
    if (ids.size !== list.length) {
      return { ok: false, error: 'duplicate_player' };
    }
    if ([...ids].some((id) => !id)) {
      return { ok: false, error: 'need_player_id' };
    }

    const inferred =
      list.length <= 2 ? 2 : list.length === 3 ? 3 : 4;
    const maxPlayers = (input.maxPlayers ?? inferred) as 2 | 3 | 4;
    if (list.length > maxPlayers) {
      return { ok: false, error: 'too_many_players' };
    }

    const { roomId } = createRoom({ ...input, maxPlayers });
    const room = get(roomId);
    if (!room) return { ok: false, error: 'room_not_found' };

    const used = new Set<ColorId>();
    const rng = opts.rng ?? Math.random;
    for (const p of list) {
      let color = p.color;
      if (color != null) {
        if (!room.colors.includes(color) || used.has(color)) {
          destroy(roomId, 'host');
          return { ok: false, error: 'bad_color' };
        }
      } else {
        const free = room.colors.filter((c) => !used.has(c));
        color = free[Math.floor(rng() * free.length)];
        if (color == null) {
          destroy(roomId, 'host');
          return { ok: false, error: 'no_seat' };
        }
      }
      used.add(color);
      room.players.set(p.playerId, {
        playerId: p.playerId,
        name: p.name?.trim() || `Player ${color + 1}`,
        color,
        ready: true,
      });
    }

    const started = start(roomId);
    if (!started.ok) {
      destroy(roomId, 'host');
      return started;
    }

    const players = [...room.players.values()];
    const seats: Record<string, ColorId> = {};
    for (const p of players) seats[p.playerId] = p.color;

    return {
      ok: true,
      roomId,
      players,
      config: toConfig(room),
      policy: room.policy,
      seats,
    };
  }

  return {
    createMatch,
    createRoom,
    join,
    ready,
    start,
    leave,
    kick,
    action,
    destroy,
    getRoom: (roomId) => {
      const room = get(roomId);
      if (!room) return null;
      return {
        roomId: room.id,
        status: room.status,
        players: [...room.players.values()],
        policy: room.policy,
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

export type { RoomLifecyclePolicy, NormalizedRoomPolicy } from './policy';
