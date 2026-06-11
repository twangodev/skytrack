import { error } from '@sveltejs/kit';
import { loadAuctions, auctionSlugMap, auctionHistory } from '$lib/server/data';
import { slugFromId } from '$lib/slug';
import { formatPrice } from '$lib/format';
import { site } from '$lib/config';
import type { EntryGenerator, RequestHandler } from './$types';

export const prerender = true;

export const entries: EntryGenerator = () =>
	Object.keys(loadAuctions().items).map((id) => ({ slug: slugFromId(id) }));

const iso = (t: number) => new Date(t * 1000).toISOString().slice(0, 16) + 'Z';

export const GET: RequestHandler = ({ params }) => {
	const id = auctionSlugMap().get(params.slug);
	if (!id) error(404, 'Unknown item');
	const { lastUpdated, items } = loadAuctions();
	const stats = items[id];
	const history = auctionHistory(id);

	const body = `# ${stats.name}

Hypixel Skyblock auction house item \`${id}\` (${stats.tier}).
Updated ${new Date(lastUpdated).toISOString()}. Prices in Skyblock coins, buy-it-now listings only.
Page: ${site.url}/auctions/${params.slug} | JSON history: ${site.url}/data/items/${params.slug}.json

## Current

| Metric | Value |
| --- | --- |
| Lowest BIN | ${formatPrice(stats.lowestBin)} |
| Median BIN | ${formatPrice(stats.medianBin)} |
| Active listings | ${stats.count} |

## History (sampled)

| Time (UTC) | Lowest BIN | Median BIN | Listings |
| --- | --- | --- | --- |
${history
	.slice(-40)
	.map((p) => `| ${iso(p.t)} | ${formatPrice(p.l)} | ${formatPrice(p.m)} | ${p.c} |`)
	.join('\n')}

Data from the official Hypixel API. Not affiliated with Hypixel Inc.
`;

	return new Response(body, {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Cache-Control': 'max-age=0, s-maxage=900'
		}
	});
};
