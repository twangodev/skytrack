import { requireDb, getBazaarSnapshot, getItems } from '$lib/server/db';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';
import { flipQuote } from '$lib/market/flips';
import { filterByName, normalizeListQuery, paginateRows, parseListPage } from '$lib/market/list';
import { MARKET_PAGE_CACHE } from '$lib/server/cache';
import type { PageServerLoad } from './$types';

const SORT_KEYS = ['sp', 'bp', 'profit', 'marginPct', 'volume', 'weeklyPotential'] as const;
type SortKey = (typeof SORT_KEYS)[number];

function parseSortKey(value: string | null): SortKey {
	return SORT_KEYS.find((key) => key === value) ?? 'weeklyPotential';
}

export const load: PageServerLoad = async ({ platform, setHeaders, url }) => {
	const db = requireDb(platform);
	setHeaders({ 'cache-control': MARKET_PAGE_CACHE });
	const [{ lastUpdated, products }, items] = await Promise.all([
		getBazaarSnapshot(db),
		getItems(db)
	]);
	const allRows = Object.entries(products)
		.filter(([, snap]) => snap.qs.bp > 0 && snap.qs.sp > 0)
		.map(([id, snap]) => {
			const { bp, sp, bmw, smw } = snap.qs;
			const { profit, marginPct } = flipQuote(bp, sp);
			const volume = Math.min(bmw, smw);
			return {
				id,
				slug: slugFromId(id),
				name: items[id]?.name ?? titleCase(id),
				sp,
				bp,
				profit,
				marginPct,
				volume,
				weeklyPotential: profit * volume
			};
		})
		.filter((row) => row.profit > 0);
	const query = normalizeListQuery(url.searchParams.get('q'));
	const sortKey = parseSortKey(url.searchParams.get('sort'));
	const sortDir = url.searchParams.get('dir') === 'asc' ? ('asc' as const) : ('desc' as const);
	const filtered = filterByName(allRows, query).sort((a, b) =>
		sortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]
	);
	const page = paginateRows(filtered, parseListPage(url.searchParams.get('page')));
	return {
		lastUpdated,
		itemCount: allRows.length,
		query,
		sortKey,
		sortDir,
		...page
	};
};
