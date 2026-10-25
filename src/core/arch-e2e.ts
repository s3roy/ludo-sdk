/**
 * Architecture e2e: host ↔ N clients stay in sync (no DOM).
 * Run: npx tsx src/core/arch-e2e.ts
 */
import { chooseAiMove } from './ai';
import { createGame, type LudoGame } from './game';
import { listLegalMoves } from './moves';
import { createLudoRoomHost } from '../sdk/host';
import { offlineRoom, type LudoHostCommand } from '../sdk/room';
import type { ColorId, GameEvent, GameState } from './types';

let failed = 0;
let passed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    passed += 1;
  }
}

function fingerprint(s: GameState): string {
  return JSON.stringify({
    phase: s.phase,
    current: s.currentColor,
    dice: s.dice,
    turnId: s.turnId,
    winner: s.winner,
    sixes: s.consecutiveSixes,
    players: s.players.map((p) => [p.color, p.presence, p.kind]),
    tokens: s.tokens.map((t) => [t.id, t.state]),
  });
}

/** Mirror mount.dispatch for a headless game client. */
function applyHostCommand(game: LudoGame, cmd: LudoHostCommand): GameEvent | null {
  if (cmd.type === 'sync') {
    if (cmd.event !== undefined) {
      let seen: GameEvent | null = null;
      const unsub = game.subscribe((_s, e) => {
        seen = e;
      });
      game.syncState(cmd.state, cmd.event);
      unsub();
      return seen;
    }
    let seen: GameEvent | null = 'sentinel' as unknown as GameEvent;
    const unsub = game.subscribe((_s, e) => {
      seen = e;
    });
    game.syncState(cmd.state);
    unsub();
    return seen;
  }
  if (cmd.type === 'dice') {
    game.applyDice(cmd.value);
    return game.getState().lastEvent;
  }
  if (cmd.type === 'play') {
    game.move(cmd.tokenId);
    return game.getState().lastEvent;
  }
  if (cmd.type === 'presence') {
    const s = game.getState();
    const players = s.players.map((p) =>
      p.color === cmd.color
        ? {
            ...p,
            presence: cmd.presence,
            ...(cmd.name ? { name: cmd.name } : {}),
            ...(cmd.id ? { id: cmd.id } : {}),
          }
        : p,
    );
    game.syncState({ ...s, players }, { type: 'presence', color: cmd.color, presence: cmd.presence });
    return { type: 'presence', color: cmd.color, presence: cmd.presence };
  }
  if (cmd.type === 'seats') {
    const s = game.getState();
    game.syncState({ ...s, players: cmd.seats });
    return null;
  }
  if (cmd.type === 'destroy') {
    return null;
  }
  return null;
}

function makeClients(n: number, seedState: GameState): LudoGame[] {
  return Array.from({ length: n }, () => {
    const g = createGame({
      mode: seedState.mode,
      players: seedState.players,
    });
    g.syncState(seedState);
    return g;
  });
}

function fanOut(clients: LudoGame[], cmds: LudoHostCommand[]) {
  for (const cmd of cmds) {
    for (const c of clients) applyHostCommand(c, cmd);
  }
}

// ─── syncState silent vs replay ──────────────────────────
{
  const g = createGame({
    mode: 'rush',
    players: [
      { id: 'a', name: 'A', kind: 'human', color: 0, presence: 'ready' },
      { id: 'b', name: 'B', kind: 'human', color: 2, presence: 'ready' },
    ],
    rng: () => 0.99, // rolls 6
  });
  const events: (GameEvent | null)[] = [];
  g.subscribe((_s, e) => events.push(e));
  g.roll();
  const afterRoll = events.filter((e) => e?.type === 'roll').length;
  assert(afterRoll === 1, 'one roll event from applyDice');

  events.length = 0;
  const snap = g.getState();
  g.syncState(snap); // silent
  assert(events.length === 1 && events[0] === null, 'silent sync emits null');
  assert(snap.lastEvent?.type === g.getState().lastEvent?.type, 'silent sync keeps lastEvent');

  events.length = 0;
  g.syncState(snap, snap.lastEvent);
  assert(events.some((e) => e?.type === snap.lastEvent?.type), 'explicit event re-emits');
}

