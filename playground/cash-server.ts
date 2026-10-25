/**
 * Self-host cash table: login + wallet + stake escrow + authoritative lobby.
 *
 * Run: npm run cash:server
 * UI:  http://localhost:5195/cash.html
 *
 * Demo money only — not production payments.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { createLudoLobby } from '../src/server/lobby.ts';
import type { ColorId, PlayerConfig } from '../src/core/types.ts';
import type { LudoClientAction, LudoHostCommand } from '../src/sdk/room.ts';

const PORT = Number(process.env.LUDO_CASH_PORT ?? 8790);
const START_BALANCE = 1000;
const RAKE_BPS = 50; // 0.5%
const DATA_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../.data',
);
const STORE_PATH = resolve(DATA_DIR, 'cash-wallet.json');

type User = {
  id: string;
  username: string;
  passHash: string; // salt:hex
  balance: number;
};

type Session = { token: string; userId: string; expires: number };

type Table = {
  id: string;
  stake: number;
  mode: 'classic' | 'rush' | 'blitz' | 'arena';
  maxPlayers: 2 | 3 | 4;
  fillAi: boolean;
  status: 'open' | 'locked' | 'playing' | 'settled' | 'cancelled';
  escrow: Map<string, number>; // userId → amount locked
  roomId: string | null;
  winnerUserId: string | null;
};

type Store = { users: User[]; sessions: Session[] };

type ClientMsg =
  | { type: 'auth'; token: string }
  | {
      type: 'create';
      stake: number;
      mode?: 'classic' | 'rush' | 'blitz' | 'arena';
      maxPlayers?: 2 | 3 | 4;
      fillAi?: boolean;
    }
  | { type: 'join'; tableId: string }
  | { type: 'start' }
  | { type: 'action'; action: LudoClientAction }
  | { type: 'leave' }
  | { type: 'cancel' };

type LobbyPlayerSnap = {
  playerId: string;
  name: string;
  color: number;
  ready: boolean;
};

type ServerMsg =
  | {
      type: 'hello';
      ok: true;
      user: { id: string; username: string; balance: number };
    }
  | { type: 'error'; error: string }
  | {
      type: 'table';
      tableId: string;
      roomId: string | null;
      stake: number;
      pot: number;
      status: string;
      fillAi: boolean;
      color: number | null;
      balance: number;
      players: LobbyPlayerSnap[];
      seats: PlayerConfig[];
    }
  | {
      type: 'settled';
      tableId: string;
      winnerUserId: string | null;
      payout: number;
      balance: number;
      ranking: number[];
    }
  | { type: 'ludo'; cmd: LudoHostCommand }
  | { type: 'ok' };

type Conn = {
  ws: WebSocket;
  userId: string | null;
  tableId: string | null;
  color: ColorId | null;
};

function loadStore(): Store {
  if (!existsSync(STORE_PATH)) return { users: [], sessions: [] };
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as Store;
  } catch {
    return { users: [], sessions: [] };
  }
}

function saveStore(store: Store) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

let store = loadStore();
const tables = new Map<string, Table>();
const tableSockets = new Map<string, Set<Conn>>();

function hashPassword(password: string, salt?: Buffer): string {
  const s = salt ?? randomBytes(16);
  const hash = scryptSync(password, s, 32);
  return `${s.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password: string, packed: string): boolean {
  const [saltHex, hashHex] = packed.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, salt, 32);
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}

function randomId(prefix: string): string {
  return `${prefix}_${randomBytes(4).toString('hex')}`;
}

function findUser(id: string): User | undefined {
  return store.users.find((u) => u.id === id);
}

function findUserByName(username: string): User | undefined {
  return store.users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase(),
  );
}

function cleanSessions() {
  const now = Date.now();
  store.sessions = store.sessions.filter((s) => s.expires > now);
}

function issueSession(userId: string): string {
  cleanSessions();
  const token = randomBytes(24).toString('hex');
  store.sessions.push({
    token,
    userId,
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  saveStore(store);
  return token;
}

function userFromToken(token: string | null | undefined): User | null {
  if (!token) return null;
  cleanSessions();
  const sess = store.sessions.find((s) => s.token === token);
  if (!sess) return null;
  return findUser(sess.userId) ?? null;
}

function publicUser(u: User) {
  return { id: u.id, username: u.username, balance: u.balance };
}

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function bindTable(tableId: string, conn: Conn) {
  let set = tableSockets.get(tableId);
  if (!set) {
    set = new Set();
    tableSockets.set(tableId, set);
  }
  set.add(conn);
}

function unbindTable(conn: Conn) {
  if (!conn.tableId) return;
  const set = tableSockets.get(conn.tableId);
  if (!set) return;
  set.delete(conn);
  if (set.size === 0) tableSockets.delete(conn.tableId);
}

function potOf(t: Table): number {
  let n = 0;
  for (const v of t.escrow.values()) n += v;
  return n;
}

function emitTable(tableId: string) {
  const t = tables.get(tableId);
  if (!t) return;
  const set = tableSockets.get(tableId);
  if (!set) return;
  const room = t.roomId ? lobby.getRoom(t.roomId) : null;
  for (const c of set) {
    const u = c.userId ? findUser(c.userId) : null;
    const me = room?.players.find((p) => p.playerId === c.userId);
    if (me) c.color = me.color;
    send(c.ws, {
      type: 'table',
      tableId: t.id,
      roomId: t.roomId,
      stake: t.stake,
      pot: potOf(t),
      status: t.status,
      fillAi: t.fillAi,
      mode: t.mode,
      color: me?.color ?? c.color,
      balance: u?.balance ?? 0,
      players: room?.players ?? [],
      seats: room?.config.seats ?? [],
    });
    // Re-push board state — mount often happens after the start sync was already sent
    if (t.status === 'playing' && room?.state) {
      send(c.ws, {
        type: 'ludo',
        cmd: { type: 'sync', state: room.state },
      });
    }
  }
}

function debitEscrow(user: User, table: Table, amount: number): string | null {
  if (amount <= 0) return 'bad_stake';
  if (user.balance < amount) return 'insufficient_balance';
  if (table.escrow.has(user.id)) return 'already_in';
  user.balance -= amount;
  table.escrow.set(user.id, amount);
  saveStore(store);
  return null;
}

function refundAll(table: Table) {
  for (const [uid, amt] of table.escrow) {
    const u = findUser(uid);
    if (u) u.balance += amt;
  }
  table.escrow.clear();
  saveStore(store);
}

function settleTable(
  table: Table,
  winnerColor: ColorId | null,
  ranking: ColorId[],
) {
  if (table.status === 'settled' || table.status === 'cancelled') return;
  const room = table.roomId ? lobby.getRoom(table.roomId) : null;
  let winnerUserId: string | null = null;
  if (winnerColor != null && room) {
    const seat = room.players.find((p) => p.color === winnerColor);
    // Humans only in room.players — AI win means no matching seat → house keeps pot
    if (seat) winnerUserId = seat.playerId;
  }

  const pot = potOf(table);
  let payout = 0;
  if (winnerUserId) {
    const rake = Math.floor((pot * RAKE_BPS) / 10_000);
    payout = pot - rake;
    const w = findUser(winnerUserId);
    if (w) w.balance += payout;
  }
  // Clear escrow either way (AI/house win = player stake forfeited)
  table.escrow.clear();
  table.status = 'settled';
  table.winnerUserId = winnerUserId;
  saveStore(store);

  const set = tableSockets.get(table.id);
  if (set) {
    for (const c of set) {
      const u = c.userId ? findUser(c.userId) : null;
      send(c.ws, {
        type: 'settled',
        tableId: table.id,
        winnerUserId,
        payout: winnerUserId && c.userId === winnerUserId ? payout : 0,
        balance: u?.balance ?? 0,
        ranking,
      });
    }
  }
  emitTable(table.id);
}

const lobby = createLudoLobby({
  broadcast: (roomId, cmd) => {
    for (const [tid, t] of tables) {
      if (t.roomId !== roomId) continue;
      const set = tableSockets.get(tid);
      if (!set) return;
      const payload = JSON.stringify({ type: 'ludo', cmd } satisfies ServerMsg);
      for (const c of set) {
        if (c.ws.readyState === c.ws.OPEN) c.ws.send(payload);
      }
      return;
    }
  },
  onWin: (roomId, winner, ranking) => {
    for (const t of tables.values()) {
      if (t.roomId === roomId) {
        settleTable(t, winner, ranking);
        break;
      }
    }
  },
  onRoomDestroyed: (roomId) => {
    for (const t of tables.values()) {
      if (t.roomId === roomId && t.status === 'playing') {
        refundAll(t);
        t.status = 'cancelled';
        saveStore(store);
        emitTable(t.id);
      }
    }
  },
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(
  res: ServerResponse,
  status: number,
  body: unknown,
) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function handleHttp(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { ok: true, service: 'ludo-cash' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/register') {
    const raw = await readBody(req);
    let body: { username?: string; password?: string };
    try {
      body = JSON.parse(raw);
    } catch {
      json(res, 400, { ok: false, error: 'bad_json' });
      return;
    }
    const username = body.username?.trim() ?? '';
    const password = body.password ?? '';
    if (username.length < 3 || username.length > 24) {
      json(res, 400, { ok: false, error: 'bad_username' });
      return;
    }
    if (password.length < 4) {
      json(res, 400, { ok: false, error: 'bad_password' });
      return;
    }
    if (findUserByName(username)) {
      json(res, 409, { ok: false, error: 'username_taken' });
      return;
    }
    const user: User = {
      id: randomId('u'),
      username,
      passHash: hashPassword(password),
      balance: START_BALANCE,
    };
    store.users.push(user);
    const token = issueSession(user.id);
    json(res, 200, { ok: true, token, user: publicUser(user) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    const raw = await readBody(req);
    let body: { username?: string; password?: string };
    try {
      body = JSON.parse(raw);
    } catch {
      json(res, 400, { ok: false, error: 'bad_json' });
      return;
    }
    const user = findUserByName(body.username?.trim() ?? '');
    if (!user || !verifyPassword(body.password ?? '', user.passHash)) {
      json(res, 401, { ok: false, error: 'invalid_credentials' });
      return;
    }
    const token = issueSession(user.id);
    json(res, 200, { ok: true, token, user: publicUser(user) });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/me') {
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    const user = userFromToken(auth || url.searchParams.get('token'));
    if (!user) {
      json(res, 401, { ok: false, error: 'unauthorized' });
      return;
    }
    json(res, 200, { ok: true, user: publicUser(user) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/topup') {
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '';
    const user = userFromToken(auth);
    if (!user) {
      json(res, 401, { ok: false, error: 'unauthorized' });
      return;
    }
    const raw = await readBody(req);
    let amount = 500;
    try {
      const body = JSON.parse(raw) as { amount?: number };
      if (typeof body.amount === 'number') amount = Math.floor(body.amount);
    } catch {
      /* default */
    }
    amount = Math.min(5000, Math.max(100, amount));
    user.balance += amount;
    saveStore(store);
    json(res, 200, { ok: true, user: publicUser(user), credited: amount });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(
      'ludo-sdk cash host — HTTP /api/* + WebSocket. Open http://localhost:5195/cash.html\n',
    );
    return;
  }

  json(res, 404, { ok: false, error: 'not_found' });
}

