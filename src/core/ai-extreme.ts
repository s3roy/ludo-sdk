/**
 * Extreme AI — expectiminimax over dice + opponent replies.
 * Much stronger than greedy `hard`; slower (~few ms per move).
 */
import { isSafeSquare, TRACK_LEN, tokensToWin } from './constants';
import { createGame } from './game';
import { countFinished, listLegalMoves } from './moves';
import { progressScore } from './path';
import type { ColorId, GameState, LegalMove } from './types';

const WIN = 50_000;
/** Deeper than hard — extreme should win most head-to-heads. */
const DEPTH_2P = 4;
const DEPTH_MULTI = 3;

export type ExtremeOptions = {
  /** Search depth (roll/move plies). Default 4 (2p) / 3 (3–4p). */
  depth?: number;
  /** Max candidate moves to expand. Default 10. */
  maxBranch?: number;
};

/** Local hard-ish pick — avoids circular import with `ai.ts`. */
function hardishPick(moves: LegalMove[], state: GameState): LegalMove {
  const finish = moves.filter((m) => m.finishes);
  if (finish.length) return finish[0];
  const caps = moves.filter((m) => m.captures);
  if (caps.length) return caps[0];
  // Prefer escaping imminent kill over random progress
  const escapes = moves.filter((m) => {
    if (m.from.kind !== 'track' || isSafeSquare(m.from.index)) return false;
    return attackersBehind(state, state.currentColor, m.from.index).some(
      (d) => d <= 3,
    );
  });
  if (escapes.length) return rankByQuick(escapes, state)[0]!;
  return rankByQuick(moves, state)[0]!;
}

export function chooseExtremeMove(
  moves: LegalMove[],
  state: GameState,
  rng: () => number = Math.random,
  options: ExtremeOptions = {},
): LegalMove {
  if (moves.length === 1) return moves[0];

  // Hard tiers at the root — search must NEVER skip a finish or eat
  // for a “safer” advance (that was the yellow-won’t-capture bug).
  const finishes = moves.filter((m) => m.finishes);
  const captures = moves.filter((m) => m.captures);
  let scoped = finishes.length
    ? finishes
    : captures.length
      ? captures
      : moves;

  // Among non-tactical moves, drop obvious 1–3 dump landings when an
  // alternative exists (escape / safe / progress without suicide).
  if (!finishes.length && !captures.length && scoped.length > 1) {
    const safeish = scoped.filter((m) => !isDumpLanding(m, state));
    if (safeish.length) scoped = safeish;
  }

  if (scoped.length === 1) return scoped[0]!;

  const root = state.currentColor;
  const seats = state.players.length;
  const depth =
    options.depth ?? (seats <= 2 ? DEPTH_2P : DEPTH_MULTI);
  const maxBranch = options.maxBranch ?? 10;

  const hardPick = hardishPick(scoped, state);
  const candidates = uniqueMoves([hardPick, ...scoped]);

  const pool =
    candidates.length > maxBranch
      ? rankByQuick(candidates, state).slice(0, maxBranch)
      : candidates;

  let best = pool[0];
  let bestScore = -Infinity;
  const ties: LegalMove[] = [];

  for (const m of pool) {
    const next = applyMove(state, m);
    // Immediate tactical bonus so short-depth search doesn’t undervalue eats
    const tacticalBonus = m.finishes ? 2_500 : m.captures ? 1_800 : 0;
    const score = expectimax(next, depth - 1, root) + tacticalBonus;
    if (score > bestScore + 0.01) {
      bestScore = score;
      best = m;
      ties.length = 0;
      ties.push(m);
    } else if (Math.abs(score - bestScore) <= 0.01) {
      ties.push(m);
    }
  }

  return ties[Math.floor(rng() * ties.length)] ?? best;
}

/** Land on unsafe track in 1–3 of an enemy without capturing. */
function isDumpLanding(m: LegalMove, state: GameState): boolean {
  if (m.captures || m.finishes || m.entersBoard) return false;
  if (m.to.kind !== 'track' || isSafeSquare(m.to.index)) return false;
  return attackersBehind(state, state.currentColor, m.to.index).some(
    (d) => d <= 3,
  );
}

