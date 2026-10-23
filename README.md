# @ludorush/sdk

Open-source **self-hosted Ludo web SDK** — pure TypeScript rules engine, SVG board UI, AI seats, queue matchmaking, and host-authoritative multiplayer.

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
- **Queue matchmaking** — `createLudoMatchmaker` (no player host; backend forms rooms)
- **Lobby + policies** — turn clock, auto/skip on miss, `maxAutoTurns`, leave → AI
- **Hosted client** — `mountHostedLudo` (UI + intents only)
- **2–4 seats** — public pools or named table tokens
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

## Matchmaking (recommended multiplayer)

No first-joiner host. Players press **Play**; your backend queues them and creates the room when seats fill (or on timeout + AI fill).

```ts
import { createLudoMatchmaker } from '@ludorush/sdk'

const mm = createLudoMatchmaker({
  broadcast: (roomId, cmd) => io.to(roomId).emit('ludo', cmd),
  notify: (playerId, msg) => io.to(playerId).emit('mm', msg),
  defaults: {
    seats: 4,
    fillAi: true,
    queueTimeoutMs: 30_000,
    policy: {
      turnDurationMs: 15_000,
      onTurnTimeout: 'auto', // or 'skip'
      maxAutoTurns: 3,       // consecutive misses → seat becomes AI
      onLeave: 'convert_ai',
    },
  },
  onTurn: (roomId, color, state) => {},
  onMissTurn: (roomId, color, streak, action, state) => {},
  onSeatConverted: (roomId, color, reason) => {},
  onWin: (roomId, winner) => {},
})

// Named table (optional token)
mm.openTable({
  token: 'vip',
  seats: 2,
  policy: { turnDurationMs: 12_000, maxAutoTurns: 2 },
})

// Client pressed Play
const result = mm.play({ playerId, name: 'Ada', token: 'vip' })
// → { status: 'queued', … } | { status: 'matched', roomId, color, … }

mm.action(roomId, playerId, intent)
mm.leave(roomId, playerId)
mm.destroy(roomId) // backend only
```

### Client (hosted UI)

```ts
import { mountHostedLudo } from '@ludorush/sdk'
import '@ludorush/sdk/style.css'

const ui = mountHostedLudo('#board', {
  roomId,
  myColor,          // board rotates so this yard is bottom-left
  seats,
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

### Room policy (set at table / room creation)

| Field | Default | Meaning |
|-------|---------|---------|
| `turnDurationMs` | `15000` | Server turn clock (`false` = off) |
| `onTurnTimeout` | `'auto'` | `'auto'` play once via AI, or `'skip'` forfeit |
| `maxAutoTurns` | `3` | Miss streak before seat → AI (`0` = never) |
| `onLeave` | `'convert_ai'` | `'convert_ai'` · `'forfeit'` · `'destroy_if_empty'` |

Reference FE+BE harness (sibling folder in the monorepo): `tools/ludo-demo` — Play queue, WS protocol, `npm run e2e`.

## Low-level hosted rooms

```ts
import { createLudoLobby, mountHostedLudo } from '@ludorush/sdk'

const lobby = createLudoLobby({
  broadcast: (roomId, cmd) => io.to(roomId).emit('ludo', cmd),
})

const { roomId } = lobby.createRoom({
  mode: 'rush',
  maxPlayers: 4,
  fillAi: true,
  policy: { turnDurationMs: 15_000, onTurnTimeout: 'auto', maxAutoTurns: 3 },
})
lobby.join(roomId, { playerId: 'u1', name: 'Ada' })
lobby.start(roomId)
lobby.action(roomId, 'u1', { type: 'roll', roomId, color: 0 })
```

Prefer **`createLudoMatchmaker`** for product integrations; use **`createLudoLobby`** when you already have matchmaking.

Step-by-step contracts: **[DOCS.md](./DOCS.md)**.

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

## Develop

```bash
git clone https://github.com/s3roy/ludo-sdk.git
cd ludo-sdk
npm i
npm run dev          # playground → http://localhost:5195
npm test             # typecheck + smoke + bots + e2e
npm run build:sdk    # dist/ + style.css
```

| Script | What |
|--------|------|
| `npm run dev` | Vite playground |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run smoke` | Rule assertions + short playthroughs |
| `npm run test:bots` | Full AI games |
| `npm run test:e2e` | Path / seats / AI gates (~2k asserts) |
| `npm run build:sdk` | Library build |
| `npm run build:web` | Static play site (`dist-playground/`) |

## Package exports

```json
{
  ".": { "import": "./dist/ludo-sdk.js", "types": "./dist/index.d.ts" },
  "./style.css": "./dist/ludo-sdk.css"
}
```

## License

[MIT](./LICENSE) © 2026 Ludo Rush SDK contributors
