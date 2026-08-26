import { requireDb, getAuctionSnapshot, auctionSparks } from '$lib/server/db';
import { MARKET_PAGE_CACHE } from '$lib/server/cache';
import { filterByName, normalizeListQuery, paginateRows, parseListPage } from '$lib/market/list';
import { slugFromId } from '$lib/slug';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, setHeaders, url }) => {
	const db = requireDb(platform);
	setHeaders({ 'cache-control': MARKET_PAGE_CACHE });
	const now = Math.floor(Date.now() / 1000);
	const { lastUpdated, items } = await getAuctionSnapshot(db);
	const allRows = Object.entries(items)
		.map(([id, stats]) => ({
			id,
			slug: slugFromId(id),
			name: stats.name,
			tier: stats.tier,
			lowestBin: stats.lowestBin,
			medianBin: stats.medianBin,
			count: stats.count,
			discount: stats.medianBin > 0 ? (stats.medianBin - stats.lowestBin) / stats.medianBin : 0
		}))
		.sort((a, b) => b.count - a.count);
	const query = normalizeListQuery(url.searchParams.get('q'));
	const page = paginateRows(
		filterByName(allRows, query),
		parseListPage(url.searchParams.get('page'))
	);
	const sparks = await auctionSparks(
		db,
		page.rows.map((row) => row.id),
		now
	);
	return {
		lastUpdated,
		itemCount: allRows.length,
		query,
		...page,
		rows: page.rows.map((row) => ({ ...row, spark: sparks.get(row.id) ?? [] }))
	};
};
