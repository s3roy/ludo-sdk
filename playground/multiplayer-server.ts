/**
 * Minimal WebSocket lobby for multi-user testing.
 * Run: npm run multiplayer:server
 */
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
// Import lobby + types only (not src/index — that pulls CSS and breaks Node).
import { createLudoLobby } from '../src/server/lobby.ts';
import {
  policyFromAutoPlayPreset,
  type RoomLifecyclePolicy,
} from '../src/server/policy.ts';
import type { PlayerConfig } from '../src/core/types.ts';
import type { LudoClientAction, LudoHostCommand } from '../src/sdk/room.ts';

const PORT = Number(process.env.LUDO_MP_PORT ?? 8787);

type ClientMsg =
  | { type: 'hello'; playerId?: string; name?: string }
  | {
      type: 'create';
      name?: string;
      mode?: 'classic' | 'rush' | 'blitz' | 'arena';
      maxPlayers?: 2 | 3 | 4;
      fillAi?: boolean;
      autoPlay?: string;
      onLeave?: 'hold' | 'convert_ai';
    }
  | { type: 'join'; roomId: string; name?: string }
  | { type: 'ready'; ready?: boolean }
  | { type: 'start' }
  | { type: 'action'; action: LudoClientAction }
  | { type: 'leave' };

type LobbyPlayerSnap = {
  playerId: string;
  name: string;
  color: number;
  ready: boolean;
};

type ServerMsg =
  | { type: 'welcome'; playerId: string; name: string }
  | {
      type: 'room';
      roomId: string;
      color: number;
      status: string;
      players: LobbyPlayerSnap[];
      seats: PlayerConfig[];
    }
  | { type: 'ludo'; cmd: LudoHostCommand }
  | { type: 'error'; error: string }
  | { type: 'ok' };

type Conn = {
  ws: WebSocket;
  playerId: string;
  name: string;
  roomId: string | null;
  color: number | null;
};

