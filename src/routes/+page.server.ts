import {
	loadBazaar,
	loadAuctions,
	loadItems,
	bazaarHistory,
	type BazaarHistoryPoint
} from '$lib/server/data';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';
import { flipQuote, isFlipOpportunity } from '$lib/market/flips';

export function load() {
	const bazaar = loadBazaar();
	const auctions = loadAuctions();
	const items = loadItems();

	// Top movers: biggest |%Δ| in instabuy over a rolling 24h, liquid items only.
	// Rolling rather than calendar-day: a UTC-midnight anchor leaves the whole
	// dashboard empty for builds in the first minutes of each day.
	const windowStart = Math.floor(Date.now() / 1000) - 86_400;
	const movers = Object.entries(bazaar.products)
		.map(([id, snap]) => {
			if (snap.qs.bmw < 100_000) return null;
			// history is chronological; recent points are a suffix
			const history = bazaarHistory(id).filter((h) => h.t >= windowStart);
			if (history.length < 2) return null;
			const first = history[0].b;
			const last = history[history.length - 1].b;
			if (first <= 0) return null;
			return {
				id,
				slug: slugFromId(id),
				name: items[id]?.name ?? titleCase(id),
				price: snap.qs.bp,
				change: (last - first) / first,
				spark: history.map((h) => [h.t, h.b] as [number, number])
			};
		})
		.filter((m) => m !== null)
		.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
		.slice(0, 6);

	// Market dashboard stats: total weekly volume, 24h breadth, equal-weight index.
	let totalWeeklyVolume = 0;
	let up = 0;
	let down = 0;
	const liquid: { bmw: number; history: BazaarHistoryPoint[] }[] = [];

	for (const [id, snap] of Object.entries(bazaar.products)) {
		totalWeeklyVolume += snap.qs.bmw + snap.qs.smw;
		if (snap.qs.bmw < 100_000) continue;
		const history = bazaarHistory(id).filter((h) => h.t >= windowStart);
		if (history.length < 2) continue;
		const first = history[0].b;
		if (first <= 0) continue;
		const change = (history[history.length - 1].b - first) / first;
		if (change > 0.001) up++;
		else if (change < -0.001) down++;
		liquid.push({ bmw: snap.qs.bmw, history });
	}

	// Equal-weight index: the window's points of the 50 most liquid products, each
	// normalized to its first point, averaged per timestamp bucket.
	const buckets = new Map<number, number[]>();
	for (const { history } of liquid.sort((a, b) => b.bmw - a.bmw).slice(0, 50)) {
		const base = history[0].b;
		for (const point of history) {
			let values = buckets.get(point.t);
			if (!values) buckets.set(point.t, (values = []));
			values.push((point.b / base - 1) * 100);
		}
	}
	const index: [number, number][] = [...buckets]
		.filter(([, values]) => values.length >= 10)
		.map(
			([t, values]) =>
				[t, values.reduce((sum, v) => sum + v, 0) / values.length] as [number, number]
		)
		.sort((a, b) => a[0] - b[0]);

	// Top flips: best buy-order to sell-offer opportunities by weekly potential.
	const flips = Object.entries(bazaar.products)
		.map(([id, snap]) => {
			const { bp, sp, bmw, smw } = snap.qs;
			if (bp <= 0 || sp <= 0) return null;
			const quote = flipQuote(bp, sp);
			const volume = Math.min(bmw, smw);
			if (!isFlipOpportunity(quote, volume)) return null;
			const { profit, marginPct } = quote;
			return {
				id,
				slug: slugFromId(id),
				name: items[id]?.name ?? titleCase(id),
				profit,
				marginPct,
				volume,
				weeklyPotential: profit * volume
			};
		})
		.filter((f) => f !== null)
		.sort((a, b) => b.weeklyPotential - a.weeklyPotential)
		.slice(0, 3);

	return {
		movers,
		flips,
		totalWeeklyVolume,
		breadth: { up, down },
		index,
		bazaarCount: Object.keys(bazaar.products).length,
		auctionCount: Object.keys(auctions.items).length,
		lastUpdated: bazaar.lastUpdated
	};
}
