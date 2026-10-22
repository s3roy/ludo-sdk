# Design system

Ludo Rush UI tokens used by the SDK board and chrome. Prefer CSS variables on `.ludo-sdk` (see `src/ui/styles.css`); player/board paints also live in `src/core/constants.ts` + `src/ui/render.ts`.

## Core look

**Deep navy `#07152E` + bright player colors + white board tiles + golden dice button.**

## Shell

| Token | HEX |
|-------|-----|
| Deep navy background | `#07152E` |
| Outer background | `#172642` |
| Card / panel | `#0B1933` |
| Panel border | `#173D78` |
| Primary text | `#F8FAFC` |
| Secondary text | `#B8C6DF` |
| Muted text | `#8192B0` |

## Players

Each seat: primary · highlight · dark · panel · border.

| | Primary | Highlight | Dark | Panel | Border |
|--|---------|-----------|------|-------|--------|
| Red | `#FF303D` | `#FF5964` | `#B51224` | `#3B1828` | `#FF4D55` |
| Green | `#18D653` | `#49F879` | `#008C37` | `#10362F` | `#149B68` |
| Yellow | `#FFC21A` | `#FFE45C` | `#D98B00` | `#382C1C` | `#E99A17` |
| Blue | `#0785FF` | `#45B4FF` | `#0054D6` | `#11284B` | `#2165C2` |

Exported as `COLOR_HEX`, `COLOR_HIGHLIGHT`, `COLOR_DARK`, `COLOR_PANEL`, `COLOR_BORDER`.

## Board

| Element | HEX |
|---------|-----|
| Outer frame | `#10264A` |
| Frame highlight | `#2861AA` |
| Empty tiles | `#F1F5F9` |
| Tile borders | `#CBD5E1` |
| Safe / star tile | `#FFF1B8` |
| Star icon | `#F5A900` |
| Green home path | `#16B84A` |
| Yellow home path | `#FFB900` |
| Red home path | `#F52D38` |
| Blue home path | `#087BEB` |
| Spinner outer ring | `#071329` |
| Spinner center | `#F8FAFC` |

Home paths: `HOME_PATH_HEX`.

## Actions

| Element | HEX |
|---------|-----|
| Roll gradient start | `#FFE34D` |
| Roll gradient end | `#FFAE00` |
| Button border | `#FFD65A` |
| Button text | `#10213C` |
| Dice dock | `#0B2B56` |
| Dice / focus glow | `#38BDF8` |
| Inactive button | `#10203B` |
| Inactive border | `#254A82` |
| Selected outline | `#FF5964` |
| Gold badge | `#FFC21A` |
| Badge background | `#111C31` |

## CSS variables

Scoped under `.ludo-sdk` (not global `:root`) so the embed does not leak into host apps:

```css
.ludo-sdk {
  --bg-main: #07152E;
  --bg-outer: #172642;
  --bg-panel: #0B1933;
  --border-panel: #173D78;
  --text-primary: #F8FAFC;
  --text-secondary: #B8C6DF;
  --text-muted: #8192B0;
  --player-red: #FF303D;
  --player-green: #18D653;
  --player-yellow: #FFC21A;
  --player-blue: #0785FF;
  --btn-roll-start: #FFE34D;
  --btn-roll-end: #FFAE00;
  --btn-text: #10213C;
  --focus-ring: #38BDF8;
  --radius-panel: 24px;
  --radius-card: 18px;
  --radius-button: 20px;
  --shadow-panel: 0 20px 50px #00000040;
}
```

Import styles via `@ludorush/sdk/style.css` after bundling (`npm run build:sdk`).
