import {
  COLOR_NAMES,
  mountHostedLudo,
  type ColorId,
  type GameMode,
  type HostedHandle,
  type LudoHostCommand,
  type PlayerConfig,
} from '@ludorush/sdk';

const mountEl = document.querySelector<HTMLElement>('#mount')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;
const authBox = document.querySelector<HTMLElement>('#authBox')!;
const playBox = document.querySelector<HTMLElement>('#playBox')!;
const whoEl = document.querySelector<HTMLElement>('#who')!;
const balanceEl = document.querySelector<HTMLElement>('#balance')!;
const usernameInput = document.querySelector<HTMLInputElement>('#username')!;
const passwordInput = document.querySelector<HTMLInputElement>('#password')!;
const stakeInput = document.querySelector<HTMLInputElement>('#stake')!;
const modeSel = document.querySelector<HTMLSelectElement>('#mode')!;
const playersSel = document.querySelector<HTMLSelectElement>('#players')!;
const joinCode = document.querySelector<HTMLInputElement>('#joinCode')!;
const lobbyBox = document.querySelector<HTMLElement>('#lobbyBox')!;
const tableCodeEl = document.querySelector<HTMLElement>('#tableCode')!;
const seatList = document.querySelector<HTMLElement>('#seatList')!;
const myColorEl = document.querySelector<HTMLElement>('#myColor')!;
const potLine = document.querySelector<HTMLElement>('#potLine')!;
const toastEl = document.querySelector<HTMLElement>('#toast')!;

const COLOR_HEX = ['#e11d48', '#16a34a', '#eab308', '#2563eb'] as const;

type User = { id: string; username: string; balance: number };

type TableMsg = {
  type: 'table';
  tableId: string;
  roomId: string | null;
  stake: number;
  pot: number;
  status: string;
  fillAi: boolean;
  mode?: string;
  color: number | null;
  balance: number;
  players: Array<{
    playerId: string;
    name: string;
    color: number;
    ready: boolean;
  }>;
  seats: PlayerConfig[];
};

type ServerMsg =
  | { type: 'hello'; ok: true; user: User }
  | TableMsg
  | {
      type: 'settled';
      tableId: string;
      winnerUserId: string | null;
      payout: number;
      balance: number;
      ranking: number[];
    }
  | { type: 'ludo'; cmd: LudoHostCommand }
  | { type: 'error'; error: string }
  | { type: 'ok' };

let token = localStorage.getItem('ludo-cash-token') ?? '';
let user: User | null = null;
let myColor: ColorId | null = null;
let tableId: string | null = null;
let roomId: string | null = null;
let seats: PlayerConfig[] = [];
let tableMode: GameMode = 'rush';
let handle: HostedHandle | null = null;
let toastTimer = 0;
let ws: WebSocket | null = null;

const ludoHandlers = new Set<(cmd: LudoHostCommand) => void>();
/** Syncs that arrive before mountHostedLudo subscribes (start race). */
let pendingLudo: LudoHostCommand[] = [];

function pushLudo(cmd: LudoHostCommand) {
  if (ludoHandlers.size === 0) {
    pendingLudo.push(cmd);
    return;
  }
  for (const fn of ludoHandlers) fn(cmd);
}

function subscribeLudo(fn: (cmd: LudoHostCommand) => void) {
  ludoHandlers.add(fn);
  if (pendingLudo.length) {
    const queued = pendingLudo;
    pendingLudo = [];
    for (const cmd of queued) fn(cmd);
  }
  return () => ludoHandlers.delete(fn);
}

function apiBase(): string {
  const q = new URLSearchParams(location.search).get('api');
  if (q) return q.replace(/\/$/, '');
  // Same origin — Vite/tunnel proxies /api → cash host
  return '';
}

function wsUrl(): string {
  const q = new URLSearchParams(location.search).get('ws');
  if (q) return q;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

function bindAppViewportHeight() {
  const set = () => {
    const h = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--app-vh', `${Math.round(h)}px`);
  };
  set();
  window.visualViewport?.addEventListener('resize', set);
  window.addEventListener('resize', set);
}
bindAppViewportHeight();

function setStatus(text: string, kind: '' | 'ok' | 'err' = '') {
  statusEl.textContent = text;
  statusEl.classList.remove('ok', 'err');
  if (kind) statusEl.classList.add(kind);
}

function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2400);
}

