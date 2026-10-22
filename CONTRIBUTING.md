# Contributing

## Setup

```bash
npm i
npm run dev
```

Playground: [http://localhost:5195](http://localhost:5195).

## Layout

```
src/
  core/     # pure engine (game, moves, path, AI, e2e)
  sdk/      # mount + room adapter
  ui/       # SVG board, dice, CSS, token animation
  audio/    # optional SFX
playground/ # local demo shell
```

- Keep **rules** in `src/core` — no DOM.
- Keep **paint** in `src/ui` + tokens in `src/core/constants.ts` ([DESIGN.md](./DESIGN.md)).
- Multiplayer fairness: host rolls dice; clients use `controlled: true`.

## Checks before PR

```bash
npm test
npm run build:sdk
```

## Design tweaks

Update CSS vars in `src/ui/styles.css` and board fills in `src/ui/render.ts`. Sync HEX tables in [DESIGN.md](./DESIGN.md).

## License

By contributing you agree your changes are MIT-licensed.
