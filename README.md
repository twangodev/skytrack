# skytrack

Live Hypixel Skyblock market tracker: [skytrack.twango.dev](https://skytrack.twango.dev)

```sh
bun install
bun run db:migrate:local   # once
bun run db:seed:local
```

In another terminal, seed local D1 by hitting the pipeline's cron endpoints:

```sh
curl "http://localhost:8787/__scheduled?cron=*%2F5+*+*+*+*"    # bazaar data
curl "http://localhost:8787/__scheduled?cron=15+4+*+*+*"       # item catalog
curl "http://localhost:8787/__scheduled?cron=7%2C22%2C37%2C52+*+*+*+*" # auction data
curl "http://localhost:8787/__scheduled?cron=30+4+*+*+*"       # daily rollup + prune (optional)
```

Then:

```sh
bun run dev
```

For history depth, export production D1 (`bunx wrangler d1 export skytrack --remote --output=history.sql -c workers/pipeline/wrangler.jsonc`) and apply it locally with `bunx wrangler d1 execute skytrack --local --persist-to .wrangler/state --file=history.sql -c workers/pipeline/wrangler.jsonc`.

Item pages are prerendered at deployment from `src/lib/server/item-catalog.json`.
CI refreshes this metadata from the public search index before building; run
`bun run catalog:refresh` to update it locally. Ordinary local builds use the
checked-in catalog and do not need production D1 access. Items added between
deployments still get a page through the server fallback.

The static HTML contains item metadata and links to JSON, CSV, and Markdown.
The browser fetches the cached snapshot and history endpoints concurrently,
then updates the price panels and charts. History JSON includes an exact summary
computed before chart bucketing, so it needs no separate summary query. Quotes
refresh every minute while the tab is visible; history loads on demand. Prices
are not baked into the HTML and require JavaScript; the Markdown endpoint remains
available for a server-rendered market summary. Pipeline schedules and D1 storage
are independent of page builds.

Not affiliated with Hypixel Inc. or Mojang.
