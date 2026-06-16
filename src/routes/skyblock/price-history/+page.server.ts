import { popularAuctionItems, popularBazaarItems } from '$lib/server/data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	auctionExamples: popularAuctionItems(3),
	bazaarExamples: popularBazaarItems(3)
});
