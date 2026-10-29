/**
 * Hosted example client — Play → queue → matched → mountHostedLudo.
 * Game authority lives on the Node backend (never in this browser).
 */
import {
  mountHostedLudo,
  type HostedHandle,
  type LudoClientAction,
  type LudoHostCommand,
  type LudoThemeId,
  type PlayerConfig,
  type ColorId,
  type NormalizedRoomPolicy,
} from '@ludorush/sdk';
import '../../../src/ui/styles.css';
import './style.css';

const WS_URL =
  (import.meta as ImportMeta & { env?: { VITE_WS_URL?: string } }).env
    ?.VITE_WS_URL ?? `ws://${location.hostname}:8787`;

const app = document.querySelector<HTMLElement>('#app')!;
const playShell = document.querySelector<HTMLElement>('#play')!;

const el = {
  name: document.querySelector<HTMLInputElement>('#name')!,
  token: document.querySelector<HTMLInputElement>('#token')!,
  seats: document.querySelector<HTMLSelectElement>('#seats')!,
  mode: document.querySelector<HTMLSelectElement>('#mode')!,
  theme: document.querySelector<HTMLSelectElement>('#theme')!,
  status: document.querySelector<HTMLElement>('#status')!,
  playStatus: document.querySelector<HTMLElement>('#playStatus')!,
  ids: document.querySelector<HTMLElement>('#ids')!,
  policy: document.querySelector<HTMLElement>('#policy')!,
  seatCount: document.querySelector<HTMLElement>('#seat-count')!,
  seatList: document.querySelector<HTMLElement>('#seat-list')!,
  board: document.querySelector<HTMLElement>('#board')!,
  play: document.querySelector<HTMLButtonElement>('#btn-play')!,
  cancel: document.querySelector<HTMLButtonElement>('#btn-cancel')!,
  leave: document.querySelector<HTMLButtonElement>('#btn-leave')!,
};

type LobbyPlayer = {
  playerId: string;
  name: string;
  color: ColorId;
  ready: boolean;
};

type Match = {
  roomId: string;
  color: ColorId;
  players: LobbyPlayer[];
  config: { seats: PlayerConfig[]; mode: string; roomId: string };
  policy: NormalizedRoomPolicy;
};

let ws: WebSocket | null = null;
let playerId = '';
let match: Match | null = null;
let queued = false;
let game: HostedHandle | null = null;
let cmdHandler: ((cmd: LudoHostCommand) => void) | null = null;
const cmdQueue: LudoHostCommand[] = [];

function setStatus(text: string) {
  el.status.textContent = text;
  el.playStatus.textContent = text;
}

function setPlaying(on: boolean) {
  app.classList.toggle('playing', on);
  playShell.hidden = !on;
}

function updateIds() {
  el.ids.textContent = [
    playerId ? `you=${playerId}` : null,
    match ? `room=${match.roomId}` : null,
    match != null ? `seat=c${match.color}` : null,
    queued ? 'state=queued' : match ? 'state=playing' : 'state=idle',
  ]
    .filter(Boolean)
    .join(' · ');
}

function setButtons() {
  el.play.disabled = queued || !!match;
  el.cancel.disabled = !queued;
  el.leave.disabled = !match && !queued;
}

function send(msg: unknown) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function showPolicy(p?: NormalizedRoomPolicy | null) {
  if (!p) {
    el.policy.textContent = '';
    return;
  }
  el.policy.textContent = [
    `turn=${p.turnDurationMs === false ? 'off' : `${p.turnDurationMs}ms`}`,
    `timeout=${p.onTurnTimeout}`,
    `maxAuto=${p.maxAutoTurns}`,
    `leave=${p.onLeave}`,
  ].join(' · ');
}

function renderSeats() {
  if (!match) {
    el.seatCount.textContent = '';
    el.seatList.innerHTML = '';
    return;
  }
  el.seatCount.textContent = `(${match.players.length})`;
  el.seatList.innerHTML = '';
  for (const p of match.players) {
    const li = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = `swatch c${p.color}`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;
    li.append(swatch, name);
    if (p.playerId === playerId) {
      const b = document.createElement('span');
      b.className = 'badge you';
      b.textContent = 'you';
      li.append(b);
    }
    el.seatList.append(li);
  }
}

function clearMatch(reason: string) {
  match = null;
  queued = false;
  teardownGame();
  setPlaying(false);
  renderSeats();
  showPolicy(null);
  setButtons();
  updateIds();
  setStatus(reason);
}

