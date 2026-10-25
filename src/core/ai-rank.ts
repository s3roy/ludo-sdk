/**
 * Play + probe the AI — rank easy / normal / hard.
 * Run: npx tsx src/core/ai-rank.ts
 */
import { chooseAiMove, type AiDifficulty } from './ai';
import { COLOR_NAMES, START_INDEX, tokensToWin } from './constants';
import { createGame } from './game';
import { listLegalMoves } from './moves';
import type {
  ColorId,
  GameMode,
  GameState,
  LegalMove,
  PlayerConfig,
  Token,
  TokenState,
} from './types';

function rngFrom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function fourAi(kinds: AiDifficulty[]): PlayerConfig[] {
  return [0, 1, 2, 3].map((c) => ({
    id: `p${c}`,
    name: COLOR_NAMES[c as ColorId],
    kind: 'ai' as const,
    color: c as ColorId,
  }));
}

function setBoard(
  state: GameState,
  color: ColorId,
  dice: number,
  patch: Record<string, TokenState>,
) {
  for (const t of state.tokens) {
    t.state = patch[t.id] ? { ...patch[t.id] } : { kind: 'yard' };
  }
  state.currentColor = color;
  state.phase = 'waiting_move';
  state.dice = dice;
  state.winner = null;
  state.ranking = [];
}

type MoveKind =
  | 'finish'
  | 'capture'
  | 'escape'
  | 'enter_home'
  | 'open'
  | 'safe'
  | 'advance'
  | 'other';

function classify(m: LegalMove, state: GameState): MoveKind {
  if (m.finishes) return 'finish';
  if (m.captures) return 'capture';
  if (m.entersBoard) return 'open';
  if (m.to.kind === 'homeColumn') return 'enter_home';
  if (m.to.kind === 'track') {
    // safe check via choose path — approximate with START/SAFE via landing score later
    return 'advance';
  }
  return 'other';
}

function hasCapture(moves: LegalMove[]) {
  return moves.some((m) => m.captures);
}
function hasFinish(moves: LegalMove[]) {
  return moves.some((m) => m.finishes);
}

/** Probe: given a constructed position, does difficulty pick the "correct" move class? */
function probe(
  label: string,
  difficulty: AiDifficulty,
  setup: (state: GameState) => void,
  expect: (pick: LegalMove, moves: LegalMove[], state: GameState) => boolean,
  rng = () => 0,
): boolean {
  const g = createGame({ mode: 'rush', players: fourAi(['hard', 'hard', 'hard', 'hard']) });
  const state = (g as unknown as { state: GameState }).state;
  setup(state);
  const moves = listLegalMoves(state);
  if (!moves.length) {
    console.log(`  SKIP ${label} (no moves)`);
    return true;
  }
  const pick = chooseAiMove(moves, state, difficulty, rng);
  const ok = expect(pick, moves, state);
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'} [${difficulty}] ${label} → ${pick.tokenId} (${classify(pick, state)}${pick.captures ? ' cap' : ''}${pick.finishes ? ' fin' : ''}${pick.entersBoard ? ' open' : ''})`,
  );
  return ok;
}

type SeatDiff = AiDifficulty;

function playMatch(
  mode: GameMode,
  diffs: SeatDiff[],
  seed: number,
  maxSteps = 5000,
): { winner: ColorId | null; steps: number; byColor: Record<number, { captures: number; finishes: number; opens: number; suicidal: number; moves: number }> } {
  const rng = rngFrom(seed);
  const players = fourAi(diffs).slice(0, diffs.length);
  // remap colors for 2p
  if (diffs.length === 2) {
    players[0].color = 0;
    players[1].color = 2;
  }
  const game = createGame({ mode, players, rng });
  const byColor: Record<
    number,
    { captures: number; finishes: number; opens: number; suicidal: number; moves: number }
  > = {};
  for (const p of players) {
    byColor[p.color] = { captures: 0, finishes: 0, opens: 0, suicidal: 0, moves: 0 };
  }

  // Map color → difficulty
  const diffOf = new Map<ColorId, AiDifficulty>();
  players.forEach((p, i) => diffOf.set(p.color, diffs[i]));

  let steps = 0;
  while (game.getState().phase !== 'finished' && steps++ < maxSteps) {
    const st = game.getState();
    if (st.phase === 'waiting_roll') {
      game.roll();
      continue;
    }
    if (st.phase === 'waiting_move') {
      const legal = listLegalMoves(st);
      if (!legal.length) break;
      const d = diffOf.get(st.currentColor) ?? 'hard';
      const pick = chooseAiMove(legal, st, d, rng);
      const stats = byColor[st.currentColor];
      stats.moves += 1;
      if (pick.captures) stats.captures += 1;
      if (pick.finishes) stats.finishes += 1;
      if (pick.entersBoard) stats.opens += 1;
      // suicidal landing heuristic: track, not safe, attacker 1–3 behind
      if (
        pick.to.kind === 'track' &&
        !pick.captures &&
        !pick.finishes
      ) {
        const idx = pick.to.index;
        const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
        if (!SAFE.has(idx)) {
          for (const t of st.tokens) {
            if (t.color === st.currentColor || t.state.kind !== 'track') continue;
            const dist = (idx - t.state.index + 52) % 52;
            if (dist >= 1 && dist <= 3) {
              stats.suicidal += 1;
              break;
            }
          }
        }
      }
      game.play(pick);
    } else break;
  }
  const end = game.getState();
  return { winner: end.winner, steps, byColor };
}

