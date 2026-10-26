/**
 * Shared “gut feel” tactics for AI pickers — danger, escape, open discipline.
 * Does not change engine legality; only ranks legal moves.
 */
import { isSafeSquare, TRACK_LEN, tokensToWin } from './constants';
import { progressScore } from './path';
import type { ColorId, GameState, LegalMove } from './types';

/** Distances (1–6) of enemy tokens sitting behind `index`. */
export function attackersBehind(
  state: GameState,
  self: ColorId,
  index: number,
  ignoreId?: string,
): number[] {
  const out: number[] = [];
  for (const t of state.tokens) {
    if (t.color === self || t.state.kind !== 'track') continue;
    if (ignoreId && t.id === ignoreId) continue;
    const dist = (index - t.state.index + TRACK_LEN) % TRACK_LEN;
    if (dist >= 1 && dist <= 6) out.push(dist);
  }
  return out;
}

/** Imminent kill window — opponent needs 1–3 to land on us. */
export function isPureDanger(distances: number[]): boolean {
  return distances.some((d) => d <= 3);
}

export function dangerOn(
  state: GameState,
  self: ColorId,
  index: number,
  ignoreId?: string,
): number[] {
  if (isSafeSquare(index)) return [];
  return attackersBehind(state, self, index, ignoreId);
}

/**
 * This move flees a threatened track square.
 * Gut feel: run before opening a new pin when you’re in the kill window.
 */
export function isEscapeMove(m: LegalMove, state: GameState): boolean {
  if (m.from.kind !== 'track') return false;
  if (isSafeSquare(m.from.index)) return false;
  const danger = attackersBehind(state, state.currentColor, m.from.index);
  if (!danger.length) return false;

  // Home / finish / safe landing = always a save
  if (m.to.kind !== 'track') return true;
  if (isSafeSquare(m.to.index)) return true;

  const after = attackersBehind(
    state,
    state.currentColor,
    m.to.index,
    m.tokenId,
  );
  const imminent = isPureDanger(danger);
  // Broke the 1–3 window even if some 4–6 heat remains
  if (imminent && !isPureDanger(after)) return true;
  if (after.length === 0) return true;
  // Still a save if we leave worse heat (closer attacker) for farther heat
  const beforeMin = Math.min(...danger);
  const afterMin = after.length ? Math.min(...after) : 99;
  if (afterMin > beforeMin) return true;
  return false;
}

/** Own track pin currently in an opponent’s 1–6 (esp. 1–3) window. */
export function threatenedOwnTokens(
  state: GameState,
  color: ColorId,
): { tokenId: string; distances: number[]; pure: boolean }[] {
  const out: { tokenId: string; distances: number[]; pure: boolean }[] = [];
  for (const t of state.tokens) {
    if (t.color !== color || t.state.kind !== 'track') continue;
    if (isSafeSquare(t.state.index)) continue;
    const distances = attackersBehind(state, color, t.state.index);
    if (!distances.length) continue;
    out.push({
      tokenId: t.id,
      distances,
      pure: isPureDanger(distances),
    });
  }
  return out;
}

export function landsSafe(m: LegalMove): boolean {
  if (m.to.kind !== 'track') return true;
  return isSafeSquare(m.to.index);
}

export function formsBlock(
  m: LegalMove,
  state: GameState,
): boolean {
  if (m.to.kind !== 'track') return false;
  const toIndex = m.to.index;
  return (
    state.tokens.filter(
      (t) =>
        t.id !== m.tokenId &&
        t.color === state.currentColor &&
        t.state.kind === 'track' &&
        t.state.index === toIndex,
    ).length >= 1
  );
}

export function isDumpLanding(m: LegalMove, state: GameState): boolean {
  if (m.captures || m.finishes || m.entersBoard) return false;
  if (m.to.kind !== 'track' || isSafeSquare(m.to.index)) return false;
  if (formsBlock(m, state)) return false;
  return attackersBehind(state, state.currentColor, m.to.index, m.tokenId).some(
    (d) => d <= 3,
  );
}

