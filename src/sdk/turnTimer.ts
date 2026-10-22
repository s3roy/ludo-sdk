import type { ColorId, GamePhase, GameState } from '../core/types';

/** What the SDK does after a seat misses the clock. */
export type TurnTimerAutoAction =
  /** Fire callbacks only — host / app decides. */
  | 'none'
  /** Forfeit: skip this seat and advance turn. */
  | 'skip'
  /** Auto-roll / auto-pick a legal move (uses AI difficulty). */
  | 'auto';

export type TurnTimerAppliesTo =
  | 'interactive'
  | 'human'
  | 'all'
  | ColorId[];

export type TurnTimeoutContext = {
  color: ColorId;
  phase: 'waiting_roll' | 'waiting_move';
  turnId: number;
  durationMs: number;
  state: GameState;
};

export type TurnTimerTickContext = {
  color: ColorId;
  phase: GamePhase;
  turnId: number;
  remainingMs: number;
  durationMs: number;
  ratio: number;
};

/**
 * Controllable per-turn clock shown as a ring around the dice.
 * All fields optional — merge with defaults via `normalizeTurnTimer`.
 */
export type TurnTimerConfig = {
  /** Master switch. Default `false`. */
  enabled?: boolean;
  /** Full countdown length. Default `15000`. */
  durationMs?: number;
  /** Who is timed. Default `'interactive'`. */
  appliesTo?: TurnTimerAppliesTo;
  /** Draw SVG ring around dice dock. Default `true`. */
  showRing?: boolean;
  /**
   * Built-in timeout behaviour when `onTurnTimeout` does not override.
   * Default `'skip'` offline, `'none'` when `controlled`.
   */
  onTimeout?: TurnTimerAutoAction;
  /** Freeze the clock during move/dice animations. Default `true`. */
  pauseWhileBusy?: boolean;
};

export type TurnTimerSnapshot = {
  enabled: boolean;
  running: boolean;
  paused: boolean;
  remainingMs: number;
  durationMs: number;
  ratio: number;
  color: ColorId | null;
  turnId: number | null;
};

export const DEFAULT_TURN_TIMER: Required<
  Pick<
    TurnTimerConfig,
    | 'enabled'
    | 'durationMs'
    | 'appliesTo'
    | 'showRing'
    | 'onTimeout'
    | 'pauseWhileBusy'
  >
> = {
  enabled: false,
  durationMs: 15_000,
  appliesTo: 'interactive',
  showRing: true,
  onTimeout: 'skip',
  pauseWhileBusy: true,
};

export function normalizeTurnTimer(
  input?: TurnTimerConfig | false | null,
  controlled = false,
): Required<
  Pick<
    TurnTimerConfig,
    | 'enabled'
    | 'durationMs'
    | 'appliesTo'
    | 'showRing'
    | 'onTimeout'
    | 'pauseWhileBusy'
  >
> {
  if (input === false || input == null) {
    return {
      ...DEFAULT_TURN_TIMER,
      enabled: false,
      onTimeout: controlled ? 'none' : 'skip',
    };
  }
  return {
    enabled: input.enabled ?? false,
    durationMs: Math.max(1000, Math.floor(input.durationMs ?? 15_000)),
    appliesTo: input.appliesTo ?? 'interactive',
    showRing: input.showRing !== false,
    onTimeout:
      input.onTimeout ?? (controlled ? 'none' : 'skip'),
    pauseWhileBusy: input.pauseWhileBusy !== false,
  };
}

export function timerAppliesToSeat(
  appliesTo: TurnTimerAppliesTo,
  color: ColorId,
  opts: {
    interactive: Set<ColorId>;
    kind: 'human' | 'ai' | string;
  },
): boolean {
  if (Array.isArray(appliesTo)) return appliesTo.includes(color);
  if (appliesTo === 'all') return true;
  if (appliesTo === 'interactive') return opts.interactive.has(color);
  if (appliesTo === 'human') return opts.kind === 'human';
  return false;
}

/** Circumference for r=30 in the 72×72 ring viewBox. */
export const TIMER_RING_C = 2 * Math.PI * 30;

export function timerRingMarkup(): string {
  return `<svg class="ludo-sdk__timer-ring" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
    <circle class="ludo-sdk__timer-track" cx="36" cy="36" r="30" fill="none"/>
    <circle class="ludo-sdk__timer-progress" data-ludo-timer-progress cx="36" cy="36" r="30" fill="none"
      stroke-dasharray="${TIMER_RING_C}" stroke-dashoffset="0"/>
  </svg>`;
}

export function setTimerRingProgress(
  ringHost: HTMLElement | null,
  ratio: number,
  active: boolean,
) {
  if (!ringHost) return;
  const wrap = ringHost.closest('.ludo-sdk__dice-wrap');
  wrap?.classList.toggle('ludo-sdk__dice-wrap--timing', active);
  const progress = ringHost.querySelector<SVGCircleElement>(
    '[data-ludo-timer-progress]',
  );
  if (!progress) return;
  const r = Math.min(1, Math.max(0, ratio));
  progress.style.strokeDashoffset = String(TIMER_RING_C * (1 - r));
  progress.style.opacity = active ? '1' : '0';
}
