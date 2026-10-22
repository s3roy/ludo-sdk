# @ludorush/sdk

Open-source **self-hosted Ludo web SDK** — pure TypeScript rules engine, SVG board UI, AI seats, and host-authoritative multiplayer hooks.

### [▶ Play in the browser](https://s3roy.github.io/ludo-sdk/)

Generate a game on the client (mode · seats · AI) and play vs bots — no signup. Share the URL to reopen the same settings.

```bash
npm i @ludorush/sdk
```

```ts
import { mountLudoRoom, offlineRoom } from '@ludorush/sdk'
import '@ludorush/sdk/style.css'

mountLudoRoom('#board', offlineRoom({ mode: 'rush', aiDifficulty: 'hard' }))
```

## Features

- **Classic / Rush / Blitz** — same board, different open & win conditions
- **Headless engine** — validate rolls/moves on your server with the same code
- **Embeddable UI** — navy glass chrome, bright board, golden roll button ([DESIGN.md](./DESIGN.md))
- **AI** — easy / normal / hard (finish → capture → escape tiers)
- **2–4 seats** — 2-player uses diagonal colours (Red↔Yellow or Green↔Blue)
- **Host rooms** — `controlled: true` + `onAction` → your backend owns dice & sync
- **Turn timer** — blue rounded-rect border on the dice dock (visible for all seats); skip/auto on miss
- **Seat presence** — `empty` → `joining` → `ready` / `disconnected` for lobby & away handling
- **Lifecycle callbacks** — `onTurn` / `onMyTurn` / `onWin` / `onDestroy` / `onLegalMoves` / …
- **destroyRoom** — client teardown; **`createLudoRoomHost`** — backend destroy / validate / broadcast

## Modes

| Mode | Leave yard | Tokens to win |
|------|------------|---------------|
| `classic` | Roll **6** | **4** |
| `rush` | Any face | **2** |
| `blitz` | Any face | **1** |

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
}), { sound: true })

// later
game.destroy()
```

## Multiplayer (your backend)

Your API creates the room and is the source of truth. Clients mount with `controlled: true` and defer actions:

```ts
const ui = mountLudoRoom('#board', room, {
  onAction: async (action) => {
    await api.sendAction(action)
    return 'defer' // wait for host applyDice / syncState
  },
})

// host → client
ui.applyDice(4)
ui.applyMove('red-0')
ui.syncState(authoritativeState)
```

Step-by-step contracts, handle API, and headless validation: **[DOCS.md](./DOCS.md)**.

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

Query params (optional): `?mode=rush&players=4&ai=hard&room=ABC123`

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
