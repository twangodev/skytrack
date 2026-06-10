import { loadBazaar, loadAuctions, loadItems } from '$lib/server/data';
import { slugFromId } from '$lib/slug';
import { titleCase, formatPrice } from '$lib/format';
import { site } from '$lib/config';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () => {
	const bazaar = loadBazaar();
	const auctions = loadAuctions();
	const items = loadItems();
	const updated = new Date(bazaar.lastUpdated).toISOString();

	const bazaarLines = Object.entries(bazaar.products)
		.map(([id, snap]) => ({ name: items[id]?.name ?? titleCase(id), id, snap }))
		.sort((a, b) => a.name.localeCompare(b.name))
		.map(
			({ name, id, snap }) =>
				`- ${name}: instabuy ${formatPrice(snap.qs.bp)} / instasell ${formatPrice(snap.qs.sp)} coins: ${site.url}/bazaar/${slugFromId(id)}`
		);

	const auctionLines = Object.entries(auctions.items)
		.map(([id, stats]) => ({ id, stats }))
		.sort((a, b) => a.stats.name.localeCompare(b.stats.name))
		.map(
			({ id, stats }) =>
				`- ${stats.name} (${stats.tier}): lowest BIN ${formatPrice(stats.lowestBin)} / median BIN ${formatPrice(stats.medianBin)} coins, ${stats.count} listings: ${site.url}/auctions/${slugFromId(id)}`
		);

	const body = `# ${site.title} full item directory

${site.description}
Data from the official Hypixel API, last refreshed ${updated}. Prices in Skyblock coins.

## Bazaar (${bazaarLines.length} products)

${bazaarLines.join('\n')}

## Auction House (${auctionLines.length} items, buy-it-now only)

${auctionLines.join('\n')}
`;

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'max-age=0, s-maxage=3600'
		}
	});
};
