/**
 * Queue matchmaker — no player host.
 *
 * Integrator flow:
 * 1. `openTable({ token, seats, policy… })` (optional named pool)
 * 2. Client presses Play → `play({ playerId, name, token? })`
 * 3. When enough players (or queue timeout + fillAi) → room created + started
 * 4. `action` / `leave` / callbacks for turn / miss / win
 */
import type { AiDifficulty } from '../core/ai';
import type { ColorId, GameEvent, GameMode, GameState } from '../core/types';
import type { RoomDestroyReason } from '../sdk/lifecycle';
import type { LudoClientAction, LudoHostCommand } from '../sdk/room';
import {
  createLudoLobby,
  type JoinOk,
  type LobbyPlayer,
  type LudoLobby,
  type MissTurnAction,
} from './lobby';
import {
  normalizeRoomPolicy,
  type NormalizedRoomPolicy,
  type RoomLifecyclePolicy,
} from './policy';

export type MatchTableConfig = {
  /** Join key. Same token = same queue. Omit = public pool for seats+mode. */
  token?: string;
  seats?: 2 | 3 | 4;
  mode?: GameMode;
  fillAi?: boolean;
  /** If queue not full after this ms, start with AI (if fillAi) or cancel. */
  queueTimeoutMs?: number;
  aiDifficulty?: AiDifficulty;
  policy?: RoomLifecyclePolicy;
  meta?: Record<string, unknown>;
};

export type PlayInput = {
  playerId: string;
  name?: string;
  /** Match a named table from `openTable`, or public pool. */
  token?: string;
  /** Override seats when using public pool (ignored if token table exists). */
  seats?: 2 | 3 | 4;
  mode?: GameMode;
};

export type PlayQueued = {
  status: 'queued';
  ticketId: string;
  token: string;
  position: number;
  seats: number;
  playersInQueue: number;
};

export type PlayMatched = {
  status: 'matched';
  roomId: string;
  color: ColorId;
  players: LobbyPlayer[];
  config: JoinOk['config'];
  policy: NormalizedRoomPolicy;
};

export type PlayResult = PlayQueued | PlayMatched | { status: 'error'; error: string };

export type QueueUpdate = {
  token: string;
  ticketId: string;
  position: number;
  seats: number;
  playersInQueue: number;
};

export type LudoMatchmakerOptions = {
  broadcast: (roomId: string, cmd: LudoHostCommand) => void;
  /** Notify a waiting player (queue position / matched / cancelled). */
  notify?: (
    playerId: string,
    msg:
      | { type: 'queue'; update: QueueUpdate }
      | { type: 'matched'; match: PlayMatched }
      | { type: 'queue_cancelled'; reason: string; token: string }
      | { type: 'kicked'; roomId: string }
      | { type: 'left'; roomId: string },
  ) => void;
  rng?: () => number;
  defaults?: MatchTableConfig;
  onMatched?: (roomId: string, players: LobbyPlayer[], token: string) => void;
  onQueue?: (update: QueueUpdate) => void;
  onTurn?: (roomId: string, color: ColorId, state: GameState) => void;
  onMissTurn?: (
    roomId: string,
    color: ColorId,
    streak: number,
    action: MissTurnAction,
    state: GameState,
  ) => void;
  onSeatConverted?: (
    roomId: string,
    color: ColorId,
    reason: 'max_auto_turns' | 'leave',
    state: GameState | null,
  ) => void;
  onWin?: (
    roomId: string,
    winner: ColorId,
    ranking: ColorId[],
    state: GameState,
  ) => void;
  onEvent?: (roomId: string, event: GameEvent | null, state: GameState) => void;
  onRoomDestroyed?: (
    roomId: string,
    reason: RoomDestroyReason,
    state: GameState | null,
  ) => void;
};

type WaitingPlayer = {
  playerId: string;
  name: string;
  ticketId: string;
};

