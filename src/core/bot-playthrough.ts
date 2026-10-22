/**
 * Full AI vs AI playthrough with invariant checks after every action.
 * Run: npx tsx src/core/bot-playthrough.ts
 */
import { chooseAiMove } from './ai';
import { COLOR_NAMES, HOME_LEN, TRACK_LEN, tokensToWin } from './constants';
import { createGame } from './game';
import { listLegalMoves } from './moves';
import type {
  GameEvent,
  GameMode,
  GameState,
  PlayerConfig,
  TokenState,
} from './types';

const players: PlayerConfig[] = [0, 1, 2, 3].map((color) => ({
  id: `p${color}`,
  name: COLOR_NAMES[color as 0 | 1 | 2 | 3],
  kind: 'ai' as const,
  color: color as 0 | 1 | 2 | 3,
}));

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function validToken(t: TokenState) {
  if (t.kind === 'yard' || t.kind === 'finished') return true;
  if (t.kind === 'track') return t.index >= 0 && t.index < TRACK_LEN;
  if (t.kind === 'homeColumn') return t.index >= 0 && t.index < HOME_LEN;
  return false;
}

function checkInvariants(s: GameState, label: string) {
  assert(s.tokens.length === s.players.length * 4, `${label}: token count`);
  for (const t of s.tokens) {
    assert(validToken(t.state), `${label}: bad token ${t.id} ${JSON.stringify(t.state)}`);
  }
  assert(
    s.players.some((p) => p.color === s.currentColor),
    `${label}: currentColor not in players`,
  );
  if (s.phase === 'waiting_move') {
    assert(s.dice != null && s.dice >= 1 && s.dice <= 6, `${label}: dice required`);
  }
  if (s.phase === 'finished') {
    assert(s.winner != null, `${label}: winner set`);
    assert(
      s.tokens.filter((t) => t.color === s.winner && t.state.kind === 'finished')
        .length >= tokensToWin(s.mode),
      `${label}: winner finished enough tokens`,
    );
  }
}

function playthrough(mode: GameMode, seed: number, maxSteps: number) {
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  const game = createGame({ mode, players, rng });
  const log: string[] = [];
  let rolls = 0;
  let moves = 0;
  let captures = 0;
  let opens = 0;
  let finishes = 0;
  let sixExtras = 0;

  game.subscribe((_st, ev: GameEvent | null) => {
    if (!ev) return;
    if (ev.type === 'roll') {
      rolls += 1;
      log.push(`roll ${COLOR_NAMES[ev.color]}=${ev.value}`);
    }
    if (ev.type === 'move') {
      moves += 1;
      if (ev.move.entersBoard) opens += 1;
      if (ev.move.finishes) finishes += 1;
      if (ev.move.captures) captures += 1;
      log.push(
        `move ${COLOR_NAMES[ev.color]} ${ev.tokenId} ${JSON.stringify(ev.move.from)}→${JSON.stringify(ev.move.to)}${ev.move.captures ? ' CAP' : ''}`,
      );
    }
    if (ev.type === 'extra_turn' && ev.reason === 'six') sixExtras += 1;
    if (ev.type === 'win') log.push(`WIN ${COLOR_NAMES[ev.color]}`);
  });

  let steps = 0;
  while (game.getState().phase !== 'finished' && steps < maxSteps) {
    const st = game.getState();
    checkInvariants(st, `step ${steps}`);

    if (st.phase === 'waiting_roll') {
      game.roll();
    } else if (st.phase === 'waiting_move') {
      const legal = listLegalMoves(game.getState());
      assert(legal.length > 0, `step ${steps}: waiting_move but no legal moves`);
      // Every legal move must still be playable
      const pick = chooseAiMove(legal, game.getState(), 'hard', rng);
      const ok = game.play(pick);
      assert(ok, `step ${steps}: AI move rejected ${pick.tokenId}`);
    } else {
      break;
    }
    steps += 1;
  }

  const end = game.getState();
  checkInvariants(end, 'end');
  assert(end.phase === 'finished', `${mode} seed=${seed} did not finish (${steps} steps)`);
  assert(rolls > 0 && moves > 0, `${mode}: no rolls/moves`);
  assert(opens > 0, `${mode}: no tokens opened`);

  console.log(
    `[bot:${mode}] seed=${seed} steps=${steps} rolls=${rolls} moves=${moves} opens=${opens} captures=${captures} finishes=${finishes} sixExtras=${sixExtras} winner=${COLOR_NAMES[end.winner!]}`,
  );
  // Sample last few lines for visibility
  console.log(`  … ${log.slice(-5).join(' | ')}`);
  return { steps, rolls, moves, captures, opens, finishes, winner: end.winner };
}

const results = [
  playthrough('rush', 7, 5000),
  playthrough('rush', 12345, 5000),
  playthrough('classic', 99, 8000),
  playthrough('classic', 4242, 8000),
  playthrough('blitz', 3, 3000),
];

// 2-player AI — diagonal seats (red vs yellow)
{
  const two = [players[0], players[2]];
  let s = 55;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const game = createGame({ mode: 'rush', players: two, rng });
  let steps = 0;
  while (game.getState().phase !== 'finished' && steps < 3000) {
    const st = game.getState();
    if (st.phase === 'waiting_roll') game.roll();
    else if (st.phase === 'waiting_move') {
      const m = listLegalMoves(game.getState());
      game.play(chooseAiMove(m, game.getState(), 'normal', rng));
    } else break;
    steps += 1;
  }
  assert(game.getState().phase === 'finished', '2p rush unfinished');
  console.log(`[bot:rush-2p] steps=${steps} winner=${game.getState().winner}`);
}

console.log(
  `[bot] OK — ${results.length + 1} playthroughs, total moves=${results.reduce((a, r) => a + r.moves, 0)}`,
);
