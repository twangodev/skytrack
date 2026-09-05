import type { ItemSeriesJson } from './series';
import type { AuctionItemStats, BazaarProductSnapshot } from './aggregate';

export type MarketKind = 'bazaar' | 'auctions';

export interface MarketItem {
	slug: string;
	name: string;
	kind: MarketKind;
	aliases?: string[];
	lower: string;
}

export type PickedMarketItem = Pick<MarketItem, 'slug' | 'name' | 'kind'>;

export interface MarketSnapshotJson {
	name: string;
	bazaar?: { updatedAt: number; snapshot: BazaarProductSnapshot; live: boolean };
	auctions?: { updatedAt: number; snapshot: AuctionItemStats; live: boolean };
}

const seriesCache = new Map<string, Promise<ItemSeriesJson | null>>();
const SNAPSHOT_CACHE_MS = 55_000;
const snapshotCache = new Map<
	string,
	{ expiresAt: number; pending: Promise<MarketSnapshotJson | null> }
>();
let indexPromise: Promise<MarketItem[]> | null = null;

export const marketItemKey = (item: PickedMarketItem): string => `${item.kind}:${item.slug}`;

export function loadMarketIndex(): Promise<MarketItem[]> {
	if (!indexPromise) {
		indexPromise = fetch('/search-index.json')
			.then((response) => {
				if (!response.ok) throw new Error(`Search index request failed: ${response.status}`);
				return response.json() as Promise<Omit<MarketItem, 'lower'>[]>;
			})
			.then((items) =>
				items.map((item) => ({
					...item,
					lower: [item.name, ...(item.aliases ?? [])].join(' ').toLowerCase()
				}))
			)
			.catch((error) => {
				indexPromise = null;
				throw error;
			});
	}
	return indexPromise;
}

export function loadMarketSeries(slug: string): Promise<ItemSeriesJson | null> {
	let pending = seriesCache.get(slug);
	if (!pending) {
		// Avoid pre-deployment browser/edge entries that don't contain the history summary.
		pending = fetch(`/data/items/${slug}.json?v=2`, { signal: AbortSignal.timeout(20_000) })
			.then((response) =>
				response.ok ? (response.json() as Promise<ItemSeriesJson>) : Promise.resolve(null)
			)
			.catch(() => null)
			.then((series) => {
				if (series === null) seriesCache.delete(slug);
				return series;
			});
		seriesCache.set(slug, pending);
	}
	return pending;
}

export function loadMarketSnapshot(slug: string): Promise<MarketSnapshotJson | null> {
	const now = Date.now();
	let entry = snapshotCache.get(slug);
	if (!entry || entry.expiresAt <= now) {
		const pending = fetch(`/data/items/${slug}/snapshot.json`, {
			signal: AbortSignal.timeout(20_000)
		})
			.then((response) =>
				response.ok ? (response.json() as Promise<MarketSnapshotJson>) : Promise.resolve(null)
			)
			.catch(() => null)
			.then((snapshot) => {
				if (snapshot === null) snapshotCache.delete(slug);
				return snapshot;
			});
		entry = { expiresAt: now + SNAPSHOT_CACHE_MS, pending };
		snapshotCache.set(slug, entry);
	}
	return entry.pending;
}

export function clearMarketSnapshotCache(): void {
	snapshotCache.clear();
}

function rankMarketItem(item: MarketItem, query: string): number {
	const name = item.name.toLowerCase();
	if (name.startsWith(query)) return 0;
	if (name.includes(` ${query}`)) return 1;
	if (name.includes(query)) return 2;
	if ((item.aliases ?? []).some((alias) => alias.toLowerCase().includes(query))) return 3;
	return 4;
}

export function searchMarketItems(
	items: MarketItem[],
	query: string,
	excluded: ReadonlySet<string> = new Set(),
	limit = 10
): MarketItem[] {
	const normalized = query.trim().toLowerCase();
	if (normalized.length < 2) return [];
	return items
		.filter((item) => !excluded.has(marketItemKey(item)))
		.map((item) => ({ item, rank: rankMarketItem(item, normalized) }))
		.filter(({ rank }) => rank < 4)
		.sort(
			(a, b) =>
				a.rank - b.rank ||
				a.item.name.length - b.item.name.length ||
				a.item.name.localeCompare(b.item.name)
		)
		.slice(0, limit)
		.map(({ item }) => item);
}