type Table = {
  token: string;
  seats: 2 | 3 | 4;
  mode: GameMode;
  fillAi: boolean;
  queueTimeoutMs: number;
  aiDifficulty: AiDifficulty;
  policy: RoomLifecyclePolicy;
  meta?: Record<string, unknown>;
  queue: WaitingPlayer[];
  timer: ReturnType<typeof setTimeout> | null;
};

export type LudoMatchmaker = {
  /** Create / update a named match pool (integrator). */
  openTable: (config: MatchTableConfig & { token: string }) => {
    token: string;
    seats: number;
    policy: NormalizedRoomPolicy;
  };
  /** Player pressed Play — enqueue or instantly match. */
  play: (input: PlayInput) => PlayResult;
  /** Leave the queue before match. */
  cancel: (playerId: string) => { ok: boolean; error?: string };
  leave: (roomId: string, playerId: string) => { ok: boolean; error?: string };
  kick: (
    roomId: string,
    targetPlayerId: string,
  ) => { ok: boolean; error?: string; kickedColor?: ColorId };
  action: (
    roomId: string,
    playerId: string,
    action: LudoClientAction,
  ) => { ok: boolean; error?: string };
  destroy: (roomId: string, reason?: RoomDestroyReason) => void;
  getRoom: LudoLobby['getRoom'];
  listRooms: LudoLobby['listRooms'];
  listQueues: () => Array<{
    token: string;
    seats: number;
    waiting: number;
    mode: GameMode;
  }>;
  /** Underlying lobby (advanced). */
  lobby: LudoLobby;
};

function publicToken(seats: number, mode: GameMode) {
  return `public:${seats}:${mode}`;
}

function ticketId() {
  return `t_${Math.random().toString(36).slice(2, 10)}`;
}

