import { requireDb, getBazaarSnapshot, getItems, bazaarSparks } from '$lib/server/db';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = requireDb(platform);
	const now = Math.floor(Date.now() / 1000);
	const [{ lastUpdated, products }, items, sparks] = await Promise.all([
		getBazaarSnapshot(db),
		getItems(db),
		bazaarSparks(db, now)
	]);
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
			spark: sparks.get(id) ?? []
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
	return { lastUpdated, rows };
};