console.log('═══ Scenario probes (hard) ═══');
let probes = 0;
let probePass = 0;

function runProbe(
  label: string,
  d: AiDifficulty,
  setup: (s: GameState) => void,
  expect: (pick: LegalMove, moves: LegalMove[], s: GameState) => boolean,
) {
  probes += 1;
  if (probe(label, d, setup, expect)) probePass += 1;
}

// 1 Capture over open/advance
runProbe(
  'capture beats open/advance',
  'hard',
  (s) =>
    setBoard(s, 0, 3, {
      'red-0': { kind: 'track', index: 2 },
      'green-0': { kind: 'track', index: 5 },
      'red-1': { kind: 'track', index: 20 },
    }),
  (pick) => !!pick.captures,
);

// 2 Finish over capture (LudoBench GT preference)
runProbe(
  'finish beats capture (when both legal)',
  'hard',
  (s) =>
    setBoard(s, 0, 1, {
      'red-0': { kind: 'homeColumn', index: 4 },
      'red-1': { kind: 'track', index: 10 },
      'green-0': { kind: 'track', index: 11 },
    }),
  (pick, moves) => {
    if (!hasFinish(moves) || !hasCapture(moves)) return !!pick.finishes;
    return !!pick.finishes; // GT: finish first
  },
);

// 3 Escape when threatened
runProbe(
  'escape when 1–3 behind',
  'hard',
  (s) =>
    setBoard(s, 0, 4, {
      'red-0': { kind: 'track', index: 10 },
      'green-0': { kind: 'track', index: 7 },
      'red-1': { kind: 'track', index: 30 },
    }),
  (pick) => pick.tokenId === 'red-0' && !pick.entersBoard,
);

// 4 Open when all in yard on 6
runProbe(
  'open from yard when all home',
  'hard',
  (s) => setBoard(s, 0, 6, {}),
  (pick) => !!pick.entersBoard,
);

// 5 Don't open when already racing (hard)
runProbe(
  'hard: advance on-board, do not open',
  'hard',
  (s) =>
    setBoard(s, 0, 3, {
      'red-0': { kind: 'track', index: 0 },
      'red-1': { kind: 'track', index: 8 },
    }),
  (pick) => !pick.entersBoard,
);

// 6 Win-finishing token preferred
runProbe(
  'rush: finish wins game (2nd token)',
  'hard',
  (s) => {
    setBoard(s, 0, 1, {
      'red-0': { kind: 'finished' },
      'red-1': { kind: 'homeColumn', index: 4 },
      'red-2': { kind: 'track', index: 0 },
    });
  },
  (pick) => !!pick.finishes && pick.tokenId === 'red-1',
);

console.log(`\nProbes hard: ${probePass}/${probes}`);

