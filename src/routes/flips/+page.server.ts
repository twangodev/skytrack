import { loadBazaar, loadItems } from '$lib/server/data';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';
import { flipQuote } from '$lib/market/flips';

export function load() {
	const { lastUpdated, products } = loadBazaar();
	const items = loadItems();
	const rows = Object.entries(products)
		.filter(([, snap]) => snap.qs.bp > 0 && snap.qs.sp > 0)
		.map(([id, snap]) => {
			const { bp, sp, bmw, smw } = snap.qs;
			const { profit, marginPct } = flipQuote(bp, sp);
			const volume = Math.min(bmw, smw);
			return {
				id,
				slug: slugFromId(id),
				name: items[id]?.name ?? titleCase(id),
				sp,
				bp,
				profit,
				marginPct,
				volume,
				weeklyPotential: profit * volume
			};
		})
		.filter((row) => row.profit > 0)
		.sort((a, b) => b.weeklyPotential - a.weeklyPotential);
	return { lastUpdated, rows };
}