/**
 * Root candidate filter — gut-feel tiers shared by normal / hard / extreme.
 * finish → capture → escape threatened pin → home → safe/block → rest
 * Never open a new pin while a runner can flee pure danger.
 */
export function tacticalPool(moves: LegalMove[], state: GameState): LegalMove[] {
  const finish = moves.filter((m) => m.finishes);
  if (finish.length) return finish;

  const caps = moves.filter((m) => m.captures);
  if (caps.length) return caps;

  const escapes = moves.filter((m) => isEscapeMove(m, state));
  if (escapes.length) return escapes;

  // Threatened pin can move (even if landing isn’t a perfect “escape”) — prefer
  // running that pin over opening from yard on a 6.
  const threatened = threatenedOwnTokens(state, state.currentColor);
  if (threatened.length) {
    const pureIds = new Set(
      threatened.filter((t) => t.pure).map((t) => t.tokenId),
    );
    const anyIds = new Set(threatened.map((t) => t.tokenId));
    const runPure = moves.filter(
      (m) => pureIds.has(m.tokenId) && !m.entersBoard,
    );
    if (runPure.length) {
      const nonDump = runPure.filter((m) => !isDumpLanding(m, state));
      return nonDump.length ? nonDump : runPure;
    }
    const runAny = moves.filter(
      (m) => anyIds.has(m.tokenId) && !m.entersBoard,
    );
    if (runAny.length) {
      const nonDump = runAny.filter((m) => !isDumpLanding(m, state));
      return nonDump.length ? nonDump : runAny;
    }
  }

  const intoHome = moves.filter(
    (m) =>
      m.to.kind === 'homeColumn' ||
      (m.from.kind === 'homeColumn' && m.to.kind !== 'yard'),
  );
  if (intoHome.length) {
    const entering = intoHome.filter((m) => m.from.kind === 'track');
    return entering.length ? entering : intoHome;
  }

  const onBoardMoves = moves.filter((m) => !m.entersBoard);
  if (onBoardMoves.length) {
    const safeish = onBoardMoves.filter((m) => !isDumpLanding(m, state));
    if (safeish.length) {
      const preferSafe = safeish.filter(
        (m) => landsSafe(m) || formsBlock(m, state),
      );
      return preferSafe.length ? preferSafe : safeish;
    }
    const opens = moves.filter((m) => m.entersBoard);
    if (opens.length) return opens;
    return onBoardMoves;
  }

  const safeLand = moves.filter(
    (m) => m.entersBoard || landsSafe(m) || formsBlock(m, state),
  );
  if (safeLand.length) return safeLand;

  return moves;
}

/** Extra score for gut-feel ranking inside a tier. */
export function gutFeelBonus(m: LegalMove, state: GameState): number {
  const color = state.currentColor;
  let s = 0;

  if (isEscapeMove(m, state) && m.from.kind === 'track') {
    const danger = attackersBehind(state, color, m.from.index);
    s += isPureDanger(danger) ? 220 : 140;
  }

  // Opening while a runner sits in the kill window is almost always wrong
  if (m.entersBoard) {
    const threatened = threatenedOwnTokens(state, color);
    if (threatened.some((t) => t.pure)) s -= 280;
    else if (threatened.length) s -= 160;

    const active = state.tokens.filter(
      (t) =>
        t.color === color &&
        t.state.kind !== 'yard' &&
        t.state.kind !== 'finished',
    ).length;
    const need = tokensToWin(state.mode);
    const finiteNeed = Number.isFinite(need) ? need : 4;
    if (active === 0) s += 70;
    else if (active >= finiteNeed) s -= 55;
    else s += 6;
  }

  // Prefer moving the pin that’s actually hot
  if (m.from.kind === 'track' && !m.entersBoard) {
    const d = attackersBehind(state, color, m.from.index);
    if (isPureDanger(d)) s += 90;
    else if (d.length) s += 40;
  }

  s += (progressScore(color, m.to) - progressScore(color, m.from)) * 2.2;
  return s;
}
