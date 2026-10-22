import {
  chooseAiMove,
  currentPlayerIsAi,
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
} from '../core/types';
import { animateDiceRoll, diceFaceHtml } from '../ui/dice';
import {
  flashCapture,
  renderBoardBase,
  statusText,
  syncTokens,
} from '../ui/render';
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
import '../ui/styles.css';

export type LudoMountOptions = {
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
  onEvent?: (event: GameEvent, state: GameState) => void;
  onChange?: (state: GameState) => void;
  /** Called before local apply when user rolls/moves. */
  onAction?: (
    action: LudoClientAction,
    ctx: ActionContext,
  ) => ActionResult | Promise<ActionResult>;
  onReady?: (handle: LudoHandle) => void;
};

export type LudoHandle = {
  game: LudoGame;
  getState: () => GameState;
  roll: () => void;
  move: (tokenId: string) => void;
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
  reset: (opts?: LudoMountOptions) => void;
  destroy: () => void;
  setSoundEnabled: (on: boolean) => void;
  sounds: LudoSounds;
  roomId?: string;
};

const ROLL_MS = 650;

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
  let destroyed = false;
  let busy = false;
  let boardReady = false;
  let queue: Promise<void> = Promise.resolve();

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

  const boardWrap = root.querySelector<HTMLElement>('[data-ludo-board]')!;
  const statusEl = root.querySelector<HTMLElement>('[data-ludo-status]')!;
  const diceHost = root.querySelector<HTMLElement>('[data-ludo-dice-host]')!;
  const playersEl = root.querySelector<HTMLElement>('[data-ludo-players]');
  const rollBtn = root.querySelector<HTMLButtonElement>('[data-ludo-roll]')!;
  const soundBtn = root.querySelector<HTMLButtonElement>('[data-ludo-sound]')!;
  const modeEl = root.querySelector<HTMLElement>('[data-ludo-mode]')!;

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

  function ensureBoard() {
    if (boardReady) return;
    boardWrap.innerHTML =
      renderBoardBase() + `<div class="ludo-sdk__toast" data-ludo-toast></div>`;
    boardReady = true;
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

  function setDice(value: number | null, rolling = false) {
    diceHost.innerHTML = diceFaceHtml(value, rolling);
  }

  function canControl(color: ColorId) {
    return interactive.has(color);
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

    if (event?.type === 'roll') {
      busy = true;
      sounds.play('roll');
      await animateDiceRoll(diceHost, event.value, ROLL_MS);
      if (destroyed) return;
      sounds.play('land');
      if (event.value === 6) sounds.play('six');
    } else if (state.dice != null) {
      setDice(state.dice, false);
    }

    // Capture is applied in engine before `move` — defer victim visuals to path anim
    if (event?.type === 'capture') {
      showToast('Captured!');
      if (event) opts.onEvent?.(event, state);
      opts.onChange?.(state);
      return;
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
      showToast(`${COLOR_NAMES[event.color]} wins`);
      sounds.play('win');
    }
    if (event?.type === 'turn') sounds.play('turn');
    if (event?.type === 'no_moves') sounds.play('nomove');

    if (event?.type === 'move') {
      busy = true;
      paintChrome(state);
      // Place tokens at post-move state, then walk the mover cell-by-cell
      syncTokens(tokensLayer(), state, []);
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
      paint(state, event);
    } else {
      paint(state, event);
    }

    if (event) opts.onEvent?.(event, state);
    opts.onChange?.(state);

    busy = false;
    scheduleAi(game.getState());
  }

  function paintChrome(state: GameState) {
    statusEl.innerHTML = statusText(state, {
      interactive: interactive,
    });
    const winN = tokensToWin(state.mode);
    modeEl.innerHTML = `<span class="ludo-sdk__badge-bolt">⚡</span> ${state.mode.toUpperCase()} · FIRST TO ${winN}`;
  }

  function paint(state: GameState, event: GameEvent | null) {
    const legal = game.legalMoves();
    syncTokens(tokensLayer(), state, legal);
    paintChrome(state);

    const mine =
      canControl(state.currentColor) &&
      state.phase !== 'finished' &&
      !busy;
    const canRoll = mine && state.phase === 'waiting_roll';
    rollBtn.disabled = !canRoll;
    rollBtn.classList.toggle('ludo-sdk__btn--pulse', canRoll);

    if (playersEl) {
      playersEl.innerHTML = state.players
        .map((p) => {
          const active =
            p.color === state.currentColor ? ' ludo-sdk__player--active' : '';
          const you = canControl(p.color);
          const role = you ? 'You' : p.kind === 'ai' ? 'AI' : p.name;
          const crown = you ? '<span class="ludo-sdk__player-crown">👑</span>' : '';
          const done = state.ranking.includes(p.color) ? ' ✓' : '';
          const name = COLOR_NAMES[p.color];
          return `<div class="ludo-sdk__player ludo-sdk__player--c${p.color}${active}">
            <span class="ludo-sdk__player-dot"></span>
            <span class="ludo-sdk__player-label">${name[0].toUpperCase()}${name.slice(1)} · ${role}${done}</span>
            ${crown}
          </div>`;
        })
        .join('');
    }

    tokensLayer()
      .querySelectorAll<SVGGElement>('[data-token-id]')
      .forEach((node) => {
        node.onclick = () => {
          const id = node.getAttribute('data-token-id');
          if (!id || busy) return;
          void requestMove(id);
        };
      });
  }

  function scheduleAi(state: GameState) {
    if (opts.controlled) return;
    if (opts.autoAi === false) return;
    if (state.phase === 'finished') return;
    if (!currentPlayerIsAi(state)) return;
    if (canControl(state.currentColor)) return;
    if (busy) return;
    if (aiTimer) clearTimeout(aiTimer);
    aiTimer = setTimeout(() => {
      if (destroyed || busy) return;
      const s = game.getState();
      if (!currentPlayerIsAi(s) || opts.controlled) return;
      playAiStep(game, s.currentColor, opts.aiDifficulty ?? 'hard');
    }, opts.aiDelayMs ?? 650);
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
    if (next) opts = { ...opts, ...next };
    interactive = new Set(
      opts.interactiveColors ??
        resolveSeats(opts)
          .filter((p) => p.kind === 'human')
          .map((p) => p.color),
    );
    busy = false;
    game = makeGame(opts);
    bind();
  }

  function destroy() {
    destroyed = true;
    if (aiTimer) clearTimeout(aiTimer);
    unsub?.();
    root.innerHTML = '';
    root.classList.remove('ludo-sdk', 'ludo-sdk--compact');
  }

  const handle: LudoHandle = {
    get game() {
      return game;
    },
    getState: () => game.getState(),
    roll: () => {
      void requestRoll();
    },
    move: (tokenId: string) => {
      void requestMove(tokenId);
    },
    applyDice: (value: number) => game.applyDice(value),
    applyMove: (tokenId: string) => game.move(tokenId),
    syncState: (state, event) => game.syncState(state, event),
    dispatch: (cmd) => {
      if (cmd.type === 'sync') game.syncState(cmd.state, cmd.event);
      else if (cmd.type === 'dice') game.applyDice(cmd.value);
      else if (cmd.type === 'play') game.move(cmd.tokenId);
      else if (cmd.type === 'config') {
        if (cmd.mode) handle.setMode(cmd.mode);
        if (cmd.aiDifficulty) handle.setAiDifficulty(cmd.aiDifficulty);
        if (cmd.autoAi != null) handle.setAutoAi(cmd.autoAi);
        if (cmd.interactiveColors) handle.setInteractiveColors(cmd.interactiveColors);
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
      paint(game.getState(), null);
    },
    reset,
    destroy,
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
  bind();
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
  });
}

function makeGame(opts: LudoMountOptions): LudoGame {
  return createGame({
    mode: opts.mode ?? 'rush',
    players: resolveSeats(opts),
  });
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
    <div class="ludo-sdk__board-wrap" data-ludo-board></div>
    <div class="ludo-sdk__controls">
      <div class="ludo-sdk__dice-dock" data-ludo-dice-host tabindex="0" role="button" aria-label="Roll dice"></div>
      <button type="button" class="ludo-sdk__btn" data-ludo-roll>
        <span aria-hidden="true">🎲</span> Roll dice
      </button>
      <button type="button" class="ludo-sdk__btn ludo-sdk__btn--icon" data-ludo-sound aria-label="Sound">🔊</button>
    </div>
    ${showPlayers ? '<div class="ludo-sdk__players" data-ludo-players></div>' : ''}
  `;
}

export function createLudoGame(options: LudoMountOptions = {}) {
  return makeGame(options);
}

export { chooseAiMove, offlineRoom };
