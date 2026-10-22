import { chooseAiMove } from './ai';
import { createGame } from './game';
import { listLegalMoves } from './moves';
import { runRuleTests } from './rules.test';
import type { PlayerConfig } from './types';

const players: PlayerConfig[] = [
  { id: 'r', name: 'Red', kind: 'ai', color: 0 },
  { id: 'g', name: 'Green', kind: 'ai', color: 1 },
  { id: 'y', name: 'Yellow', kind: 'ai', color: 2 },
  { id: 'b', name: 'Blue', kind: 'ai', color: 3 },
];

function run(mode: 'classic' | 'rush', seed = 42) {
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  const game = createGame({ mode, players, rng });
  let steps = 0;
  const max = mode === 'rush' ? 4000 : 6000;

  while (game.getState().phase !== 'finished' && steps < max) {
    const st = game.getState();
    if (st.phase === 'waiting_roll') {
      game.roll();
    } else if (st.phase === 'waiting_move') {
      const moves = listLegalMoves(game.getState());
      if (moves.length === 0) break;
      game.play(chooseAiMove(moves, game.getState(), 'hard', rng));
    } else {
      break;
    }
    steps += 1;
  }

  const end = game.getState();
  console.log(
    `[smoke:${mode}] steps=${steps} winner=${end.winner} ranking=${end.ranking.join(',')}`,
  );
  if (end.phase !== 'finished') {
    throw new Error(`smoke ${mode} did not finish in ${max} steps`);
  }
}

runRuleTests();
run('rush', 7);
run('classic', 99);
console.log('smoke ok');
