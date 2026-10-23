/**
 * Regression: AI must keep playing after rolling 6 (extra turn / open).
 * Run: npx tsx src/core/ai-six-e2e.ts
 */
import { playAiStep, chooseAiMove } from './ai';
import { createGame } from './game';
import { listLegalMoves } from './moves';
import { COLOR_NAMES } from './constants';
import type { ColorId, PlayerConfig } from './types';

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

function fourAi(): PlayerConfig[] {
  return ([0, 1, 2, 3] as ColorId[]).map((c) => ({
    id: `ai-${c}`,
    name: COLOR_NAMES[c],
    kind: 'ai' as const,
    color: c,
  }));
}

/** rng that yields 6 for the first `nSix` rolls, then cycles 1–5 */
function sixThenRng(nSix: number) {
  let rolls = 0;
  return () => {
    rolls += 1;
    if (rolls <= nSix) return 0.99; // → 6
    // 1..5 evenly
    const faces = [0.0, 0.2, 0.4, 0.6, 0.8];
    return faces[(rolls - nSix - 1) % faces.length]!;
  };
}

// ─── After a 6, AI must still be able to move (not stuck in waiting_move) ───
{
  const rng = sixThenRng(1);
  const game = createGame({ mode: 'rush', players: fourAi(), rng });
  const color = game.getState().currentColor;
  assert(playAiStep(game, color, 'hard', rng), 'AI roll 6');
  const afterRoll = game.getState();
  assert(afterRoll.dice === 6, 'dice is 6');
  assert(afterRoll.phase === 'waiting_move', 'waiting_move after 6');
  const legal = listLegalMoves(afterRoll);
  assert(legal.length > 0, 'legal moves after opening 6');
  assert(playAiStep(game, color, 'hard', rng), 'AI moves after 6');
  const afterMove = game.getState();
  assert(
    afterMove.phase === 'waiting_roll',
    'back to waiting_roll after move on 6',
  );
  assert(
    afterMove.currentColor === color,
    'extra turn keeps same color after 6',
  );
}

// ─── Two sixes then forced 1–5 — never stuck ───
{
  const rng = sixThenRng(2);
  const game = createGame({ mode: 'rush', players: fourAi(), rng });
  let steps = 0;
  let sixMoves = 0;
  while (game.getState().phase !== 'finished' && steps++ < 80) {
    const s = game.getState();
    const color = s.currentColor;
    if (s.phase === 'waiting_roll') {
      const beforeSix = s.consecutiveSixes;
      assert(playAiStep(game, color, 'hard', rng), `roll @${steps}`);
      const mid = game.getState();
      if (mid.dice === 6) {
        assert(mid.phase === 'waiting_move' || mid.phase === 'waiting_roll', '6 resolved');
      }
      if (mid.phase === 'waiting_move') {
        const legal = listLegalMoves(mid);
        assert(legal.length > 0, `legal after roll @${steps}`);
        assert(playAiStep(game, color, 'hard', rng), `move after roll @${steps}`);
        if (beforeSix < 2 && mid.dice === 6) sixMoves += 1;
      }
      continue;
    }
    if (s.phase === 'waiting_move') {
      const legal = listLegalMoves(s);
      assert(legal.length > 0, `orphan waiting_move has legal @${steps}`);
      assert(playAiStep(game, color, 'hard', rng), `orphan move @${steps}`);
    }
  }
  assert(sixMoves >= 1, 'exercised at least one six-move');
}

// ─── Full AI playthrough must not freeze after sixes (busy-schedule pattern) ───
{
  /** Mimic mount: drop schedule if busy (old bug) vs retry (fixed). */
  function runWithScheduler(retryWhenBusy: boolean, maxSteps: number): number {
    let busy = false;
    let steps = 0;
    let stuck = 0;
    const rng = sixThenRng(12);
    const game = createGame({ mode: 'blitz', players: fourAi(), rng });

    const tick = (): boolean => {
      if (busy) {
        if (retryWhenBusy) return false; // caller will retry
        return true; // old bug: drop forever
      }
      const s = game.getState();
      if (s.phase === 'finished') return true;
      const color = s.currentColor;
      busy = true;
      const ok = playAiStep(game, color, 'hard', rng);
      busy = false;
      if (!ok) {
        // no-op phases shouldn't count as progress
        stuck += 1;
        return stuck > 5;
      }
      steps += 1;
      stuck = 0;
      return steps >= maxSteps || game.getState().phase === 'finished';
    };

    let guard = 0;
    while (guard++ < maxSteps * 4) {
      const done = tick();
      if (busy && retryWhenBusy) {
        busy = false; // simulate anim end
        continue;
      }
      if (done) break;
    }
    return steps;
  }

  const fixedSteps = runWithScheduler(true, 40);
  assert(fixedSteps >= 10, `retry scheduler made progress (${fixedSteps})`);
}

// ─── chooseAiMove always returns a legal token after 6 ───
{
  const rng = () => 0.99;
  const game = createGame({ mode: 'classic', players: fourAi(), rng });
  game.roll();
  const s = game.getState();
  const moves = listLegalMoves(s);
  assert(moves.length > 0, 'classic open on 6');
  const pick = chooseAiMove(moves, s, 'hard', () => 0.1);
  assert(!!pick.tokenId, 'AI picked a token');
  assert(
    moves.some((m) => m.tokenId === pick.tokenId),
    'pick is legal',
  );
}

if (failed) {
  console.error(`[ai-six-e2e] passed=${passed} failed=${failed}`);
  process.exit(1);
}
console.log(`[ai-six-e2e] passed=${passed} failed=0`);
console.log('[ai-six-e2e] OK — AI continues after rolling 6');
