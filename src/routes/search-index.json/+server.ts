import { json } from '@sveltejs/kit';
import { loadBazaar, loadAuctions, loadItems } from '$lib/server/data';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';
import type { RequestHandler } from './$types';

export const prerender = true;

// The full item directory is ~300KB of JSON; serving it as its own cacheable
// asset keeps the landing page small and off the critical path.
export const GET: RequestHandler = () => {
	const items = loadItems();
	const index = [
		...Object.keys(loadBazaar().products).map((id) => ({
			slug: slugFromId(id),
			name: items[id]?.name ?? titleCase(id),
			kind: 'bazaar' as const
		})),
		...Object.entries(loadAuctions().items).map(([id, stats]) => ({
			slug: slugFromId(id),
			name: stats.name,
			kind: 'auctions' as const
		}))
	];
	return json(index, {
		headers: { 'Cache-Control': 'max-age=0, s-maxage=3600' }
	});
};
