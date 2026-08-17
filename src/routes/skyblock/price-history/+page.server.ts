import { requireDb, popularAuctionItems, popularBazaarItems } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, setHeaders }) => {
	const db = requireDb(platform);
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60' });
	const [auctionExamples, bazaarExamples] = await Promise.all([
		popularAuctionItems(db, 3),
		popularBazaarItems(db, 3)
	]);
	return { auctionExamples, bazaarExamples };
};
