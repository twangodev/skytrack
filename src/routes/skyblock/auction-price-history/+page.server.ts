import { popularAuctionItems } from '$lib/server/data';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ examples: popularAuctionItems(6) });
