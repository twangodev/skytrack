import { requireDb, getAuctionSnapshot, auctionSparks } from '$lib/server/db';
import { slugFromId } from '$lib/slug';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = requireDb(platform);
	const now = Math.floor(Date.now() / 1000);
	const [{ lastUpdated, items }, sparks] = await Promise.all([
		getAuctionSnapshot(db),
		auctionSparks(db, now)
	]);
	const rows = Object.entries(items)
		.map(([id, stats]) => ({
			id,
			slug: slugFromId(id),
			name: stats.name,
			tier: stats.tier,
			lowestBin: stats.lowestBin,
			medianBin: stats.medianBin,
			count: stats.count,
			discount: stats.medianBin > 0 ? (stats.medianBin - stats.lowestBin) / stats.medianBin : 0,
			spark: sparks.get(id) ?? []
		}))
		.sort((a, b) => b.count - a.count);
	return { lastUpdated, rows };
};
