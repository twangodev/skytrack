import { error } from '@sveltejs/kit';
import {
	requireDb,
	getBazaarSnapshot,
	getItems,
	resolveBazaarId,
	bazaarHistory,
	bazaarSummaryHistory
} from '$lib/server/db';
import { MARKET_PAGE_CACHE } from '$lib/server/cache';
import { summarizeHistory } from '$lib/market/history-summary';
import { titleCase } from '$lib/format';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
	const db = requireDb(platform);
	const id = await resolveBazaarId(db, params.slug);
	if (!id) error(404, 'Unknown product');
	const [{ lastUpdated, products }, items, history, summaryHistory] = await Promise.all([
		getBazaarSnapshot(db),
		getItems(db),
		bazaarHistory(db, id),
		bazaarSummaryHistory(db, id)
	]);
	const snapshot = products[id];
	if (!snapshot) error(404, 'Unknown product');
	setHeaders({ 'cache-control': MARKET_PAGE_CACHE });
	const meta = items[id];
	return {
		id,
		slug: params.slug,
		name: meta?.name ?? titleCase(id),
		tier: meta?.tier,
		snapshot,
		history,
		summary: summarizeHistory(summaryHistory.map((point) => ({ t: point.t, value: point.b }))),
		lastUpdated
	};
};