export function createLudoMatchmaker(
  opts: LudoMatchmakerOptions,
): LudoMatchmaker {
  const defaults = opts.defaults ?? {};
  const tables = new Map<string, Table>();
  /** playerId → token while queued */
  const queuedAt = new Map<string, string>();

  const lobby = createLudoLobby({
    broadcast: opts.broadcast,
    rng: opts.rng,
    onRoomDestroyed: opts.onRoomDestroyed,
    onWin: opts.onWin,
    onEvent: opts.onEvent,
    onTurn: opts.onTurn,
    onMissTurn: opts.onMissTurn,
    onSeatConverted: opts.onSeatConverted,
  });

  function tableDefaults(partial: MatchTableConfig): Omit<Table, 'queue' | 'timer' | 'token'> & {
    token?: string;
  } {
    const seats = (partial.seats ?? defaults.seats ?? 4) as 2 | 3 | 4;
    const mode = partial.mode ?? defaults.mode ?? 'rush';
    return {
      token: partial.token,
      seats,
      mode,
      fillAi: partial.fillAi ?? defaults.fillAi ?? true,
      queueTimeoutMs: Math.max(
        1000,
        partial.queueTimeoutMs ?? defaults.queueTimeoutMs ?? 30_000,
      ),
      aiDifficulty: partial.aiDifficulty ?? defaults.aiDifficulty ?? 'hard',
      policy: partial.policy ?? defaults.policy ?? {},
      meta: partial.meta ?? defaults.meta,
    };
  }

  function ensureTable(token: string, partial: MatchTableConfig): Table {
    let t = tables.get(token);
    if (t) return t;
    const d = tableDefaults({ ...partial, token });
    t = {
      token,
      seats: d.seats,
      mode: d.mode,
      fillAi: d.fillAi,
      queueTimeoutMs: d.queueTimeoutMs,
      aiDifficulty: d.aiDifficulty,
      policy: d.policy,
      meta: d.meta,
      queue: [],
      timer: null,
    };
    tables.set(token, t);
    return t;
  }

  function clearTimer(t: Table) {
    if (t.timer) {
      clearTimeout(t.timer);
      t.timer = null;
    }
  }

  function fanQueue(t: Table) {
    t.queue.forEach((p, i) => {
      const update: QueueUpdate = {
        token: t.token,
        ticketId: p.ticketId,
        position: i + 1,
        seats: t.seats,
        playersInQueue: t.queue.length,
      };
      opts.onQueue?.(update);
      opts.notify?.(p.playerId, { type: 'queue', update });
    });
  }

  function formMatch(t: Table, players: WaitingPlayer[]): PlayMatched | null {
    const created = lobby.createRoom({
      mode: t.mode,
      maxPlayers: t.seats,
      fillAi: t.fillAi,
      aiDifficulty: t.aiDifficulty,
      policy: t.policy,
      meta: { ...t.meta, matchToken: t.token },
    });

    const matchedPlayers: LobbyPlayer[] = [];
    let first: JoinOk | null = null;

    for (const wp of players) {
      queuedAt.delete(wp.playerId);
      const joined = lobby.join(created.roomId, {
        playerId: wp.playerId,
        name: wp.name,
      });
      if (!joined.ok) {
        lobby.destroy(created.roomId, 'host');
        return null;
      }
      matchedPlayers.push(
        joined.players.find((p) => p.playerId === wp.playerId)!,
      );
      if (!first) first = joined;
    }

    // Notify before start so the host can attach sockets before sync/dice.
    const lobbyRoom = lobby.getRoom(created.roomId);
    if (!lobbyRoom?.config) {
      lobby.destroy(created.roomId, 'host');
      return null;
    }
    opts.onMatched?.(created.roomId, matchedPlayers, t.token);
    for (const wp of players) {
      const seat = lobbyRoom.players.find((p) => p.playerId === wp.playerId);
      if (!seat) continue;
      const match: PlayMatched = {
        status: 'matched',
        roomId: created.roomId,
        color: seat.color,
        players: lobbyRoom.players,
        config: lobbyRoom.config,
        policy: lobbyRoom.policy,
      };
      opts.notify?.(wp.playerId, { type: 'matched', match });
    }

    const started = lobby.start(created.roomId);
    if (!started.ok) {
      lobby.destroy(created.roomId, 'host');
      return null;
    }

    const room = lobby.getRoom(created.roomId);
    return {
      status: 'matched',
      roomId: created.roomId,
      color: first!.color,
      players: room?.players ?? matchedPlayers,
      config: room!.config!,
      policy: room!.policy,
    };
  }

  function tryMatch(t: Table): PlayMatched | null {
    if (t.queue.length < t.seats) return null;
    clearTimer(t);
    const batch = t.queue.splice(0, t.seats);
    const result = formMatch(t, batch);
    fanQueue(t);
    if (t.queue.length === 0 && !t.token.startsWith('public:')) {
      // keep named tables
    }
    return result;
  }

  function armQueueTimeout(t: Table) {
    clearTimer(t);
    if (t.queue.length === 0) return;
    t.timer = setTimeout(() => {
      t.timer = null;
      if (t.queue.length === 0) return;
      if (t.queue.length >= t.seats) {
        tryMatch(t);
        return;
      }
      if (t.fillAi && t.queue.length >= 1) {
        const batch = t.queue.splice(0, t.queue.length);
        formMatch(t, batch);
        fanQueue(t);
        return;
      }
      // cancel waiters
      const cancelled = t.queue.splice(0, t.queue.length);
      for (const p of cancelled) {
        queuedAt.delete(p.playerId);
        opts.notify?.(p.playerId, {
          type: 'queue_cancelled',
          reason: 'timeout',
          token: t.token,
        });
      }
    }, t.queueTimeoutMs);
  }

  function openTable(config: MatchTableConfig & { token: string }) {
    const token = config.token.trim();
    const existing = tables.get(token);
    const d = tableDefaults(config);
    if (existing) {
      existing.seats = d.seats;
      existing.mode = d.mode;
      existing.fillAi = d.fillAi;
      existing.queueTimeoutMs = d.queueTimeoutMs;
      existing.aiDifficulty = d.aiDifficulty;
      existing.policy = d.policy;
      existing.meta = d.meta;
      return {
        token,
        seats: existing.seats,
        policy: normalizeRoomPolicy(existing.policy),
      };
    }
    ensureTable(token, config);
    const t = tables.get(token)!;
    return {
      token,
      seats: t.seats,
      policy: normalizeRoomPolicy(t.policy),
    };
  }

  function play(input: PlayInput): PlayResult {
    if (!input.playerId) return { status: 'error', error: 'need_player_id' };
    if (queuedAt.has(input.playerId)) {
      return { status: 'error', error: 'already_queued' };
    }

    const seats = (input.seats ?? defaults.seats ?? 4) as 2 | 3 | 4;
    const mode = input.mode ?? defaults.mode ?? 'rush';
    const token = (input.token?.trim() || publicToken(seats, mode));

    let t = tables.get(token);
    if (!t) {
      if (input.token) {
        return { status: 'error', error: 'unknown_token' };
      }
      t = ensureTable(token, { seats, mode });
    } else if (input.seats != null && input.seats !== t.seats) {
      return {
        status: 'error',
        error: `seats_mismatch:table_is_${t.seats}`,
      };
    }

    const wp: WaitingPlayer = {
      playerId: input.playerId,
      name: input.name?.trim() || 'Player',
      ticketId: ticketId(),
    };
    t.queue.push(wp);
    queuedAt.set(input.playerId, token);
    fanQueue(t);

    const matched = tryMatch(t);
    if (matched) {
      // Caller is in this match — find their color
      const room = lobby.getRoom(matched.roomId);
      const seat = room?.players.find((p) => p.playerId === input.playerId);
      if (seat) {
        return {
          ...matched,
          color: seat.color,
          players: room!.players,
        };
      }
      return matched;
    }

    armQueueTimeout(t);
    return {
      status: 'queued',
      ticketId: wp.ticketId,
      token: t.token,
      position: t.queue.findIndex((p) => p.playerId === input.playerId) + 1,
      seats: t.seats,
      playersInQueue: t.queue.length,
    };
  }

  function cancel(playerId: string) {
    const token = queuedAt.get(playerId);
    if (!token) return { ok: false, error: 'not_queued' };
    const t = tables.get(token);
    if (!t) {
      queuedAt.delete(playerId);
      return { ok: false, error: 'not_queued' };
    }
    t.queue = t.queue.filter((p) => p.playerId !== playerId);
    queuedAt.delete(playerId);
    if (t.queue.length === 0) clearTimer(t);
    else {
      fanQueue(t);
      armQueueTimeout(t);
    }
    opts.notify?.(playerId, {
      type: 'queue_cancelled',
      reason: 'cancelled',
      token,
    });
    return { ok: true };
  }

  return {
    openTable,
    play,
    cancel,
    leave: (roomId, playerId) => {
      const r = lobby.leave(roomId, playerId);
      if (r.ok) opts.notify?.(playerId, { type: 'left', roomId });
      return r;
    },
    kick: (roomId, targetPlayerId) => {
      const r = lobby.kick(roomId, targetPlayerId);
      if (r.ok) opts.notify?.(targetPlayerId, { type: 'kicked', roomId });
      return r;
    },
    action: (roomId, playerId, action) =>
      lobby.action(roomId, playerId, action),
    destroy: (roomId, reason) => lobby.destroy(roomId, reason),
    getRoom: (roomId) => lobby.getRoom(roomId),
    listRooms: () => lobby.listRooms(),
    listQueues: () =>
      [...tables.values()].map((t) => ({
        token: t.token,
        seats: t.seats,
        waiting: t.queue.length,
        mode: t.mode,
      })),
    lobby,
  };
}
