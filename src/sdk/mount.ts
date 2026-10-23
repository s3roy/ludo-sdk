import {
  chooseAiMove,
  currentPlayerIsAi,
  playAiSeatOnce,
  playAiStep,
  type AiDifficulty,
} from '../core/ai';
import { LudoSounds, type SoundOptions } from '../audio/sounds';
import { COLOR_NAMES, seatColorsForCount, tokensToWin } from '../core/constants';
import { createGame, LudoGame } from '../core/game';
import type {
  ColorId,
  GameEvent,
  GameMode,
  GameState,
  PlayerConfig,
  PlayerKind,
  SeatPresence,
} from '../core/types';
import { animateDiceRoll, diceFaceHtml } from '../ui/dice';
import {
  flashCapture,
  renderBoardBase,
  statusText,
  syncTokens,
} from '../ui/render';
import {
  BOARD_CORNERS,
  boardRotationDeg,
  visualCornerForColor,
} from '../ui/boardFacing';
import {
  applyThemeToElement,
  getTheme,
  type LudoThemeId,
  type ThemePalette,
} from '../ui/themes';
import { animateLegalMove } from '../ui/tokenAnim';
import {
  offlineRoom,
  roomToMountPlayers,
  type ActionContext,
  type ActionResult,
  type LudoClientAction,
  type LudoHostCommand,
  type LudoRoomConfig,
} from './room';
import type {
  DestroyContext,
  LegalMovesContext,
  LudoLifecycleCallbacks,
  RoomDestroyReason,
  TurnChangeContext,
  WinContext,
} from './lifecycle';
import {
  isSeatAbsent,
  normalizePresence,
  presenceLabel,
  withPresence,
  type AbsentSeatConfig,
} from './presence';
import {
  hudTimerRingMarkup,
  normalizeTurnTimer,
  setTimerRingProgress,
  timerAppliesToSeat,
  timerRingMarkup,
  type TurnTimerAutoAction,
  type TurnTimerConfig,
  type TurnTimerSnapshot,
  type TurnTimerTickContext,
  type TurnTimeoutContext,
} from './turnTimer';
import '../ui/styles.css';

export type {
  TurnTimerAutoAction,
  TurnTimerConfig,
  TurnTimerSnapshot,
  TurnTimerTickContext,
  TurnTimeoutContext,
} from './turnTimer';
export type { AbsentSeatConfig, AbsentSeatAction } from './presence';
export type {
  RoomDestroyReason,
  TurnChangeContext,
  WinContext,
  DestroyContext,
  LegalMovesContext,
  PresenceChangeContext,
  LudoLifecycleCallbacks,
} from './lifecycle';

export type LudoMountOptions = LudoLifecycleCallbacks & {
  mode?: GameMode;
  players?: number;
  /** Full seat list (overrides `players` + `aiColors`). */
  seats?: PlayerConfig[];
  aiColors?: ColorId[];
  aiDifficulty?: AiDifficulty;
  autoAi?: boolean;
  aiDelayMs?: number;
  sound?: boolean | SoundOptions;
  /** Colors this client can operate. Default: non-AI seats. */
  interactiveColors?: ColorId[];
  /**
   * Host-authoritative mode: UI emits `onAction` and waits for
   * `applyDice` / `applyMove` / `syncState` from your backend.
   */
  controlled?: boolean;
  /** Optional room id stamped on client actions. */
  roomId?: string;
  /** Compact chrome (default true). */
  compact?: boolean;
  /** Show seat strip under board (default true). */
  showPlayers?: boolean;
  /**
   * Controllable turn clock (ring around dice).
   * Pass `false` to force off. See `TurnTimerConfig`.
   */
  turnTimer?: TurnTimerConfig | false;
  /**
   * When the current seat is `empty` / `joining` / `disconnected`,
   * auto skip or AI-fill (default `{ action: 'skip', delayMs: 400 }`).
   * Set `action: 'none'` if the host will decide.
   */
  absentSeat?: AbsentSeatConfig;
  /** Visual theme (client-only cosmetics). */
  theme?: LudoThemeId | string;
  /**
   * Rotate the board so this color’s yard is always bottom-left (Ludo King).
   * Default: first interactive color. Pass `false` to keep red fixed at BL.
   */
  boardFacing?: ColorId | false;
  onEvent?: (event: GameEvent, state: GameState) => void;
  /** @deprecated Prefer `onPresenceChange`. */
  onPresence?: (
    color: ColorId,
    presence: SeatPresence,
    state: GameState,
  ) => void;
  onChange?: (state: GameState) => void;
  /** Called before local apply when user rolls/moves. */
  onAction?: (
    action: LudoClientAction,
    ctx: ActionContext,
  ) => ActionResult | Promise<ActionResult>;
  /**
   * Seat ran out of time. Return an action to override `turnTimer.onTimeout`,
   * or void to use the config default.
   */
  onTurnTimeout?: (
    ctx: TurnTimeoutContext,
  ) =>
    | void
    | TurnTimerAutoAction
    | Promise<void | TurnTimerAutoAction>;
  /** Fires while the clock runs (for custom UI). */
  onTurnTick?: (ctx: TurnTimerTickContext) => void;
  onReady?: (handle: LudoHandle) => void;
  /** Fired when user taps Play again on the win overlay (offline rematch). */
  onRematch?: () => void;
  /** Hide built-in win overlay (default false). */
  hideWinOverlay?: boolean;
};

export type LudoHandle = {
  game: LudoGame;
  getState: () => GameState;
  /** Current seat colour. */
  whoseTurn: () => ColorId | null;
  /** True when an interactive seat must act now. */
  isMyTurn: () => boolean;
  roll: () => void;
  move: (tokenId: string) => void;
  /** Forfeit current seat (same as timer skip). */
  forfeitTurn: () => boolean;
  /** Apply host dice (controlled rooms). */
  applyDice: (value: number) => number | null;
  /** Apply host move (controlled rooms). */
  applyMove: (tokenId: string) => boolean;
  /** Full state sync from backend. */
  syncState: (state: GameState, event?: GameEvent | null) => void;
  /** Push a host command. */
  dispatch: (cmd: LudoHostCommand) => void;
  setMode: (mode: GameMode) => void;
  setAiDifficulty: (d: AiDifficulty) => void;
  setAutoAi: (on: boolean) => void;
  setInteractiveColors: (colors: ColorId[]) => void;
  setTheme: (theme: LudoThemeId | string) => void;
  getTheme: () => ThemePalette;
  /** Rotate board so this color is bottom-left (`false` = red fixed). */
  setBoardFacing: (color: ColorId | false) => void;
  /** Merge / replace timer settings (`false` disables). */
  setTurnTimer: (cfg: TurnTimerConfig | false) => void;
  pauseTurnTimer: () => void;
  resumeTurnTimer: () => void;
  /** Restart countdown for the current seat (if applicable). */
  resetTurnTimer: () => void;
  getTurnTimer: () => TurnTimerSnapshot;
  /** Update one seat’s join / queue status. */
  setSeatPresence: (
    color: ColorId,
    presence: SeatPresence,
    patch?: Partial<Pick<PlayerConfig, 'name' | 'id' | 'kind'>>,
  ) => void;
  /** Replace full seat list (lobby sync). */
  setSeats: (seats: PlayerConfig[]) => void;
  getSeats: () => PlayerConfig[];
  /** True when every non-AI seat is `joined` or `ready`. */
  allHumansPresent: () => boolean;
  /**
   * End the room session: stop timers, fire `onDestroy`, tear down UI.
   * In controlled mode also emits `onAction({ type: 'destroy' })` when `notifyHost`.
   */
  destroyRoom: (reason?: RoomDestroyReason, notifyHost?: boolean) => void;
  /** True after `destroy` / `destroyRoom`. */
  isDestroyed: () => boolean;
  reset: (opts?: LudoMountOptions) => void;
  /** Alias of `destroyRoom('client')` without host notify. */
  destroy: () => void;
  setSoundEnabled: (on: boolean) => void;
  sounds: LudoSounds;
  roomId?: string;
};

