import {
  mountLudoRoom,
  offlineRoom,
  type AiDifficulty,
  type GameMode,
  type LudoHandle,
} from '@ludorush/sdk';

const mountEl = document.querySelector<HTMLElement>('#mount')!;
const modeSel = document.querySelector<HTMLSelectElement>('#mode')!;
const playersSel = document.querySelector<HTMLSelectElement>('#players')!;
const diffSel = document.querySelector<HTMLSelectElement>('#diff')!;
const applyBtn = document.querySelector<HTMLButtonElement>('#apply')!;

let handle: LudoHandle | null = null;

function start() {
  handle?.destroy();
  const room = offlineRoom({
    roomId: `demo-${Date.now()}`,
    mode: modeSel.value as GameMode,
    players: Number(playersSel.value),
    aiDifficulty: diffSel.value as AiDifficulty,
    humanColor: 0,
  });

  handle = mountLudoRoom(mountEl, room, {
    compact: true,
    sound: true,
    aiDelayMs: 600,
  });
}

applyBtn.addEventListener('click', start);
start();
