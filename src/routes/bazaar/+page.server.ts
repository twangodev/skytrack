import { bazaarRaw, loadBazaar, loadItems } from '$lib/server/data';
import { spark7d } from '$lib/server/spark';
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
			demandShare: snap.qs.bv + snap.qs.sv === 0 ? 0 : snap.qs.sv / (snap.qs.bv + snap.qs.sv),
			spark: spark7d(bazaarRaw(id).map((h) => [h.t, h.b] as [number, number]))
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
	return { lastUpdated, rows };
}
