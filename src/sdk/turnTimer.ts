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

/** Circumference for r=32 in the 72×72 ring viewBox (outer line). */
export const TIMER_RING_C = 2 * Math.PI * 32;

/** Deep navy → danger red (remaining ratio 1 → 0). */
const TIMER_DEEP = { r: 0x10, g: 0x26, b: 0x4a }; // #10264A
const TIMER_MID = { r: 0x07, g: 0x85, b: 0xff }; // #0785FF
const TIMER_RED = { r: 0xff, g: 0x30, b: 0x3d }; // #FF303D

function mixChan(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

/** Map remaining ratio → stroke HEX (deep early, red in the final stretch). */
export function timerStrokeForRatio(ratio: number): string {
  const r = Math.min(1, Math.max(0, ratio));
  // Hold deep/blue until ~40% left, then ramp hard into red
  let t: number;
  if (r > 0.4) {
    t = (1 - r) / 0.6; // 0 → ~1 across the first 60% of the clock
    t = t * 0.35; // stay mostly deep/blue
    const c = {
      r: mixChan(TIMER_DEEP.r, TIMER_MID.r, t),
      g: mixChan(TIMER_DEEP.g, TIMER_MID.g, t),
      b: mixChan(TIMER_DEEP.b, TIMER_MID.b, t),
    };
    return `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }
  // Final 40%: blue → red
  t = 1 - r / 0.4;
  // Ease-in so the last moments read urgently red
  t = t * t;
  const c = {
    r: mixChan(TIMER_MID.r, TIMER_RED.r, t),
    g: mixChan(TIMER_MID.g, TIMER_RED.g, t),
    b: mixChan(TIMER_MID.b, TIMER_RED.b, t),
  };
  return `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

export function timerRingMarkup(): string {
  return `<svg class="ludo-sdk__timer-ring" viewBox="0 0 72 72" aria-hidden="true" focusable="false">
    <circle class="ludo-sdk__timer-outer" cx="36" cy="36" r="33.5" fill="none"/>
    <circle class="ludo-sdk__timer-track" cx="36" cy="36" r="32" fill="none"/>
    <circle class="ludo-sdk__timer-progress" data-ludo-timer-progress cx="36" cy="36" r="32" fill="none"
      stroke-dasharray="${TIMER_RING_C}" stroke-dashoffset="0"/>
  </svg>`;
}

export function setTimerRingProgress(
  ringHost: HTMLElement | null,
  ratio: number,
  active: boolean,
) {
  if (!ringHost) return;
  const wrap = ringHost.closest('.ludo-sdk__dice-wrap') as HTMLElement | null;
  wrap?.classList.toggle('ludo-sdk__dice-wrap--timing', active);
  const r = Math.min(1, Math.max(0, ratio));
  const urgency = 1 - r; // 0 fresh → 1 empty
  if (wrap) {
    wrap.style.setProperty('--timer-urgency', urgency.toFixed(3));
    wrap.classList.toggle('ludo-sdk__dice-wrap--urgent', active && r <= 0.35);
    wrap.classList.toggle('ludo-sdk__dice-wrap--critical', active && r <= 0.15);
  }
  const progress = ringHost.querySelector<SVGCircleElement>(
    '[data-ludo-timer-progress]',
  );
  if (!progress) return;
  progress.style.strokeDashoffset = String(TIMER_RING_C * (1 - r));
  progress.style.opacity = active ? '1' : '0';
  progress.style.stroke = active ? timerStrokeForRatio(r) : '';
}
