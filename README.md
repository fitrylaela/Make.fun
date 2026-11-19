# Make.fun — token launch radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/fitrylaela/Make.fun/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/fitrylaela/Make.fun/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A pre-token launch radar. It reads a sealed DefiLlama snapshot, fits a comparable-company valuation over the protocols that already trade, and ranks every protocol that still records no token by what its launch would be worth — with a farm plan and a filterable dashboard.

Entry for the [token-radar-01](https://make.fun/bounty/token-radar-01) bounty on make.fun.

## What it does

- **Valuation.** A log-linear fit over 128 comparables in 34 categories (R² 0.212) prices each protocol from TVL, category and stage. Wrapped and bridged products, versioned pool names and exchange prefixes are excluded from the comparable set, so the fit is not distorted by derivative tokens.
- **Board.** 197 ranked rows — 157 early protocols with no token yet, plus the 40 on the watchlist. 24 live tokens are set aside rather than ranked.
- **Farm plan.** Each row carries a concrete, ordered set of steps for farming a prospective launch.
- **Dashboard.** A static page with a ranked board, a live/token-bearing view, a detail sheet and category filtering. No network calls, no build step.

## Run it

The program reads the sealed snapshot from `/input/snapshot.json` and writes to `/output`. Outside the grader's container, `MAKEFUN_OUTPUT_DIR` and `--input` stand in for those paths:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input
```

Requires Node.js 22.18 or later. Output is deterministic: two clean runs produce byte-identical `board.json` and `dossier.json`.

## Layout

| Path | Purpose |
| --- | --- |
| `main.ts` | Entrypoint: reads the snapshot, writes the board, data, dashboard and dossier |
| `lib/board.ts` | Board assembly, exclusion rules, farm steps |
| `lib/valuation.ts` | Comparable-company fit and implied value |
| `lib/types.ts` | Row and snapshot types |
| `dashboard/` | `index.html`, `app.css`, `app.js` — the static radar page |
| `screenshots/` | Three captures of the dashboard |
| `vendor/` | The kit's `makefun-board.ts`, which writes the dossier |
| `tools/` | Screenshot capture and image handling |

## Dashboard

The three screenshots in `screenshots/` show the ranked board, a protocol detail sheet, and a filtered view. The page renders from `data.js` and works from disk with no server.

---

<sub>Entered on [make.fun](https://make.fun/?ref=hsbvga10&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
