# @ludorush/sdk — production guide

Self-hosted Ludo: **your backend owns the room**; this SDK is the rules engine + embeddable board.

```
┌─────────────┐     create room / seats      ┌──────────────┐
│  Your API   │ ───────────────────────────► │  Postgres /  │
│  (host)     │                              │  Redis       │
└──────┬──────┘                              └──────────────┘
       │ WS / SSE: sync | dice | config
       ▼
┌─────────────┐   onAction(roll|move)        ┌──────────────┐
│  mountLudo  │ ───────────────────────────► │  Your API    │
│  (client)   │ ◄─────────────────────────── │  validates   │
└─────────────┘   applyDice / syncState      └──────────────┘
```

## Install

```bash
npm i @ludorush/sdk
```

```ts
import { mountLudoRoom, type LudoRoomConfig } from '@ludorush/sdk'
import '@ludorush/sdk/style.css'
```

## Game modes

| Mode | Leave yard | Tokens to win |
|------|------------|---------------|
| `classic` | Roll 6 | 4 |
| `rush` | Any | 2 |
| `blitz` | Any | 1 |

Rules detail: [`RULES.md`](./RULES.md).

## Offline / bots (no server)

```ts
import { mountLudoRoom, offlineRoom } from '@ludorush/sdk'

const room = offlineRoom({
  mode: 'rush',
  players: 4,
  aiDifficulty: 'hard',
  humanColor: 0,
})

const game = mountLudoRoom('#board', room, { sound: true })
```

## Hosted room (backend-authoritative)

### 1. Backend creates the room

```ts
// server — example shape (your stack)
const room: LudoRoomConfig = {
  roomId: 'room_abc',
  mode: 'rush',
  seats: [
    { id: 'u1', name: 'Asha', kind: 'human', color: 0 },
    { id: 'u2', name: 'Bot', kind: 'ai', color: 1 },
    { id: 'u3', name: 'Dev', kind: 'human', color: 2 },
    { id: 'bot2', name: 'Bot2', kind: 'ai', color: 3 },
  ],
  interactiveColors: [0], // this client's seat(s)
  controlled: true,       // required for multiplayer fairness
  autoAi: false,          // host runs AI or pure human seats
  aiDifficulty: 'normal',
}
```

### 2. Client mounts

```ts
const ui = mountLudoRoom('#board', room, {
  compact: true,
  sound: true,
  onAction: async (action) => {
    // POST /rooms/:id/action  { type, tokenId? }
    await api.sendAction(action)
    return 'defer' // wait for host broadcast
  },
  onEvent: (e, state) => {
    // optional analytics
  },
})
```

### 3. Host pushes commands

```ts
// after validating roll
ui.applyDice(serverDice)          // or
ui.dispatch({ type: 'dice', value: 4 })

// after validating move
ui.applyMove('red-0')

// full resync (reconnect / mid-game join)
ui.syncState(authoritativeState)

// live config
ui.setAiDifficulty('hard')
ui.setMode('blitz')               // restarts local engine — prefer new room
ui.setInteractiveColors([0, 2])   // shared device
```

### Action contract

**Client → server** (`LudoClientAction`):

```ts
{ type: 'roll', roomId, color }
{ type: 'move', roomId, color, tokenId }
```

**Server → client** (`LudoHostCommand`):

```ts
{ type: 'dice', value: 1|2|3|4|5|6 }
{ type: 'play', tokenId }
{ type: 'sync', state, event? }
{ type: 'config', mode?, aiDifficulty?, autoAi?, interactiveColors? }
```

`onAction` return values:

| Return | Meaning |
|--------|---------|
| `'defer'` | Do nothing locally; host will `applyDice` / `syncState` |
| `'allow'` | Apply with local RNG (offline only) |
| `{ dice: n }` | Apply this face immediately (server already rolled) |

## Handle API

```ts
type LudoHandle = {
  getState(): GameState
  roll() / move(tokenId)
  applyDice(n) / applyMove(tokenId) / syncState(state)
  dispatch(cmd: LudoHostCommand)
  setMode / setAiDifficulty / setAutoAi / setInteractiveColors
  setSoundEnabled(boolean)
  reset(opts?) / destroy()
  sounds: LudoSounds
  roomId?: string
}
```

## Headless (server-side rules)

Run the same engine on Node to validate actions:

```ts
import { createGame, listLegalMoves } from '@ludorush/sdk'

const g = createGame({ mode: 'rush', players: room.seats })
g.applyDice(hostDice)
const legal = listLegalMoves(g.getState())
if (!legal.some(m => m.tokenId === req.tokenId)) throw new Error('illegal')
g.move(req.tokenId)
broadcast({ type: 'sync', state: g.getState() })
```

## UI notes

- Board is compact by default (`compact: true`)
- No move history / mode pickers inside the board — host UI is yours
- Legal pawns glow; seats show as initials only

## Scripts

```bash
npm run dev          # playground :5195
npm run typecheck
npm run smoke
npm run test:bots
npm run test:e2e
npm test             # all of the above
npm run build:sdk
```

## Related

- [RULES.md](./RULES.md) — capture, blocks, extras
- [DESIGN.md](./DESIGN.md) — colours & CSS variables
- [CONTRIBUTING.md](./CONTRIBUTING.md) — local development
