# @ludorush/sdk

Open-source **self-hosted Ludo web SDK** — pure TypeScript rules engine, SVG board UI, AI seats, and host-authoritative multiplayer.

### [▶ Play in the browser](https://s3roy.github.io/ludo-sdk/)

Generate a game on the client (mode · seats · AI) and play vs bots — no signup. Share the URL to reopen the same settings.

```bash
npm i @ludorush/sdk
```

```ts
import { mountLudoRoom, offlineRoom } from '@ludorush/sdk'
import '@ludorush/sdk/style.css'

mountLudoRoom('#board', offlineRoom({ mode: 'rush', aiDifficulty: 'hard' }), {
  theme: 'king',
})
```

## Features

- **Classic / Rush / Blitz** — open on 6; win with 4 / 2 / 1 tokens
- **Headless engine** — validate rolls/moves on your server with the same code
- **King theme** — Ludo King–style pins, corner HUDs, turn timer ring around the gold card
- **Board facing** — your seat always bottom-left (`boardFacing` / `mountHostedLudo`)
- **AI** — easy / normal / hard / **extreme** (expectiminimax)
- **Themes** — `king` · `rush` · `felt` · `neon` · `ivory` · `midnight`
- **Backend-owned rooms** — you decide who plays → `lobby.createMatch({ players })`
- **Policies** — turn clock, auto/skip on miss, `maxAutoTurns`, leave → AI
- **Hosted client** — `mountHostedLudo` (UI + intents only)
- **Lifecycle callbacks** — `onTurn` / `onMissTurn` / `onWin` / `onDestroy` / …

## Modes

| Mode | Leave yard | Tokens to win |
|------|------------|---------------|
| `classic` | Roll **6** | **4** |
| `rush` | Roll **6** | **2** |
| `blitz` | Roll **6** | **1** |

Full rules: [RULES.md](./RULES.md).

## Quick start (offline)

```ts
import { mountLudoRoom, offlineRoom } from '@ludorush/sdk'
import '@ludorush/sdk/style.css'

const game = mountLudoRoom('#board', offlineRoom({
  mode: 'rush',
  players: 4,
  aiDifficulty: 'hard',
  humanColor: 0,
}), { theme: 'king', sound: true })

game.destroy()
```

## Multiplayer

```ts
import { createLudoLobby, mountHostedLudo } from '@ludorush/sdk'

const lobby = createLudoLobby({
  broadcast: (roomId, cmd) => io.to(roomId).emit('ludo', cmd),
  onWin: (roomId, winner) => {},
  onTurn: (roomId, color) => {},
})

const match = lobby.createMatch({
  players: [
    { playerId: 'u1', name: 'Ada' },
    { playerId: 'u2', name: 'Bob' },
  ],
  maxPlayers: 4,
  mode: 'rush',
  policy: {
    turnDurationMs: 15_000,
    onTurnTimeout: 'auto',
    maxAutoTurns: 3,
    onLeave: 'convert_ai',
  },
})
if (!match.ok) throw new Error(match.error)

lobby.action(match.roomId, 'u1', intent)
lobby.leave(match.roomId, 'u1')
lobby.destroy(match.roomId)
```

### Client (hosted UI)

```ts
import { mountHostedLudo } from '@ludorush/sdk'
import '@ludorush/sdk/style.css'

const ui = mountHostedLudo('#board', {
  roomId: match.roomId,
  myColor: match.seats['u1'], // board rotates so this yard is bottom-left
  seats: match.config.seats,
  theme: 'king',
  transport: {
    send: (action) => socket.emit('action', action),
    subscribe: (fn) => {
      socket.on('ludo', (msg) => fn(msg.cmd))
      return () => socket.off('ludo')
    },
  },
})
```

### Room policy (set at match creation)

| Field | Default | Meaning |
|-------|---------|---------|
| `turnDurationMs` | `15000` | Server turn clock (`false` = off) |
| `onTurnTimeout` | `'auto'` | `'auto'` play once via AI, or `'skip'` forfeit |
| `maxAutoTurns` | `3` | Miss streak before seat → AI (`0` = never) |
| `onLeave` | `'convert_ai'` | `'convert_ai'` · `'forfeit'` · `'destroy_if_empty'` |

### Low-level (create → join → start)

```ts
const { roomId } = lobby.createRoom({ mode: 'rush', maxPlayers: 4, fillAi: true })
lobby.join(roomId, { playerId: 'u1', name: 'Ada' })
lobby.join(roomId, { playerId: 'u2', name: 'Bob' })
lobby.start(roomId)
```

See **[DOCS.md](./DOCS.md)** for rooms, timer, host commands.

## Docs

| Doc | Contents |
|-----|----------|
| [DOCS.md](./DOCS.md) | Rooms, timer, seat presence, host commands, headless |
| [RULES.md](./RULES.md) | Engine rules (safe squares, blocks, extras) |
| [DESIGN.md](./DESIGN.md) | Colour system & CSS variables |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Dev setup & tests |

## Play site (GitHub Pages)

The playground in `playground/` is deployed to **https://s3roy.github.io/ludo-sdk/** on every push to `main` (see `.github/workflows/pages.yml`).

```bash
GITHUB_PAGES=1 npm run build:web   # → dist-playground/
npm run preview                    # local check of that build
```

Query params (optional): `?mode=rush&players=4&ai=extreme&theme=king&room=ABC123`

## License

MIT — see [LICENSE](./LICENSE).
