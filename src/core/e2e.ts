/**
 * End-to-end coverage for rules, path, seats, AI, waypoints.
 * Run: npx tsx src/core/e2e.ts
 */
import { chooseAiMove } from './ai';
import {
  COLOR_NAMES,
  HOME_ENTRY_INDEX,
  HOME_LEN,
  SAFE_TRACK,
  START_INDEX,
  TRACK_LEN,
  seatColorsForCount,
  tokensToWin,
} from './constants';
import { createGame } from './game';
import { listLegalMoves } from './moves';
import { advanceToken, moveWaypoints } from './path';
import type {
  ColorId,
  GameMode,
  PlayerConfig,
  Token,
  TokenState,
} from './types';
import {
  CORNER_BRIDGES,
  trackStepCells,
  trackToCell,
} from '../ui/boardLayout';

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

const fourAi: PlayerConfig[] = [0, 1, 2, 3].map((c) => ({
  id: `p${c}`,
  name: COLOR_NAMES[c as ColorId],
  kind: 'ai' as const,
  color: c as ColorId,
}));

function liveState(mode: GameMode = 'rush') {
  const g = createGame({ mode, players: fourAi });
  return { game: g, state: (g as unknown as { state: ReturnType<typeof g.getState> }).state };
}

function setPhase(
  state: {
    tokens: Token[];
    currentColor: ColorId;
    phase: string;
    dice: number | null;
    winner: ColorId | null;
  },
  color: ColorId,
  dice: number,
  patch: Record<string, TokenState>,
) {
  // Always reset every token, then apply patch (avoids bleed between cases)
  for (const t of state.tokens) {
    t.state = patch[t.id] ? { ...patch[t.id] } : { kind: 'yard' };
  }
  state.currentColor = color;
  state.phase = 'waiting_move';
  state.dice = dice;
  state.winner = null;
}

// ─── Seats ───────────────────────────────────────────────
{
  assert(
    JSON.stringify(seatColorsForCount(2, 0)) === JSON.stringify([0, 2]),
    '2p seats diagonal red-yellow',
  );
  assert(
    JSON.stringify(seatColorsForCount(2, 1)) === JSON.stringify([1, 3]),
    '2p seats diagonal green-blue',
  );
  assert(seatColorsForCount(3, 0).length === 3, '3p has 3 seats');
  assert(seatColorsForCount(4, 0).length === 4, '4p has 4 seats');
}

// ─── Path continuity + bridges ───────────────────────────
{
  for (let i = 0; i < TRACK_LEN; i++) {
    const cells = trackStepCells(i);
    assert(cells.length >= 1, `step ${i} has cells`);
    let prev = trackToCell(i);
    for (const c of cells) {
      const man = Math.abs(c.x - prev.x) + Math.abs(c.y - prev.y);
      assert(man === 1, `orthogonal ${i}: (${prev.x},${prev.y})→(${c.x},${c.y}) man=${man}`);
      prev = c;
    }
  }
  assert(CORNER_BRIDGES.length === 4, '4 corner bridges');
  const seen = new Set<string>();
  for (let i = 0; i < TRACK_LEN; i++) {
    const c = trackToCell(i);
    const k = `${c.x},${c.y}`;
    assert(!seen.has(k), `unique track cell ${k}`);
    seen.add(k);
  }
}

// ─── Starts / home / safe ────────────────────────────────
{
  assert(START_INDEX[0] === 0 && START_INDEX[2] === 26, 'red/yellow starts');
  assert(HOME_ENTRY_INDEX[0] === 50 && HOME_ENTRY_INDEX[1] === 11, 'home entries');
  for (const s of Object.values(START_INDEX)) {
    assert(SAFE_TRACK.has(s), `start ${s} is safe`);
  }
  assert(SAFE_TRACK.has(8) && SAFE_TRACK.has(21), 'star safes');
}

// ─── Each colour can lap to home ─────────────────────────
{
  for (const color of [0, 1, 2, 3] as ColorId[]) {
    let cur: TokenState = { kind: 'track', index: START_INDEX[color] };
    let steps = 0;
    let ok = false;
    while (steps++ < 60) {
      const r = advanceToken(color, cur, 1, []);
      assert(r.ok, `${COLOR_NAMES[color]} advance@${steps}`);
      if (!r.ok) break;
      cur = r.to;
      if (cur.kind === 'homeColumn' || cur.kind === 'finished') {
        ok = true;
        break;
      }
    }
    assert(ok, `${COLOR_NAMES[color]} reaches home stretch`);
  }
}

// ─── Red crosses green quarter ───────────────────────────
{
  let cur: TokenState = { kind: 'track', index: 8 };
  const visited: number[] = [8];
  for (let i = 0; i < 10; i++) {
    const r = advanceToken(0, cur, 1, []);
    assert(r.ok, `red cross step ${i}`);
    if (!r.ok) break;
    cur = r.to;
    if (cur.kind === 'track') visited.push(cur.index);
  }
  assert(visited.includes(11), 'red visits green home-entry cell');
  assert(visited.includes(13), 'red visits green start cell');
  assert(visited.includes(16), 'red continues past green');
}

// ─── Blocks ──────────────────────────────────────────────
{
  const tokens: Token[] = [
    { id: 'red-0', color: 0, slot: 0, state: { kind: 'track', index: 12 } },
    { id: 'green-0', color: 1, slot: 0, state: { kind: 'track', index: 13 } },
    { id: 'green-1', color: 1, slot: 1, state: { kind: 'track', index: 13 } },
  ];
  const blocked = advanceToken(0, { kind: 'track', index: 12 }, 1, tokens, 'red-0');
  assert(!blocked.ok && blocked.reason === 'blocked', 'block stops red');
  const single: Token[] = [
    { id: 'red-0', color: 0, slot: 0, state: { kind: 'track', index: 12 } },
    { id: 'green-0', color: 1, slot: 0, state: { kind: 'track', index: 13 } },
  ];
  const pass = advanceToken(0, { kind: 'track', index: 12 }, 1, single, 'red-0');
  assert(pass.ok, 'single opponent is passable/capturable');
}

