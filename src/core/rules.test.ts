/**
 * Rule assertions — run via `npm run smoke` (imported from smoke.ts).
 */
import { createGame } from './game';
import { listLegalMoves } from './moves';
import { advanceToken, enterBoard } from './path';
import { HOME_ENTRY_INDEX, HOME_LEN, START_INDEX } from './constants';
import type { PlayerConfig, Token } from './types';

const fourAi: PlayerConfig[] = [
  { id: 'r', name: 'Red', kind: 'ai', color: 0 },
  { id: 'g', name: 'Green', kind: 'ai', color: 1 },
  { id: 'y', name: 'Yellow', kind: 'ai', color: 2 },
  { id: 'b', name: 'Blue', kind: 'ai', color: 3 },
];

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`RULE FAIL: ${msg}`);
}

export function runRuleTests() {
  // Classic: cannot leave yard without 6
  {
    const g = createGame({ mode: 'classic', players: fourAi });
    // force dice via internal — use play path by mutating through rolls
    const s = g.getState();
    s.phase = 'waiting_move';
    s.dice = 5;
    // inject by rolling until we can check listLegalMoves with crafted state
  }

  // Path: from start, 50 steps lands on home entry; 51st enters home[0]
  {
    const from = enterBoard(0);
    const tokens: Token[] = [];
    const toEntry = advanceToken(0, from, 6, tokens); // partial — walk 50 with loop
    let pos = from;
    for (let i = 0; i < 50; i++) {
      const r = advanceToken(0, pos, 1, tokens);
      assert(r.ok, `step ${i + 1} from start`);
      if (!r.ok) return;
      pos = r.to;
    }
    assert(pos.kind === 'track' && pos.index === HOME_ENTRY_INDEX[0], '50 steps → home entry');
    const into = advanceToken(0, pos, 1, tokens);
    assert(into.ok && into.to.kind === 'homeColumn' && into.to.index === 0, '51st → home[0]');
  }

  // Exact finish from home[0] needs HOME_LEN
  {
    const from = { kind: 'homeColumn' as const, index: 0 };
    const over = advanceToken(0, from, HOME_LEN + 1, []);
    assert(!over.ok, 'overshoot home forbidden');
    const win = advanceToken(0, from, HOME_LEN, []);
    assert(win.ok && win.to.kind === 'finished', 'exact HOME_LEN finishes');
  }

  // Cannot lap past home entry with big roll from entry
  {
    const onEntry = { kind: 'track' as const, index: HOME_ENTRY_INDEX[0] };
    const bad = advanceToken(0, onEntry, 6, []); // 6 → finish exactly (HOME_LEN+1)
    assert(bad.ok && bad.to.kind === 'finished', '6 from entry finishes');
    const tooMuch = advanceToken(0, { kind: 'homeColumn', index: 4 }, 2, []);
    assert(!tooMuch.ok, 'home overshoot');
  }

  // Block: 2 green on a square — red cannot pass through
  {
    const blockIdx = (START_INDEX[0] + 3) % 52;
    const tokens: Token[] = [
      {
        id: 'red-0',
        color: 0,
        slot: 0,
        state: { kind: 'track', index: START_INDEX[0] },
      },
      {
        id: 'green-0',
        color: 1,
        slot: 0,
        state: { kind: 'track', index: blockIdx },
      },
      {
        id: 'green-1',
        color: 1,
        slot: 1,
        state: { kind: 'track', index: blockIdx },
      },
    ];
    const from = tokens[0].state;
    const dist = (blockIdx - START_INDEX[0] + 52) % 52;
    const r = advanceToken(0, from, dist, tokens, 'red-0');
    assert(!r.ok && r.reason === 'blocked', 'cannot land on opponent block');
    // pass-through: roll past block
    if (dist > 1) {
      const pass = advanceToken(0, from, dist + 1, tokens, 'red-0');
      assert(!pass.ok, 'cannot jump opponent block');
    }
  }

  // Capture: single opponent on unsafe square
  {
    const g = createGame({ mode: 'rush', players: fourAi });
    // Place red on start, green one ahead on unsafe
    const st = g.getState();
    const unsafe = 1; // typically not safe if starts at 0 and stars at 8...
    const red = st.tokens.find((t) => t.id === 'red-0')!;
    const green = st.tokens.find((t) => t.id === 'green-0')!;
    red.state = { kind: 'track', index: 0 };
    green.state = { kind: 'track', index: unsafe };
    // Use listLegalMoves by poking game — re-create with custom via move API hard.
    // Direct captureVictim path via listLegalMoves needs phase
    const fake = {
      ...st,
      phase: 'waiting_move' as const,
      dice: 1,
      currentColor: 0 as const,
      tokens: st.tokens.map((t) =>
        t.id === 'red-0'
          ? { ...t, state: { kind: 'track' as const, index: 0 } }
          : t.id === 'green-0'
            ? { ...t, state: { kind: 'track' as const, index: unsafe } }
            : t,
      ),
    };
    const moves = listLegalMoves(fake);
    const m = moves.find((x) => x.tokenId === 'red-0');
    assert(!!m, 'red can move 1');
    assert(m!.captures === 'green-0', 'captures single green on unsafe');
  }

  // Safe square: no capture on start
  {
    const st = createGame({ mode: 'rush', players: fourAi }).getState();
    const fake = {
      ...st,
      phase: 'waiting_move' as const,
      dice: 1,
      currentColor: 1 as const,
      tokens: st.tokens.map((t) => {
        if (t.id === 'green-0') return { ...t, state: { kind: 'track' as const, index: 12 } };
        if (t.id === 'red-0') return { ...t, state: { kind: 'track' as const, index: START_INDEX[0] } };
        return t;
      }),
    };
    // green at 12, roll 1 → lands on 13 which is green start — if red on 13... 
    // red on red start 0; green from 51 roll 1 → 0 red start safe
    const fake2 = {
      ...st,
      phase: 'waiting_move' as const,
      dice: 1,
      currentColor: 1 as const,
      tokens: st.tokens.map((t) => {
        if (t.id === 'green-0') return { ...t, state: { kind: 'track' as const, index: 51 } };
        if (t.id === 'red-0') return { ...t, state: { kind: 'track' as const, index: 0 } };
        return t;
      }),
    };
    const moves = listLegalMoves(fake2);
    const m = moves.find((x) => x.tokenId === 'green-0');
    assert(!!m && m.to.kind === 'track' && m.to.index === 0, 'green lands on red start');
    assert(!m!.captures, 'no capture on safe start');
  }

  // Classic yard: only 6 opens
  {
    const st = createGame({ mode: 'classic', players: fourAi }).getState();
    const d5 = listLegalMoves({
      ...st,
      phase: 'waiting_move',
      dice: 5,
      currentColor: 0,
    });
    assert(d5.every((m) => !m.entersBoard), 'classic: no enter on 5');
    const d6 = listLegalMoves({
      ...st,
      phase: 'waiting_move',
      dice: 6,
      currentColor: 0,
    });
    assert(d6.some((m) => m.entersBoard), 'classic: enter on 6');
  }

  // Rush: any roll opens
  {
    const st = createGame({ mode: 'rush', players: fourAi }).getState();
    const d1 = listLegalMoves({
      ...st,
      phase: 'waiting_move',
      dice: 1,
      currentColor: 0,
    });
    assert(d1.some((m) => m.entersBoard), 'rush: enter on 1');
  }

  // Three sixes forfeit
  {
    let n = 0;
    const rng = () => {
      // always return value that floors to 6: 0.99 → 1+floor(5.94)=6
      n += 1;
      return 0.99;
    };
    const g = createGame({ mode: 'classic', players: fourAi, rng });
    g.roll(); // 6, open available
    // must move or we'll keep getting sixes
    const moves = g.legalMoves();
    if (moves.length) g.play(moves[0]);
    g.roll();
    if (g.getState().phase === 'waiting_move') {
      const m2 = g.legalMoves();
      if (m2.length) g.play(m2[0]);
    }
    const before = g.getState().currentColor;
    g.roll(); // third 6 → forfeit
    const after = g.getState();
    assert(
      after.currentColor !== before || after.turnId > 1,
      'third six advances turn',
    );
    assert(after.phase === 'waiting_roll', 'after third six waiting roll');
    assert(after.dice == null, 'third six clears dice');
  }

  console.log('[rules] all assertions passed');
}
