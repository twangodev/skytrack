import { loadBazaar, loadItems, bazaarRaw } from '$lib/server/data';
import { slugFromId } from '$lib/slug';
import { titleCase } from '$lib/format';

interface Row {
	id: string;
	slug: string;
	name: string;
	price: number;
	change: number;
}

const WINDOWS = [
	['d1', 86_400],
	['w1', 604_800]
] as const;

export function load() {
	const { lastUpdated, products } = loadBazaar();
	const items = loadItems();
	const now = Math.floor(Date.now() / 1000);

	// Liquid products only; the raw tier (15-min points, ~30d) covers both
	// windows — the SSR-capped bazaarHistory would truncate 1W to 24h.
	const candidates = Object.entries(products)
		.filter(([, snap]) => snap.qs.bmw >= 100_000)
		.map(([id, snap]) => ({
			id,
			slug: slugFromId(id),
			name: items[id]?.name ?? titleCase(id),
			price: snap.qs.bp,
			history: bazaarRaw(id)
		}));

	const windows = Object.fromEntries(
		WINDOWS.map(([key, seconds]) => {
			const ranked: Row[] = candidates
				.map(({ history, ...row }) => {
					const points = history.filter((h) => h.t >= now - seconds);
					if (points.length < 2) return null;
					const first = points[0].b;
					const last = points[points.length - 1].b;
					if (first <= 0) return null;
					return { ...row, change: (last - first) / first };
				})
				.filter((r) => r !== null)
				.sort((a, b) => b.change - a.change);
			return [
				key,
				{
					gainers: ranked.filter((r) => r.change > 0).slice(0, 20),
					losers: ranked
						.filter((r) => r.change < 0)
						.sort((a, b) => a.change - b.change)
						.slice(0, 20)
				}
			];
		})
	) as Record<'d1' | 'w1', { gainers: Row[]; losers: Row[] }>;

	return { lastUpdated, windows };
}