function colorLabel(c: number) {
  const name = COLOR_NAMES[c as ColorId] ?? `c${c}`;
  return name[0]!.toUpperCase() + name.slice(1);
}

function showAuth() {
  authBox.classList.add('show');
  playBox.classList.remove('show');
}

function showPlay() {
  authBox.classList.remove('show');
  playBox.classList.add('show');
  if (user) {
    whoEl.textContent = user.username;
    balanceEl.textContent = String(user.balance);
  }
}

async function api(
  path: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(`${apiBase()}${path}`, { ...init, headers });
  return (await res.json()) as Record<string, unknown>;
}

function send(msg: object) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function mountGame() {
  if (!roomId || myColor == null || !seats.length) return;
  handle?.disconnect();
  document.body.classList.add('playing');
  document.documentElement.style.overflow = 'hidden';
  {
    const h = window.visualViewport?.height ?? window.innerHeight;
    document.documentElement.style.setProperty('--app-vh', `${Math.round(h)}px`);
  }
  handle = mountHostedLudo(mountEl, {
    roomId,
    myColor,
    seats,
    mode: tableMode,
    matchDurationMs: tableMode === 'arena' ? 180_000 : undefined,
    theme: 'king',
    compact: true,
    fill: true,
    sound: true,
    transport: {
      send: (action) => send({ type: 'action', action }),
      subscribe: subscribeLudo,
    },
    onWin: () => {
      toast('Match over — settling wallet…');
    },
  });
}

function unmountGame() {
  handle?.disconnect();
  handle = null;
  pendingLudo = [];
  document.body.classList.remove('playing');
  document.documentElement.style.overflow = '';
  mountEl.innerHTML = '';
}

function onTable(msg: TableMsg) {
  tableId = msg.tableId;
  roomId = msg.roomId;
  myColor = msg.color as ColorId | null;
  seats = msg.seats;
  if (
    msg.mode === 'classic' ||
    msg.mode === 'rush' ||
    msg.mode === 'blitz' ||
    msg.mode === 'arena'
  ) {
    tableMode = msg.mode;
  }
  if (user) {
    user.balance = msg.balance;
    balanceEl.textContent = String(msg.balance);
  }
  lobbyBox.hidden = false;
  tableCodeEl.textContent = msg.tableId;
  potLine.textContent = `Pot: ${msg.pot} · stake ${msg.stake} · ${msg.status}`;
  myColorEl.innerHTML =
    msg.color != null
      ? `Your color: <span class="dot" style="background:${COLOR_HEX[msg.color] ?? '#fff'}"></span>${colorLabel(msg.color)}`
      : 'Your color: —';
  seatList.innerHTML = (msg.players.length
    ? msg.players
    : msg.seats.map((s) => ({
        playerId: s.id,
        name: s.name,
        color: s.color,
        ready: true,
      }))
  )
    .map((p) => {
      const mine = user && p.playerId === user.id ? ' (you)' : '';
      return `<li><span><span class="dot" style="background:${COLOR_HEX[p.color] ?? '#fff'}"></span>${p.name}${mine}</span><span>${colorLabel(p.color)}</span></li>`;
    })
    .join('');

  if (msg.status === 'playing' && !handle) mountGame();
  if (msg.status === 'settled' || msg.status === 'cancelled') {
    unmountGame();
  }
}

