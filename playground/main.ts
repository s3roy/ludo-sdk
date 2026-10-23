import {
  mountLudoRoom,
  offlineRoom,
  THEME_IDS,
  type AiDifficulty,
  type GameMode,
  type LudoHandle,
  type LudoThemeId,
  type TurnTimerAutoAction,
  type TurnTimerConfig,
} from '@ludorush/sdk';

const mountEl = document.querySelector<HTMLElement>('#mount')!;
const modeSel = document.querySelector<HTMLSelectElement>('#mode')!;
const playersSel = document.querySelector<HTMLSelectElement>('#players')!;
const diffSel = document.querySelector<HTMLSelectElement>('#diff')!;
const themeSel = document.querySelector<HTMLSelectElement>('#theme')!;
const timerSel = document.querySelector<HTMLSelectElement>('#timer')!;
const roomIdEl = document.querySelector<HTMLElement>('#roomId')!;
const newGameBtn = document.querySelector<HTMLButtonElement>('#newGame')!;
const shareBtn = document.querySelector<HTMLButtonElement>('#share')!;
const pauseBtn = document.querySelector<HTMLButtonElement>('#pauseTimer')!;
const toastEl = document.querySelector<HTMLElement>('#toast')!;

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
  const auto = key.endsWith('-auto');
  const secs = Number(key.replace('-auto', '')) || 15;
  const onTimeout: TurnTimerAutoAction = auto ? 'auto' : 'skip';
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
  if (timer && /^(off|\d{1,2}(-auto)?)$/.test(timer)) out.timer = timer;
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

function writeUrl(cfg: GameConfig, replace = true) {
  const url = new URL(location.href);
  url.searchParams.set('mode', cfg.mode);
  url.searchParams.set('players', String(cfg.players));
  url.searchParams.set('ai', cfg.aiDifficulty);
  url.searchParams.set('theme', cfg.theme);
  url.searchParams.set('room', cfg.roomId);
  url.searchParams.set('timer', cfg.timer);
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 1800);
}

function start(cfg: GameConfig) {
  handle?.destroy();
  roomIdEl.textContent = cfg.roomId;
  writeUrl(cfg);

  const room = offlineRoom({
    roomId: cfg.roomId,
    mode: cfg.mode,
    players: cfg.players,
    aiDifficulty: cfg.aiDifficulty,
    humanColor: 0,
  });

  handle = mountLudoRoom(mountEl, room, {
    compact: true,
    sound: true,
    theme: cfg.theme,
    aiDelayMs: 600,
    turnTimer: timerConfig(cfg.timer),
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
}

function newGame() {
  const cfg = currentConfig(true);
  start(cfg);
  toast(`Game ${cfg.roomId} ready — roll when it’s your turn`);
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

start(currentConfig(false));
