# Hosted multiplayer architecture

**Your backend owns the truth. The browser only paints and sends intents.**

```
┌─────────────────────────────────────────────────────────────┐
│  YOUR SERVER (Node / Edge)                                  │
│  createLudoLobby()                                          │
│    · createRoom / join / ready / start / leave / destroy    │
│    · action(roomId, playerId, intent)  ← seat-authenticated │
│    · server AI seats (driveAi)                              │
│    · authoritative RNG, win, forfeit, abandon               │
│                         │ broadcast(LudoHostCommand)        │
└─────────────────────────┼───────────────────────────────────┘
                          │ WebSocket / SSE / Redis
┌─────────────────────────▼───────────────────────────────────┐
│  CLIENT SDK (npm install @ludorush/sdk)                     │
│  mountHostedLudo()                                          │
│    · themes (king / rush / felt / neon / ivory / midnight)  │
│    · board UI, dice anim, timer ring                        │
│    · onAction → transport.send (always defer)               │
│    · dispatch(hostCommand) only applies state               │
│  ✗ no local roll / move / win in controlled mode            │
└─────────────────────────────────────────────────────────────┘
```

## What must never be trusted from the client

| Concern | Owner |
|---------|--------|
| Dice face | Server RNG via `lobby.action` → host `roll` |
| Move legality | Server `listLegalMoves` |
| Whose turn | Server `GameState.currentColor` |
| Seat ownership | Server maps `playerId → color` (rejects spoofed color) |
| Win / ranking | Server engine |
| Room destroy | Server `lobby.destroy` (clients cannot `destroy`) |
| AI moves | Server `driveAi` after each human action |
| Themes / SFX | Client only (cosmetics) |

## Minimal server wiring

```ts
import { createLudoLobby } from '@ludorush/sdk'

const lobby = createLudoLobby({
  broadcast: (roomId, cmd) => io.to(roomId).emit('ludo', cmd),
  rng: () => cryptoRandom(), // use CSPRNG in production
})

io.on('connection', (socket) => {
  socket.on('ludo:create', (body, ack) => ack(lobby.createRoom(body)))
  socket.on('ludo:join', ({ roomId, name }, ack) => {
    const r = lobby.join(roomId, { playerId: socket.userId, name })
    if (r.ok) socket.join(roomId)
    ack(r)
  })
  socket.on('ludo:start', ({ roomId }, ack) => ack(lobby.start(roomId)))
  socket.on('ludo:action', (action, ack) => {
    ack(lobby.action(action.roomId, socket.userId, action))
  })
})
```

## Minimal client wiring

```ts
import { mountHostedLudo } from '@ludorush/sdk'

const join = await api.join(roomId) // { color, seats, mode }

const ui = mountHostedLudo('#board', {
  roomId,
  mode: join.mode,
  myColor: join.color,
  seats: join.seats,
  theme: 'king', // or rush | felt | neon | ivory | midnight
  transport: {
    send: (a) => socket.emit('ludo:action', a),
    subscribe: (fn) => {
      socket.on('ludo', fn)
      return () => socket.off('ludo', fn)
    },
  },
})
```

## Offline / playground

`mountLudo` / `offlineRoom` with `controlled: false` is for local demos only.
Production rooms must use `createLudoLobby` + `mountHostedLudo`.

## Package layout

```
src/
  core/          # LudoGame engine, moves, Arena scoring, AI
  server/        # createLudoLobby (rooms, clocks, driveAi)
  sdk/           # mountLudo, mountHostedLudo, createLudoRoomHost
  client/        # hosted transport helper
  ui/            # SVG board, themes, styles.css
playground/
  index.html     # offline · mode + players 2–4 + AI
  multi.html     # free WS lobby
  cash.html      # demo wallet + stake · players 2–4
  cash-server.ts # wallet + escrow + lobby on :8790
```

## Self-host layers (SUD-style)

Three processes — keep them separate so you can swap any one:

| Layer | Package / process | Owns |
|-------|-------------------|------|
| **Rules SDK** | `@ludorush/sdk` (`src/core`, `src/server/lobby`) | Dice, legality, AI, win / Arena clock |
| **Cash host** | `playground/cash-server.ts` (`npm run cash:server`) | Login, wallet, stake escrow, settle |
| **Frontend** | Vite playground (`cash.html` / `multi.html`) | Paint + intents only |

```
Browser (cash.html)
   │ HTTP  /api/register|/login|/me|/topup
   │ WS    auth → create(mode, maxPlayers, fillAi)/join/action
   ▼
Cash host :8790
   │ wallet file (.data/cash-wallet.json)
   │ escrow on create/join
   │ createLudoLobby({ aiDifficulty: 'extreme' })
   ▼
Lobby engine (in-process)
   │ broadcast LudoHostCommand (sync / dice / play)
   ▼
mountHostedLudo → paint only (scorebug, board, HUDs)
```

**Data flow for one turn**

1. Client taps dice → `transport.send({ type: 'roll' })`.
2. Cash host → `lobby.action(roomId, userId, action)` (seat-authenticated).
3. Host rolls RNG, applies engine, `broadcast({ type: 'sync', state, event })`.
4. Client `dispatch(cmd)` → animate + paint. Never applies its own dice.

**Arena**

- Lobby sets `matchDurationMs` (default 180s) and `matchEndsAt` on start.
- Engine awards points; when the clock hits zero, `endMatch()` ranks by score.
- UI scorebug is cosmetic — scores come from synced `GameState.scores`.

**Foolproof cash rules**

1. Client never rolls, moves, or settles — only `action` intents with server `playerId`.
2. Stake is debited **before** seat join; pot lives in server escrow.
3. `onWin` credits winner (pot − rake); AI win → house keeps pot (stake forfeited).
4. Cancel only while table is `open` (full refund); mid-game leave → convert_ai policy.
5. AI defaults to **extreme** (expectiminimax). Hard uses a shallower search.
6. **Players 2–4**: `fillAi: true` fills empty seats and auto-starts; human tables wait until seats fill (or host starts).

Demo: `npm run cash:server` + `npm run dev` → http://localhost:5195/cash.html

Free (no wallet) multi: `npm run multiplayer:server` → http://localhost:5195/multi.html

## Themes

Client-only. Call `ui.setTheme('neon')` anytime. Board SVG + chrome CSS update together.
Does not affect rules or fairness.