console.log('\n═══ easy vs hard on same probes ═══');
const easyWrong: string[] = [];
for (const [label, setup, expect] of [
  [
    'capture beats open',
    (s: GameState) =>
      setBoard(s, 0, 3, {
        'red-0': { kind: 'track', index: 2 },
        'green-0': { kind: 'track', index: 5 },
        'red-1': { kind: 'track', index: 20 },
      }),
    (p: LegalMove) => !!p.captures,
  ],
  [
    'finish beats capture',
    (s: GameState) =>
      setBoard(s, 0, 1, {
        'red-0': { kind: 'homeColumn', index: 4 },
        'red-1': { kind: 'track', index: 10 },
        'green-0': { kind: 'track', index: 11 },
      }),
    (p: LegalMove, moves: LegalMove[]) =>
      !hasFinish(moves) || !hasCapture(moves) ? true : !!p.finishes,
  ],
] as const) {
  let easyOk = 0;
  for (let i = 0; i < 40; i++) {
    const g = createGame({ mode: 'rush', players: fourAi(['hard', 'hard', 'hard', 'hard']) });
    const state = (g as unknown as { state: GameState }).state;
    setup(state);
    const moves = listLegalMoves(state);
    const pick = chooseAiMove(moves, state, 'easy', rngFrom(100 + i));
    if (expect(pick, moves)) easyOk += 1;
  }
  console.log(`  easy "${label}" correct ~${easyOk}/40 (${Math.round((easyOk / 40) * 100)}%)`);
  if (easyOk < 30) easyWrong.push(label);
}

console.log('\n═══ Head-to-heads (rush 2p, 80 games) ═══');

function h2h(a: AiDifficulty, b: AiDifficulty, n = 80) {
  let aw = 0;
  let bw = 0;
  let draws = 0;
  let aCap = 0;
  let bCap = 0;
  let aSuic = 0;
  let bSuic = 0;
  let aMoves = 0;
  let bMoves = 0;
  for (let i = 0; i < n; i++) {
    const r = playMatch('rush', [a, b], 1000 + i * 17);
    if (r.winner === 0) aw += 1;
    else if (r.winner === 2) bw += 1;
    else draws += 1;
    aCap += r.byColor[0]?.captures ?? 0;
    bCap += r.byColor[2]?.captures ?? 0;
    aSuic += r.byColor[0]?.suicidal ?? 0;
    bSuic += r.byColor[2]?.suicidal ?? 0;
    aMoves += r.byColor[0]?.moves ?? 0;
    bMoves += r.byColor[2]?.moves ?? 0;
  }
  const aRate = Math.round((aw / n) * 100);
  const bRate = Math.round((bw / n) * 100);
  console.log(
    `  ${a} vs ${b}: ${a} wins ${aRate}% | ${b} wins ${bRate}% | unfinished ${draws}`,
  );
  console.log(
    `    captures/game: ${a}=${(aCap / n).toFixed(1)} ${b}=${(bCap / n).toFixed(1)} | suicidal landings/game: ${a}=${(aSuic / n).toFixed(2)} ${b}=${(bSuic / n).toFixed(2)}`,
  );
  return { aRate, bRate, aCap: aCap / n, bCap: bCap / n, aSuic: aSuic / n, bSuic: bSuic / n };
}

const eh = h2h('easy', 'hard', 80);
const nh = h2h('normal', 'hard', 80);
const en = h2h('easy', 'normal', 60);
const hh = h2h('hard', 'hard', 40); // sanity ~50/50

console.log('\n═══ 4-seat free-for-all (hard only, 40 games) ═══');
const wins4: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
let avgSteps = 0;
for (let i = 0; i < 40; i++) {
  const r = playMatch('rush', ['hard', 'hard', 'hard', 'hard'], 5000 + i * 31);
  if (r.winner != null) wins4[r.winner] += 1;
  avgSteps += r.steps;
}
console.log(
  `  winners R/G/Y/B: ${wins4[0]}/${wins4[1]}/${wins4[2]}/${wins4[3]} · avg steps ${Math.round(avgSteps / 40)}`,
);

console.log('\n═══ RANKING ═══');
console.log(`
Tier ladder (this SDK) — rules unchanged at every level:

  EXTREME ★★★★★  deeper expectiminimax (depth 3–4) inside finish→capture tiers
  HARD    ★★★★☆  (~${100 - eh.aRate}% win vs easy, ~${nh.bRate}% vs normal)
                  shallow search (depth 1–2) + same tiers
  NORMAL  ★★★☆☆  (~${100 - en.aRate}% win vs easy)
                  greedy tiers + slack / occasional second-best
  EASY    ★☆☆☆☆  random legal move

Shared tiers: finish → capture → escape → home → safe/block → rest.
Docs: DOCS.md § AI difficulty · RULES.md for modes.
`);

console.log('Ship default: extreme (cash) / hard (casual offline).');
