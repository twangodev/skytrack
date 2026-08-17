import { requireDb, popularAuctionItems, popularBazaarItems } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = requireDb(platform);
	const [auctionExamples, bazaarExamples] = await Promise.all([
		popularAuctionItems(db, 3),
		popularBazaarItems(db, 3)
	]);
	return { auctionExamples, bazaarExamples };
};
