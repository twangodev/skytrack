# SkyTrack

Live [Hypixel Skyblock](https://hypixel.net) market tracker — real-time bazaar order books and
auction house BIN prices for every item, at [skytrack.twango.dev](https://skytrack.twango.dev).

Built with SvelteKit 2 / Svelte 5, Tailwind CSS 4, and bun. Fully static, no servers, no
database — data comes exclusively from the [official Hypixel API](https://api.hypixel.net), and
history lives in the deployment itself.

## How it works

```
GitHub Actions (every 15 min)
  └─ bun run fetch
       ├─ restore /data/state/*.binpb from the PREVIOUS deploy   (protobuf)
       ├─ /v2/skyblock/bazaar            → append 15-min snapshot
       ├─ /v2/skyblock/auctions          → every ~3h: all pages, BINs decoded
       │                                   from NBT, lowest/median per item
       ├─ re-tier: raw 30d → hourly 90d → daily forever
       ├─ validate: refuse to deploy if the state shrank or regressed
       └─ emit  /data/state/*.binpb           (carried to the next run)
                /data/items/{slug}.json       (per-item chart endpoints)
                src/lib/data/*.json           (gitignored build inputs)
  └─ bun run build                  → ~4,300 prerendered pages with real prices
  └─ deploy to GitHub Pages         → the artifact IS the database
```

- **Bazaar pages** also poll the bazaar API in the browser every 30s, so the
  order book ladder, hero price, and quick stats are live. If polling fails,
  the page falls back to build-time data.
- **History** is deployment-carried: each run builds on the previous deploy's
  state, so nothing is committed to git and there are no external services.
  A weekly workflow backs the state up to the rolling `data-backup` release
  (`bun scripts/backup-state.ts`).
- **Charts** fetch `/data/items/{slug}.json` (CDN-cached, columnar tiers) and
  slice 1D/1W/1M/ALL ranges client-side.
- **SEO/GEO**: every item page embeds current prices in HTML and JSON-LD;
  `sitemap.xml`, `robots.txt`, `llms.txt`, and `llms-full.txt` are generated at
  build time.

## Development

```sh
bun install
BOOTSTRAP=1 bun run fetch   # seed market data (restores history from the live site when deployed)
bun run dev
```

`bun run test` runs the vitest suite, `bun run check` type-checks, `bun run proto` regenerates
the protobuf code after editing `proto/history.proto`.

## First deploy & recovery

The pipeline refuses to start from empty state (that guard is what protects a year of history
from a bad deploy), but it auto-detects a genuine first deploy: if the site responds while every
state route 404s — and no `data-backup` release assets exist — it bootstraps empty on its own.
An outage, a partial state, or existing backups all still abort. To recover after a chain loss,
download the newest assets from the `data-backup` release into `static/data/state/` (dropping
the date prefix) and run with the repository variable `BOOTSTRAP=1` as a manual override.

## Disclaimer

Not affiliated with or endorsed by Hypixel Inc. or Mojang.
