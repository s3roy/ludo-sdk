# @ludorush/sdk — production guide

Self-hosted Ludo: **your backend owns matchmaking and the room**; this SDK is the rules engine + embeddable board + lifecycle callbacks.

Match users however you want (queue, party, Elo), then:

```ts
import { createLudoLobby } from '@ludorush/sdk'

const lobby = createLudoLobby({
  broadcast: (roomId, cmd) => io.to(roomId).emit('ludo', cmd),
})

const match = lobby.createMatch({
  players: [
    { playerId: 'u1', name: 'Ada' },
    { playerId: 'u2', name: 'Bob' },
  ],
  maxPlayers: 4, // remaining seats → AI
  mode: 'rush',
  policy: { turnDurationMs: 15_000, onTurnTimeout: 'auto', maxAutoTurns: 3 },
})
```

`createLudoMatchmaker` is an optional in-process Play queue for demos — prefer your own matcher + `createMatch`.

```
┌─────────────┐     create room / seats      ┌──────────────┐
│  Your API   │ ───────────────────────────► │  Postgres /  │
│  (host)     │                              │  Redis       │
└──────┬──────┘                              └──────────────┘
       │ WS / SSE: sync | dice | presence | destroy
       ▼
┌─────────────┐   onAction(roll|move|forfeit|leave|destroy)
│  mountLudo  │ ───────────────────────────► │  Your API    │
│  (client)   │ ◄─────────────────────────── │  validates   │
└─────────────┘   applyDice / syncState / destroyRoom
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
| `rush` | Roll 6 | 2 |
| `blitz` | Roll 6 | 1 |

Rules detail: [`RULES.md`](./RULES.md).

## Offline / bots (no server)

```ts
import { mountLudoRoom, offlineRoom } from '@ludorush/sdk'

const room = offlineRoom({
  mode: 'rush',
  players: 4,
  aiDifficulty: 'extreme', // easy | normal | hard | extreme
  humanColor: 0,
})

const game = mountLudoRoom('#board', room, {
  sound: true,
  onTurn: ({ color, isMine }) => console.log('turn', color, isMine),
  onMyTurn: () => console.log('your move'),
  onWin: ({ winner }) => console.log('winner', winner),
  onDestroy: ({ reason }) => console.log('room ended', reason),
})
```

## Lifecycle callbacks

Wire these on `mountLudo` / `mountLudoRoom`. Raw engine events still arrive via `onEvent`.

| Callback | When |
|----------|------|
| `onReady(handle)` | Mount finished |
| `onTurn(ctx)` | Any seat’s turn started (`color`, `turnId`, `isMine`, `previousColor`) |
| `onMyTurn(ctx)` | Interactive seat must act |
| `onRoll(color, value, state)` | Dice result |
| `onMove(color, tokenId, state, event)` | Token moved |
| `onCapture(by, victimTokenId, state)` | Capture |
| `onLegalMoves(ctx)` | Waiting for move — list of legal `moves` |
| `onWin({ winner, ranking, state })` | Someone won |
| `onTurnTimeout(ctx)` | Timer hit zero |
| `onTurnTick(ctx)` | Timer tick (`remainingMs`, `ratio`) |
| `onPresenceChange(ctx)` | Seat join / leave / ready |
| `onPresence(...)` | Deprecated alias of presence |
| `onDestroy({ reason, roomId, state })` | Room torn down |
| `onAction(action, ctx)` | Client intent before apply (controlled rooms) |
| `onEvent(event, state)` | Every engine event |
| `onChange(state)` | After each paint/update |

```ts
const ui = mountLudoRoom('#board', room, {
  controlled: true,
  onAction: async (action) => {
    await api.send(action)
    return 'defer'
  },
  onTurn: ({ color, isMine, turnId }) => {
    hud.setTurn(color, isMine)
  },
  onMyTurn: () => {
    toast('Your turn')
  },
  onLegalMoves: ({ moves, isMine }) => {
    if (isMine) highlight(moves)
  },
  onWin: ({ winner, ranking }) => {
    showResults(winner, ranking)
  },
  onDestroy: ({ reason }) => {
    leaveLobby(reason)
  },
})

ui.whoseTurn() // ColorId | null
ui.isMyTurn()  // boolean
```

## Destroy room

### Backend (authoritative) — `createLudoRoomHost`

Your server owns the engine and can destroy the room for **all** clients:

```ts
import { createLudoRoomHost, offlineRoom } from '@ludorush/sdk'

