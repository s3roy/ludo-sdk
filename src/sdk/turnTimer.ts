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
 * Controllable per-turn clock drawn as a rounded rect matching the dice dock.
 * All fields optional — merge with defaults via `normalizeTurnTimer`.
 */
export type TurnTimerConfig = {
  /** Master switch. Default `false`. */
  enabled?: boolean;
  /** Full countdown length. Default `15000`. */
  durationMs?: number;
  /**
   * Who shows the timer UI. Default `'all'` (you + opponents).
   * Timeout skip/auto still only enforces for interactive seats.
   */
  appliesTo?: TurnTimerAppliesTo;
  /** Draw border around dice dock. Default `true`. */
  showRing?: boolean;
  /**
   * Built-in timeout behaviour when `onTurnTimeout` does not override.
   * Default `'auto'` offline (roll + pick a pin), `'none'` when `controlled`.
   * Only applied to interactive (your) seats.
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
  appliesTo: 'all',
  showRing: true,
  onTimeout: 'auto',
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
      onTimeout: controlled ? 'none' : 'auto',
    };
  }
  return {
    enabled: input.enabled ?? false,
    durationMs: Math.max(1000, Math.floor(input.durationMs ?? 15_000)),
    appliesTo: input.appliesTo ?? 'all',
    showRing: input.showRing !== false,
    onTimeout: input.onTimeout ?? (controlled ? 'none' : 'auto'),
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

/**
 * Rounded-rect path matching the dice dock (64×64, rx=16) inset in 76 viewBox.
 * Perimeter used for stroke-dasharray countdown.
 */
export const TIMER_BOX = {
  x: 6,
  y: 6,
  w: 64,
  h: 64,
  rx: 16,
} as const;

/** Perimeter of rounded rect: 2*(w+h−4r) + 2πr */
export const TIMER_RING_C =
  2 * (TIMER_BOX.w + TIMER_BOX.h - 4 * TIMER_BOX.rx) + 2 * Math.PI * TIMER_BOX.rx;

/** Bright blue → danger red (remaining ratio 1 → 0). */
const TIMER_BLUE = { r: 0x07, g: 0x85, b: 0xff }; // #0785FF
const TIMER_BLUE_HI = { r: 0x45, g: 0xb4, b: 0xff }; // #45B4FF
const TIMER_RED = { r: 0xff, g: 0x30, b: 0x3d }; // #FF303D

function mixChan(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function toHex(c: { r: number; g: number; b: number }): string {
  return `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/** Map remaining ratio → stroke HEX (bright blue early, red at the end). */
export function timerStrokeForRatio(ratio: number): string {
  const r = Math.min(1, Math.max(0, ratio));
  if (r > 0.35) {
    // Stay clearly blue for most of the clock
    const t = ((1 - r) / 0.65) * 0.25;
    return toHex({
      r: mixChan(TIMER_BLUE.r, TIMER_BLUE_HI.r, t),
      g: mixChan(TIMER_BLUE.g, TIMER_BLUE_HI.g, t),
      b: mixChan(TIMER_BLUE.b, TIMER_BLUE_HI.b, t),
    });
  }
  // Final 35%: blue → red
  let t = 1 - r / 0.35;
  t = t * t;
  return toHex({
    r: mixChan(TIMER_BLUE.r, TIMER_RED.r, t),
    g: mixChan(TIMER_BLUE.g, TIMER_RED.g, t),
    b: mixChan(TIMER_BLUE.b, TIMER_RED.b, t),
  });
}

export function timerRingMarkup(): string {
  const { x, y, w, h, rx } = TIMER_BOX;
  return `<svg class="ludo-sdk__timer-ring" viewBox="0 0 76 76" aria-hidden="true" focusable="false">
    <rect class="ludo-sdk__timer-track" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="none"/>
    <rect class="ludo-sdk__timer-progress" data-ludo-timer-progress
      x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}" fill="none"
      stroke-dasharray="${TIMER_RING_C}" stroke-dashoffset="0"
      pathLength="${TIMER_RING_C}"/>
  </svg>`;
}

export function setTimerRingProgress(
  ringHost: HTMLElement | null,
  ratio: number,
  active: boolean,
) {
  if (!ringHost) return;
  const wrap = ringHost.closest(
    '.ludo-sdk__dice-wrap, .ludo-sdk__hud-shell',
  ) as HTMLElement | null;
  const isHud = !!wrap?.classList.contains('ludo-sdk__hud-shell');
  wrap?.classList.toggle('ludo-sdk__dice-wrap--timing', active && !isHud);
  wrap?.classList.toggle('ludo-sdk__hud-shell--timing', active && isHud);
  const r = Math.min(1, Math.max(0, ratio));
  const urgency = 1 - r;
  // Bright blue → red countdown (gold track alone looked like "no timer")
  const stroke = timerStrokeForRatio(r);
  if (wrap) {
    wrap.style.setProperty('--timer-urgency', urgency.toFixed(3));
    // Idle HUD keeps gold so the track reads as a permanent border
    wrap.style.setProperty(
      '--timer-stroke',
      active ? stroke : isHud ? '#e8c84a' : 'transparent',
    );
    wrap.classList.toggle('ludo-sdk__dice-wrap--urgent', active && !isHud && r <= 0.35);
    wrap.classList.toggle('ludo-sdk__dice-wrap--critical', active && !isHud && r <= 0.15);
    wrap.classList.toggle('ludo-sdk__hud-shell--urgent', active && isHud && r <= 0.35);
    wrap.classList.toggle('ludo-sdk__hud-shell--critical', active && isHud && r <= 0.15);
  }
  const progress = ringHost.querySelector<SVGRectElement>(
    '[data-ludo-timer-progress]',
  );
  if (!progress) return;
  const len = Number(progress.getAttribute('pathLength') || TIMER_RING_C);
  // pathLength normalizes dash so countdown is even around the rounded box
  progress.style.strokeDasharray = String(len);
  // Idle: full path under the track (hidden) so the next turn starts complete
  progress.style.strokeDashoffset = String(active ? len * (1 - r) : 0);
  progress.style.opacity = active ? '1' : '0';
  progress.style.stroke = active ? stroke : '';
  // Track is always the visible border — never hide it from JS
  const track = ringHost.querySelector<SVGRectElement>('.ludo-sdk__timer-track');
  if (track) track.style.opacity = '1';
}

/**
 * Rounded timer ring for King HUD — viewBox matches the 96×48 shell + pad
 * so the stroke stays a true border around the gold card (not stretched).
 */
export function hudTimerRingMarkup(): string {
  // Shell is 96×48; 3px pad each side for the countdown stroke outside the card
  const w = 96;
  const h = 48;
  const pad = 1.5;
  const rx = 9; // matches ~8px card radius + pad
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const len = Math.round(
    2 * (iw + ih - 4 * rx) + 2 * Math.PI * rx,
  );
  // preserveAspectRatio=none: shell size is dynamic (clamp height) — "meet"
  // letterboxes and misaligns the gold border (ghost/double edges in Safari).
  return `<svg class="ludo-sdk__timer-ring ludo-sdk__timer-ring--hud" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <rect class="ludo-sdk__timer-track" x="${pad}" y="${pad}" width="${iw}" height="${ih}" rx="${rx}" ry="${rx}" fill="none"/>
    <rect class="ludo-sdk__timer-progress" data-ludo-timer-progress
      x="${pad}" y="${pad}" width="${iw}" height="${ih}" rx="${rx}" ry="${rx}" fill="none"
      stroke-dasharray="${len}" stroke-dashoffset="0"
      pathLength="${len}"/>
  </svg>`;
}
