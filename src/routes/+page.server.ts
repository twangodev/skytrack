import {
	requireDb,
	getBazaarSnapshot,
	getAuctionSnapshot,
	getItems,
	bazaarWindowChanges,
	bazaarSeriesSince
} from '$lib/server/db';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';
import { flipQuote, isFlipOpportunity } from '$lib/market/flips';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, setHeaders }) => {
	const db = requireDb(platform);
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60' });
	const [bazaar, auctions, items] = await Promise.all([
		getBazaarSnapshot(db),
		getAuctionSnapshot(db),
		getItems(db)
	]);

	const windowStart = Math.floor(Date.now() / 1000) - 86_400;
	const changes = await bazaarWindowChanges(db, windowStart);

	let up = 0;
	let down = 0;
	const ranked = changes
		.map(({ id, first, last }) => {
			const snap = bazaar.products[id];
			if (!snap) return null;
			if (snap.qs.bmw < 100_000) return null;
			if (first <= 0) return null;
			const change = (last - first) / first;
			return {
				id,
				slug: slugFromId(id),
				name: items[id]?.name ?? titleCase(id),
				price: snap.qs.bp,
				change
			};
		})
		.filter((m) => m !== null);

	for (const { change } of ranked) {
		if (change > 0.001) up++;
		else if (change < -0.001) down++;
	}

	const top6 = ranked.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 6);
	const sparks = await bazaarSeriesSince(
		db,
		top6.map((m) => m.id),
		windowStart
	);
	const movers = top6.map((m) => ({
		...m,
		spark: (sparks.get(m.id) ?? []).map((h) => [h.t, h.b] as [number, number])
	}));

	let totalWeeklyVolume = 0;
	const liquid: { id: string; bmw: number }[] = [];
	for (const [id, snap] of Object.entries(bazaar.products)) {
		totalWeeklyVolume += snap.qs.bmw + snap.qs.smw;
		if (snap.qs.bmw < 100_000) continue;
		liquid.push({ id, bmw: snap.qs.bmw });
	}

	const indexIds = liquid
		.sort((a, b) => b.bmw - a.bmw)
		.slice(0, 50)
		.map((l) => l.id);
	const indexSeries = await bazaarSeriesSince(db, indexIds, windowStart);
	const buckets = new Map<number, number[]>();
	for (const id of indexIds) {
		const history = indexSeries.get(id) ?? [];
		if (history.length === 0) continue;
		const base = history[0].b;
		if (base <= 0) continue;
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
};
