import { loadBazaar, loadItems } from '$lib/server/data';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';

const BAZAAR_TAX = 0.0125;
const TICK = 0.1; // outbid/undercut step the strategy assumes

export function load() {
	const { lastUpdated, products } = loadBazaar();
	const items = loadItems();
	const rows = Object.entries(products)
		.filter(([, snap]) => snap.qs.bp > 0 && snap.qs.sp > 0)
		.map(([id, snap]) => {
			const { bp, sp, bmw, smw } = snap.qs;
			// buy order at instasell +0.1, sell offer at instabuy −0.1, tax on the sale
			const buyCost = sp + TICK;
			const profit = (bp - TICK) * (1 - BAZAAR_TAX) - buyCost;
			const marginPct = (profit / buyCost) * 100;
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