const host = createLudoRoomHost({
  room: { ...offlineRoom({ roomId: 'r1', players: 4 }), controlled: true, autoAi: false },
  broadcast: (cmd, roomId) => io.to(roomId).emit('ludo', cmd),
  onDestroyed: (reason) => redis.del(`room:${host.roomId}`),
  onTurn: (color, state) => {},
  onWin: (winner) => {},
})

// client intents
io.on('ludo-action', (action) => {
  const result = host.handleAction(action)
  if (!result.ok) socket.emit('ludo-error', result.error)
})

// admin / idle / matchmaker
host.destroy('host')           // → broadcasts { type: 'destroy', reason: 'host' }
host.handleAction({            // client asked to close
  type: 'destroy', roomId: 'r1', reason: 'client',
})
host.handleAction({            // player left → presence disconnect;
  type: 'leave', roomId: 'r1', color: 0, // destroys with 'abandoned' if no humans left
})

host.isDestroyed()
host.whoseTurn()
host.setPresence(2, 'ready', { name: 'Dev', id: 'u3' })
```

| Host API | Effect |
|----------|--------|
| `destroy(reason)` | Broadcast `destroy` to every client, mark room dead |
| `handleAction({ type: 'destroy' })` | Same, reason from client |
| `handleAction({ type: 'leave' })` | Mark seat `disconnected`; auto-`abandoned` if no humans left |
| `handleAction({ type: 'roll' \| 'move' })` | Validate turn → broadcast `dice` / `play` + `sync` |
| `setPresence` / `setSeats` | Lobby updates → broadcast |

Clients must mount with `controlled: true` and apply broadcasts:

```ts
socket.on('ludo', (cmd) => ui.dispatch(cmd))
// cmd.type === 'destroy' → client tears down via dispatch (onDestroy fires)
```

### Client teardown

```ts
// local only
ui.destroyRoom('finished')
ui.destroy() // destroyRoom('client')

// notify backend then tear down
ui.destroyRoom('abandoned', true)
// → onAction({ type: 'destroy', roomId, reason })

// apply host destroy
ui.dispatch({ type: 'destroy', reason: 'host' })

