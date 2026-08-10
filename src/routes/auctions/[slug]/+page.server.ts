import { error } from '@sveltejs/kit';
import {
	requireDb,
	getAuctionSnapshot,
	resolveAuctionId,
	auctionHistory,
	auctionSummaryHistory
} from '$lib/server/db';
import { summarizeHistory } from '$lib/market/history-summary';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform }) => {
	const db = requireDb(platform);
	const id = await resolveAuctionId(db, params.slug);
	if (!id) error(404, 'Unknown item');
	const [{ lastUpdated, items }, history, summaryHistory] = await Promise.all([
		getAuctionSnapshot(db),
		auctionHistory(db, id),
		auctionSummaryHistory(db, id)
	]);
	const stats = items[id];
	return {
		slug: params.slug,
		name: stats.name,
		tier: stats.tier,
		stats,
		history,
		summary: summarizeHistory(summaryHistory.map((point) => ({ t: point.t, value: point.l }))),
		lastUpdated
	};
};
