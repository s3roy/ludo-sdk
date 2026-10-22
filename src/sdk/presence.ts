import type { ColorId, PlayerConfig, SeatPresence } from '../core/types';

/** Seat counts as in-game (timer + normal turns). */
export function isSeatPresent(presence: SeatPresence | undefined, kind: string): boolean {
  const p = presence ?? (kind === 'ai' ? 'ready' : 'joined');
  return p === 'joined' || p === 'ready';
}

/** Seat is still in the join queue / not playable. */
export function isSeatAwaiting(presence: SeatPresence | undefined): boolean {
  const p = presence ?? 'joined';
  return p === 'empty' || p === 'joining';
}

export function isSeatAbsent(presence: SeatPresence | undefined, kind: string): boolean {
  return !isSeatPresent(presence, kind);
}

export function normalizePresence(
  player: PlayerConfig,
): SeatPresence {
  if (player.presence) return player.presence;
  return player.kind === 'ai' ? 'ready' : 'joined';
}

export function presenceLabel(presence: SeatPresence): string {
  switch (presence) {
    case 'empty':
      return 'Open';
    case 'joining':
      return 'Joining…';
    case 'joined':
      return 'Joined';
    case 'ready':
      return 'Ready';
    case 'disconnected':
      return 'Away';
    default:
      return '';
  }
}

/** What to do when the current seat is empty / disconnected. */
export type AbsentSeatAction = 'skip' | 'auto' | 'none';

export type AbsentSeatConfig = {
  /** Default `skip`. */
  action?: AbsentSeatAction;
  /** Delay before acting so the UI can show the seat. Default `400`. */
  delayMs?: number;
};

export function withPresence(
  players: PlayerConfig[],
  color: ColorId,
  presence: SeatPresence,
  patch?: Partial<Pick<PlayerConfig, 'name' | 'id' | 'kind'>>,
): PlayerConfig[] {
  return players.map((p) =>
    p.color === color
      ? { ...p, ...patch, presence }
      : p,
  );
}
