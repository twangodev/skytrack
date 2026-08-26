import { json } from '@sveltejs/kit';
import { requireDb, getBazaarSnapshot, getAuctionSnapshot, getItems } from '$lib/server/db';
import { aliasesForItem } from '$lib/aliases';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';
import { SEARCH_INDEX_CACHE } from '$lib/server/cache';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform }) => {
	const db = requireDb(platform);
	const [bazaar, auctions, items] = await Promise.all([
		getBazaarSnapshot(db),
		getAuctionSnapshot(db),
		getItems(db)
	]);
	const index = [
		...Object.keys(bazaar.products).map((id) => ({
			slug: slugFromId(id),
			name: items[id]?.name ?? titleCase(id),
			kind: 'bazaar' as const,
			aliases: aliasesForItem(id)
		})),
		...Object.entries(auctions.items).map(([id, stats]) => ({
			slug: slugFromId(id),
			name: stats.name,
			kind: 'auctions' as const,
			aliases: aliasesForItem(id)
		}))
	];
	return json(index, {
		headers: { 'Cache-Control': SEARCH_INDEX_CACHE }
	});
};
