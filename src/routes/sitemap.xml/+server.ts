import { loadBazaar, bazaarSlugMap, auctionSlugMap } from '$lib/server/data';
import { site } from '$lib/config';
import type { RequestHandler } from './$types';

export const prerender = true;

export const GET: RequestHandler = () => {
	const lastmod = new Date(loadBazaar().lastUpdated).toISOString().slice(0, 10);
	const urls = [
		'/',
		'/bazaar',
		'/auctions',
		'/flips',
		'/movers',
		'/compare',
		'/docs',
		...[...bazaarSlugMap().keys()].map((slug) => `/bazaar/${slug}`),
		...[...auctionSlugMap().keys()].map((slug) => `/auctions/${slug}`)
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
