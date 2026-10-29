/**
 * Example host using createLudoMatchmaker (no player host).
 *
 * Client: hello → play → (queue | matched) → action / leave
 * Backend owns: table token, seats, turn clock, max auto-turns, leave policy.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  createLudoMatchmaker,
  type ColorId,
  type LudoClientAction,
  type LudoHostCommand,
  type PlayMatched,
} from '@ludorush/sdk';

const PORT = Number(process.env.PORT ?? 8787);

type ClientMsg =
  | { type: 'hello'; name?: string }
  | {
      type: 'play';
      token?: string;
      seats?: 2 | 3 | 4;
      mode?: 'classic' | 'rush' | 'blitz';
    }
  | { type: 'cancel' }
  | { type: 'leave' }
  | { type: 'action'; action: LudoClientAction }
  | { type: 'list' };

type Seat = {
  ws: WebSocket;
  playerId: string;
  name: string;
  roomId: string | null;
  color: ColorId | null;
};

const seats = new Map<WebSocket, Seat>();
const roomSockets = new Map<string, Set<WebSocket>>();
const byPlayerId = new Map<string, Seat>();

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcastRoom(roomId: string, cmd: LudoHostCommand) {
  const set = roomSockets.get(roomId);
  if (!set) return;
  const msg = JSON.stringify({ type: 'ludo', cmd });
  for (const sock of set) {
    if (sock.readyState === sock.OPEN) sock.send(msg);
  }
}

function attachToRoom(ws: WebSocket, roomId: string) {
  let set = roomSockets.get(roomId);
  if (!set) {
    set = new Set();
    roomSockets.set(roomId, set);
  }
  set.add(ws);
}

function detachFromRoom(ws: WebSocket, roomId: string | null) {
  if (!roomId) return;
  const set = roomSockets.get(roomId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) roomSockets.delete(roomId);
}

function pushMatch(seat: Seat, match: PlayMatched) {
  seat.roomId = match.roomId;
  seat.color = match.color;
  attachToRoom(seat.ws, match.roomId);
  send(seat.ws, {
    type: 'matched',
    roomId: match.roomId,
    color: match.color,
    players: match.players,
    config: match.config,
    policy: match.policy,
  });
}

const mm = createLudoMatchmaker({
  broadcast: (roomId, cmd) => broadcastRoom(roomId, cmd),
  notify: (playerId, msg) => {
    const seat = byPlayerId.get(playerId);
    if (!seat) return;

    if (msg.type === 'queue') {
      send(seat.ws, { type: 'queue', ...msg.update });
      return;
    }
    if (msg.type === 'matched') {
      pushMatch(seat, msg.match);
      return;
    }
    if (msg.type === 'queue_cancelled') {
      send(seat.ws, {
        type: 'queue_cancelled',
        reason: msg.reason,
        token: msg.token,
      });
      return;
    }
    if (msg.type === 'kicked' || msg.type === 'left') {
      detachFromRoom(seat.ws, seat.roomId);
      seat.roomId = null;
      seat.color = null;
      send(seat.ws, { type: msg.type, roomId: msg.roomId });
    }
  },
  defaults: {
    seats: 4,
    mode: 'rush',
    fillAi: true,
    queueTimeoutMs: 20_000,
    aiDifficulty: 'hard',
    policy: {
      turnDurationMs: 15_000,
      onTurnTimeout: 'auto',
      maxAutoTurns: 3,
      onLeave: 'convert_ai',
    },
  },
  onMatched: (roomId, players, token) => {
    console.log(`[matched] room=${roomId} token=${token} n=${players.length}`);
  },
  onTurn: (roomId, color) => {
    console.log(`[turn] room=${roomId} color=${color}`);
  },
  onMissTurn: (roomId, color, streak, action) => {
    console.log(
      `[miss] room=${roomId} color=${color} streak=${streak} action=${action}`,
    );
  },
  onSeatConverted: (roomId, color, reason) => {
    console.log(`[convert] room=${roomId} color=${color} reason=${reason}`);
  },
  onWin: (roomId, winner) => {
    console.log(`[win] room=${roomId} winner=${winner}`);
  },
  onRoomDestroyed: (roomId, reason) => {
    console.log(`[destroy] room=${roomId} reason=${reason}`);
    const set = roomSockets.get(roomId);
    if (set) {
      const payload = JSON.stringify({ type: 'destroyed', reason, roomId });
      for (const sock of set) {
        if (sock.readyState === sock.OPEN) sock.send(payload);
        const s = seats.get(sock);
        if (s) {
          s.roomId = null;
          s.color = null;
        }
      }
    }
    roomSockets.delete(roomId);
  },
});

// Example named table — clients can play with token "demo"
mm.openTable({
  token: 'demo',
  seats: 4,
  mode: 'rush',
  fillAi: true,
  queueTimeoutMs: 25_000,
  policy: {
    turnDurationMs: 12_000,
    onTurnTimeout: 'auto',
    maxAutoTurns: 2,
    onLeave: 'convert_ai',
  },
  meta: { label: 'Demo table' },
});

function json(res: ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(data);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method === 'GET' && url.pathname === '/health') {
    return json(res, 200, { ok: true, service: 'ludo-sdk-hosted-backend' });
  }
  if (req.method === 'GET' && url.pathname === '/rooms') {
    return json(res, 200, {
      rooms: mm.listRooms(),
      queues: mm.listQueues(),
    });
  }
  if (req.method === 'POST' && url.pathname === '/tables') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (!body.token) return json(res, 400, { error: 'need_token' });
    const t = mm.openTable({
      token: String(body.token),
      seats: body.seats ?? 4,
      mode: body.mode ?? 'rush',
      fillAi: body.fillAi !== false,
      queueTimeoutMs: body.queueTimeoutMs,
      policy: body.policy,
      meta: body.meta,
    });
    return json(res, 200, t);
  }
  json(res, 404, { error: 'not_found' });
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  const playerId = `p_${Math.random().toString(36).slice(2, 10)}`;
  const seat: Seat = {
    ws,
    playerId,
    name: 'Player',
    roomId: null,
    color: null,
  };
  seats.set(ws, seat);
  byPlayerId.set(playerId, seat);
  send(ws, { type: 'welcome', playerId });

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw)) as ClientMsg;
    } catch {
      send(ws, { type: 'error', error: 'bad_json' });
      return;
    }
    try {
      handle(seat, msg);
    } catch (err) {
      console.error(err);
      send(ws, {
        type: 'error',
        error: err instanceof Error ? err.message : 'server_error',
      });
    }
  });

  ws.on('close', () => {
    mm.cancel(seat.playerId);
    if (seat.roomId) {
      mm.leave(seat.roomId, seat.playerId);
      detachFromRoom(ws, seat.roomId);
    }
    byPlayerId.delete(seat.playerId);
    seats.delete(ws);
  });
});

function handle(seat: Seat, msg: ClientMsg) {
  if (msg.type === 'hello') {
    if (msg.name?.trim()) seat.name = msg.name.trim().slice(0, 24);
    send(seat.ws, {
      type: 'hello_ok',
      playerId: seat.playerId,
      name: seat.name,
    });
    return;
  }

  if (msg.type === 'list') {
    send(seat.ws, {
      type: 'rooms',
      rooms: mm.listRooms(),
      queues: mm.listQueues(),
    });
    return;
  }

  if (msg.type === 'play') {
    if (seat.roomId) {
      return send(seat.ws, { type: 'error', error: 'already_in_room' });
    }
    const result = mm.play({
      playerId: seat.playerId,
      name: seat.name,
      token: msg.token?.trim() || undefined,
      seats: msg.seats,
      mode: msg.mode,
    });
    if (result.status === 'error') {
      return send(seat.ws, { type: 'error', error: result.error });
    }
    if (result.status === 'queued') {
      return send(seat.ws, { type: 'queue', ...result });
    }
    // matched — notify also fires; ensure seat attached
    pushMatch(seat, result);
    return;
  }

  if (msg.type === 'cancel') {
    const r = mm.cancel(seat.playerId);
    if (!r.ok) send(seat.ws, { type: 'error', error: r.error });
    else send(seat.ws, { type: 'queue_cancelled', reason: 'cancelled' });
    return;
  }

  if (msg.type === 'leave') {
    if (!seat.roomId) {
      mm.cancel(seat.playerId);
      send(seat.ws, { type: 'left' });
      return;
    }
    const roomId = seat.roomId;
    mm.leave(roomId, seat.playerId);
    detachFromRoom(seat.ws, roomId);
    seat.roomId = null;
    seat.color = null;
    send(seat.ws, { type: 'left', roomId });
    return;
  }

  if (msg.type === 'action') {
    if (!seat.roomId) return send(seat.ws, { type: 'error', error: 'not_in_room' });
    const action = { ...msg.action, roomId: seat.roomId };
    const r = mm.action(seat.roomId, seat.playerId, action);
    if (!r.ok) send(seat.ws, { type: 'error', error: r.error ?? 'action_failed' });
    return;
  }

  send(seat.ws, { type: 'error', error: 'unknown_message' });
}

httpServer.listen(PORT, () => {
  console.log(`ludo-sdk examples/hosted backend  ws://localhost:${PORT}`);
  console.log(`health             http://localhost:${PORT}/health`);
  console.log(`tables             POST /tables  { token, seats, policy }`);
  console.log(`open table token   "demo" (4 seats, auto-turn×2)`);
});