// ─── Host → 2 clients full game stay in sync ─────────────
{
  const room = offlineRoom({ roomId: 'arch-1', mode: 'blitz', players: 2 });
  room.controlled = true;
  room.autoAi = false;
  // Both seats human for deterministic host play
  room.seats = room.seats.map((s) => ({ ...s, kind: 'human' as const, presence: 'ready' as const }));

  let batch: LudoHostCommand[] = [];
  const host = createLudoRoomHost({
    room,
    rng: (() => {
      let s = 7;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
      };
    })(),
    broadcast: (cmd) => {
      batch.push(cmd);
    },
  });

  const clients = makeClients(2, host.getState());

  let steps = 0;
  while (host.getState().phase !== 'finished' && steps++ < 2000) {
    batch = [];
    const st = host.getState();
    const color = st.currentColor;

    if (st.phase === 'waiting_roll') {
      const r = host.handleAction({ type: 'roll', roomId: 'arch-1', color });
      assert(r.ok, `roll ok @${steps}`);
    } else if (st.phase === 'waiting_move') {
      const legal = listLegalMoves(st);
      assert(legal.length > 0, `legal moves @${steps}`);
      const pick = chooseAiMove(legal, st, 'hard', () => 0.1);
      const r = host.handleAction({
        type: 'move',
        roomId: 'arch-1',
        color,
        tokenId: pick.tokenId,
      });
      assert(r.ok, `move ok @${steps}`);
    } else break;

    // After dice|play, sync is silent — except win / void-roll turn pass
    const syncCmds = batch.filter((c) => c.type === 'sync');
    for (const sc of syncCmds) {
      if (sc.type === 'sync') {
        const t = sc.event?.type;
        const ok =
          sc.event === undefined ||
          t === 'win' ||
          t === 'turn' ||
          t === 'no_moves' ||
          t === 'match_over';
        assert(ok, `post action sync silent @${steps}`);
      }
    }

    fanOut(clients, batch);

    const hf = fingerprint(host.getState());
    for (let i = 0; i < clients.length; i++) {
      assert(
        fingerprint(clients[i].getState()) === hf,
        `client ${i} matches host @${steps}`,
      );
    }
  }

  assert(host.getState().phase === 'finished', 'arch game finished');
  assert(host.getState().winner != null, 'arch has winner');
  console.log(`[arch] playthrough steps=${steps} winner=${host.getState().winner}`);
}

// ─── Forfeit advances all clients ────────────────────────
{
  const room = offlineRoom({ roomId: 'arch-f', mode: 'rush', players: 2 });
  room.controlled = true;
  room.seats = room.seats.map((s) => ({
    ...s,
    kind: 'human' as const,
    presence: 'ready' as const,
  }));

  let batch: LudoHostCommand[] = [];
  const host = createLudoRoomHost({
    room,
    broadcast: (cmd) => batch.push(cmd),
  });
  const clients = makeClients(2, host.getState());
  const turnBefore = host.getState().turnId;
  const color = host.whoseTurn()!;

  batch = [];
  const r = host.handleAction({ type: 'forfeit', roomId: 'arch-f', color });
  assert(r.ok, 'forfeit ok');
  assert(host.getState().turnId === turnBefore + 1, 'forfeit advances turnId');
  assert(host.whoseTurn() !== color, 'forfeit changes seat');

  const syncWithEvent = batch.find((c) => c.type === 'sync' && c.event != null);
  assert(!!syncWithEvent, 'forfeit sync carries event');

  fanOut(clients, batch);
  assert(
    fingerprint(clients[0].getState()) === fingerprint(host.getState()),
    'forfeit client0 sync',
  );
  assert(
    fingerprint(clients[1].getState()) === fingerprint(host.getState()),
    'forfeit client1 sync',
  );
}

