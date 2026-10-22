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

console.log('[host] smoke ok');
