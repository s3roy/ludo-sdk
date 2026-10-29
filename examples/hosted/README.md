# Hosted example — backend + frontend (+ Java sidecar)

Complete **host-authoritative** stack for `@ludorush/sdk`:

| Piece | Path | Role |
|-------|------|------|
| **Node game service** | `backend/` | `createLudoMatchmaker` — dice, legality, AI, rooms |
| **Web frontend** | `frontend/` | Queue UI + `mountHostedLudo` (paint only) |
| **Java Spring shell** | `java-spring/` | Product API that **calls** the Node sidecar (does not embed the engine) |

```
Browser (frontend :5200)
   │  WS play / roll / move
   ▼
Node game service (:8787)   ← @ludorush/sdk createLudoMatchmaker
   ▲
   │  HTTP /health /rooms /tables
Spring Boot (:8080)         ← auth / wallet / your APIs (optional)
```

**Java cannot `import` the npm package.** Use Node as the game sidecar (this example) or later a full Java engine port.

## Quick start (Node + frontend)

```bash
# from repo root
npm install
npm run build:sdk

cd examples/hosted/backend && npm install && npm run start
# → ws://localhost:8787

cd examples/hosted/frontend && npm install && npm run dev
# → http://localhost:5200
```

1. Open **two tabs** on http://localhost:5200  
2. Seats **2**, empty token → **Play** in both  
3. Or seats **4**, token **`demo`** → four tabs  

## Optional: Spring beside Node

```bash
# terminal A — Node game service (required)
cd examples/hosted/backend && npm run start

# terminal B — Spring
cd examples/hosted/java-spring
./mvnw spring-boot:run   # or: mvn spring-boot:run
```

Then:

- `GET http://localhost:8080/api/ludo/bootstrap` → `{ wsUrl, sidecar }`  
- `GET http://localhost:8080/api/ludo/rooms`  
- `POST http://localhost:8080/api/ludo/tables` `{ "token": "vip", "seats": 2 }`  

Browser still connects to **`wsUrl`** (Node) for gameplay. Spring is for your product surface.

## WS protocol (language-agnostic)

| Client → server | Server → client |
|-----------------|-----------------|
| `hello` `{ name? }` | `welcome` `{ playerId }` |
| `play` `{ token?, seats?, mode? }` | `queue` / `matched` |
| `cancel` | `queue_cancelled` |
| `leave` | `left` / `kicked` |
| `action` `{ action: LudoClientAction }` | `ludo` `{ cmd: LudoHostCommand }` |

Authoritative commands: `sync`, `dice`, `play`, `presence`, `destroy`, …

## Why this shape

| Concern | Owner |
|---------|--------|
| Dice, moves, win, AI | Node (`@ludorush/sdk`) |
| Board paint / themes | Frontend SDK |
| Login, wallet, CMS | Your Spring (or any) backend |

See root [ARCHITECTURE.md](../../ARCHITECTURE.md).
