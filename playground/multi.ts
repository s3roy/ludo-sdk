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

const statusEl = document.querySelector<HTMLElement>('#status')!;
const nameInput = document.querySelector<HTMLInputElement>('#name')!;
const modeSel = document.querySelector<HTMLSelectElement>('#mode')!;
const maxSel = document.querySelector<HTMLSelectElement>('#maxPlayers')!;
const createBtn = document.querySelector<HTMLButtonElement>('#createBtn')!;
const joinBtn = document.querySelector<HTMLButtonElement>('#joinBtn')!;
const joinCode = document.querySelector<HTMLInputElement>('#joinCode')!;
const lobbyBox = document.querySelector<HTMLElement>('#lobbyBox')!;
const roomCodeEl = document.querySelector<HTMLElement>('#roomCode')!;
const seatList = document.querySelector<HTMLElement>('#seatList')!;
const myColorEl = document.querySelector<HTMLElement>('#myColor')!;
const startBtn = document.querySelector<HTMLButtonElement>('#startBtn')!;
const leaveBtn = document.querySelector<HTMLButtonElement>('#leaveBtn')!;
const toastEl = document.querySelector<HTMLElement>('#toast')!;

const COLOR_HEX = ['#e11d48', '#16a34a', '#eab308', '#2563eb'] as const;

type RoomMsg = {
  type: 'room';
  roomId: string;
  color: number;
  status: string;
  players: Array<{
    playerId: string;
    name: string;
    color: number;
    ready: boolean;
  }>;
  seats: PlayerConfig[];
};

type ServerMsg =
  | { type: 'welcome'; playerId: string; name: string }
  | RoomMsg
  | { type: 'ludo'; cmd: LudoHostCommand }
  | { type: 'error'; error: string }
  | { type: 'ok' };

let playerId = localStorage.getItem('ludo-mp-pid') ?? '';
if (!playerId) {
  playerId = `p_${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem('ludo-mp-pid', playerId);
}

let myColor: ColorId | null = null;
let roomId: string | null = null;
let seats: PlayerConfig[] = [];
let status: string = 'lobby';
let tableMode: GameMode = 'rush';
let handle: HostedHandle | null = null;
let toastTimer = 0;

const ludoHandlers = new Set<(cmd: LudoHostCommand) => void>();

function wsUrl(): string {
  const q = new URLSearchParams(location.search).get('ws');
  if (q) return q;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Local Vite / Cloudflare tunnel: same-origin proxy → :8787 (see vite.playground.config)
  // Direct hit on :8787 only when the page itself is served from that port.
  if (location.port === '8787') return `${proto}//${location.host}`;
  return `${proto}//${location.host}/mp`;
}

function setStatus(text: string, kind: '' | 'ok' | 'err' = '') {
  statusEl.textContent = text;
  statusEl.classList.remove('ok', 'err');
  if (kind) statusEl.classList.add(kind);
}

function toast(msg: string) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2000);
}

function colorLabel(c: number) {
  const name = COLOR_NAMES[c as ColorId] ?? `c${c}`;
  return name[0]!.toUpperCase() + name.slice(1);
}

