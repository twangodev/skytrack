import { error } from '@sveltejs/kit';
import { requireDb, getAuctionItem, resolveAuctionId, auctionPageHistory } from '$lib/server/db';
import { MARKET_PAGE_CACHE } from '$lib/server/cache';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
	const db = requireDb(platform);
	const id = await resolveAuctionId(db, params.slug);
	if (!id) error(404, 'Unknown item');
	const item = await getAuctionItem(db, id);
	if (!item) error(404, 'Unknown item');
	const { lastUpdated, snapshot: stats } = item;
	const { history, summary } = await auctionPageHistory(db, id);
	setHeaders({ 'cache-control': MARKET_PAGE_CACHE });
	return {
		slug: params.slug,
		name: stats.name,
		tier: stats.tier,
		stats,
		history,
		summary,
		lastUpdated
	};
};
