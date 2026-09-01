import { error, json } from '@sveltejs/kit';
import {
	getAuctionSnapshot,
	getBazaarSnapshot,
	getItemIdBySlug,
	getItems,
	requireDb
} from '$lib/server/db';
import { getLiveBazaarProduct } from '$lib/server/live-market';
import type { MarketSnapshotJson } from '$lib/market/client';
import type { RequestHandler } from './$types';

const AUCTION_FRESH_MS = 20 * 60_000;

export const GET: RequestHandler = async ({ params, platform, fetch, setHeaders }) => {
	const db = requireDb(platform);
	const id = await getItemIdBySlug(db, params.slug);
	if (!id) error(404, 'Unknown item');

	const [items, bazaar, auctions] = await Promise.all([
		getItems(db),
		getBazaarSnapshot(db),
		getAuctionSnapshot(db)
	]);
	const liveBazaar = bazaar.products[id]
		? await getLiveBazaarProduct(fetch, id).catch(() => null)
		: null;
	const bazaarSnapshot =
		liveBazaar ??
		(bazaar.products[id] ? { updatedAt: bazaar.lastUpdated, snapshot: bazaar.products[id] } : null);
	const auctionSnapshot = auctions.items[id]
		? { updatedAt: auctions.lastUpdated, snapshot: auctions.items[id] }
		: null;
	const response: MarketSnapshotJson = {
		name: items[id]?.name ?? id,
		...(bazaarSnapshot && {
			bazaar: { ...bazaarSnapshot, live: liveBazaar !== null }
		}),
		...(auctionSnapshot && {
			auctions: {
				...auctionSnapshot,
				live: Date.now() - auctionSnapshot.updatedAt <= AUCTION_FRESH_MS
			}
		})
	};
	if (!response.bazaar && !response.auctions) error(404, 'No market snapshot');
	setHeaders({ 'cache-control': 'public, max-age=60, stale-while-revalidate=240' });
	return json(response);
};
