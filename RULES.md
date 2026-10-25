# Ludo rules (engine)

These are the **game rules**. AI difficulty never changes them — every seat (human or bot) uses the same legality and win conditions.

## Shared (all modes)

| Rule | Detail |
|------|--------|
| Seats | 2–4 players · **Red → Green → Yellow → Blue** |
| Tokens | 4 per seat · start in **yard** |
| Track | 52 cells clockwise · then 5-cell **home column** · then **finish** |
| Finish | **Exact** dice count required |
| Safe squares | Every color **start** + star cells `8, 21, 34, 47` — **no captures** |
| Block | 2+ same-color tokens on one track cell — immune; opponents cannot land on or jump over |
| Capture | Land on a **single** opponent on a **non-safe** cell → victim to yard → **extra roll** |
| Finish bonus | Finish a token → **extra roll** |
| Six | Roll **6** → **extra roll**; **three 6s in a row** → turn ends (third 6 unused) |
| Open | Leave yard **only on a 6** · lands on that color’s **start only** (no extra steps on open) |

## Modes

| Mode | Leave yard | Win condition |
|------|------------|---------------|
| **`classic`** | Roll **6** | Finish **4** tokens |
| **`rush`** | Roll **6** | Finish **2** tokens |
| **`blitz`** | Roll **6** | Finish **1** token |
| **`arena`** | Roll **6** | **Timed match** (default **3 minutes**) · **highest score** wins |

### Arena scoring

When the clock hits zero, ranking is by score (ties → more tokens finished).

| Action | Points |
|--------|--------|
| Legal move | **+1** |
| Open from yard | **+2** |
| Capture | **+10** |
| Finish a token | **+25** |

Bonuses **stack** on the same play (e.g. open that also… only open lands on start/safe, so open + move = +3; capture move = +1 +10).

## What is *not* a rule difference

- Themes, sounds, timers UI — cosmetics  
- AI `easy` / `normal` / `hard` / `extreme` — **move picking only** (see [DOCS.md § AI](./DOCS.md#ai-difficulty))  
- Cash stake / wallet — host layer, not engine rules  
