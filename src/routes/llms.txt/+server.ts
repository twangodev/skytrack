import { loadBazaar, loadAuctions } from '$lib/server/data';
import { site } from '$lib/config';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () => {
	const bazaarCount = Object.keys(loadBazaar().products).length;
	const auctionCount = Object.keys(loadAuctions().items).length;
	const updated = new Date(loadBazaar().lastUpdated).toISOString();

	const body = `# ${site.title}

> ${site.description}

Skytrack tracks the Hypixel Skyblock in-game economy using only the official Hypixel API:

- **Bazaar** (${bazaarCount} products): live order books with instabuy/instasell prices, market depth, volume, and order counts. Pages poll the official API in the browser, so displayed prices are real-time.
- **Auction House** (${auctionCount} items): lowest and median buy-it-now (BIN) prices aggregated from every active BIN listing, refreshed roughly every 3 hours. Bazaar pages refresh every 15 minutes.

Item URLs use the slug — the lowercase item id with hyphens — for example [enchanted-diamond on the Bazaar](${site.url}/bazaar/enchanted-diamond) or [wither-boots in the Auction House](${site.url}/auctions/wither-boots). Every item page embeds current prices in its HTML and JSON-LD, so no JavaScript is required to read them.

Data last refreshed: ${updated}

## Pages

- [Bazaar directory](${site.url}/bazaar): browse all ${bazaarCount} bazaar products at /bazaar/{slug}
- [Auction House directory](${site.url}/auctions): browse all ${auctionCount} auction items at /auctions/{slug}
- [Documentation](${site.url}/docs): human-readable guide to the data and API

## Machine-readable data

- [Item markdown summary](${site.url}/bazaar/enchanted-diamond.md): append .md to any item URL (/bazaar/{slug}.md or /auctions/{slug}.md)
- [Price history JSON](${site.url}/data/items/enchanted-diamond.json): 15-min raw, hourly, and daily tiers at /data/items/{slug}.json
- [Item directory JSON](${site.url}/search-index.json): every tracked item with its slug and type
- [OpenAPI 3.1 spec](${site.url}/openapi.json): full description of the JSON endpoints
- [Full item directory](${site.url}/llms-full.txt): plain-text list of every item with current prices

## Source

- [Source code](${site.repo}): project repository on GitHub
- [Hypixel API](https://api.hypixel.net): official upstream data source

Not affiliated with Hypixel Inc.
`;

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'max-age=0, s-maxage=3600'
		}
	});
};
