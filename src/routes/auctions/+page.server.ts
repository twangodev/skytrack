import { auctionHistory, loadAuctions } from '$lib/server/data';
import { spark7d } from '$lib/server/spark';
import { slugFromId } from '$lib/slug';

export function load() {
	const { lastUpdated, items } = loadAuctions();
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
			spark: spark7d(auctionHistory(id).map((h) => [h.t, h.m] as [number, number]))
		}))
		.sort((a, b) => b.count - a.count);
	return { lastUpdated, rows };
}