function connectWs() {
  ws?.close();
  setStatus('Connecting wallet host…');
  ws = new WebSocket(wsUrl());
  ws.onopen = () => {
    if (token) send({ type: 'auth', token });
    else setStatus('Register or login to play', 'ok');
  };
  ws.onclose = () => setStatus('Disconnected — refresh to reconnect', 'err');
  ws.onerror = () => setStatus('Cash server offline — run npm run cash:server', 'err');
  ws.onmessage = (ev) => {
    let msg: ServerMsg;
    try {
      msg = JSON.parse(String(ev.data)) as ServerMsg;
    } catch {
      return;
    }
    if (msg.type === 'hello') {
      user = msg.user;
      showPlay();
      setStatus(`Signed in as ${user.username}`, 'ok');
      return;
    }
    if (msg.type === 'table') {
      onTable(msg);
      return;
    }
    if (msg.type === 'ludo') {
      pushLudo(msg.cmd);
      return;
    }
    if (msg.type === 'settled') {
      if (user) {
        user.balance = msg.balance;
        balanceEl.textContent = String(msg.balance);
      }
      unmountGame();
      if (msg.winnerUserId && user && msg.winnerUserId === user.id) {
        toast(`You won +${msg.payout}`);
        setStatus(`Won +${msg.payout} · balance ${msg.balance}`, 'ok');
      } else if (msg.winnerUserId) {
        toast('You lost the stake');
        setStatus(`Settled · balance ${msg.balance}`, 'err');
      } else {
        toast('AI / house took the pot');
        setStatus(`Settled · balance ${msg.balance}`, 'err');
      }
      lobbyBox.hidden = true;
      tableId = null;
      return;
    }
    if (msg.type === 'error') {
      setStatus(msg.error, 'err');
      toast(msg.error);
    }
  };
}

async function auth(kind: 'login' | 'register') {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const data = await api(`/api/${kind}`, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (!data.ok) {
    setStatus(String(data.error ?? 'auth_failed'), 'err');
    return;
  }
  token = String(data.token);
  localStorage.setItem('ludo-cash-token', token);
  user = data.user as User;
  showPlay();
  connectWs();
}

document.querySelector('#loginBtn')!.addEventListener('click', () => void auth('login'));
document.querySelector('#registerBtn')!.addEventListener('click', () => void auth('register'));

document.querySelector('#logoutBtn')!.addEventListener('click', () => {
  token = '';
  localStorage.removeItem('ludo-cash-token');
  user = null;
  unmountGame();
  showAuth();
  setStatus('Logged out');
  ws?.close();
});

document.querySelector('#topupBtn')!.addEventListener('click', async () => {
  const data = await api('/api/topup', {
    method: 'POST',
    body: JSON.stringify({ amount: 500 }),
  });
  if (!data.ok) {
    toast(String(data.error));
    return;
  }
  user = data.user as User;
  balanceEl.textContent = String(user.balance);
  toast('+500 chips');
});

function selectedPlayers(): 2 | 3 | 4 {
  const n = Number(playersSel.value);
  if (n === 3 || n === 4) return n;
  return 2;
}

document.querySelector('#vsAiBtn')!.addEventListener('click', () => {
  const mode = modeSel.value as GameMode;
  const maxPlayers = selectedPlayers();
  tableMode = mode;
  pendingLudo = [];
  send({
    type: 'create',
    stake: Number(stakeInput.value) || 50,
    mode,
    maxPlayers,
    fillAi: true,
  });
});

document.querySelector('#createHumanBtn')!.addEventListener('click', () => {
  const mode = modeSel.value as GameMode;
  const maxPlayers = selectedPlayers();
  tableMode = mode;
  pendingLudo = [];
  send({
    type: 'create',
    stake: Number(stakeInput.value) || 50,
    mode,
    maxPlayers,
    fillAi: false,
  });
  toast(`Share the table code · ${maxPlayers} seats`);
});

document.querySelector('#joinBtn')!.addEventListener('click', () => {
  send({ type: 'join', tableId: joinCode.value.trim() });
});

document.querySelector('#leaveBtn')!.addEventListener('click', () => {
  send({ type: 'cancel' });
  send({ type: 'leave' });
  unmountGame();
  lobbyBox.hidden = true;
});

(async () => {
  if (!token) {
    showAuth();
    setStatus('Register or login', 'ok');
    return;
  }
  const me = await api('/api/me');
  if (!me.ok) {
    token = '';
    localStorage.removeItem('ludo-cash-token');
    showAuth();
    setStatus('Session expired — login again', 'err');
    return;
  }
  user = me.user as User;
  showPlay();
  connectWs();
})();