function uniqueMoves(list: LegalMove[]): LegalMove[] {
  const seen = new Set<string>();
  const out: LegalMove[] = [];
  for (const m of list) {
    const k = `${m.tokenId}:${m.dice}:${JSON.stringify(m.to)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m);
  }
  return out;
}

function rankByQuick(moves: LegalMove[], state: GameState): LegalMove[] {
  return [...moves].sort(
    (a, b) => quickMoveScore(b, state) - quickMoveScore(a, state),
  );
}

function quickMoveScore(m: LegalMove, state: GameState): number {
  const color = state.currentColor;
  let s = 0;
  if (m.finishes) s += 2000;
  if (m.captures) {
    // Eating is almost always correct (extra turn + send them home)
    const victim = state.tokens.find((t) => t.id === m.captures);
    s += 1600 + (victim ? progressScore(victim.color, victim.state) : 40);
  }

  const active = state.tokens.filter(
    (t) =>
      t.color === color &&
      t.state.kind !== 'yard' &&
      t.state.kind !== 'finished',
  ).length;
  const need = tokensToWin(state.mode);
  const finiteNeed = Number.isFinite(need) ? need : 4;

  if (m.entersBoard) {
    // Opening the first runner is good; opening extras past win-need is dumb
    if (active === 0) s += 55;
    else if (active >= finiteNeed) s -= 40;
    else s += 8;
  }

  // Prefer entering / advancing home stretch
  if (m.to.kind === 'homeColumn' || m.from.kind === 'homeColumn') {
    s += 90 + (m.to.kind === 'homeColumn' ? m.to.index * 12 : 0);
  }

  // Escape imminent kill
  if (
    m.from.kind === 'track' &&
    !isSafeSquare(m.from.index) &&
    attackersBehind(state, color, m.from.index).some((d) => d <= 3)
  ) {
    s += 120;
  }

  // Dump moves: land in 1–3 kill range without capturing
  if (
    m.to.kind === 'track' &&
    !isSafeSquare(m.to.index) &&
    !m.captures &&
    !m.finishes
  ) {
    const atk = attackersBehind(state, color, m.to.index);
    for (const d of atk) s -= d <= 3 ? 110 : 35;
  }

  s += progressScore(color, m.to) * 2.4;
  s -= progressScore(color, m.from) * 0.4;
  return s;
}

function applyMove(state: GameState, move: LegalMove): GameState {
  const g = createGame({
    mode: state.mode,
    players: state.players,
  });
  g.syncState(state);
  g.play(move);
  return g.getState();
}

function applyDice(state: GameState, face: number): GameState {
  const g = createGame({
    mode: state.mode,
    players: state.players,
  });
  g.syncState(state);
  g.applyDice(face);
  return g.getState();
}

/**
 * Chance node on rolls; max for root; approx-min for opponents (hard top replies).
 */
function expectimax(state: GameState, depth: number, root: ColorId): number {
  if (state.phase === 'finished') {
    if (state.winner === root) return WIN;
    if (state.winner != null) return -WIN;
    return state.ranking.includes(root) ? WIN * 0.5 : -WIN * 0.5;
  }

  if (depth <= 0) return evaluate(state, root);

  if (state.phase === 'waiting_roll') {
    let sum = 0;
    for (let d = 1; d <= 6; d++) {
      sum += expectimax(applyDice(state, d), depth - 1, root);
    }
    return sum / 6;
  }

  if (state.phase === 'waiting_move') {
    const moves = listLegalMoves(state);
    if (!moves.length) return evaluate(state, root);

    if (state.currentColor === root) {
      let best = -Infinity;
      for (const m of moves) {
        best = Math.max(best, expectimax(applyMove(state, m), depth - 1, root));
      }
      return best;
    }

    // Opponent: minimize our score using their strongest 1–2 replies
    const replies = opponentReplies(moves, state);
    let worst = Infinity;
    for (const m of replies) {
      worst = Math.min(worst, expectimax(applyMove(state, m), depth - 1, root));
    }
    return worst;
  }

  return evaluate(state, root);
}

function opponentReplies(moves: LegalMove[], state: GameState): LegalMove[] {
  if (moves.length <= 2) return moves;
  // Assume opponent plays hard-ish — take top 2
  const pick = hardishPick(moves, state);
  const ranked = rankByQuick(moves, state);
  const second = ranked.find(
    (m) =>
      m.tokenId !== pick.tokenId ||
      JSON.stringify(m.to) !== JSON.stringify(pick.to),
  );
  return second ? [pick, second] : [pick];
}

/** Relative seat strength — higher is better for `root`. */
export function evaluate(state: GameState, root: ColorId): number {
  const others = state.players.filter((p) => p.color !== root);
  let score = seatPower(state, root) * 1.15;
  for (const p of others) {
    score -= seatPower(state, p.color) / Math.max(1, others.length);
  }

  // Race pressure: punish opponents closer to win
  const need = tokensToWin(state.mode);
  if (Number.isFinite(need) && need > 0) {
    for (const p of state.players) {
      const fin = countFinished(state, p.color);
      const near = fin / need;
      if (p.color === root) score += near * 400;
      else score -= near * 380;
    }
  }

  // Arena: points on the board are the win condition
  if (state.mode === 'arena' && state.scores) {
    score += (state.scores[root] ?? 0) * 35;
    for (const p of others) {
      score -= ((state.scores[p.color] ?? 0) * 30) / Math.max(1, others.length);
    }
  }

  return score;
}

function seatPower(state: GameState, color: ColorId): number {
  let power = countFinished(state, color) * 520;
  let yard = 0;
  let active = 0;

  for (const t of state.tokens) {
    if (t.color !== color) continue;
    power += progressScore(color, t.state) * 3.2;

    if (t.state.kind === 'yard') {
      yard += 1;
      continue;
    }
    if (t.state.kind === 'finished') continue;
    active += 1;

    if (t.state.kind === 'track') {
      const idx = t.state.index;
      if (isSafeSquare(idx)) {
        power += 28;
      } else {
        const threats = attackersBehind(state, color, idx);
        for (const d of threats) {
          power -= d <= 3 ? 55 : 22;
        }
      }
      // Block bonus
      const stack = state.tokens.filter(
        (x) =>
          x.color === color &&
          x.state.kind === 'track' &&
          x.state.index === idx,
      ).length;
      if (stack >= 2) power += 45;
    }

    if (t.state.kind === 'homeColumn') {
      const hi = t.state.index;
      power += 60 + hi * 18;
    }
  }

  // Prefer developing at least one runner; dump-yard is bad midgame
  if (active === 0 && yard > 0) power -= 35;
  if (active >= 2) power += 25;

  return power;
}

function attackersBehind(
  state: GameState,
  self: ColorId,
  index: number,
): number[] {
  const out: number[] = [];
  for (const t of state.tokens) {
    if (t.color === self || t.state.kind !== 'track') continue;
    const dist = (index - t.state.index + TRACK_LEN) % TRACK_LEN;
    if (dist >= 1 && dist <= 6) out.push(dist);
  }
  return out;
}
