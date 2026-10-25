/**
 * Headless cash vs-AI smoke: register → stake → auto-play → settle.
 * Run with cash server up: npx tsx playground/cash-playtest.ts
 */
import WebSocket from 'ws';
import { chooseAiMove } from '../src/core/ai.ts';
import { listLegalMoves } from '../src/core/moves.ts';
import type { ColorId, GameState } from '../src/core/types.ts';

const API = process.env.LUDO_CASH_URL ?? 'http://127.0.0.1:8790';
const WS =
  process.env.LUDO_CASH_WS ??
  `${API.replace(/^http/, 'ws').replace(/\/$/, '')}/ws`;

async function main() {
  const user = `pt_${Math.random().toString(36).slice(2, 7)}`;
  const pass = 'test1234';

  const reg = (await fetch(`${API}/api/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  }).then((r) => r.json())) as {
    ok: boolean;
    token?: string;
    user?: { balance: number; id: string };
    error?: string;
  };
  if (!reg.ok || !reg.token || !reg.user) {
    throw new Error(`register ${JSON.stringify(reg)}`);
  }
  console.log('[cash-pt] registered', user, 'balance', reg.user.balance);

  const token = reg.token;
  const userId = reg.user.id;
  const ws = new WebSocket(WS);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
  });

  const send = (m: object) => ws.send(JSON.stringify(m));

  let myColor: ColorId | null = null;
  let roomId: string | null = null;
  let latest: GameState | null = null;
  let busy = false;
  let steps = 0;
  let lastDoneKey = '';

  function stateKey(st: GameState): string {
    return `${st.turnId}:${st.phase}:${st.dice ?? '-'}:${st.currentColor}`;
  }

  async function pump() {
    if (busy || !latest || myColor == null || !roomId) return;
    const st = latest;
    if (st.phase === 'finished') return;
    if (st.currentColor !== myColor) return;
    if (st.phase !== 'waiting_roll' && st.phase !== 'waiting_move') return;

    const key = stateKey(st);
    if (key === lastDoneKey) return;

    busy = true;
    try {
      if (st.phase === 'waiting_roll') {
        send({
          type: 'action',
          action: { type: 'roll', roomId, color: myColor },
        });
      } else {
        const legal = listLegalMoves(st);
        if (!legal.length) return;
        const pick = chooseAiMove(legal, st, 'hard');
        send({
          type: 'action',
          action: {
            type: 'move',
            roomId,
            color: myColor,
            tokenId: pick.tokenId,
          },
        });
      }
      steps += 1;
      lastDoneKey = key;
      // Wait briefly for server sync before next pump
      await new Promise((r) => setTimeout(r, 80));
    } finally {
      busy = false;
      // Continue if a newer state arrived while we were busy
      queueMicrotask(() => {
        void pump();
      });
    }
  }

  const settled = new Promise<Record<string, unknown>>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`timeout waiting settle after ${steps} acts`)),
      120_000,
    );
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as Record<string, unknown>;
      if (msg.type === 'error') {
        const err = String(msg.error);
        if (
          err !== 'not_waiting_move' &&
          err !== 'not_waiting_roll' &&
          err !== 'not_your_turn'
        ) {
          console.error('[cash-pt] error', err);
        }
        // Allow retry on stale intent
        if (
          err === 'not_waiting_move' ||
          err === 'not_waiting_roll' ||
          err === 'not_your_turn'
        ) {
          lastDoneKey = '';
        }
      }
      if (msg.type === 'hello') {
        console.log(
          '[cash-pt] hello',
          (msg.user as { username: string; balance: number }).username,
          (msg.user as { balance: number }).balance,
        );
      }
      if (msg.type === 'table') {
        myColor = msg.color as ColorId;
        roomId = msg.roomId as string;
        console.log(
          '[cash-pt] table',
          msg.tableId,
          msg.status,
          'pot',
          msg.pot,
          'color',
          myColor,
          'room',
          roomId,
        );
      }
      if (msg.type === 'ludo') {
        const cmd = msg.cmd as { type?: string; state?: GameState };
        if (cmd.state) {
          latest = cmd.state;
          void pump();
        }
      }
      if (msg.type === 'settled') {
        clearTimeout(t);
        resolve(msg);
      }
    });
  });

  send({ type: 'auth', token });
  await new Promise((r) => setTimeout(r, 150));
  send({
    type: 'create',
    stake: 50,
    mode: 'rush',
    maxPlayers: 2,
    fillAi: true,
  });

  const result = await settled;
  const bal = result.balance as number;
  const won = result.winnerUserId === userId;
  console.log('[cash-pt] SETTLED', {
    won,
    winnerUserId: result.winnerUserId,
    payout: result.payout,
    balance: bal,
    ranking: result.ranking,
    steps,
  });
  if (typeof bal !== 'number') throw new Error('bad balance');
  if (won && bal < 1000) throw new Error(`win but balance ${bal}`);
  if (!won && bal !== 950) {
    // AI/house win → stake forfeited
    console.warn('[cash-pt] loss balance expected 950 got', bal);
  }
  console.log('[cash-pt] OK');
  ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
