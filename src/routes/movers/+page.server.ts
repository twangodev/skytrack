import {
	requireDb,
	getBazaarSnapshot,
	getItems,
	bazaarWindowChanges,
	bazaarSeriesSince
} from '$lib/server/db';
import { downsample } from '$lib/server/spark';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';
import type { PageServerLoad } from './$types';

interface Row {
	id: string;
	slug: string;
	name: string;
	price: number;
	change: number;
	spark: [number, number][];
}

const WINDOWS = [
	['d1', 86_400],
	['w1', 604_800]
] as const;

export const load: PageServerLoad = async ({ platform, setHeaders }) => {
	const db = requireDb(platform);
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60' });
	const [{ lastUpdated, products }, items] = await Promise.all([
		getBazaarSnapshot(db),
		getItems(db)
	]);
	const now = Math.floor(Date.now() / 1000);

	const windows = Object.fromEntries(
		await Promise.all(
			WINDOWS.map(async ([key, seconds]) => {
				const changes = await bazaarWindowChanges(db, now - seconds);
				const ranked = changes
					.map(({ id, first, last }) => {
						const snap = products[id];
						if (!snap) return null;
						if (snap.qs.bmw < 100_000) return null;
						if (first <= 0) return null;
						return {
							id,
							slug: slugFromId(id),
							name: items[id]?.name ?? titleCase(id),
							price: snap.qs.bp,
							change: (last - first) / first
						};
					})
					.filter((r) => r !== null)
					.sort((a, b) => b.change - a.change);

				const gainers = ranked.filter((r) => r.change > 0).slice(0, 20);
				const losers = ranked
					.filter((r) => r.change < 0)
					.sort((a, b) => a.change - b.change)
					.slice(0, 20);

				const displayedIds = [...gainers, ...losers].map((r) => r.id);
				const sparks = await bazaarSeriesSince(db, displayedIds, now - seconds);
				const withSpark = (row: (typeof ranked)[number]): Row => ({
					...row,
					spark: downsample((sparks.get(row.id) ?? []).map((h) => [h.t, h.b] as [number, number]))
				});

				return [key, { gainers: gainers.map(withSpark), losers: losers.map(withSpark) }] as const;
			})
		)
	) as Record<'d1' | 'w1', { gainers: Row[]; losers: Row[] }>;

	return { lastUpdated, windows };
};
