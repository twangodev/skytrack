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
curl "http://localhost:8787/__scheduled?cron=10+*%2F3+*+*+*"   # items + auction data (a few minutes)
curl "http://localhost:8787/__scheduled?cron=30+4+*+*+*"       # daily rollup + prune (optional)
```

Then:

```sh
bun run dev
```

For history depth, export production D1 (`bunx wrangler d1 export skytrack --remote --output=history.sql -c workers/pipeline/wrangler.jsonc`) and apply it locally with `bunx wrangler d1 execute skytrack --local --persist-to .wrangler/state --file=history.sql -c workers/pipeline/wrangler.jsonc`.

Not affiliated with Hypixel Inc. or Mojang.
