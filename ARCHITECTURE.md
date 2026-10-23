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

## Themes

Client-only. Call `ui.setTheme('neon')` anytime. Board SVG + chrome CSS update together.
Does not affect rules or fairness.
