import { requireDb, popularAuctionItems } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, setHeaders }) => {
	const db = requireDb(platform);
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60' });
	return { examples: await popularAuctionItems(db, 6) };
};