/** One continuous tumble (was 1800 with a 2nd “land spin” that felt like a double roll) */
const ROLL_MS = 1100;

function buildPlayers(count: number, humanColor: ColorId): PlayerConfig[] {
  // 2p = diagonal opposites; 3p = human + 2 clockwise; 4p = all
  return seatColorsForCount(count, humanColor).map((color) => {
    const name = COLOR_NAMES[color];
    const kind: PlayerKind = color === humanColor ? 'human' : 'ai';
    return {
      id: `p-${name}`,
      name: name[0].toUpperCase() + name.slice(1),
      kind,
      color,
    };
  });
}

function resolveSeats(opts: LudoMountOptions): PlayerConfig[] {
  if (opts.seats?.length) return opts.seats.slice(0, 4);
  const count = opts.players ?? 4;
  const human = opts.interactiveColors?.[0] ?? (0 as ColorId);
  return buildPlayers(count, human);
}

export function mountLudo(
  el: string | HTMLElement,
  options: LudoMountOptions = {},
): LudoHandle {
  const found =
    typeof el === 'string' ? document.querySelector<HTMLElement>(el) : el;
  if (!found) throw new Error('[ludo-sdk] mount target not found');
  const root: HTMLElement = found;

  let opts: LudoMountOptions = {
    compact: true,
    showPlayers: true,
    autoAi: true,
    ...options,
  };
  let interactive = new Set<ColorId>(
    opts.interactiveColors ??
      resolveSeats(opts)
        .filter((p) => p.kind === 'human')
        .map((p) => p.color),
  );

  let game = makeGame(opts);
  let unsub: (() => void) | null = null;
  let aiTimer: ReturnType<typeof setTimeout> | null = null;
  let absentTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  let busy = false;
  let boardReady = false;
  /** Serializes dice / move animations so they never overlap. */
  let queue: Promise<void> = Promise.resolve();
  let previousTurnColor: ColorId | null = null;
  let lastLegalKey = '';

  let timerCfg = normalizeTurnTimer(opts.turnTimer, !!opts.controlled);
  let absentCfg: Required<AbsentSeatConfig> = {
    action: opts.absentSeat?.action ?? (opts.controlled ? 'none' : 'skip'),
    delayMs: opts.absentSeat?.delayMs ?? 400,
  };
  let timerRaf = 0;
  let timerStartedAt = 0;
  let timerPausedAt: number | null = null;
  let timerAccumPaused = 0;
  let timerManualPause = false;
  let timerTurnId: number | null = null;
  let timerColor: ColorId | null = null;
  let timerDuration = timerCfg.durationMs;
  let timerFiring = false;
  let theme = getTheme(opts.theme);

  const soundOpts: SoundOptions =
    opts.sound === false
      ? { enabled: false }
      : typeof opts.sound === 'object'
        ? opts.sound
        : { enabled: true };
  const sounds = new LudoSounds(soundOpts);

  root.classList.add('ludo-sdk');
  if (opts.compact !== false) root.classList.add('ludo-sdk--compact');
  root.innerHTML = shellHtml(opts.mode ?? 'rush', opts.showPlayers !== false);
  applyThemeToElement(root, theme);

  const boardWrap = root.querySelector<HTMLElement>('[data-ludo-board]')!;
  const statusEl = root.querySelector<HTMLElement>('[data-ludo-status]')!;
  const diceHost = root.querySelector<HTMLElement>('[data-ludo-dice-host]')!;
  const diceWrap = root.querySelector<HTMLElement>('[data-ludo-dice-wrap]')!;
  const controlsEl = root.querySelector<HTMLElement>('[data-ludo-controls]')!;
  const playersEl = root.querySelector<HTMLElement>('[data-ludo-players]');
  const rollBtn = root.querySelector<HTMLButtonElement>('[data-ludo-roll]')!;
  const soundBtn = root.querySelector<HTMLButtonElement>('[data-ludo-sound]')!;
  const modeEl = root.querySelector<HTMLElement>('[data-ludo-mode]')!;
  const winEl = root.querySelector<HTMLElement>('[data-ludo-win]')!;
  const winTitle = root.querySelector<HTMLElement>('[data-ludo-win-title]')!;
  const winSub = root.querySelector<HTMLElement>('[data-ludo-win-sub]')!;
  const winRanking = root.querySelector<HTMLOListElement>('[data-ludo-win-ranking]')!;
  const rematchBtn = root.querySelector<HTMLButtonElement>('[data-ludo-rematch]')!;

  /** King: dice lives inside the active HUD tray. Other themes: always in controls. */
  function placeDiceDock(turnColor: ColorId) {
    if (theme.id === 'king') {
      const tray = root.querySelector<HTMLElement>(
        `[data-ludo-hud-tray="${turnColor}"]`,
      );
      if (tray && diceWrap.parentElement !== tray) tray.appendChild(diceWrap);
      return;
    }
    if (diceWrap.parentElement !== controlsEl) {
      controlsEl.insertBefore(diceWrap, rollBtn);
    }
  }

  let winShownFor: ColorId | null = null;

  function hideWinOverlay() {
    winEl.hidden = true;
    winEl.classList.remove('ludo-sdk__win--show');
    winShownFor = null;
  }

  function showWinOverlay(
    winner: ColorId,
    ranking: ColorId[],
    state: GameState,
  ): boolean {
    if (opts.hideWinOverlay) return false;
    if (winShownFor === winner && !winEl.hidden) return false;
    winShownFor = winner;
    const name = COLOR_NAMES[winner];
    const titleName = name[0]!.toUpperCase() + name.slice(1);
    const winnerPlayer = state.players.find((p) => p.color === winner);
    const displayName = winnerPlayer?.name?.trim() || titleName;
    winTitle.textContent = `${displayName} wins!`;
    const mine = canControl(winner);
    winSub.textContent = mine ? 'Victory' : 'Match over';
    const ranks =
      ranking.length > 0
        ? ranking
        : ([
            winner,
            ...state.players.map((p) => p.color).filter((c) => c !== winner),
          ] as ColorId[]);
    winRanking.innerHTML = ranks
      .map((c, i) => {
        const p = state.players.find((x) => x.color === c);
        const n = COLOR_NAMES[c];
        const label = p?.name?.trim() || n[0]!.toUpperCase() + n.slice(1);
        const you = canControl(c) ? ' · you' : '';
        return `<li class="ludo-sdk__win-rank ludo-sdk__win-rank--c${c}">
          <span class="ludo-sdk__win-place">#${i + 1}</span>
          <span class="ludo-sdk__win-swatch" aria-hidden="true"></span>
          <span class="ludo-sdk__win-name">${label}${you}</span>
        </li>`;
      })
      .join('');
    // Offline: Play again. Hosted without onRematch: dismiss only.
    const canRematch = !opts.controlled || !!opts.onRematch;
    rematchBtn.hidden = false;
    rematchBtn.textContent = canRematch ? 'Play again' : 'OK';
    rematchBtn.dataset.mode = canRematch ? 'rematch' : 'dismiss';
    winEl.hidden = false;
    requestAnimationFrame(() => winEl.classList.add('ludo-sdk__win--show'));
    return true;
  }

  rematchBtn.addEventListener('click', () => {
    const mode = rematchBtn.dataset.mode ?? 'rematch';
    hideWinOverlay();
    if (mode === 'dismiss') return;
    if (opts.onRematch) {
      opts.onRematch();
      return;
    }
    if (!opts.controlled) {
      reset(opts);
    }
  });

  function syncSoundBtn() {
    soundBtn.textContent = sounds.isEnabled() ? '🔊' : '🔇';
    soundBtn.title = sounds.isEnabled() ? 'Mute' : 'Unmute';
  }
  syncSoundBtn();

  const unlockOnce = () => {
    void sounds.unlock();
    root.removeEventListener('pointerdown', unlockOnce);
  };
  root.addEventListener('pointerdown', unlockOnce);

  function facingColor(): ColorId {
    if (opts.boardFacing === false) return 0;
    if (typeof opts.boardFacing === 'number') return opts.boardFacing;
    const first = interactive.values().next().value;
    return (first ?? 0) as ColorId;
  }

  /** Keep the local seat at bottom-left; remap King HUD corners to match. */
  function applyBoardFacing() {
    const facing = facingColor();
    const svg = boardWrap.querySelector<SVGSVGElement>('svg.ludo-sdk__board');
    if (svg) {
      svg.style.transformOrigin = '50% 50%';
      svg.style.transform = `rotate(${boardRotationDeg(facing)}deg)`;
      svg.dataset.facing = String(facing);
    }
    boardWrap.dataset.facing = String(facing);
    for (let c = 0; c < 4; c++) {
      const color = c as ColorId;
      const hud = root.querySelector<HTMLElement>(`[data-ludo-hud="${color}"]`);
      if (!hud) continue;
      for (const corner of BOARD_CORNERS) {
        hud.classList.remove(`ludo-sdk__hud--${corner}`);
      }
      hud.classList.add(
        `ludo-sdk__hud--${visualCornerForColor(color, facing)}`,
      );
    }
  }

  function ensureBoard() {
    if (boardReady) return;
    boardWrap.innerHTML =
      renderBoardBase(theme, { facingColor: facingColor() }) +
      `<div class="ludo-sdk__toast" data-ludo-toast></div>`;
    boardReady = true;
    applyBoardFacing();
  }

  function tokensLayer() {
    return boardWrap.querySelector<SVGGElement>('[data-ludo-tokens]')!;
  }
  function fxLayer() {
    return boardWrap.querySelector<SVGGElement>('[data-ludo-fx]')!;
  }
  function toastEl() {
    return boardWrap.querySelector<HTMLElement>('[data-ludo-toast]')!;
  }

  function showToast(msg: string) {
    const t = toastEl();
    if (!t) return;
    t.textContent = msg;
    t.classList.remove('ludo-sdk__toast--show');
    void t.offsetWidth;
    t.classList.add('ludo-sdk__toast--show');
  }

  /** Last landed face — shown while waiting to roll (default 1). */
  let lastDiceFace = 1;

  function setDice(value: number | null, rolling = false) {
    if (value != null && value >= 1 && value <= 6) lastDiceFace = value;
    // Always show a pip face: current roll, else last roll, else 1
    const show = value != null && value >= 1 ? value : lastDiceFace;
    diceHost.innerHTML = diceFaceHtml(show, rolling);
  }

  function canControl(color: ColorId) {
    return interactive.has(color);
  }

  function timerElapsedMs(): number {
    if (!timerStartedAt) return 0;
    const now = timerPausedAt ?? performance.now();
    return Math.max(0, now - timerStartedAt - timerAccumPaused);
  }

  function timerRemainingMs(): number {
    return Math.max(0, timerDuration - timerElapsedMs());
  }

  function stopTurnTimer(clearRing = true) {
    if (timerRaf) cancelAnimationFrame(timerRaf);
    timerRaf = 0;
    timerStartedAt = 0;
    timerPausedAt = null;
    timerAccumPaused = 0;
    timerTurnId = null;
    timerColor = null;
    if (clearRing) {
      setTimerRingProgress(diceWrap, 0, false);
    }
  }

  function syncTimerPauseForBusy() {
    if (!timerCfg.enabled || !timerStartedAt) return;
    if (!timerCfg.pauseWhileBusy) return;
    if (busy && timerPausedAt == null && !timerManualPause) {
      timerPausedAt = performance.now();
    } else if (!busy && timerPausedAt != null && !timerManualPause) {
      timerAccumPaused += performance.now() - timerPausedAt;
      timerPausedAt = null;
      if (!timerRaf) timerRaf = requestAnimationFrame(tickTurnTimer);
    }
  }

  function seatTimed(state: GameState): boolean {
    if (!timerCfg.enabled) return false;
    if (state.phase === 'finished') return false;
    if (state.phase !== 'waiting_roll' && state.phase !== 'waiting_move') {
      return false;
    }
    const p = state.players.find((x) => x.color === state.currentColor);
    if (!p) return false;
    // No clock for seats still in the join queue / dropped
    if (isSeatAbsent(p.presence, p.kind)) return false;
    return timerAppliesToSeat(timerCfg.appliesTo, state.currentColor, {
      interactive,
      kind: p.kind,
    });
  }

  function applySeatPresence(
    color: ColorId,
    presence: SeatPresence,
    patch?: Partial<Pick<PlayerConfig, 'name' | 'id' | 'kind'>>,
  ) {
    const s = game.getState();
    const prev = s.players.find((p) => p.color === color)?.presence;
    const players = withPresence(s.players, color, presence, patch);
    game.syncState({ ...s, players }, { type: 'presence', color, presence });
    const next = game.getState();
    opts.onPresence?.(color, presence, next);
    opts.onPresenceChange?.({
      color,
      presence,
      previous: prev,
      state: next,
    });
  }

  function emitTurnCallbacks(state: GameState) {
    const ctx: TurnChangeContext = {
      color: state.currentColor,
      turnId: state.turnId,
      isMine: canControl(state.currentColor),
      phase: state.phase,
      state,
      previousColor: previousTurnColor,
    };
    opts.onTurn?.(ctx);
    if (ctx.isMine && state.phase !== 'finished') {
      opts.onMyTurn?.(ctx);
    }
    previousTurnColor = state.currentColor;
  }

  function emitLegalMovesIfNeeded(state: GameState) {
    if (state.phase !== 'waiting_move' || state.dice == null) {
      lastLegalKey = '';
      return;
    }
    const moves = game.legalMoves();
    const key = `${state.turnId}:${state.currentColor}:${state.dice}:${moves.map((m) => m.tokenId).join(',')}`;
    if (key === lastLegalKey) return;
    lastLegalKey = key;
    const ctx: LegalMovesContext = {
      color: state.currentColor,
      dice: state.dice,
      moves,
      isMine: canControl(state.currentColor),
      state,
    };
    opts.onLegalMoves?.(ctx);
  }

  function destroyRoom(reason: RoomDestroyReason = 'client', notifyHost = false) {
    if (destroyed) return;
    const snap = game.getState();
    const ctx: DestroyContext = {
      reason,
      roomId: opts.roomId,
      state: snap,
    };
    if (notifyHost && opts.onAction) {
      void opts.onAction(
        { type: 'destroy', roomId: opts.roomId ?? '', reason },
        { state: snap, roomId: opts.roomId },
      );
    }
    opts.onDestroy?.(ctx);
    destroyed = true;
    if (aiTimer) clearTimeout(aiTimer);
    if (absentTimer) clearTimeout(absentTimer);
    stopTurnTimer(true);
    unsub?.();
    unsub = null;
    root.innerHTML = '';
    root.classList.remove('ludo-sdk', 'ludo-sdk--compact');
  }

  function scheduleAbsent(state: GameState) {
    if (absentTimer) clearTimeout(absentTimer);
    absentTimer = null;
    if (state.phase === 'finished' || busy) return;
    const p = state.players.find((x) => x.color === state.currentColor);
    if (!p || !isSeatAbsent(p.presence, p.kind)) return;
    // AI seats are never "absent" for this path
    if (p.kind === 'ai') return;
    if (absentCfg.action === 'none') return;

    absentTimer = setTimeout(() => {
      if (destroyed || busy) return;
      const s = game.getState();
      const cur = s.players.find((x) => x.color === s.currentColor);
      if (!cur || !isSeatAbsent(cur.presence, cur.kind)) return;
      if (opts.controlled) {
        // Never mutate authoritative state locally
        void resolveAction(
          {
            type: 'forfeit',
            roomId: opts.roomId ?? '',
            color: s.currentColor,
          },
          s,
        );
        return;
      }
      if (absentCfg.action === 'skip') {
        showToast('Waiting… skipped');
        game.forfeitTurn();
      } else if (absentCfg.action === 'auto') {
        showToast('Away — auto');
        playAiSeatOnce(game, s.currentColor, opts.aiDifficulty ?? 'hard');
      }
    }, absentCfg.delayMs);
  }

  function paintTimerRing() {
    const active =
      !!timerCfg.showRing && !!timerCfg.enabled && !!timerStartedAt;
    const ratio = active ? timerRemainingMs() / timerDuration : 0;

    if (theme.id === 'king') {
      // King: ring wraps the outer HUD card — never the die.
      setTimerRingProgress(diceWrap, 0, false);
      for (const c of [0, 1, 2, 3] as ColorId[]) {
        const shell = root.querySelector<HTMLElement>(
          `[data-ludo-hud="${c}"] .ludo-sdk__hud-shell`,
        );
        setTimerRingProgress(
          shell,
          ratio,
          active && timerColor === c,
        );
      }
      return;
    }

    setTimerRingProgress(diceWrap, ratio, active);
  }

  function getTurnTimerSnapshot(): TurnTimerSnapshot {
    const remaining = timerStartedAt ? timerRemainingMs() : 0;
    return {
      enabled: timerCfg.enabled,
      running: !!timerStartedAt && timerPausedAt == null && !timerManualPause,
      paused: !!timerStartedAt && (timerPausedAt != null || timerManualPause),
      remainingMs: remaining,
      durationMs: timerDuration,
      ratio: timerDuration ? remaining / timerDuration : 0,
      color: timerColor,
      turnId: timerTurnId,
    };
  }

  async function runTimeoutAction(action: TurnTimerAutoAction) {
    if (action === 'none') return;
    const s = game.getState();
    if (opts.controlled) {
      // Host is source of truth — send forfeit intent (skip & auto)
      await resolveAction(
        {
          type: 'forfeit',
          roomId: opts.roomId ?? '',
          color: s.currentColor,
        },
        s,
      );
      return;
    }
    if (action === 'skip') {
      game.forfeitTurn();
      return;
    }
    if (action === 'auto') {
      // Miss → roll and/or move the pin (same as server driveSeatOnce)
      playAiSeatOnce(game, s.currentColor, opts.aiDifficulty ?? 'hard');
    }
  }

  async function fireTurnTimeout() {
    if (timerFiring || destroyed) return;
    timerFiring = true;
    const state = game.getState();
    const phase =
      state.phase === 'waiting_move' ? 'waiting_move' : 'waiting_roll';
    const ctx: TurnTimeoutContext = {
      color: state.currentColor,
      phase,
      turnId: state.turnId,
      durationMs: timerDuration,
      state,
    };
    stopTurnTimer(true);
    showToast('Time!');
    sounds.play('deny');

    // Visual timer runs for everyone; skip/auto only enforces on your seats
    let action: TurnTimerAutoAction = canControl(state.currentColor)
      ? timerCfg.onTimeout
      : 'none';
    if (opts.onTurnTimeout) {
      try {
        const override = await opts.onTurnTimeout(ctx);
        if (override) action = override;
      } catch {
        /* keep default */
      }
    }
    await runTimeoutAction(action);
    timerFiring = false;
  }

  function tickTurnTimer(now: number) {
    timerRaf = 0;
    if (destroyed || !timerCfg.enabled || !timerStartedAt) return;
    if (timerPausedAt != null || timerManualPause) {
      paintTimerRing();
      return;
    }
    const remaining = Math.max(
      0,
      timerDuration - (now - timerStartedAt - timerAccumPaused),
    );
    paintTimerRing();
    const s = game.getState();
    opts.onTurnTick?.({
      color: s.currentColor,
      phase: s.phase,
      turnId: s.turnId,
      remainingMs: remaining,
      durationMs: timerDuration,
      ratio: remaining / timerDuration,
    });
    if (remaining <= 0) {
      void fireTurnTimeout();
      return;
    }
    timerRaf = requestAnimationFrame(tickTurnTimer);
  }

  function startTurnTimer(state: GameState) {
    if (!seatTimed(state)) {
      stopTurnTimer(true);
      return;
    }
    if (
      timerStartedAt &&
      timerTurnId === state.turnId &&
      timerColor === state.currentColor
    ) {
      // same window — keep counting
      if (timerCfg.pauseWhileBusy) syncTimerPauseForBusy();
      else if (!timerRaf && timerPausedAt == null && !timerManualPause) {
        timerRaf = requestAnimationFrame(tickTurnTimer);
      }
      paintTimerRing();
      return;
    }
    stopTurnTimer(false);
    timerDuration = timerCfg.durationMs;
    timerStartedAt = performance.now();
    timerAccumPaused = 0;
    timerPausedAt = null;
    timerManualPause = false;
    timerTurnId = state.turnId;
    timerColor = state.currentColor;
    if (timerCfg.pauseWhileBusy && busy) {
      timerPausedAt = performance.now();
      paintTimerRing();
      return;
    }
    paintTimerRing();
    timerRaf = requestAnimationFrame(tickTurnTimer);
  }

  function scheduleTurnTimer(state: GameState) {
    if (!timerCfg.enabled) {
      stopTurnTimer(true);
      return;
    }
    startTurnTimer(state);
  }

  function bind() {
    unsub?.();
    boardReady = false;
    ensureBoard();
    queue = Promise.resolve();
    unsub = game.subscribe((state, event) => {
      queue = queue.then(() => handleUpdate(state, event));
    });
    queue = queue.then(() =>
      handleUpdate(game.getState(), game.getState().lastEvent),
    );
  }

  async function handleUpdate(state: GameState, event: GameEvent | null) {
    if (destroyed) return;
    ensureBoard();
    // Capture is followed by a `move` event — don't AI-schedule mid applyChosen
    let shouldSchedule = event?.type !== 'capture';
    try {
      if (event?.type === 'roll') {
        busy = true;
        syncTimerPauseForBusy();
        sounds.play('roll');
        await animateDiceRoll(diceHost, event.value, ROLL_MS);
        if (destroyed) return;
        lastDiceFace = event.value;
        sounds.play('land');
        if (event.value === 6) sounds.play('six');
      } else if (state.dice != null) {
        setDice(state.dice, false);
      } else {
        // Waiting to roll — keep showing last face (or 1)
        setDice(lastDiceFace, false);
      }

      // Capture is applied in engine before `move` — defer victim visuals to path anim
      if (event?.type === 'capture') {
        showToast('Captured!');
        opts.onCapture?.(event.by, event.victimTokenId, state);
        if (event) opts.onEvent?.(event, state);
        opts.onChange?.(state);
        return;
      }

      if (event?.type === 'roll') {
        opts.onRoll?.(event.color, event.value, state);
      }

      if (event?.type === 'extra_turn') {
        showToast(
          event.reason === 'six'
            ? 'Six!'
            : event.reason === 'capture'
              ? 'Extra turn'
              : 'Home!',
        );
        if (event.reason === 'six') sounds.play('six');
      }
      if (event?.type === 'win') {
        const shown = showWinOverlay(event.color, event.ranking, state);
        if (shown) {
          showToast(`${COLOR_NAMES[event.color]} wins`);
          sounds.play('win');
          opts.onWin?.({
            winner: event.color,
            ranking: event.ranking,
            state,
          } satisfies WinContext);
        }
      } else if (
        state.phase === 'finished' &&
        state.winner != null &&
        winShownFor !== state.winner
      ) {
        // Catch-up sync / late join — still show winner UI
        const shown = showWinOverlay(state.winner, state.ranking, state);
        if (shown) {
          sounds.play('win');
          opts.onWin?.({
            winner: state.winner,
            ranking: state.ranking,
            state,
          } satisfies WinContext);
        }
      }
      if (event?.type === 'turn') {
        sounds.play('turn');
        emitTurnCallbacks(state);
      }
      if (event?.type === 'no_moves') sounds.play('nomove');
      if (event?.type === 'presence') {
        /* presence sync already notifies via setSeatPresence path */
      }

      if (event?.type === 'move') {
        busy = true;
        syncTimerPauseForBusy();
        paintChrome(state);
        // Place tokens at post-move state, then walk the mover cell-by-cell
        syncTokens(tokensLayer(), state, [], theme);
        const tok = state.tokens.find((t) => t.id === event.tokenId);
        const slot = tok?.slot ?? 0;
        await animateLegalMove(
          tokensLayer(),
          event.color,
          slot,
          event.move,
          state.tokens,
          {
            onStep: (step) => {
              if (step === 1) {
                if (event.move.entersBoard) sounds.play('enter');
                else sounds.play('move');
              }
            },
            onCapture: (x, y) => {
              flashCapture(fxLayer(), x, y);
              sounds.play('capture');
            },
          },
        );
        if (destroyed) return;
        if (event.move.finishes) sounds.play('finish');
        opts.onMove?.(event.color, event.tokenId, state, event);
        paint(state, event);
      } else {
        paint(state, event);
      }

      if (event) opts.onEvent?.(event, state);
      opts.onChange?.(state);
      emitLegalMovesIfNeeded(game.getState());
    } finally {
      // Never leave the board stuck unable to tap after anim / errors
      if (!destroyed) {
        busy = false;
        syncTimerPauseForBusy();
      }
    }
    // Schedule AFTER busy clears — scheduling while busy dropped AI after every roll/6
    if (!destroyed && shouldSchedule) {
      const next = game.getState();
      scheduleAi(next);
      scheduleAbsent(next);
      scheduleTurnTimer(next);
      scheduleSoloMove(next);
    }
  }

  /** Only one legal pin → move it (after roll anim), same as Ludo King. */
  function scheduleSoloMove(state: GameState) {
    if (opts.controlled) return;
    if (state.phase !== 'waiting_move' || state.dice == null) return;
    if (!canControl(state.currentColor)) return;
    const legal = game.legalMoves();
    if (legal.length !== 1) return;
    const tokenId = legal[0]!.tokenId;
    const turnId = state.turnId;
    window.setTimeout(() => {
      if (destroyed || busy) return;
      const s = game.getState();
      if (
        s.phase !== 'waiting_move' ||
        s.turnId !== turnId ||
        !canControl(s.currentColor)
      ) {
        return;
      }
      void requestMove(tokenId);
    }, 220);
  }

  function paintChrome(state: GameState) {
    statusEl.innerHTML = statusText(state, {
      interactive: interactive,
    });
    const winN = tokensToWin(state.mode);
    modeEl.innerHTML = `<span class="ludo-sdk__badge-bolt">⚡</span> ${state.mode.toUpperCase()} · FIRST TO ${winN}`;
  }

  function paintKingHuds(state: GameState) {
    root.dataset.turn = String(state.currentColor);
    root.dataset.phase = state.phase;
    placeDiceDock(state.currentColor);
    if (theme.id !== 'king') return;
    for (const c of [0, 1, 2, 3] as ColorId[]) {
      const hud = root.querySelector<HTMLElement>(`[data-ludo-hud="${c}"]`);
      if (!hud) continue;
      const p = state.players.find((x) => x.color === c);
      if (!p) {
        hud.classList.add('ludo-sdk__hud--empty');
        hud.classList.remove('ludo-sdk__hud--active');
        continue;
      }
      hud.classList.remove('ludo-sdk__hud--empty');
      const active = c === state.currentColor && state.phase !== 'finished';
      hud.classList.toggle('ludo-sdk__hud--active', active);
    }
  }

  function paint(state: GameState, event: GameEvent | null) {
    const legal = game.legalMoves();
    syncTokens(tokensLayer(), state, legal, theme);
    paintChrome(state);
    paintKingHuds(state);

    const mine =
      canControl(state.currentColor) &&
      state.phase !== 'finished' &&
      !busy;
    const canRoll = mine && state.phase === 'waiting_roll';
    rollBtn.disabled = !canRoll;
    rollBtn.classList.toggle('ludo-sdk__btn--pulse', canRoll);
    diceHost.classList.toggle('ludo-sdk__dice-dock--armed', canRoll);

    if (playersEl) {
      playersEl.innerHTML = state.players
        .map((p) => {
          const presence = normalizePresence(p);
          const active =
            p.color === state.currentColor ? ' ludo-sdk__player--active' : '';
          const absent = isSeatAbsent(presence, p.kind)
            ? ` ludo-sdk__player--${presence}`
            : presence === 'ready'
              ? ' ludo-sdk__player--ready'
              : '';
          const you = canControl(p.color);
          let role = you ? 'You' : p.kind === 'ai' ? 'AI' : p.name;
          if (presence === 'empty') role = 'Open';
          else if (presence === 'joining') role = 'Joining…';
          else if (presence === 'disconnected') role = 'Away';
          const crown = you ? '<span class="ludo-sdk__player-crown">👑</span>' : '';
          const done = state.ranking.includes(p.color) ? ' ✓' : '';
          const name = COLOR_NAMES[p.color];
          const badge =
            presence !== 'ready' && p.kind !== 'ai'
              ? `<span class="ludo-sdk__player-presence">${presenceLabel(presence)}</span>`
              : '';
          return `<div class="ludo-sdk__player ludo-sdk__player--c${p.color}${active}${absent}" data-presence="${presence}">
            <span class="ludo-sdk__player-dot"></span>
            <span class="ludo-sdk__player-label">${name[0].toUpperCase()}${name.slice(1)} · ${role}${done}</span>
            ${badge}
            ${crown}
          </div>`;
        })
        .join('');
    }

    tokensLayer()
      .querySelectorAll<SVGGElement>('[data-token-id]')
      .forEach((node) => {
        node.style.touchAction = 'manipulation';
        node.onpointerup = (e: PointerEvent) => {
          if (e.button != null && e.button !== 0) return;
          e.stopPropagation();
          if (!node.classList.contains('ludo-sdk__token--playable')) return;
          const id = node.getAttribute('data-token-id');
          if (!id || busy) return;
          void requestMove(id);
        };
        node.onclick = null;
      });
  }

  function scheduleAi(state: GameState) {
    if (opts.controlled) return;
    if (opts.autoAi === false) return;
    if (state.phase === 'finished') return;
    const p = state.players.find((x) => x.color === state.currentColor);
    // Absent humans are handled by scheduleAbsent — don't AI them unless action is auto
    if (p && isSeatAbsent(p.presence, p.kind) && p.kind === 'human') return;
    if (!currentPlayerIsAi(state)) return;
    if (canControl(state.currentColor)) return;
    if (aiTimer) clearTimeout(aiTimer);
    const delay = opts.aiDelayMs ?? 650;
    aiTimer = setTimeout(() => {
      if (destroyed) return;
      // Dice/move anim still running — retry instead of dropping the seat
      if (busy) {
        scheduleAi(game.getState());
        return;
      }
      const s = game.getState();
      if (s.phase === 'finished') return;
      if (!currentPlayerIsAi(s) || opts.controlled) return;
      if (canControl(s.currentColor)) return;
      playAiStep(game, s.currentColor, opts.aiDifficulty ?? 'hard');
    }, delay);
  }

  async function requestRoll() {
    const s = game.getState();
    if (busy || s.phase !== 'waiting_roll' || !canControl(s.currentColor)) {
      sounds.play('deny');
      return;
    }
    const action: LudoClientAction = {
      type: 'roll',
      roomId: opts.roomId ?? '',
      color: s.currentColor,
    };
    const result = await resolveAction(action, s);
    if (result === 'defer') return;
    // Hosted / controlled: never apply local RNG — host must dispatch dice/sync
    if (opts.controlled) return;
    if (result === 'allow') {
      game.roll();
      return;
    }
    if (typeof result === 'object' && 'dice' in result) {
      game.applyDice(result.dice);
    }
  }

  async function requestMove(tokenId: string) {
    const s = game.getState();
    if (busy || s.phase !== 'waiting_move' || !canControl(s.currentColor)) {
      return;
    }
    const action: LudoClientAction = {
      type: 'move',
      roomId: opts.roomId ?? '',
      color: s.currentColor,
      tokenId,
    };
    const result = await resolveAction(action, s);
    if (result === 'defer') return;
    if (opts.controlled) return;
    if (result === 'allow' || (typeof result === 'object' && 'dice' in result)) {
      game.move(tokenId);
    }
  }

  async function resolveAction(
    action: LudoClientAction,
    state: GameState,
  ): Promise<ActionResult> {
    if (!opts.onAction) {
      return opts.controlled ? 'defer' : 'allow';
    }
    try {
      return await opts.onAction(action, {
        state,
        roomId: opts.roomId,
      });
    } catch {
      return 'defer';
    }
  }

  rollBtn.addEventListener('click', () => {
    void sounds.unlock();
    sounds.play('click');
    void requestRoll();
  });
  diceHost.addEventListener('click', () => {
    void sounds.unlock();
    void requestRoll();
  });
  diceHost.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      void requestRoll();
    }
  });
  soundBtn.addEventListener('click', () => {
    void sounds.unlock();
    sounds.toggle();
    syncSoundBtn();
    if (sounds.isEnabled()) sounds.play('click');
  });

  function reset(next?: LudoMountOptions) {
    if (aiTimer) clearTimeout(aiTimer);
    if (absentTimer) clearTimeout(absentTimer);
    stopTurnTimer(true);
    hideWinOverlay();
    if (next) opts = { ...opts, ...next };
    theme = getTheme(opts.theme);
    applyThemeToElement(root, theme);
    timerCfg = normalizeTurnTimer(opts.turnTimer, !!opts.controlled);
    absentCfg = {
      action: opts.absentSeat?.action ?? (opts.controlled ? 'none' : 'skip'),
      delayMs: opts.absentSeat?.delayMs ?? 400,
    };
    interactive = new Set(
      opts.interactiveColors ??
        resolveSeats(opts)
          .filter((p) => p.kind === 'human')
          .map((p) => p.color),
    );
    busy = false;
    previousTurnColor = null;
    game = makeGame(opts);
    boardReady = false;
    bind();
  }

  const handle: LudoHandle = {
    get game() {
      return game;
    },
    getState: () => game.getState(),
    whoseTurn: () => {
      if (destroyed) return null;
      const s = game.getState();
      return s.phase === 'finished' ? null : s.currentColor;
    },
    isMyTurn: () => {
      if (destroyed) return false;
      const s = game.getState();
      return (
        s.phase !== 'finished' &&
        canControl(s.currentColor) &&
        (s.phase === 'waiting_roll' || s.phase === 'waiting_move')
      );
    },
    roll: () => {
      void requestRoll();
    },
    move: (tokenId: string) => {
      void requestMove(tokenId);
    },
    forfeitTurn: () => {
      if (opts.controlled) {
        const s = game.getState();
        void resolveAction(
          {
            type: 'forfeit',
            roomId: opts.roomId ?? '',
            color: s.currentColor,
          },
          s,
        );
        return true;
      }
      return game.forfeitTurn();
    },
    applyDice: (value: number) => game.applyDice(value),
    applyMove: (tokenId: string) => game.move(tokenId),
    syncState: (state, event) => {
      if (arguments.length < 2) game.syncState(state);
      else game.syncState(state, event);
    },
    dispatch: (cmd) => {
      if (cmd.type === 'sync') {
        if (cmd.event !== undefined) game.syncState(cmd.state, cmd.event);
        else game.syncState(cmd.state);
      } else if (cmd.type === 'dice') game.applyDice(cmd.value);
      else if (cmd.type === 'play') game.move(cmd.tokenId);
      else if (cmd.type === 'presence') {
        handle.setSeatPresence(cmd.color, cmd.presence, {
          name: cmd.name,
          id: cmd.id,
        });
      } else if (cmd.type === 'seats') {
        handle.setSeats(cmd.seats);
      } else if (cmd.type === 'destroy') {
        destroyRoom(cmd.reason ?? 'host', false);
      } else if (cmd.type === 'config') {
        if (cmd.mode) handle.setMode(cmd.mode);
        if (cmd.aiDifficulty) handle.setAiDifficulty(cmd.aiDifficulty);
        if (cmd.autoAi != null) handle.setAutoAi(cmd.autoAi);
        if (cmd.interactiveColors) handle.setInteractiveColors(cmd.interactiveColors);
        if (cmd.turnTimer !== undefined) handle.setTurnTimer(cmd.turnTimer);
        if (cmd.absentSeat) {
          opts.absentSeat = cmd.absentSeat;
          absentCfg = {
            action: cmd.absentSeat.action ?? absentCfg.action,
            delayMs: cmd.absentSeat.delayMs ?? absentCfg.delayMs,
          };
          scheduleAbsent(game.getState());
        }
      }
    },
    setMode: (mode) => {
      opts.mode = mode;
      reset(opts);
    },
    setAiDifficulty: (d) => {
      opts.aiDifficulty = d;
    },
    setAutoAi: (on) => {
      opts.autoAi = on;
      scheduleAi(game.getState());
    },
    setInteractiveColors: (colors) => {
      interactive = new Set(colors);
      opts.interactiveColors = colors;
      if (opts.boardFacing !== false && opts.boardFacing == null) {
        boardReady = false;
        ensureBoard();
      } else {
        applyBoardFacing();
      }
      paint(game.getState(), null);
      scheduleTurnTimer(game.getState());
    },
    setTheme: (id) => {
      theme = getTheme(id);
      opts.theme = id;
      applyThemeToElement(root, theme);
      boardReady = false;
      ensureBoard();
      placeDiceDock(game.getState().currentColor);
      paint(game.getState(), null);
    },
    setBoardFacing: (color: ColorId | false) => {
      opts.boardFacing = color;
      boardReady = false;
      ensureBoard();
      paint(game.getState(), null);
    },
    getTheme: () => theme,
    setTurnTimer: (cfg) => {
      opts.turnTimer = cfg;
      const was = timerCfg.enabled;
      timerCfg = normalizeTurnTimer(cfg, !!opts.controlled);
      if (typeof cfg === 'object' && cfg && typeof cfg.durationMs === 'number') {
        timerDuration = timerCfg.durationMs;
      }
      if (!timerCfg.enabled) {
        stopTurnTimer(true);
        return;
      }
      if (!was) {
        scheduleTurnTimer(game.getState());
        return;
      }
      // keep remaining ratio when only toggling cosmetics; hard reset if duration changed mid-turn
      if (timerStartedAt) {
        timerDuration = timerCfg.durationMs;
        paintTimerRing();
        if (!timerRaf && timerPausedAt == null && !timerManualPause) {
          timerRaf = requestAnimationFrame(tickTurnTimer);
        }
      } else {
        scheduleTurnTimer(game.getState());
      }
    },
    pauseTurnTimer: () => {
      if (!timerStartedAt || timerManualPause) return;
      timerManualPause = true;
      if (timerPausedAt == null) timerPausedAt = performance.now();
      if (timerRaf) cancelAnimationFrame(timerRaf);
      timerRaf = 0;
      paintTimerRing();
    },
    resumeTurnTimer: () => {
      if (!timerStartedAt || !timerManualPause) return;
      timerManualPause = false;
      if (timerPausedAt != null) {
        timerAccumPaused += performance.now() - timerPausedAt;
        timerPausedAt = null;
      }
      if (timerCfg.pauseWhileBusy && busy) {
        timerPausedAt = performance.now();
        paintTimerRing();
        return;
      }
      timerRaf = requestAnimationFrame(tickTurnTimer);
    },
    resetTurnTimer: () => {
      stopTurnTimer(false);
      scheduleTurnTimer(game.getState());
    },
    getTurnTimer: () => getTurnTimerSnapshot(),
    setSeatPresence: (color, presence, patch) => {
      applySeatPresence(color, presence, patch);
    },
    setSeats: (seats) => {
      const s = game.getState();
      const next = seats.slice(0, 4).map((p) => ({
        ...p,
        presence: normalizePresence(p),
      }));
      game.syncState({ ...s, players: next });
      scheduleAbsent(game.getState());
      scheduleTurnTimer(game.getState());
    },
    getSeats: () => game.getState().players.map((p) => ({ ...p })),
    allHumansPresent: () => {
      const humans = game.getState().players.filter((p) => p.kind === 'human');
      return humans.every((p) => !isSeatAbsent(p.presence, p.kind));
    },
    destroyRoom: (reason = 'client', notifyHost = false) => {
      destroyRoom(reason, notifyHost);
    },
    isDestroyed: () => destroyed,
    reset,
    destroy: () => {
      destroyRoom('client', false);
    },
    setSoundEnabled: (on) => {
      sounds.setEnabled(on);
      syncSoundBtn();
    },
    sounds,
    get roomId() {
      return opts.roomId;
    },
  };

  setDice(null, false);
  bind(); // initial handleUpdate emits turn callbacks once via lastEvent
  opts.onReady?.(handle);
  return handle;
}