const httpServer = createServer((req, res) => {
  void handleHttp(req, res).catch((err) => {
    console.error(err);
    json(res, 500, { ok: false, error: 'server_error' });
  });
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  const conn: Conn = { ws, userId: null, tableId: null, color: null };

  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw)) as ClientMsg;
    } catch {
      send(ws, { type: 'error', error: 'bad_json' });
      return;
    }

    if (msg.type === 'auth') {
      const user = userFromToken(msg.token);
      if (!user) {
        send(ws, { type: 'error', error: 'unauthorized' });
        return;
      }
      conn.userId = user.id;
      send(ws, { type: 'hello', ok: true, user: publicUser(user) });
      return;
    }

    if (!conn.userId) {
      send(ws, { type: 'error', error: 'auth_required' });
      return;
    }
    const user = findUser(conn.userId);
    if (!user) {
      send(ws, { type: 'error', error: 'user_missing' });
      return;
    }

    if (msg.type === 'create') {
      const stake = Math.floor(Number(msg.stake));
      if (!Number.isFinite(stake) || stake < 10 || stake > 10_000) {
        send(ws, { type: 'error', error: 'bad_stake' });
        return;
      }
      const seatsRaw = Number(msg.maxPlayers ?? 2);
      const maxPlayers = (seatsRaw === 3 || seatsRaw === 4 ? seatsRaw : 2) as
        | 2
        | 3
        | 4;
      const table: Table = {
        id: randomId('t').toUpperCase().replace('T_', 'T'),
        stake,
        mode: msg.mode ?? 'rush',
        maxPlayers,
        fillAi: msg.fillAi !== false,
        status: 'open',
        escrow: new Map(),
        roomId: null,
        winnerUserId: null,
      };
      const err = debitEscrow(user, table, stake);
      if (err) {
        send(ws, { type: 'error', error: err });
        return;
      }
      const { roomId } = lobby.createRoom({
        mode: table.mode,
        maxPlayers: table.maxPlayers,
        fillAi: table.fillAi,
        aiDifficulty: 'extreme',
        matchDurationMs: table.mode === 'arena' ? 180_000 : undefined,
        meta: { stake, tableId: table.id },
        // Humans keep the seat — server AI only fills empty chairs
        policy: {
          turnDurationMs: 60_000,
          onTurnTimeout: 'auto',
          maxAutoTurns: 0,
          onLeave: 'convert_ai',
        },
      });
      table.roomId = roomId;
      const joined = lobby.join(roomId, {
        playerId: user.id,
        name: user.username,
      });
      if (!joined.ok) {
        refundAll(table);
        send(ws, { type: 'error', error: joined.error });
        return;
      }
      lobby.ready(roomId, user.id, true);
      tables.set(table.id, table);
      unbindTable(conn);
      conn.tableId = table.id;
      conn.color = joined.color;
      bindTable(table.id, conn);
      // Solo vs AI (2–4 seats): fill empty chairs + auto-start
      if (table.fillAi) {
        table.status = 'locked';
        const started = lobby.start(roomId);
        if (started.ok) table.status = 'playing';
      }
      emitTable(table.id);
      return;
    }

    if (msg.type === 'join') {
      const tableId = msg.tableId.trim().toUpperCase();
      const table = tables.get(tableId);
      if (!table || !table.roomId) {
        send(ws, { type: 'error', error: 'table_not_found' });
        return;
      }
      if (table.status !== 'open') {
        send(ws, { type: 'error', error: 'table_not_open' });
        return;
      }
      const err = debitEscrow(user, table, table.stake);
      if (err) {
        send(ws, { type: 'error', error: err });
        return;
      }
      const joined = lobby.join(table.roomId, {
        playerId: user.id,
        name: user.username,
      });
      if (!joined.ok) {
        const amt = table.escrow.get(user.id) ?? 0;
        table.escrow.delete(user.id);
        user.balance += amt;
        saveStore(store);
        send(ws, { type: 'error', error: joined.error });
        return;
      }
      lobby.ready(table.roomId, user.id, true);
      unbindTable(conn);
      conn.tableId = table.id;
      conn.color = joined.color;
      bindTable(table.id, conn);
      const humans = [...table.escrow.keys()].length;
      if (humans >= table.maxPlayers) {
        table.status = 'locked';
        const started = lobby.start(table.roomId);
        if (started.ok) table.status = 'playing';
      }
      emitTable(table.id);
      return;
    }

    if (msg.type === 'start') {
      if (!conn.tableId) {
        send(ws, { type: 'error', error: 'not_at_table' });
        return;
      }
      const table = tables.get(conn.tableId);
      if (!table?.roomId) {
        send(ws, { type: 'error', error: 'table_not_found' });
        return;
      }
      if (table.status === 'playing') {
        emitTable(table.id);
        return;
      }
      const started = lobby.start(table.roomId);
      if (!started.ok) {
        send(ws, { type: 'error', error: started.error });
        return;
      }
      table.status = 'playing';
      emitTable(table.id);
      return;
    }

    if (msg.type === 'action') {
      if (!conn.tableId) {
        send(ws, { type: 'error', error: 'not_at_table' });
        return;
      }
      const table = tables.get(conn.tableId);
      if (!table?.roomId) {
        send(ws, { type: 'error', error: 'table_not_found' });
        return;
      }
      const result = lobby.action(table.roomId, user.id, msg.action);
      if (!result.ok) {
        send(ws, { type: 'error', error: result.error ?? 'action_failed' });
        return;
      }
      send(ws, { type: 'ok' });
      return;
    }

    if (msg.type === 'cancel') {
      if (!conn.tableId) {
        send(ws, { type: 'error', error: 'not_at_table' });
        return;
      }
      const table = tables.get(conn.tableId);
      if (!table) {
        send(ws, { type: 'error', error: 'table_not_found' });
        return;
      }
      if (table.status === 'playing' || table.status === 'settled') {
        send(ws, { type: 'error', error: 'cannot_cancel' });
        return;
      }
      refundAll(table);
      table.status = 'cancelled';
      if (table.roomId) lobby.destroy(table.roomId);
      emitTable(table.id);
      unbindTable(conn);
      conn.tableId = null;
      conn.color = null;
      send(ws, { type: 'ok' });
      return;
    }

    if (msg.type === 'leave') {
      if (conn.tableId) {
        const table = tables.get(conn.tableId);
        if (table?.roomId && table.status === 'playing') {
          lobby.leave(table.roomId, user.id);
        } else if (table && table.status === 'open') {
          const amt = table.escrow.get(user.id) ?? 0;
          if (amt) {
            table.escrow.delete(user.id);
            user.balance += amt;
            saveStore(store);
          }
          if (table.escrow.size === 0) table.status = 'cancelled';
        }
        unbindTable(conn);
        conn.tableId = null;
        conn.color = null;
        if (table) emitTable(table.id);
      }
      send(ws, { type: 'ok' });
      return;
    }

    send(ws, { type: 'error', error: 'unknown_type' });
  });

  ws.on('close', () => {
    if (conn.tableId && conn.userId) {
      const table = tables.get(conn.tableId);
      if (table?.roomId && table.status === 'playing') {
        lobby.leave(table.roomId, conn.userId);
      }
      unbindTable(conn);
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[ludo-cash] HTTP+WS on http://0.0.0.0:${PORT}  (WS path /ws)`);
  console.log(`[ludo-cash] UI → http://localhost:5195/cash.html (Vite proxies /api + /ws)`);
  console.log(`[ludo-cash] Wallet file → ${STORE_PATH}`);
});
