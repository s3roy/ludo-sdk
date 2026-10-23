import type { TurnTimerAutoAction } from '../sdk/turnTimer';

/**
 * Backend-owned rules set when a room / match table is created.
 * Clients never choose these — push them at `createRoom` / `openTable`.
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
   * `0` = never convert. Default `3`.
   */
  maxAutoTurns?: number;
  /**
   * Human leaves mid-match:
   * - `convert_ai` — seat becomes AI (default)
   * - `forfeit` — mark disconnected; room may end if no humans left
   * - `destroy_if_empty` — destroy room when last human leaves
   */
  onLeave?: 'convert_ai' | 'forfeit' | 'destroy_if_empty';
};

export type NormalizedRoomPolicy = {
  turnDurationMs: number | false;
  onTurnTimeout: 'skip' | 'auto';
  maxAutoTurns: number;
  onLeave: 'convert_ai' | 'forfeit' | 'destroy_if_empty';
};

export const DEFAULT_ROOM_POLICY: NormalizedRoomPolicy = {
  turnDurationMs: 15_000,
  onTurnTimeout: 'auto',
  maxAutoTurns: 3,
  onLeave: 'convert_ai',
};

export function normalizeRoomPolicy(
  input?: RoomLifecyclePolicy | null,
): NormalizedRoomPolicy {
  if (!input) return { ...DEFAULT_ROOM_POLICY };
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
    onLeave: input.onLeave ?? DEFAULT_ROOM_POLICY.onLeave,
  };
}
