/**
 * Arena mode smoke: scoring + clock end.
 * Run: npx tsx src/core/arena-smoke.ts
 */
import { createGame } from './game';
import { ARENA_POINTS } from './arena';
import type { ColorId, PlayerConfig } from './types';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const players: PlayerConfig[] = [
  { id: 'h', name: 'You', kind: 'human', color: 0 },
  { id: 'a', name: 'Bot', kind: 'ai', color: 2 },
];

let t = 1_000_000;
const g = createGame({
  mode: 'arena',
  players,
  matchDurationMs: 60_000,
  now: () => t,
  rng: () => 0.99, // always 6
});

assert(g.getState().matchEndsAt === t + 60_000, 'matchEndsAt set');
assert(g.getState().scores[0] === 0 && g.getState().scores[2] === 0, 'scores 0');

// Open with 6
assert(g.roll() === 6, 'roll 6');
const open = g.legalMoves().find((m) => m.entersBoard);
assert(open, 'open move');
g.play(open!);
assert(
  g.getState().scores[0] === ARENA_POINTS.move + ARENA_POINTS.open,
  `open score got ${g.getState().scores[0]}`,
);

// Clock expires → highest score wins
t = 1_000_000 + 60_001;
assert(g.checkMatchClock(), 'clock ends match');
const end = g.getState();
assert(end.phase === 'finished', 'finished');
assert(end.winner === 0, 'human wins on points');
assert(end.ranking[0] === 0, 'ranking');

console.log('[arena] OK — scores + clock end');
