import { error } from '@sveltejs/kit';
import { requireDb, getBazaarProduct, getItemBySlug, bazaarPageHistory } from '$lib/server/db';
import { MARKET_PAGE_CACHE } from '$lib/server/cache';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
	const db = requireDb(platform);
	const meta = await getItemBySlug(db, params.slug);
	if (!meta) error(404, 'Unknown product');
	const id = meta.id;
	const product = await getBazaarProduct(db, id);
	if (!product) error(404, 'Unknown product');
	const { lastUpdated, snapshot } = product;
	const { history, summary } = await bazaarPageHistory(db, id);
	setHeaders({ 'cache-control': MARKET_PAGE_CACHE });
	return {
		id,
		slug: params.slug,
		name: meta.name,
		tier: meta.tier,
		snapshot,
		history,
		summary,
		lastUpdated
	};
};