function onMatched(msg: Record<string, unknown>) {
  queued = false;
  match = {
    roomId: String(msg.roomId),
    color: msg.color as ColorId,
    players: (msg.players as LobbyPlayer[]) ?? [],
    config: msg.config as Match['config'],
    policy: msg.policy as NormalizedRoomPolicy,
  };
  showPolicy(match.policy);
  renderSeats();
  setButtons();
  updateIds();
  setStatus(`Matched ${match.roomId}`);
  setPlaying(true);
  if (!game) mountGame(match);
}

function connect() {
  setStatus(`Connecting ${WS_URL}…`);
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setStatus('Connected — press Play');
    send({ type: 'hello', name: el.name.value.trim() || 'Player' });
  };

  ws.onclose = () => {
    setStatus('Disconnected — retrying…');
    queued = false;
    match = null;
    setButtons();
    teardownGame();
    setTimeout(connect, 1200);
  };

  ws.onerror = () => setStatus('WebSocket error');

  ws.onmessage = (ev) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
    } catch {
      return;
    }

    if (msg.type === 'welcome') {
      playerId = String(msg.playerId ?? '');
      updateIds();
      return;
    }
    if (msg.type === 'error') {
      setStatus(`Error: ${String(msg.error ?? '')}`);
      return;
    }
    if (msg.type === 'queue') {
      queued = true;
      setButtons();
      updateIds();
      setStatus(
        `In queue ${msg.token} · ${msg.playersInQueue}/${msg.seats} · pos ${msg.position}`,
      );
      return;
    }
    if (msg.type === 'queue_cancelled') {
      queued = false;
      setButtons();
      updateIds();
      setStatus(`Queue cancelled (${msg.reason ?? 'cancelled'})`);
      return;
    }
    if (msg.type === 'matched') {
      onMatched(msg);
      return;
    }
    if (msg.type === 'kicked' || msg.type === 'left' || msg.type === 'destroyed') {
      clearMatch(
        msg.type === 'destroyed'
          ? `Room destroyed (${msg.reason ?? ''})`
          : msg.type === 'kicked'
            ? 'Kicked'
            : 'Left match',
      );
      return;
    }
    if (msg.type === 'ludo' && msg.cmd) {
      const cmd = msg.cmd as LudoHostCommand;
      if (cmdHandler) cmdHandler(cmd);
      else cmdQueue.push(cmd);
      if (cmd.type === 'destroy') {
        clearMatch(`Destroyed (${cmd.reason ?? 'host'})`);
      }
    }
  };
}

function teardownGame() {
  game?.disconnect();
  game = null;
  cmdHandler = null;
  cmdQueue.length = 0;
  el.board.innerHTML = '';
}

function mountGame(info: Match) {
  teardownGame();
  game = mountHostedLudo(el.board, {
    roomId: info.roomId,
    mode: (info.config.mode as 'rush') ?? 'rush',
    myColor: info.color,
    seats: info.config.seats,
    theme: el.theme.value as LudoThemeId,
    compact: false,
    sound: true,
    turnTimer:
      info.policy.turnDurationMs === false
        ? false
        : {
            enabled: true,
            durationMs: info.policy.turnDurationMs,
            appliesTo: 'all',
            showRing: true,
            onTimeout: 'none',
          },
    transport: {
      send: (action: LudoClientAction) => send({ type: 'action', action }),
      subscribe: (handler) => {
        cmdHandler = handler;
        const pending = cmdQueue.splice(0, cmdQueue.length);
        for (const cmd of pending) handler(cmd);
        return () => {
          if (cmdHandler === handler) cmdHandler = null;
        };
      },
    },
    onWin: ({ winner }) => setStatus(`Winner · color ${winner}`),
    onDestroy: ({ reason }) => clearMatch(`Destroyed: ${reason}`),
    onTurn: ({ color, isMine }) => {
      setStatus(isMine ? 'Your turn' : `Waiting · seat ${color}`);
    },
    onMyTurn: () => setStatus('Your turn'),
  });
}

el.play.addEventListener('click', () => {
  send({ type: 'hello', name: el.name.value.trim() || 'Player' });
  const seats = Number(el.seats.value) as 2 | 3 | 4;
  let token = el.token.value.trim() || undefined;
  if (token === 'demo' && seats !== 4) {
    token = undefined;
    setStatus(`Public ${seats}-seat pool (demo table is 4-only)`);
  }
  send({
    type: 'play',
    token,
    seats,
    mode: el.mode.value,
  });
});

el.cancel.addEventListener('click', () => send({ type: 'cancel' }));
el.leave.addEventListener('click', () => send({ type: 'leave' }));

setButtons();
connect();