/** Mount from a backend room config. */
export function mountLudoRoom(
  el: string | HTMLElement,
  room: LudoRoomConfig,
  extra: Omit<LudoMountOptions, 'mode' | 'seats' | 'roomId' | 'controlled' | 'autoAi' | 'aiDifficulty' | 'interactiveColors'> = {},
): LudoHandle {
  const { players, aiColors } = roomToMountPlayers(room);
  return mountLudo(el, {
    ...extra,
    roomId: room.roomId,
    mode: room.mode,
    seats: players,
    aiColors,
    autoAi: room.autoAi ?? !room.controlled,
    aiDifficulty: room.aiDifficulty ?? 'hard',
    interactiveColors: room.interactiveColors,
    controlled: room.controlled ?? false,
    turnTimer: extra.turnTimer ?? room.turnTimer,
    absentSeat: extra.absentSeat ?? room.absentSeat,
  });
}

function makeGame(opts: LudoMountOptions): LudoGame {
  const players = resolveSeats(opts).map((p) => ({
    ...p,
    presence: normalizePresence(p),
  }));
  return createGame({
    mode: opts.mode ?? 'rush',
    players,
  });
}

function kingHud(color: ColorId, corner: 'tl' | 'tr' | 'bl' | 'br'): string {
  // Ludo King corner dock: pink tray + pin badge; timer ring wraps the outer card
  const gid = `hudArrow${color}`;
  // Block arrow (points left; CSS mirrors for right-side HUDs)
  const arrow = `<span class="ludo-sdk__hud-arrow" aria-hidden="true">
      <span class="ludo-sdk__hud-arrow-bounce">
        <svg class="ludo-sdk__hud-arrow-svg" viewBox="0 0 40 30" width="34" height="26">
          <defs>
            <linearGradient id="${gid}" x1="0" y1="0.5" x2="1" y2="0.5">
              <stop offset="0%" stop-color="#F58220"/>
              <stop offset="40%" stop-color="#FF9A18"/>
              <stop offset="100%" stop-color="#FFD200"/>
            </linearGradient>
          </defs>
          <path d="M38 6 H17 V2.2 L2 15 L17 27.8 V24 H38 Z"
            fill="url(#${gid})" stroke="#2A1806" stroke-width="1.85" stroke-linejoin="round"/>
        </svg>
      </span>
    </span>`;
  return `<div class="ludo-sdk__hud ludo-sdk__hud--${corner} ludo-sdk__hud--c${color}" data-ludo-hud="${color}">
    <div class="ludo-sdk__hud-shell">
      ${hudTimerRingMarkup()}
      <div class="ludo-sdk__hud-card">
        <div class="ludo-sdk__hud-tray" data-ludo-hud-tray="${color}"></div>
        <div class="ludo-sdk__hud-badge" aria-hidden="true">
          <span class="ludo-sdk__hud-pin"></span>
        </div>
      </div>
      ${arrow}
    </div>
  </div>`;
}

