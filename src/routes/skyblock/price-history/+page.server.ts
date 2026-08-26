import { requireDb, popularAuctionItems, popularBazaarItems } from '$lib/server/db';
import { MARKET_PAGE_CACHE } from '$lib/server/cache';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, setHeaders }) => {
	const db = requireDb(platform);
	setHeaders({ 'cache-control': MARKET_PAGE_CACHE });
	const [auctionExamples, bazaarExamples] = await Promise.all([
		popularAuctionItems(db, 3),
		popularBazaarItems(db, 3)
	]);
	return { auctionExamples, bazaarExamples };
};
