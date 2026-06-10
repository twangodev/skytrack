import { loadBazaar, loadAuctions, loadItems, bazaarHistory } from '$lib/server/data';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';

export function load() {
	const bazaar = loadBazaar();
	const auctions = loadAuctions();
	const items = loadItems();

	// Top movers: biggest |%Δ| in instabuy across today's snapshots, liquid items only.
	const startOfToday = Math.floor(Date.parse(new Date().toISOString().slice(0, 10)) / 1000);
	const movers = Object.entries(bazaar.products)
		.map(([id, snap]) => {
			if (snap.qs.bmw < 100_000) return null;
			// history is chronological; today's points are a suffix
			const history = bazaarHistory(id).filter((h) => h.t >= startOfToday);
			if (history.length < 2) return null;
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
		movers,
		bazaarCount: Object.keys(bazaar.products).length,
		auctionCount: Object.keys(auctions.items).length,
		lastUpdated: bazaar.lastUpdated
	};
}
