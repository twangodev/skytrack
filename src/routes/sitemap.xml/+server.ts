import { requireDb, getBazaarSnapshot, getAuctionSnapshot } from '$lib/server/db';
import { slugFromId } from '$lib/slug';
import { site } from '$lib/config';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
	const db = requireDb(platform);
	const [bazaar, auctions] = await Promise.all([getBazaarSnapshot(db), getAuctionSnapshot(db)]);
	const lastmod = new Date(bazaar.lastUpdated).toISOString().slice(0, 10);
	const urls = [
		'/',
		'/bazaar',
		'/auctions',
		'/flips',
		'/movers',
		'/compare',
		'/legend',
		'/docs',
		'/skyblock/price-history',
		'/skyblock/bazaar-price-history',
		'/skyblock/auction-price-history',
		'/skyblock/lowest-bin-history',
		'/skyblock/item-flipping',
		...Object.keys(bazaar.products)
			.map(slugFromId)
			.map((slug) => `/bazaar/${slug}`),
		...Object.keys(auctions.items)
			.map(slugFromId)
			.map((slug) => `/auctions/${slug}`)
	];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map(
		(u) => `\t<url><loc>${site.url}${u === '/' ? '' : u}</loc><lastmod>${lastmod}</lastmod></url>`
	)
	.join('\n')}
</urlset>`;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=0, s-maxage=3600'
		}
	});
};
