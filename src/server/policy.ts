import type { TurnTimerAutoAction } from '../sdk/turnTimer';

/**
 * Backend-owned rules set when a room / match table is created.
 * Clients pick presets at create; engine legality is unchanged.
 */
export type RoomLifecyclePolicy = {
  /**
   * Server turn clock (ms). `false` disables server timeouts.
   * Clients may still show a decorative ring via room.turnTimer.
   * Default `15000`.
   */
  turnDurationMs?: number | false;
  /**
   * On server timeout: `skip` forfeits the seat; `auto` rolls/moves once via AI.
   * Default `'auto'`.
   */
  onTurnTimeout?: Exclude<TurnTimerAutoAction, 'none'>;
  /**
   * Consecutive missed/auto turns for one seat before converting that seat to AI.
   * `0` = never convert (infinite auto-play when `onTurnTimeout: 'auto'`).
   * Default `3`.
   */
  maxAutoTurns?: number;
  /**
   * Human leaves mid-match:
   * - `hold` — keep seat (`disconnected`); can rejoin; misses count toward maxAutoTurns
   * - `convert_ai` — seat becomes AI immediately (cannot reclaim)
   * - `forfeit` — mark disconnected; room may end if no humans left
   * - `destroy_if_empty` — destroy room when last human leaves
   */
  onLeave?: 'hold' | 'convert_ai' | 'forfeit' | 'destroy_if_empty';
};

export type NormalizedRoomPolicy = {
  turnDurationMs: number | false;
  onTurnTimeout: 'skip' | 'auto';
  maxAutoTurns: number;
  onLeave: 'hold' | 'convert_ai' | 'forfeit' | 'destroy_if_empty';
};

/** UI / API presets for `maxAutoTurns` + timeout behaviour. */
export type AutoPlayPreset = '0' | '3' | '5' | 'infinite';

export const DEFAULT_ROOM_POLICY: NormalizedRoomPolicy = {
  turnDurationMs: 15_000,
  onTurnTimeout: 'auto',
  maxAutoTurns: 3,
  onLeave: 'hold',
};

/**
 * Map create-room dropdown → policy slice.
 * - `0` — no auto-play; timeout **skips** the turn
 * - `3` / `5` — auto-play that many misses, then seat → bot
 * - `infinite` — auto-play forever (never convert for misses)
 */
export function policyFromAutoPlayPreset(
  preset: AutoPlayPreset | string | number,
): Pick<RoomLifecyclePolicy, 'onTurnTimeout' | 'maxAutoTurns'> {
  const key = String(preset);
  if (key === '0' || key === 'none' || key === 'skip') {
    return { onTurnTimeout: 'skip', maxAutoTurns: 0 };
  }
  if (key === 'infinite' || key === 'inf' || key === '-1') {
    return { onTurnTimeout: 'auto', maxAutoTurns: 0 };
  }
  const n = Math.max(0, Math.floor(Number(key)));
  if (n === 0) return { onTurnTimeout: 'skip', maxAutoTurns: 0 };
  return { onTurnTimeout: 'auto', maxAutoTurns: n };
}

export function normalizeRoomPolicy(
  input?: RoomLifecyclePolicy | null,
): NormalizedRoomPolicy {
  if (!input) return { ...DEFAULT_ROOM_POLICY };
  const onLeave = input.onLeave ?? DEFAULT_ROOM_POLICY.onLeave;
  return {
    turnDurationMs:
      input.turnDurationMs === false
        ? false
        : Math.max(
            1000,
            Math.floor(
              input.turnDurationMs ??
                (DEFAULT_ROOM_POLICY.turnDurationMs || 15_000),
            ),
          ),
    onTurnTimeout: input.onTurnTimeout === 'skip' ? 'skip' : 'auto',
    maxAutoTurns: Math.max(
      0,
      Math.floor(input.maxAutoTurns ?? DEFAULT_ROOM_POLICY.maxAutoTurns),
    ),
    onLeave:
      onLeave === 'convert_ai' ||
      onLeave === 'forfeit' ||
      onLeave === 'destroy_if_empty' ||
      onLeave === 'hold'
        ? onLeave
        : DEFAULT_ROOM_POLICY.onLeave,
  };
}
