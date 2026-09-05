import { error, json } from '@sveltejs/kit';
import { getAuctionItem, getBazaarProduct, getItemBySlug, requireDb } from '$lib/server/db';
import { getLiveBazaarProduct } from '$lib/server/live-market';
import type { MarketSnapshotJson } from '$lib/market/client';
import type { RequestHandler } from './$types';

const AUCTION_FRESH_MS = 20 * 60_000;

export const GET: RequestHandler = async ({ params, platform, fetch, setHeaders }) => {
	const db = requireDb(platform);
	const item = await getItemBySlug(db, params.slug);
	if (!item) error(404, 'Unknown item');
	const id = item.id;
	const [bazaar, auctions] = await Promise.all([getBazaarProduct(db, id), getAuctionItem(db, id)]);
	const liveBazaar = bazaar ? await getLiveBazaarProduct(fetch, id).catch(() => null) : null;
	const bazaarSnapshot =
		liveBazaar ?? (bazaar ? { updatedAt: bazaar.lastUpdated, snapshot: bazaar.snapshot } : null);
	const auctionSnapshot = auctions
		? { updatedAt: auctions.lastUpdated, snapshot: auctions.snapshot }
		: null;
	const response: MarketSnapshotJson = {
		name: item.name,
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
