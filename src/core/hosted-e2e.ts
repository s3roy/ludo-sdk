/**
 * Hosted lobby e2e — seat auth, server dice, spoof rejection.
 * Run: npx tsx src/core/hosted-e2e.ts
 */
import { createLudoLobby } from '../server/lobby';
import type { LudoHostCommand } from '../sdk/room';
import { chooseAiMove } from './ai';
import { listLegalMoves } from './moves';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const cmds: LudoHostCommand[] = [];
const lobby = createLudoLobby({
  broadcast: (_roomId, cmd) => {
    cmds.push(cmd);
  },
  rng: (() => {
    let s = 42;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
  })(),
});

const { roomId } = lobby.createRoom({
  mode: 'blitz',
  maxPlayers: 2,
  fillAi: true,
  aiDifficulty: 'hard',
});

const j1 = lobby.join(roomId, { playerId: 'alice', name: 'Alice' });
assert(j1.ok, 'alice joined');
const j2 = lobby.join(roomId, { playerId: 'bob', name: 'Bob' });
assert(j2.ok, 'bob joined');
assert(j1.color !== j2.color, 'alice and bob get different seats');
// 2p uses a diagonal pair (opposite colours)
assert(
  (j1.color + 2) % 4 === j2.color || (j2.color + 2) % 4 === j1.color,
  '2p seats are diagonal',
);

const full = lobby.join(roomId, { playerId: 'eve', name: 'Eve' });
assert(!full.ok && full.error === 'room_full', 'room full');

const started = lobby.start(roomId);
assert(started.ok && started.status === 'playing', 'started');

// Spoof: bob tries to roll as alice’s colour
const spoof = lobby.action(roomId, 'bob', {
  type: 'roll',
  roomId,
  color: j1.color,
});
assert(!spoof.ok && spoof.error === 'seat_mismatch', 'seat spoof rejected');

// Client destroy forbidden
const badDestroy = lobby.action(roomId, 'alice', {
  type: 'destroy',
  roomId,
  reason: 'client',
});
assert(!badDestroy.ok && badDestroy.error === 'forbidden', 'no client destroy');

// Humans play until finished (AI fill unused for 2-human room)
const room = lobby.getRoom(roomId)!;
assert(room.state, 'has state');
let guard = 0;
while (
  room.state &&
  room.state.phase !== 'finished' &&
  guard++ < 200
) {
  const st = lobby.getRoom(roomId)!.state!;
  if (st.phase === 'finished') break;
  const seat = st.players.find((p) => p.color === st.currentColor);
  if (seat?.kind === 'ai') {
    // server should have driven AI; if stuck, fail
    assert(false, 'AI should not be waiting on client');
  }
  const playerId = seat?.id;
  assert(playerId, 'human seat id');
  if (st.phase === 'waiting_roll') {
    const r = lobby.action(roomId, playerId, {
      type: 'roll',
      roomId,
      color: st.currentColor,
    });
    assert(r.ok, `roll ok ${playerId}`);
  } else if (st.phase === 'waiting_move') {
    const legal = listLegalMoves(st);
    assert(legal.length > 0, 'legal moves');
    const pick = chooseAiMove(legal, st, 'hard', () => 0.2);
    const r = lobby.action(roomId, playerId, {
      type: 'move',
      roomId,
      color: st.currentColor,
      tokenId: pick.tokenId,
    });
    assert(r.ok, `move ok ${playerId}`);
  } else break;
}

const end = lobby.getRoom(roomId);
assert(end?.state?.phase === 'finished', 'game finished on server');
assert(end?.state?.winner != null, 'winner set server-side');
assert(cmds.some((c) => c.type === 'dice'), 'broadcast dice');
assert(cmds.some((c) => c.type === 'sync'), 'broadcast sync');

lobby.destroy(roomId, 'host');
assert(lobby.getRoom(roomId) == null, 'room gone');

console.log('[hosted-e2e] OK — lobby auth + server finish');
