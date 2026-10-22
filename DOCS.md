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
{ type: 'presence', roomId, color, presence } // optional lobby intent
```

**Server → client** (`LudoHostCommand`):

```ts
{ type: 'dice', value: 1|2|3|4|5|6 }
{ type: 'play', tokenId }
{ type: 'sync', state, event? }
{ type: 'presence', color, presence, name?, id? }
{ type: 'seats', seats }
{ type: 'config', mode?, aiDifficulty?, autoAi?, interactiveColors?, turnTimer?, absentSeat? }
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

## Turn timer (dice box border)

Optional countdown drawn as a **rounded rectangle** matching the dice dock outer shape (not a circle). Starts bright blue (`#0785FF`), turns red near the end.

By default the timer is **visible for every seat’s turn** (you + opponents / AI). Miss actions (`skip` / `auto`) only apply to **interactive** seats so bots are not forfeited mid-turn.

```ts
mountLudoRoom('#board', room, {
  turnTimer: {
    enabled: true,
    durationMs: 15_000,
    appliesTo: 'all',         // default — show for opponents too
                              // 'interactive' | 'human' | ColorId[]
    showRing: true,
    onTimeout: 'skip',        // 'skip' | 'auto' | 'none' (your seats only)
    pauseWhileBusy: true,     // freeze during dice/move anim
  },
  onTurnTimeout: (ctx) => {
    // fires for any seat that hits 0 — including opponents
    // return 'auto' | 'skip' | 'none' to override (interactive seats)
  },
  onTurnTick: ({ remainingMs, ratio }) => {
    // optional custom HUD
  },
})

// runtime control
ui.setTurnTimer({ enabled: true, durationMs: 20_000, appliesTo: 'all' })
ui.pauseTurnTimer()
ui.resumeTurnTimer()
ui.resetTurnTimer()
ui.getTurnTimer() // { remainingMs, running, paused, ratio, color, … }
ui.forfeitTurn()  // same as skip
ui.dispatch({ type: 'config', turnTimer: { enabled: false } })
```

| Option | Meaning |
|--------|---------|
| `appliesTo: 'all'` | Show blue box timer on every turn (default) |
| `appliesTo: 'interactive'` | Only when it’s your seat |
| `onTimeout: 'skip'` | Forfeit your seat → next player (`timeout` event) |
| `onTimeout: 'auto'` | Auto-roll / auto-pick move for your seat |
| `onTimeout: 'none'` | Callback only (typical for `controlled` rooms) |

Default: timer **off**. When enabled without `onTimeout`, offline → `skip`, `controlled` → `none`.

## Seat presence / join queue

Matchmaking and the join queue live on **your host**. The SDK tracks per-seat status so the UI and timer know who has actually joined.

| `presence` | Meaning |
|------------|---------|
| `empty` | Open lobby slot |
| `joining` | Reserved / connecting |
| `joined` | In room |
| `ready` | Ready / playing (AI default) |
| `disconnected` | Dropped mid-game |

```ts
const room: LudoRoomConfig = {
  roomId: 'room_abc',
  mode: 'rush',
  seats: [
    { id: 'u1', name: 'Asha', kind: 'human', color: 0, presence: 'ready' },
    { id: 'open', name: 'Open', kind: 'human', color: 1, presence: 'empty' },
    { id: 'bot', name: 'Bot', kind: 'ai', color: 2, presence: 'ready' },
  ],
  interactiveColors: [0],
  controlled: true,
  // When current seat is empty / disconnected:
  absentSeat: { action: 'skip', delayMs: 400 }, // or 'auto' | 'none'
}

const ui = mountLudoRoom('#board', room, {
  onPresence: (color, presence, state) => {
    // analytics / lobby UI
  },
})

// host → clients
ui.setSeatPresence(1, 'joining', { name: 'Dev', id: 'u2' })
ui.setSeatPresence(1, 'ready')
ui.dispatch({ type: 'presence', color: 1, presence: 'disconnected' })
ui.dispatch({ type: 'seats', seats: nextLobbySeats })

ui.allHumansPresent() // true when every human is joined/ready
ui.getSeats()
```

- Timer does **not** run for `empty` / `joining` / `disconnected` seats.
- `absentSeat.action`: `skip` forfeits, `auto` AI-fills, `none` waits for host (default in `controlled` rooms).
- Animation events are still serialized on an internal promise queue so dice/moves never overlap.

## UI notes

- Board is compact by default (`compact: true`)
- No move history / mode pickers inside the board — host UI is yours
- Legal pawns glow; seats show presence badges when not ready
- Turn timer is a blue rounded-rect border around the dice dock (visible for all turns when `appliesTo: 'all'`)

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
