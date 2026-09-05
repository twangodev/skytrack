import { error } from '@sveltejs/kit';
import { requireDb, getItemBySlug, getAuctionItem } from '$lib/server/db';
import { catalogEntries, catalogItem } from '$lib/server/item-catalog';
import { MARKET_PAGE_CACHE } from '$lib/server/cache';
import type { EntryGenerator, PageServerLoad } from './$types';

export const prerender = 'auto';
export const entries: EntryGenerator = () => catalogEntries('auctions');

export const load: PageServerLoad = async ({ params, platform, setHeaders }) => {
	setHeaders({ 'cache-control': MARKET_PAGE_CACHE });
	const known = catalogItem('auctions', params.slug);
	if (known) return known;

	// Items added after the last build get the same shell on demand.
	const db = requireDb(platform);
	const item = await getItemBySlug(db, params.slug);
	if (!item) error(404, 'Unknown item');
	const market = await getAuctionItem(db, item.id);
	if (!market) error(404, 'Unknown item');
	return { slug: params.slug, name: item.name, tier: item.tier };
};
