import { requireDb, popularBazaarItems } from '$lib/server/db';
import { MARKET_PAGE_CACHE } from '$lib/server/cache';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, setHeaders }) => {
	const db = requireDb(platform);
	setHeaders({ 'cache-control': MARKET_PAGE_CACHE });
	return { examples: await popularBazaarItems(db, 6) };
};