// ─── No double-apply: dice then silent sync ──────────────
{
  const room = offlineRoom({ roomId: 'arch-d', mode: 'rush', players: 2 });
  room.controlled = true;
  room.seats = room.seats.map((s) => ({
    ...s,
    kind: 'human' as const,
    presence: 'ready' as const,
  }));

  let batch: LudoHostCommand[] = [];
  const host = createLudoRoomHost({
    room,
    rng: () => 0.5, // face 4
    broadcast: (cmd) => batch.push(cmd),
  });
  const client = makeClients(1, host.getState())[0];
  const rollEvents: GameEvent[] = [];
  client.subscribe((_s, e) => {
    if (e?.type === 'roll') rollEvents.push(e);
  });

  host.handleAction({ type: 'roll', roomId: 'arch-d', color: 0 });
  assert(batch.some((c) => c.type === 'dice'), 'broadcast dice');
  // Face 4 with all in yard = void roll → sync carries `turn` (not silent)
  assert(
    batch.some(
      (c) =>
        c.type === 'sync' &&
        (c.event === undefined || c.event?.type === 'turn'),
    ),
    'broadcast sync after dice',
  );

  fanOut([client], batch);
  assert(rollEvents.length === 1, 'client sees exactly one roll event');
  assert(fingerprint(client.getState()) === fingerprint(host.getState()), 'dice path sync');
}

// ─── Leave last human → destroy ──────────────────────────
{
  const room = offlineRoom({ roomId: 'arch-l', mode: 'rush', players: 2 });
  let batch: LudoHostCommand[] = [];
  let destroyedReason: string | null = null;
  const host = createLudoRoomHost({
    room,
    broadcast: (cmd) => batch.push(cmd),
    onDestroyed: (reason) => {
      destroyedReason = reason;
    },
  });
  host.handleAction({ type: 'leave', roomId: 'arch-l', color: 0 });
  assert(host.isDestroyed(), 'destroyed after last human leave');
  assert(destroyedReason === 'abandoned', 'reason abandoned');
  assert(batch.some((c) => c.type === 'destroy'), 'destroy broadcast');
}

// ─── Reject wrong room / wrong turn ──────────────────────
{
  const room = offlineRoom({ roomId: 'arch-r', mode: 'rush', players: 2 });
  room.seats = room.seats.map((s) => ({
    ...s,
    kind: 'human' as const,
    presence: 'ready' as const,
  }));
  const host = createLudoRoomHost({
    room,
    broadcast: () => {},
  });
  assert(
    !host.handleAction({ type: 'roll', roomId: 'nope', color: 0 }).ok,
    'room mismatch',
  );
  assert(
    !host.handleAction({ type: 'roll', roomId: 'arch-r', color: 2 }).ok,
    'not your turn',
  );
  assert(
    !host.handleAction({ type: 'forfeit', roomId: 'arch-r', color: 2 }).ok,
    'forfeit not your turn',
  );
}

// ─── Presence fans out ───────────────────────────────────
{
  const room = offlineRoom({ roomId: 'arch-p', mode: 'rush', players: 2 });
  let batch: LudoHostCommand[] = [];
  const host = createLudoRoomHost({
    room,
    broadcast: (cmd) => batch.push(cmd),
  });
  const clients = makeClients(2, host.getState());
  batch = [];
  host.setPresence(2 as ColorId, 'disconnected');
  fanOut(clients, batch);
  assert(
    clients[0].getState().players.find((p) => p.color === 2)?.presence ===
      'disconnected',
    'presence on client',
  );
  assert(
    fingerprint(clients[0].getState()) === fingerprint(host.getState()),
    'presence fingerprint',
  );
}

console.log(`\n[arch-e2e] passed=${passed} failed=${failed}`);
if (failed) process.exit(1);
console.log('[arch-e2e] OK');
