# SkyTrack

Live [Hypixel Skyblock](https://hypixel.net) market tracker — real-time bazaar order books and
auction house BIN prices for every item, at [skytrack.twango.dev](https://skytrack.twango.dev).

Built with SvelteKit 2 / Svelte 5, Tailwind CSS 4, and bun. Fully static, no servers — data comes
exclusively from the [official Hypixel API](https://api.hypixel.net).

## How it works

```
GitHub Actions (every 3h)
  └─ bun run fetch
       ├─ /v2/resources/skyblock/items  → item metadata
       ├─ /v2/skyblock/bazaar           → order books + quick stats
       └─ /v2/skyblock/auctions         → all pages, BINs decoded from NBT,
                                          aggregated to lowest/median per item
       writes src/lib/data/*.json   (gitignored build inputs)
       appends data/history/**      (committed, append-only ndjson)
  └─ bun run build                  → ~4,300 prerendered pages with real prices
  └─ deploy to GitHub Pages
```

- **Bazaar pages** also poll the bazaar API in the browser every 30s, so the
  order book ladder and quick stats are live. If polling fails, the page falls
  back to build-time data.
- **History** is kept at full resolution for 7 days, then compacted to daily
  medians (`daily.ndjson`) so the repo stays small.
- **SEO/GEO**: every item page embeds current prices in HTML and JSON-LD;
  `sitemap.xml`, `robots.txt`, `llms.txt`, and `llms-full.txt` are generated at
  build time.

## Development

```sh
bun install
bun run fetch   # seed market data from the Hypixel API
bun run dev
```

`bun run test` runs the vitest suite, `bun run check` type-checks.

## Disclaimer

Not affiliated with or endorsed by Hypixel Inc. or Mojang.