function renderLobby(msg: RoomMsg) {
  roomId = msg.roomId;
  myColor = msg.color as ColorId;
  seats = msg.seats;
  status = msg.status;
  lobbyBox.hidden = false;
  roomCodeEl.textContent = msg.roomId;
  myColorEl.innerHTML = `Your color: <span class="dot" style="background:${COLOR_HEX[msg.color] ?? '#fff'}"></span>${colorLabel(msg.color)}`;
  seatList.innerHTML = msg.players
    .map((p) => {
      const mine = p.playerId === playerId ? ' (you)' : '';
      return `<li><span><span class="dot" style="background:${COLOR_HEX[p.color] ?? '#fff'}"></span>${p.name}${mine}</span><span>${colorLabel(p.color)}${p.ready ? ' · ready' : ''}</span></li>`;
    })
    .join('');
  startBtn.disabled = msg.status !== 'lobby' || msg.players.length < 2;
  startBtn.textContent =
    msg.status === 'playing' ? 'Playing…' : msg.status === 'finished' ? 'Finished' : 'Start game';

  if (msg.status === 'playing' && !handle) {
    mountGame();
  }
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
    // Match multiplayer-server turnDurationMs — ring on every seat's turn
    turnTimer: {
      enabled: true,
      durationMs: 15_000,
      appliesTo: 'all',
      showRing: true,
      onTimeout: 'none',
      pauseWhileBusy: true,
    },
    transport: {
      send: (action) => {
        send({ type: 'action', action });
      },
      subscribe: (fn) => {
        ludoHandlers.add(fn);
        return () => ludoHandlers.delete(fn);
      },
    },
    onWin: ({ winner }) => {
      toast(`${colorLabel(winner)} wins!`);
    },
    onDestroy: ({ reason }) => {
      toast(`Room ended (${reason ?? 'done'})`);
      handle = null;
      document.body.classList.remove('playing');
      document.documentElement.style.overflow = '';
    },
  });
  mountEl.querySelector('.ludo-sdk')?.classList.add('ludo-sdk--fill');
  setStatus('Game on — your turn when the board says so', 'ok');
}

function send(payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

let ws = new WebSocket(wsUrl());
let reconnectTimer = 0;

function connect() {
  ws = new WebSocket(wsUrl());
  setStatus('Connecting…');

  ws.addEventListener('open', () => {
    setStatus('Connected — create or join a room', 'ok');
    send({
      type: 'hello',
      playerId,
      name: nameInput.value.trim() || 'Player',
    });
  });

  ws.addEventListener('message', (ev) => {
    let msg: ServerMsg;
    try {
      msg = JSON.parse(String(ev.data)) as ServerMsg;
    } catch {
      return;
    }

    if (msg.type === 'welcome') {
      playerId = msg.playerId;
      localStorage.setItem('ludo-mp-pid', playerId);
      return;
    }

    if (msg.type === 'room') {
      renderLobby(msg);
      if (msg.status === 'lobby') {
        setStatus(`In lobby ${msg.roomId} · waiting`, 'ok');
      }
      return;
    }

    if (msg.type === 'ludo') {
      for (const fn of ludoHandlers) fn(msg.cmd);
      return;
    }

    if (msg.type === 'error') {
      setStatus(msg.error, 'err');
      toast(msg.error);
      return;
    }
  });

  ws.addEventListener('close', () => {
    setStatus('Disconnected — reconnecting…', 'err');
    handle?.disconnect();
    handle = null;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = window.setTimeout(connect, 1200);
  });
}

connect();

const autoPlaySel = document.querySelector<HTMLSelectElement>('#autoPlay')!;
const onLeaveSel = document.querySelector<HTMLSelectElement>('#onLeave')!;

createBtn.addEventListener('click', () => {
  tableMode = modeSel.value as GameMode;
  send({
    type: 'create',
    name: nameInput.value.trim() || 'Player',
    mode: tableMode,
    maxPlayers: Number(maxSel.value) as 2 | 3 | 4,
    fillAi: false,
    autoPlay: autoPlaySel.value,
    onLeave: onLeaveSel.value,
  });
});

joinBtn.addEventListener('click', () => {
  const code = joinCode.value.trim().toUpperCase();
  if (!code) {
    toast('Enter a room code');
    return;
  }
  send({
    type: 'join',
    roomId: code,
    name: nameInput.value.trim() || 'Player',
  });
});

startBtn.addEventListener('click', () => {
  send({ type: 'start' });
});

leaveBtn.addEventListener('click', () => {
  send({ type: 'leave' });
  handle?.disconnect();
  handle = null;
  document.body.classList.remove('playing');
  document.documentElement.style.overflow = '';
  lobbyBox.hidden = true;
  roomId = null;
  myColor = null;
  mountEl.innerHTML = '';
  setStatus('Left room — create or join again', 'ok');
});

// Deep-link: ?room=ABC123
const qRoom = new URLSearchParams(location.search).get('room');
if (qRoom) joinCode.value = qRoom.toUpperCase();
