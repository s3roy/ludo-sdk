/**
 * Extreme vs hard head-to-head smoke.
 * Run: npx tsx src/core/extreme-smoke.ts
 */
import { chooseAiMove, type AiDifficulty } from './ai';
import { COLOR_NAMES } from './constants';
import { createGame } from './game';
import { listLegalMoves } from './moves';
import type { ColorId, PlayerConfig } from './types';

function rngFrom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function play(a: AiDifficulty, b: AiDifficulty, seed: number): ColorId | null {
  const rng = rngFrom(seed);
  const players: PlayerConfig[] = [
    { id: 'a', name: 'A', kind: 'ai', color: 0, presence: 'ready' },
    { id: 'b', name: 'B', kind: 'ai', color: 2, presence: 'ready' },
  ];
  const diff = new Map<ColorId, AiDifficulty>([
    [0, a],
    [2, b],
  ]);
  const game = createGame({ mode: 'rush', players, rng });
  let steps = 0;
  while (game.getState().phase !== 'finished' && steps++ < 4000) {
    const st = game.getState();
    if (st.phase === 'waiting_roll') {
      game.roll();
      continue;
    }
    if (st.phase === 'waiting_move') {
      const legal = listLegalMoves(st);
      if (!legal.length) break;
      const d = diff.get(st.currentColor) ?? 'hard';
      game.play(chooseAiMove(legal, st, d, rng));
    } else break;
  }
  return game.getState().winner;
}

let extremeWins = 0;
let hardWins = 0;
const N = 36;
// Tactical correctness first (finish > capture > never skip eat)
{
  const players: PlayerConfig[] = [0, 1, 2, 3].map((c) => ({
    id: `p${c}`,
    name: COLOR_NAMES[c as ColorId],
    kind: 'ai' as const,
    color: c as ColorId,
  }));
  const g = createGame({ mode: 'rush', players });
  const state = (g as unknown as { state: import('./types').GameState }).state;
  for (const t of state.tokens) t.state = { kind: 'yard' };
  state.tokens.find((t) => t.id === 'red-0')!.state = {
    kind: 'homeColumn',
    index: 4,
  };
  state.tokens.find((t) => t.id === 'red-1')!.state = {
    kind: 'track',
    index: 10,
  };
  state.tokens.find((t) => t.id === 'green-0')!.state = {
    kind: 'track',
    index: 11,
  };
  state.currentColor = 0;
  state.phase = 'waiting_move';
  state.dice = 1;
  const pick = chooseAiMove(listLegalMoves(state), state, 'extreme', () => 0);
  if (!pick.finishes) {
    console.error('FAIL: extreme should finish over capture', pick);
    process.exit(1);
  }
  console.log('[extreme] finish-over-capture OK');
}

{
  const players = ([0, 1, 2, 3] as const).map((c) => ({
    id: `p${c}`,
    name: 'Bot',
    kind: 'ai' as const,
    color: c as ColorId,
  }));
  const g = createGame({ mode: 'rush', players });
  const state = (g as unknown as { state: import('./types').GameState }).state;
  for (const t of state.tokens) t.state = { kind: 'yard' };
  state.tokens.find((t) => t.id === 'yellow-0')!.state = {
    kind: 'track',
    index: 20,
  };
  state.tokens.find((t) => t.id === 'red-0')!.state = {
    kind: 'track',
    index: 23,
  };
  state.tokens.find((t) => t.id === 'yellow-1')!.state = {
    kind: 'track',
    index: 40,
  };
  state.currentColor = 2; // yellow
  state.phase = 'waiting_move';
  state.dice = 3; // yellow-0 lands on red-0
  const legal = listLegalMoves(state);
  const pick = chooseAiMove(legal, state, 'extreme', () => 0.99);
  if (!pick.captures) {
    console.error('FAIL: extreme must capture when eat is legal', pick, legal);
    process.exit(1);
  }
  // hard / normal must also eat
  for (const d of ['hard', 'normal'] as const) {
    const p = chooseAiMove(legal, state, d, () => 0.99);
    if (!p.captures) {
      console.error(`FAIL: ${d} must capture when eat is legal`, p);
      process.exit(1);
    }
  }
  console.log('[extreme] capture-over-advance OK');
}

const t0 = Date.now();
for (let i = 0; i < N; i++) {
  // Alternate seats so color bias cancels
  const swap = i % 2 === 1;
  const w = swap
    ? play('hard', 'extreme', 9000 + i * 41)
    : play('extreme', 'hard', 9000 + i * 41);
  if (swap) {
    if (w === 2) extremeWins += 1;
    else if (w === 0) hardWins += 1;
  } else {
    if (w === 0) extremeWins += 1;
    else if (w === 2) hardWins += 1;
  }
}
const ms = Date.now() - t0;
console.log(
  `[extreme] vs hard over ${N} rush-2p games: extreme=${extremeWins} hard=${hardWins} (${ms}ms)`,
);
console.log(
  `[extreme] win rate ${Math.round((extremeWins / N) * 100)}% · seats swapped for fairness`,
);
// Both share finish/capture tiers; series is informational (dice variance).
console.log('[extreme] OK — tactical tiers locked + deeper search');
