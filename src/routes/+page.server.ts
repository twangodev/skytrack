import { loadBazaar, loadAuctions, loadItems, bazaarHistory } from '$lib/server/data';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';

export function load() {
	const bazaar = loadBazaar();
	const auctions = loadAuctions();
	const items = loadItems();

	const searchIndex = [
		...Object.keys(bazaar.products).map((id) => ({
			slug: slugFromId(id),
			name: items[id]?.name ?? titleCase(id),
			kind: 'bazaar' as const
		})),
		...Object.entries(auctions.items).map(([id, stats]) => ({
			slug: slugFromId(id),
			name: stats.name,
			kind: 'auctions' as const
		}))
	];

	// Top movers: biggest |%Δ| in instabuy across today's snapshots, liquid items only.
	const movers = Object.entries(bazaar.products)
		.map(([id, snap]) => {
			const history = bazaarHistory(id);
			if (history.length < 2 || snap.qs.bmw < 100_000) return null;
			const first = history[0].b;
			const last = history[history.length - 1].b;
			if (first <= 0) return null;
			return {
				id,
				slug: slugFromId(id),
				name: items[id]?.name ?? titleCase(id),
				price: snap.qs.bp,
				change: (last - first) / first
			};
		})
		.filter((m) => m !== null)
		.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
		.slice(0, 6);

	return {
		searchIndex,
		movers,
		bazaarCount: Object.keys(bazaar.products).length,
		auctionCount: Object.keys(auctions.items).length,
		lastUpdated: bazaar.lastUpdated
	};
}