function randomPlayerId(): string {
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

const roomSockets = new Map<string, Set<Conn>>();

function bindConn(roomId: string, conn: Conn) {
  let set = roomSockets.get(roomId);
  if (!set) {
    set = new Set();
    roomSockets.set(roomId, set);
  }
  set.add(conn);
}

function unbindConn(conn: Conn) {
  if (!conn.roomId) return;
  const set = roomSockets.get(conn.roomId);
  if (!set) return;
  set.delete(conn);
  if (set.size === 0) roomSockets.delete(conn.roomId);
}

const lobby = createLudoLobby({
  broadcast: (roomId, cmd) => {
    const set = roomSockets.get(roomId);
    if (!set) return;
    const payload = JSON.stringify({ type: 'ludo', cmd } satisfies ServerMsg);
    for (const c of set) {
      if (c.ws.readyState === c.ws.OPEN) c.ws.send(payload);
    }
  },
});

function emitRoom(
  roomId: string,
  snap: {
    roomId: string;
    status: string;
    players: LobbyPlayerSnap[];
    config: { seats: PlayerConfig[] };
  },
) {
  const set = roomSockets.get(roomId);
  if (!set) return;
  for (const c of set) {
    const me = snap.players.find((p) => p.playerId === c.playerId);
    if (me) c.color = me.color;
    send(c.ws, {
      type: 'room',
      roomId: snap.roomId,
      color: me?.color ?? c.color ?? 0,
      status: snap.status,
      players: snap.players,
      seats: snap.config.seats,
    });
  }
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('ludo-sdk multiplayer lobby — connect via WebSocket\n');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  const conn: Conn = {
    ws,
    playerId: randomPlayerId(),
    name: 'Player',
    roomId: null,
    color: null,
  };
  send(ws, {
    type: 'welcome',
    playerId: conn.playerId,
    name: conn.name,
  });

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw)) as ClientMsg;
    } catch {
      send(ws, { type: 'error', error: 'bad_json' });
      return;
    }

    if (msg.type === 'hello') {
      if (msg.playerId?.trim()) conn.playerId = msg.playerId.trim();
      if (msg.name?.trim()) conn.name = msg.name.trim();
      send(ws, {
        type: 'welcome',
        playerId: conn.playerId,
        name: conn.name,
      });
      return;
    }

    if (msg.type === 'create') {
      if (msg.name?.trim()) conn.name = msg.name.trim();
      const auto = policyFromAutoPlayPreset(msg.autoPlay ?? '3');
      const onLeave: RoomLifecyclePolicy['onLeave'] =
        msg.onLeave === 'convert_ai' ? 'convert_ai' : 'hold';
      const { roomId } = lobby.createRoom({
        mode: msg.mode ?? 'rush',
        maxPlayers: msg.maxPlayers ?? 2,
        fillAi: msg.fillAi ?? false,
        aiDifficulty: 'extreme',
        matchDurationMs: msg.mode === 'arena' ? 180_000 : undefined,
        policy: {
          turnDurationMs: 15_000,
          ...auto,
          onLeave,
        },
      });
      const joined = lobby.join(roomId, {
        playerId: conn.playerId,
        name: conn.name,
      });
      if (!joined.ok) {
        send(ws, { type: 'error', error: joined.error });
        return;
      }
      lobby.ready(roomId, conn.playerId, true);
      unbindConn(conn);
      conn.roomId = roomId;
      conn.color = joined.color;
      bindConn(roomId, conn);
      const snap = lobby.getRoom(roomId);
      if (snap) {
        emitRoom(roomId, {
          roomId: snap.roomId,
          status: snap.status,
          players: snap.players,
          config: snap.config,
        });
      }
      return;
    }

    if (msg.type === 'join') {
      if (msg.name?.trim()) conn.name = msg.name.trim();
      const roomId = msg.roomId.trim().toUpperCase();
      const joined = lobby.join(roomId, {
        playerId: conn.playerId,
        name: conn.name,
      });
      if (!joined.ok) {
        send(ws, { type: 'error', error: joined.error });
        return;
      }
      lobby.ready(roomId, conn.playerId, true);
      unbindConn(conn);
      conn.roomId = roomId;
      conn.color = joined.color;
      bindConn(roomId, conn);
      emitRoom(roomId, {
        roomId: joined.roomId,
        status: joined.status,
        players: joined.players,
        config: joined.config,
      });
      return;
    }

    if (msg.type === 'ready') {
      if (!conn.roomId) {
        send(ws, { type: 'error', error: 'not_in_room' });
        return;
      }
      const snap = lobby.ready(conn.roomId, conn.playerId, msg.ready !== false);
      if (!snap.ok) {
        send(ws, { type: 'error', error: snap.error });
        return;
      }
      emitRoom(conn.roomId, {
        roomId: snap.roomId,
        status: snap.status,
        players: snap.players,
        config: snap.config,
      });
      return;
    }

    if (msg.type === 'start') {
      if (!conn.roomId) {
        send(ws, { type: 'error', error: 'not_in_room' });
        return;
      }
      const snap = lobby.start(conn.roomId);
      if (!snap.ok) {
        send(ws, { type: 'error', error: snap.error });
        return;
      }
      emitRoom(conn.roomId, {
        roomId: snap.roomId,
        status: snap.status,
        players: snap.players,
        config: snap.config,
      });
      return;
    }

    if (msg.type === 'action') {
      if (!conn.roomId) {
        send(ws, { type: 'error', error: 'not_in_room' });
        return;
      }
      const result = lobby.action(conn.roomId, conn.playerId, msg.action);
      if (!result.ok) {
        send(ws, { type: 'error', error: result.error ?? 'action_failed' });
        return;
      }
      send(ws, { type: 'ok' });
      return;
    }

    if (msg.type === 'leave') {
      if (conn.roomId) {
        const rid = conn.roomId;
        lobby.leave(rid, conn.playerId);
        unbindConn(conn);
        conn.roomId = null;
        conn.color = null;
        const left = lobby.getRoom(rid);
        if (left) {
          emitRoom(rid, {
            roomId: left.roomId,
            status: left.status,
            players: left.players,
            config: left.config,
          });
        }
      }
      send(ws, { type: 'ok' });
      return;
    }

    send(ws, { type: 'error', error: 'unknown_type' });
  });

  ws.on('close', () => {
    if (conn.roomId) {
      const rid = conn.roomId;
      lobby.leave(rid, conn.playerId);
      unbindConn(conn);
      const left = lobby.getRoom(rid);
      if (left) {
        emitRoom(rid, {
          roomId: left.roomId,
          status: left.status,
          players: left.players,
          config: left.config,
        });
      }
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[ludo-mp] WebSocket lobby on ws://0.0.0.0:${PORT}`);
  console.log(
    `[ludo-mp] Open http://localhost:5195/multi.html — create room, share code, join in 2nd browser`,
  );
});
