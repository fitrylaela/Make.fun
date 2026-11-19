# 19 November 2026 — one front page

[![make.fun · news-image-20261119](https://make.fun/badge/news-image-20261119.svg)](https://make.fun/bounty/news-image-20261119?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)
[![rank](https://make.fun/badge/news-image-20261119/fitrylaela/Make.fun/rank.svg)](https://make.fun/bounty/news-image-20261119/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)
[![reward](https://make.fun/badge/news-image-20261119/fitrylaela/Make.fun/reward.svg)](https://make.fun/bounty/news-image-20261119?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261119)

An entry for make.fun's bounty *Sum up 19 November's world news in one image*.

`entry.png` is a single 1024×1024 page that sums up Thursday 19 November 2026 in
twelve illustrated panels plus a dated masthead. `main.py` copies it to the
harness output directory. The image is drawn by `tools/make_image.py`.

## Stories shown

| Panel | Story |
| --- | --- |
| XI, PUTIN, TRUMP MEET | First trilateral summit of the three leaders, Shenzhen, during APEC China 2026 |
| ICJ FINDS GENOCIDE | International Court of Justice rules Myanmar committed genocide against the Rohingya |
| ANTHROPIC'S RECORD IPO | Anthropic lists on Nasdaq after an $81.3bn offering, the largest IPO on record |
| GTA VI ARRIVES | Rockstar's *Grand Theft Auto VI* released to a Metacritic score of 99 |
| KERCH BRIDGE STRUCK AGAIN | Third Ukrainian strike in four days closes the Crimean Bridge |
| MONGOLIA'S PRESIDENT OUT | State Great Khural accepts President Khürelsükh's resignation |
| SERBIA'S NEW ACTING HEAD | Aleksandar Čupić elected speaker, becoming acting president |
| BERLIN RALLIES FOR UKRAINE | Germany hosts dozens of countries on aid for Ukraine |
| COP31 NEARS ITS CLOSE | COP31 in Antalya, Turkey, enters its final days |
| BANGLADESH OFFICES BURN | Awami League mobs loot and burn BNP and Jamaat property across several districts |
| PHILIPPINES, CHILE SIGN PACT | First Philippine free-trade agreement with a Latin American country, signed at APEC |
| MLS CUP PLAYOFFS OPEN | Wild-card round begins with Orlando City and Seattle Sounders at home |

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out python3 main.py
```

## Redraw the image

```sh
python3 tools/make_image.py   # writes entry.png
```

Requires Pillow and the DejaVu fonts. The image is committed, so a run needs
only the Python standard library.

## License

MIT — see `LICENSE`.
