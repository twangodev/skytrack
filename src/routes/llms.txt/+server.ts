import { loadBazaar, loadAuctions } from '$lib/server/data';
import { site } from '$lib/config';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () => {
	const bazaarCount = Object.keys(loadBazaar().products).length;
	const auctionCount = Object.keys(loadAuctions().items).length;
	const updated = new Date(loadBazaar().lastUpdated).toISOString();

	const body = `# ${site.title}

${site.description}

## About

Skytrack tracks the Hypixel Skyblock in-game economy using only the official Hypixel API:

- **Bazaar** (${bazaarCount} products): live order books with instabuy/instasell prices, market depth, volume, and order counts. Pages poll the official API in the browser, so displayed prices are real-time.
- **Auction House** (${auctionCount} items): lowest and median buy-it-now (BIN) prices aggregated from every active BIN listing, refreshed roughly every 3 hours. Bazaar pages refresh every 15 minutes, with price history served per item at ${site.url}/data/items/{slug}.json.

Data last refreshed: ${updated}

## URL patterns

- Bazaar product: ${site.url}/bazaar/{slug} (e.g. ${site.url}/bazaar/enchanted-diamond)
- Auction item: ${site.url}/auctions/{slug} (e.g. ${site.url}/auctions/wither-boots)
- Slugs are the lowercase item id with underscores as hyphens.

Every item page embeds current prices in its HTML and JSON-LD, so no JavaScript is required to read them.

## Full item directory with current prices

${site.url}/llms-full.txt

## Source

Source: ${site.repo}. Data from the official Hypixel API (https://api.hypixel.net). Not affiliated with Hypixel Inc.
`;

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'max-age=0, s-maxage=3600'
		}
	});
};
