import { createLudoRoomHost } from '../sdk/host';
import { offlineRoom } from '../sdk/room';
import type { LudoHostCommand } from '../sdk/room';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const cmds: LudoHostCommand[] = [];
const room = offlineRoom({ roomId: 'h1', mode: 'rush', players: 2 });
room.controlled = true;
room.autoAi = false;

const host = createLudoRoomHost({
  room,
  broadcast: (cmd) => {
    cmds.push(cmd);
  },
});

assert(host.whoseTurn() === 0, 'starts on red');
const roll = host.handleAction({ type: 'roll', roomId: 'h1', color: 0 });
assert(roll.ok, 'roll ok');
assert(cmds.some((c) => c.type === 'dice'), 'broadcast dice');

host.setPresence(0, 'disconnected');
assert(
  host.getState().players.find((p) => p.color === 0)?.presence === 'disconnected',
  'presence set',
);

host.destroy('host');
assert(host.isDestroyed(), 'destroyed');
assert(cmds.some((c) => c.type === 'destroy'), 'broadcast destroy');

const after = host.handleAction({ type: 'roll', roomId: 'h1', color: 0 });
assert(!after.ok && after.error === 'room_destroyed', 'reject after destroy');

// leave → abandoned when last human gone
const cmds2: LudoHostCommand[] = [];
const room2 = offlineRoom({ roomId: 'h2', mode: 'blitz', players: 2 });
room2.seats = room2.seats.map((s) =>
  s.kind === 'human' ? { ...s, presence: 'ready' as const } : s,
);
const host2 = createLudoRoomHost({
  room: room2,
  broadcast: (c) => cmds2.push(c),
});
host2.handleAction({ type: 'leave', roomId: 'h2', color: 0 });
assert(host2.isDestroyed(), 'abandoned after last human leave');
assert(cmds2.some((c) => c.type === 'destroy'), 'destroy on abandon');

// forfeit advances turn + sync with event
const cmds3: LudoHostCommand[] = [];
const room3 = offlineRoom({ roomId: 'h3', mode: 'rush', players: 2 });
room3.seats = room3.seats.map((s) => ({
  ...s,
  kind: 'human' as const,
  presence: 'ready' as const,
}));
const host3 = createLudoRoomHost({
  room: room3,
  broadcast: (c) => cmds3.push(c),
});
const before = host3.getState().turnId;
const f = host3.handleAction({ type: 'forfeit', roomId: 'h3', color: 0 });
assert(f.ok, 'forfeit ok');
assert(host3.getState().turnId === before + 1, 'forfeit advances');
assert(
  cmds3.some((c) => c.type === 'sync' && c.event != null),
  'forfeit sync has event',
);

console.log('[host] smoke ok');
