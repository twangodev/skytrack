import { error, json } from '@sveltejs/kit';
import {
	getAuctionSnapshot,
	getBazaarSnapshot,
	getItemIdBySlug,
	getItems,
	requireDb
} from '$lib/server/db';
import type { MarketSnapshotJson } from '$lib/market/client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, platform, setHeaders }) => {
	const db = requireDb(platform);
	const id = await getItemIdBySlug(db, params.slug);
	if (!id) error(404, 'Unknown item');

	const [items, bazaar, auctions] = await Promise.all([
		getItems(db),
		getBazaarSnapshot(db),
		getAuctionSnapshot(db)
	]);
	const response: MarketSnapshotJson = {
		name: items[id]?.name ?? id,
		...(bazaar.products[id] && {
			bazaar: { updatedAt: bazaar.lastUpdated, snapshot: bazaar.products[id] }
		}),
		...(auctions.items[id] && {
			auctions: { updatedAt: auctions.lastUpdated, snapshot: auctions.items[id] }
		})
	};
	if (!response.bazaar && !response.auctions) error(404, 'No market snapshot');
	setHeaders({ 'cache-control': 'public, max-age=60' });
	return json(response);
};