// ─── Waypoints match advance ─────────────────────────────
{
  for (const color of [0, 1, 2, 3] as ColorId[]) {
    for (let from = 0; from < TRACK_LEN; from++) {
      for (let d = 1; d <= 6; d++) {
        const start: TokenState = { kind: 'track', index: from };
        const r = advanceToken(color, start, d, []);
        if (!r.ok) continue;
        const wp = moveWaypoints(color, start, r.to, d);
        const last = wp[wp.length - 1];
        assert(
          JSON.stringify(last) === JSON.stringify(r.to),
          `wp c${color} from${from} d${d}`,
        );
      }
    }
  }
}

// ─── Exact home ──────────────────────────────────────────
{
  const over = advanceToken(0, { kind: 'homeColumn', index: 4 }, 2, []);
  assert(!over.ok, 'home overshoot rejected');
  const fin = advanceToken(0, { kind: 'homeColumn', index: 4 }, 1, []);
  assert(fin.ok && fin.to.kind === 'finished', 'exact finish');
}

// ─── AI hard priorities ──────────────────────────────────
{
  const { state } = liveState('rush');

  setPhase(state, 0, 3, {
    'red-0': { kind: 'track', index: 2 },
    'green-0': { kind: 'track', index: 5 },
    'red-1': { kind: 'track', index: 20 },
  });
  let pick = chooseAiMove(listLegalMoves(state), state, 'hard', () => 0);
  assert(!!pick.captures, 'AI hard: capture over advance/open');

  setPhase(state, 0, 4, {
    'red-0': { kind: 'track', index: 10 },
    'green-0': { kind: 'track', index: 7 },
    'red-1': { kind: 'track', index: 30 },
  });
  pick = chooseAiMove(listLegalMoves(state), state, 'hard', () => 0);
  assert(pick.tokenId === 'red-0' && !pick.entersBoard, 'AI hard: escape not open');

  setPhase(state, 0, 1, {
    'red-0': { kind: 'homeColumn', index: 4 },
    'red-1': { kind: 'track', index: 0 },
  });
  pick = chooseAiMove(listLegalMoves(state), state, 'hard', () => 0);
  assert(!!pick.finishes, 'AI hard: finish');

  setPhase(state, 0, 6, {});
  pick = chooseAiMove(listLegalMoves(state), state, 'hard', () => 0);
  assert(!!pick.entersBoard, 'AI hard: open when all in yard');

  setPhase(state, 0, 3, {
    'red-0': { kind: 'track', index: 0 },
    'red-1': { kind: 'track', index: 8 },
  });
  pick = chooseAiMove(listLegalMoves(state), state, 'hard', () => 0);
  assert(!pick.entersBoard, 'AI hard: advance on-board, do not open');
}

// ─── Modes win counts ────────────────────────────────────
{
  assert(tokensToWin('classic') === 4, 'classic win 4');
  assert(tokensToWin('rush') === 2, 'rush win 2');
  assert(tokensToWin('blitz') === 1, 'blitz win 1');
}

// ─── Full bot playthroughs (short invariants) ────────────
{
  for (const mode of ['rush', 'classic', 'blitz'] as GameMode[]) {
    let s = 42 + mode.length;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
    const game = createGame({ mode, players: fourAi, rng });
    let steps = 0;
    while (game.getState().phase !== 'finished' && steps++ < 4000) {
      const st = game.getState();
      if (st.phase === 'waiting_roll') game.roll();
      else if (st.phase === 'waiting_move') {
        const legal = listLegalMoves(game.getState());
        assert(legal.length > 0, `${mode} has moves`);
        game.play(chooseAiMove(legal, game.getState(), 'hard', rng));
      } else break;
    }
    const end = game.getState();
    assert(end.phase === 'finished' && end.winner != null, `${mode} finishes`);
    assert(
      end.tokens.filter(
        (t) => t.color === end.winner && t.state.kind === 'finished',
      ).length >= tokensToWin(mode),
      `${mode} winner finished enough`,
    );
    console.log(`[e2e:${mode}] steps=${steps} winner=${COLOR_NAMES[end.winner!]}`);
  }
}

// ─── 2p diagonal room play ───────────────────────────────
{
  const two = [fourAi[0], fourAi[2]];
  let s = 99;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  const game = createGame({ mode: 'rush', players: two, rng });
  let steps = 0;
  while (game.getState().phase !== 'finished' && steps++ < 3000) {
    const st = game.getState();
    if (st.phase === 'waiting_roll') game.roll();
    else if (st.phase === 'waiting_move') {
      const legal = listLegalMoves(game.getState());
      game.play(chooseAiMove(legal, game.getState(), 'hard', rng));
    } else break;
  }
  assert(game.getState().phase === 'finished', '2p diagonal finishes');
  assert(
    game.getState().winner === 0 || game.getState().winner === 2,
    '2p winner is red or yellow',
  );
  console.log(`[e2e:2p] steps=${steps} winner=${game.getState().winner}`);
}

// ─── Home column length ──────────────────────────────────
{
  assert(HOME_LEN === 5, 'home len 5');
}

console.log(`\n[e2e] passed=${passed} failed=${failed}`);
if (failed) {
  process.exit(1);
}
console.log('[e2e] OK');
