import { loadBazaar, loadItems } from '$lib/server/data';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';

export function load() {
	const { lastUpdated, products } = loadBazaar();
	const items = loadItems();
	const rows = Object.entries(products)
		.map(([id, snap]) => ({
			id,
			slug: slugFromId(id),
			name: items[id]?.name ?? titleCase(id),
			bp: snap.qs.bp,
			sp: snap.qs.sp,
			bmw: snap.qs.bmw,
			smw: snap.qs.smw,
			demandShare: snap.qs.bv + snap.qs.sv === 0 ? 0 : snap.qs.sv / (snap.qs.bv + snap.qs.sv)
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
	return { lastUpdated, rows };
}
