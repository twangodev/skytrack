import { loadAuctions } from '$lib/server/data';
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
			count: stats.count
		}))
		.sort((a, b) => b.count - a.count);
	return { lastUpdated, rows };
}
