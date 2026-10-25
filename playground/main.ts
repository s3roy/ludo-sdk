import {
  COLOR_NAMES,
  mountLudoRoom,
  offlineRoom,
  THEME_IDS,
  type AiDifficulty,
  type ColorId,
  type GameMode,
  type GameState,
  type LudoHandle,
  type LudoThemeId,
  type PlayerConfig,
  type TurnTimerAutoAction,
  type TurnTimerConfig,
} from '@ludorush/sdk';

const mountEl = document.querySelector<HTMLElement>('#mount')!;
/** Safari iOS: lock immersive shell to visualViewport (not 100dvh). */
function bindAppViewportHeight() {
  const set = () => {
    const h = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--app-vh', `${Math.round(h)}px`);
  };
  set();
  window.visualViewport?.addEventListener('resize', set);
  window.visualViewport?.addEventListener('scroll', set);
  window.addEventListener('resize', set);
  window.addEventListener('orientationchange', () => {
    requestAnimationFrame(() => requestAnimationFrame(set));
  });
}
bindAppViewportHeight();

const modeSel = document.querySelector<HTMLSelectElement>('#mode')!;
const playersSel = document.querySelector<HTMLSelectElement>('#players')!;
const diffSel = document.querySelector<HTMLSelectElement>('#diff')!;
const themeSel = document.querySelector<HTMLSelectElement>('#theme')!;
const timerSel = document.querySelector<HTMLSelectElement>('#timer')!;
const roomIdEl = document.querySelector<HTMLElement>('#roomId')!;
const newGameBtn = document.querySelector<HTMLButtonElement>('#newGame')!;
const shareBtn = document.querySelector<HTMLButtonElement>('#share')!;
const pauseBtn = document.querySelector<HTMLButtonElement>('#pauseTimer')!;
const starStackBtn = document.querySelector<HTMLButtonElement>('#starStack')!;
const blockDemoBtn = document.querySelector<HTMLButtonElement>('#blockDemo')!;
const toastEl = document.querySelector<HTMLElement>('#toast')!;

/** Star track cells (not starts): red / green / yellow / blue arms */
const STAR_CELLS = [8, 21, 34, 47] as const;

type DemoId = 'star-stack' | 'block' | 'home';

/** Non-safe track cell for the 3-red block (between red start 0 and star 8). */
const BLOCK_CELL = 5;
/** Green sits here — dice 2 would land on BLOCK_CELL (illegal). */
const APPROACH_CELL = 3;

let handle: LudoHandle | null = null;
let toastTimer = 0;

type GameConfig = {
  mode: GameMode;
  players: number;
  aiDifficulty: AiDifficulty;
  theme: LudoThemeId;
  roomId: string;
  timer: string;
};

function randomRoomId(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return id;
}

function timerConfig(key: string): TurnTimerConfig | false {
  if (key === 'off') return false;
  // Default: auto-play (roll + move a pin). Opt out with "10-skip".
  const skip = key.endsWith('-skip');
  const secs = Number(key.replace(/-(auto|skip)$/, '')) || 15;
  const onTimeout: TurnTimerAutoAction = skip ? 'skip' : 'auto';
  return {
    enabled: true,
    durationMs: secs * 1000,
    appliesTo: 'all',
    showRing: true,
    onTimeout,
    pauseWhileBusy: true,
  };
}

function isTheme(v: string | null): v is LudoThemeId {
  return !!v && (THEME_IDS as string[]).includes(v);
}

function readConfigFromUrl(): Partial<GameConfig> {
  const q = new URLSearchParams(location.search);
  const mode = q.get('mode');
  const players = Number(q.get('players'));
  const ai = q.get('ai');
  const theme = q.get('theme');
  const roomId = q.get('room');
  const timer = q.get('timer');
  const out: Partial<GameConfig> = {};
  if (mode === 'classic' || mode === 'rush' || mode === 'blitz') out.mode = mode;
  if (players === 2 || players === 3 || players === 4) out.players = players;
  if (ai === 'easy' || ai === 'normal' || ai === 'hard' || ai === 'extreme') {
    out.aiDifficulty = ai;
  }
  if (isTheme(theme)) out.theme = theme;
  if (roomId && /^[A-Z0-9]{4,12}$/i.test(roomId)) out.roomId = roomId.toUpperCase();
  if (timer && /^(off|\d{1,2}(-(auto|skip))?)$/.test(timer)) out.timer = timer;
  return out;
}

function applyForm(cfg: Partial<GameConfig>) {
  if (cfg.mode) modeSel.value = cfg.mode;
  if (cfg.players) playersSel.value = String(cfg.players);
  if (cfg.aiDifficulty) diffSel.value = cfg.aiDifficulty;
  if (cfg.theme) themeSel.value = cfg.theme;
  if (cfg.timer) timerSel.value = cfg.timer;
}