ui.isDestroyed()
```

| Reason | Meaning |
|--------|---------|
| `host` | Server closed the room |
| `client` | Local unmount / player quit |
| `finished` | After win / rematch flow |
| `abandoned` | Last human left |
| `error` | Fatal sync / network |

## Hosted room (backend-authoritative)

### 1. Backend creates the room

```ts
const room: LudoRoomConfig = {
  roomId: 'room_abc',
  mode: 'rush',
  seats: [
    { id: 'u1', name: 'Asha', kind: 'human', color: 0, presence: 'ready' },
    { id: 'u2', name: 'Bot', kind: 'ai', color: 1, presence: 'ready' },
    { id: 'u3', name: 'Dev', kind: 'human', color: 2, presence: 'joining' },
    { id: 'bot2', name: 'Bot2', kind: 'ai', color: 3, presence: 'ready' },
  ],
  interactiveColors: [0],
  controlled: true,
  autoAi: false,
  aiDifficulty: 'normal',
  absentSeat: { action: 'none' }, // host decides skips
  turnTimer: { enabled: true, durationMs: 15_000, appliesTo: 'all' },
}
```

### 2. Client mounts

```ts
const ui = mountLudoRoom('#board', room, {
  compact: true,
  sound: true,
  onAction: async (action) => {
    await api.sendAction(action)
    return 'defer'
  },
  onTurn: (ctx) => api.broadcastTurn?.(ctx),
  onDestroy: ({ reason }) => api.clearLocalRoom(reason),
})
```

### 3. Host pushes commands

```ts
ui.applyDice(serverDice)
ui.applyMove('red-0')
ui.syncState(authoritativeState)
ui.setSeatPresence(2, 'ready', { name: 'Dev', id: 'u3' })
ui.dispatch({ type: 'destroy', reason: 'host' })
```

### Action contract

**Client → server** (`LudoClientAction`):

```ts
{ type: 'roll', roomId, color }
{ type: 'move', roomId, color, tokenId }
{ type: 'forfeit', roomId, color }   // turn-timer / absent miss (controlled)
{ type: 'presence', roomId, color, presence }
{ type: 'leave', roomId, color }
{ type: 'destroy', roomId, reason? }
```

**Server → client** (`LudoHostCommand`):

```ts
{ type: 'dice', value: 1|2|3|4|5|6 }
{ type: 'play', tokenId }
{ type: 'sync', state }              // silent catch-up after dice/play
{ type: 'sync', state, event }       // lifecycle (e.g. forfeit → turn)
{ type: 'presence', color, presence, name?, id? }
{ type: 'seats', seats }
{ type: 'destroy', reason? }
{ type: 'config', mode?, aiDifficulty?, autoAi?, interactiveColors?, turnTimer?, absentSeat? }
```

After `{dice|play}`, the host also sends a **silent** `{sync}` (no `event`) so clients
align without replaying animations — except a **winning move**, which syncs with the `win`
event so the winner overlay shows. `syncState(state)` is silent; `syncState(state, event)` emits.
In `controlled` rooms, timer/absent skip send `{ type: 'forfeit' }` via `onAction` — never local forfeit.

`onAction` return values:

| Return | Meaning |
|--------|---------|
| `'defer'` | Wait for host `applyDice` / `dispatch` / `syncState` |
| `'allow'` | Apply with local RNG (offline only) |
| `{ dice: n }` | Apply this face immediately |

## Handle API

```ts
type LudoHandle = {
  game: LudoGame
  getState(): GameState
  whoseTurn(): ColorId | null
  isMyTurn(): boolean
  roll() / move(tokenId) / forfeitTurn()
  applyDice(n) / applyMove(tokenId) / syncState(state)
  dispatch(cmd: LudoHostCommand)
  setMode / setAiDifficulty / setAutoAi / setInteractiveColors
  setTurnTimer / pauseTurnTimer / resumeTurnTimer / resetTurnTimer / getTurnTimer
  setSeatPresence / setSeats / getSeats / allHumansPresent
  destroyRoom(reason?, notifyHost?) / destroy() / isDestroyed()
  reset(opts?)
  setSoundEnabled(boolean)
  sounds: LudoSounds
  roomId?: string
}
```

## Headless (server-side rules)

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

Rounded-rect border matching the dice dock. Bright blue → red at the end. Visible for **all** seats by default; skip/auto only for interactive seats.

```ts
mountLudoRoom('#board', room, {
  turnTimer: {
    enabled: true,
    durationMs: 15_000,
    appliesTo: 'all',
    showRing: true,
    onTimeout: 'skip',
    pauseWhileBusy: true,
  },
  onTurnTimeout: (ctx) => { /* any seat */ },
  onTurnTick: ({ remainingMs, ratio }) => {},
})

ui.setTurnTimer({ enabled: true, durationMs: 20_000 })
ui.pauseTurnTimer()
ui.resumeTurnTimer()
ui.resetTurnTimer()
ui.getTurnTimer()
ui.forfeitTurn()
```

| Option | Meaning |
|--------|---------|
| `appliesTo: 'all'` | Show timer every turn (default) |
| `appliesTo: 'interactive'` | Only your seats |
| `onTimeout: 'skip' \| 'auto' \| 'none'` | Miss behaviour for **your** seats |

## Seat presence / join queue

Matchmaking lives on **your host**. Push seat status into the SDK.

| `presence` | Meaning |
|------------|---------|
| `empty` | Open lobby slot |
| `joining` | Reserved / connecting |
| `joined` | In room |
| `ready` | Ready / playing |
| `disconnected` | Dropped |

```ts
ui.setSeatPresence(1, 'joining', { name: 'Dev', id: 'u2' })
ui.setSeatPresence(1, 'ready')
ui.dispatch({ type: 'presence', color: 1, presence: 'disconnected' })
ui.dispatch({ type: 'seats', seats: nextLobbySeats })
ui.allHumansPresent()
```

`absentSeat: { action: 'skip' | 'auto' | 'none', delayMs }` — when the current seat is empty/disconnected.

## UI notes

- Compact board by default
- Legal pawns glow; seats show presence badges
- Turn timer = blue rounded-rect around the dice dock
- Dice/move animations are serialized (internal promise queue)

## Scripts

```bash
npm run dev          # playground :5195
npm run typecheck
npm test
npm run build:sdk
```

## Related

- [RULES.md](./RULES.md) — capture, blocks, extras
- [DESIGN.md](./DESIGN.md) — colours & CSS variables
- [CONTRIBUTING.md](./CONTRIBUTING.md) — local development
