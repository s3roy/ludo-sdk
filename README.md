# @ludorush/sdk

Open-source **self-hosted Ludo web SDK** — pure TypeScript rules engine, SVG board UI, AI seats, host-authoritative multiplayer, and an optional cash-table demo.

### [▶ Play in the browser](https://s3roy.github.io/ludo-sdk/)

Generate a game on the client (mode · **2–4 players** · AI) and play vs bots — no signup. Share the URL to reopen the same settings.

```bash
npm i @ludorush/sdk
```

```ts
import { mountLudoRoom, offlineRoom } from '@ludorush/sdk'
import '@ludorush/sdk/style.css'

mountLudoRoom('#board', offlineRoom({ mode: 'rush', players: 4, aiDifficulty: 'hard' }), {
  theme: 'king',
})
```

## Features

- **Classic / Rush / Blitz / Arena** — open on 6; win by tokens **or** timed points
- **2–4 seats** — human + AI fill, or all-human lobby
- **Headless engine** — same code validates rolls/moves on your server
- **King theme** — Ludo King–style pins, corner HUDs, turn timer ring
- **Board facing** — your seat always bottom-left (`boardFacing` / `mountHostedLudo`)
- **AI** — easy / normal / hard / **extreme** (expectiminimax)
- **Themes** — `king` · `rush` · `felt` · `neon` · `ivory` · `midnight`
- **Backend-owned rooms** — `createLudoLobby` · policies · hosted client
- **Cash playground** — demo wallet + stake escrow (`cash.html` + `cash:server`)

## Modes

| Mode | Leave yard | Win condition |
|------|------------|---------------|
| `classic` | Roll **6** | Finish **4** tokens |
| `rush` | Roll **6** | Finish **2** tokens |
| `blitz` | Roll **6** | Finish **1** token |
| `arena` | Roll **6** | **3 min** clock · highest score wins |

**Arena points:** +1 move · +2 open from yard · +10 capture · +25 finish (stack on the same play).

Full rules: [RULES.md](./RULES.md). Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Architecture (short)

```
┌──────────────────────────┐     intents (roll/move)      ┌──────────────────────────┐
│  Browser                 │ ───────────────────────────► │  Your server             │
│  mountHostedLudo / UI    │                              │  createLudoLobby()       │
│  paint + animations only │ ◄─────────────────────────── │  engine + AI + settle    │
└──────────────────────────┘     LudoHostCommand (sync)   └──────────────────────────┘
```

| Layer | Owns |
|-------|------|
| **`src/core`** | Rules, dice, legality, scores, AI |
| **`src/server/lobby`** | Rooms, seats, turn/match clocks, `driveAi` |
| **`src/sdk/mount` + UI** | Board paint, dice anim, themes — never authoritative |
| **Your host** (e.g. `cash-server`) | Auth, wallet, escrow, WebSocket fan-out |

Offline demos use `mountLudo` / `offlineRoom` with `controlled: false`. Production must use **lobby + `mountHostedLudo`**.

Deep dive: **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Quick start (offline)

```ts
import { mountLudoRoom, offlineRoom } from '@ludorush/sdk'
import '@ludorush/sdk/style.css'

const game = mountLudoRoom('#board', offlineRoom({
  mode: 'rush',
  players: 4,          // 2 | 3 | 4
  aiDifficulty: 'hard',
  humanColor: 0,
}), { theme: 'king', sound: true, fill: true })

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
```

### Client (hosted UI)

```ts
import { mountHostedLudo } from '@ludorush/sdk'
import '@ludorush/sdk/style.css'

const ui = mountHostedLudo('#board', {
  roomId: match.roomId,
  mode: 'rush',
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

See **[DOCS.md](./DOCS.md)** for rooms, timer, host commands.

## Local playgrounds

```bash
npm install
npm run dev                 # Vite → http://localhost:5195/
```

| URL | What |
|-----|------|
| [`/`](http://localhost:5195/) | Offline vs AI — mode · **players 2–4** · difficulty · theme |
| [`/multi.html`](http://localhost:5195/multi.html) | Free WS lobby (`npm run multiplayer:server`) |
| [`/cash.html`](http://localhost:5195/cash.html) | Demo chips + stake (`npm run cash:server`) |

```bash
# Terminal A — cash host (wallet + lobby)
npm run cash:server         # :8790  (Vite proxies /api + /ws)

# Terminal B — UI
npm run dev                 # open /cash.html → pick mode + players → Play vs AI
```

Cash demo: register → stake → **Players** (2 / 3 / 4) → vs AI (fills empty seats) or open human table. Winner takes pot − 0.5% rake. Not real money.

## Docs

| Doc | Contents |
|-----|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Host-authoritative flow · cash layers · trust boundary |
| [DOCS.md](./DOCS.md) | Rooms, timer, seat presence, host commands, headless |
| [RULES.md](./RULES.md) | Engine rules (safe squares, blocks, Arena scoring) |
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
