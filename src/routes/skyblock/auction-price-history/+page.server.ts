import { requireDb, popularAuctionItems } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = requireDb(platform);
	return { examples: await popularAuctionItems(db, 6) };
};
