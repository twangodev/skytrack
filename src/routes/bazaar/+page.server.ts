import { requireDb, getBazaarSnapshot, getItems, bazaarSparks } from '$lib/server/db';
import { MARKET_PAGE_CACHE } from '$lib/server/cache';
import { filterByName, normalizeListQuery, paginateRows, parseListPage } from '$lib/market/list';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, setHeaders, url }) => {
	const db = requireDb(platform);
	setHeaders({ 'cache-control': MARKET_PAGE_CACHE });
	const now = Math.floor(Date.now() / 1000);
	const [{ lastUpdated, products }, items] = await Promise.all([
		getBazaarSnapshot(db),
		getItems(db)
	]);
	const allRows = Object.entries(products)
		.map(([id, snap]) => ({
			id,
			slug: slugFromId(id),
			name: items[id]?.name ?? titleCase(id),
			bp: snap.qs.bp,
			sp: snap.qs.sp,
			bmw: snap.qs.bmw,
			smw: snap.qs.smw,
			demandShare: snap.qs.bv + snap.qs.sv === 0 ? 0 : snap.qs.sv / (snap.qs.bv + snap.qs.sv)
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
	const query = normalizeListQuery(url.searchParams.get('q'));
	const page = paginateRows(
		filterByName(allRows, query),
		parseListPage(url.searchParams.get('page'))
	);
	const sparks = await bazaarSparks(
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