function currentConfig(forceNewId = false): GameConfig {
  const fromUrl = readConfigFromUrl();
  const themeVal = themeSel.value;
  return {
    mode: modeSel.value as GameMode,
    players: Number(playersSel.value),
    aiDifficulty: diffSel.value as AiDifficulty,
    theme: isTheme(themeVal) ? themeVal : 'king',
    roomId: forceNewId ? randomRoomId() : fromUrl.roomId ?? randomRoomId(),
    timer: timerSel.value,
  };
}

function writeUrl(cfg: GameConfig, demo?: DemoId, replace = true) {
  const url = new URL(location.href);
  url.searchParams.set('mode', cfg.mode);
  url.searchParams.set('players', String(cfg.players));
  url.searchParams.set('ai', cfg.aiDifficulty);
  url.searchParams.set('theme', cfg.theme);
  url.searchParams.set('room', cfg.roomId);
  url.searchParams.set('timer', cfg.timer);
  if (demo) url.searchParams.set('demo', demo);
  else url.searchParams.delete('demo');
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

function isFreezeDemo(demo?: DemoId): boolean {
  return demo === 'star-stack' || demo === 'block' || demo === 'home';
}

/**
 * Home-stretch QA: each color has a pin on 2nd-last + last home cell,
 * plus one finished — check tips sit in cell centers (not on the line).
 */
function applyHomeDemo(h: LudoHandle) {
  const s = h.getState();
  const tokens = s.tokens.map((t) => {
    if (t.slot === 0) {
      return { ...t, state: { kind: 'homeColumn' as const, index: 3 } }; // 2nd-last
    }
    if (t.slot === 1) {
      return { ...t, state: { kind: 'homeColumn' as const, index: 4 } }; // last
    }
    if (t.slot === 2) {
      return { ...t, state: { kind: 'finished' as const } };
    }
    return { ...t, state: { kind: 'yard' as const } };
  });
  const next: GameState = {
    ...s,
    tokens,
    players: freezeSeats(),
    phase: 'waiting_roll',
    dice: null,
    currentColor: 0,
    consecutiveSixes: 0,
  };
  h.syncState(next);
  h.setTurnTimer(false);
}

function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function freezeSeats(): PlayerConfig[] {
  return ([0, 1, 2, 3] as ColorId[]).map((color) => ({
    id: `seat-${color}`,
    name: COLOR_NAMES[color][0]!.toUpperCase() + COLOR_NAMES[color].slice(1),
    kind: 'human' as const,
    color,
    presence: 'ready' as const,
  }));
}

/**
 * Each color: 2 pins stacked on that color’s star (4 stacks × 2).
 * Easy to judge tip centering without an 8-wide fan.
 */
function applyStarStackDemo(h: LudoHandle) {
  const s = h.getState();
  const tokens = s.tokens.map((t) => {
    // slots 0+1 on this color’s star; 2+3 stay in yard
    if (t.slot === 0 || t.slot === 1) {
      const star = STAR_CELLS[t.color]!;
      return { ...t, state: { kind: 'track' as const, index: star } };
    }
    return { ...t, state: { kind: 'yard' as const } };
  });
  const next: GameState = {
    ...s,
    tokens,
    players: freezeSeats(),
    phase: 'waiting_roll',
    dice: null,
    currentColor: 0,
    consecutiveSixes: 0,
  };
  h.syncState(next);
  h.setTurnTimer(false);
}

/**
 * Block QA scene:
 * - 3 reds stacked on unsafe cell 5 (immune wall)
 * - 2 yellows stacked on cell 28 (2-stack look)
 * - 1 blue alone on unsafe cell 10 (capturable if landed on)
 * - Green on cell 3 with dice=2 → would land on 5 but move is illegal
 * - Another green free on cell 15 so you can still move / compare
 */
function applyBlockDemo(h: LudoHandle) {
  const s = h.getState();
  const tokens = s.tokens.map((t) => {
    if (t.color === 0) {
      // Red: 3-stack block on BLOCK_CELL
      if (t.slot <= 2) {
        return { ...t, state: { kind: 'track' as const, index: BLOCK_CELL } };
      }
      return { ...t, state: { kind: 'yard' as const } };
    }
    if (t.color === 1) {
      if (t.slot === 0) {
        return { ...t, state: { kind: 'track' as const, index: APPROACH_CELL } };
      }
      if (t.slot === 1) {
        return { ...t, state: { kind: 'track' as const, index: 15 } };
      }
      return { ...t, state: { kind: 'yard' as const } };
    }
    if (t.color === 2) {
      // Yellow: 2-stack elsewhere
      if (t.slot === 0 || t.slot === 1) {
        return { ...t, state: { kind: 'track' as const, index: 28 } };
      }
      return { ...t, state: { kind: 'yard' as const } };
    }
    // Blue: lone pin on unsafe cell (capture target)
    if (t.slot === 0) {
      return { ...t, state: { kind: 'track' as const, index: 10 } };
    }
    return { ...t, state: { kind: 'yard' as const } };
  });
  const next: GameState = {
    ...s,
    tokens,
    players: freezeSeats(),
    // Green to move with a 2 that would hit the red wall
    currentColor: 1,
    phase: 'waiting_move',
    dice: 2,
    consecutiveSixes: 0,
  };
  h.syncState(next);
  h.setTurnTimer(false);
}

function start(cfg: GameConfig, demo?: DemoId) {
  handle?.destroy();
  roomIdEl.textContent = cfg.roomId;
  writeUrl(cfg, demo);

  const freeze = isFreezeDemo(demo);
  const room = freeze
    ? {
        roomId: cfg.roomId,
        mode: cfg.mode,
        seats: freezeSeats(),
        interactiveColors: [0, 1, 2, 3] as ColorId[],
        autoAi: false,
        controlled: false,
      }
    : offlineRoom({
        roomId: cfg.roomId,
        mode: cfg.mode,
        players: cfg.players,
        aiDifficulty: cfg.aiDifficulty,
        // Random seat each game — not always red
        humanColor: Math.floor(Math.random() * 4) as ColorId,
      });

  document.body.classList.add('playing');
  document.documentElement.style.overflow = 'hidden';
  {
    const h = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--app-vh', `${Math.round(h)}px`);
  }
  handle = mountLudoRoom(mountEl, room, {
    compact: false,
    sound: true,
    theme: cfg.theme,
    aiDelayMs: freeze ? 60_000 : 600,
    turnTimer: freeze ? false : timerConfig(cfg.timer),
    onRematch: () => {
      newGame();
    },
    onTurn: ({ color, isMine, turnId }) => {
      console.info('[turn]', { color, isMine, turnId });
    },
    onMyTurn: () => {
      console.info('[my-turn]');
    },
    onWin: ({ winner, ranking }) => {
      console.info('[win]', winner, ranking);
    },
    onDestroy: ({ reason }) => {
      console.info('[destroy]', reason);
    },
    onTurnTimeout: (ctx) => {
      console.info('[timer] miss', ctx.color, ctx.phase, ctx.turnId);
    },
  });
  mountEl.querySelector('.ludo-sdk')?.classList.add('ludo-sdk--fill');

  if (demo === 'star-stack') {
    applyStarStackDemo(handle);
    toast('Star stacks · 2 pins per color on each star');
  } else if (demo === 'block') {
    applyBlockDemo(handle);
    toast(
      'Block demo · Green’s dice=2 cannot land on 3-red stack · move the free green pin',
    );
  } else if (demo === 'home') {
    applyHomeDemo(handle);
    toast('Home path · 2nd-last + last cell + 1 finished per color');
  }
}

function newGame() {
  const cfg = currentConfig(true);
  start(cfg);
  toast(`Game ${cfg.roomId} ready — roll when it’s your turn`);
}

function showStarStack() {
  const cfg = currentConfig(true);
  cfg.theme = 'king';
  cfg.players = 4;
  start(cfg, 'star-stack');
}

function showBlockDemo() {
  const cfg = currentConfig(true);
  cfg.theme = 'king';
  cfg.players = 4;
  start(cfg, 'block');
}

async function share() {
  const cfg = currentConfig(false);
  writeUrl(cfg);
  const link = location.href;
  try {
    await navigator.clipboard.writeText(link);
    toast('Share link copied');
  } catch {
    toast(link);
  }
}

function togglePause() {
  if (!handle) return;
  const t = handle.getTurnTimer();
  if (!t.enabled) {
    toast('Timer is off — pick a duration above');
    return;
  }
  if (t.paused) {
    handle.resumeTurnTimer();
    toast('Timer resumed');
  } else if (t.running || t.remainingMs > 0) {
    handle.pauseTurnTimer();
    toast('Timer paused');
  } else {
    handle.resetTurnTimer();
    toast('Timer reset');
  }
}

applyForm(readConfigFromUrl());
newGameBtn.addEventListener('click', newGame);
starStackBtn.addEventListener('click', showStarStack);
blockDemoBtn.addEventListener('click', showBlockDemo);
shareBtn.addEventListener('click', () => {
  void share();
});
pauseBtn.addEventListener('click', togglePause);
timerSel.addEventListener('change', () => {
  if (!handle) return;
  const cfg = timerConfig(timerSel.value);
  handle.setTurnTimer(cfg);
  writeUrl(currentConfig(false));
  toast(cfg ? `Timer ${cfg.durationMs / 1000}s` : 'Timer off');
});
themeSel.addEventListener('change', () => {
  const cfg = currentConfig(false);
  if (handle) {
    handle.setTheme(cfg.theme);
    writeUrl(cfg);
    toast(`Theme · ${cfg.theme}`);
  } else {
    start(cfg);
  }
});

const bootDemo = new URLSearchParams(location.search).get('demo');
if (bootDemo === 'star-stack') {
  showStarStack();
} else if (bootDemo === 'block') {
  showBlockDemo();
} else if (bootDemo === 'home') {
  const cfg = currentConfig(true);
  cfg.theme = 'king';
  cfg.players = 4;
  start(cfg, 'home');
} else {
  start(currentConfig(false));
}