function shellHtml(mode: GameMode, showPlayers: boolean): string {
  return `
    <div class="ludo-sdk__header">
      <div class="ludo-sdk__brand">
        <h2 class="ludo-sdk__logo"><span class="ludo-sdk__logo-ludo">Ludo</span> <span class="ludo-sdk__logo-rush">Rush</span></h2>
        <div class="ludo-sdk__status" data-ludo-status></div>
      </div>
      <span class="ludo-sdk__badge" data-ludo-mode><span class="ludo-sdk__badge-bolt">⚡</span> ${mode.toUpperCase()}</span>
    </div>
    <div class="ludo-sdk__stage" data-ludo-stage>
      ${kingHud(1, 'tl')}
      ${kingHud(2, 'tr')}
      ${kingHud(0, 'bl')}
      ${kingHud(3, 'br')}
      <div class="ludo-sdk__board-wrap" data-ludo-board></div>
    </div>
    <div class="ludo-sdk__controls" data-ludo-controls>
      <div class="ludo-sdk__dice-wrap" data-ludo-dice-wrap>
        ${timerRingMarkup()}
        <div class="ludo-sdk__dice-dock" data-ludo-dice-host tabindex="0" role="button" aria-label="Roll dice"></div>
      </div>
      <button type="button" class="ludo-sdk__btn" data-ludo-roll>
        <span aria-hidden="true">🎲</span> Roll dice
      </button>
      <button type="button" class="ludo-sdk__btn ludo-sdk__btn--icon" data-ludo-sound aria-label="Sound">🔊</button>
    </div>
    ${showPlayers ? '<div class="ludo-sdk__players" data-ludo-players></div>' : ''}
    <div class="ludo-sdk__win" data-ludo-win hidden>
      <div class="ludo-sdk__win-card" role="dialog" aria-labelledby="ludo-win-title">
        <div class="ludo-sdk__win-emoji" aria-hidden="true">🏆</div>
        <h3 class="ludo-sdk__win-title" id="ludo-win-title" data-ludo-win-title>Wins!</h3>
        <p class="ludo-sdk__win-sub" data-ludo-win-sub></p>
        <ol class="ludo-sdk__win-ranking" data-ludo-win-ranking></ol>
        <button type="button" class="ludo-sdk__btn ludo-sdk__win-rematch" data-ludo-rematch>
          Play again
        </button>
      </div>
    </div>
  `;
}

export function createLudoGame(options: LudoMountOptions = {}) {
  return makeGame(options);
}

export { chooseAiMove, offlineRoom };
