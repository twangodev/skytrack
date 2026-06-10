import { readFileSync, existsSync } from 'node:fs';
import { decodeStateFile, type BazaarPoint, type AuctionPoint } from '$lib/market/state';
import type { BazaarProductSnapshot, AuctionItemStats } from '$lib/market/aggregate';
import { buildSlugMap } from '$lib/slug';

export interface ItemMeta {
	name: string;
	tier?: string;
	category?: string;
	npc?: number;
}

export interface BazaarFile {
	lastUpdated: number;
	products: Record<string, BazaarProductSnapshot>;
}

export interface AuctionsFile {
	lastUpdated: number;
	items: Record<string, AuctionItemStats>;
}

export type BazaarHistoryPoint = { t: number; b: number; s: number };
export type AuctionHistoryPoint = { t: number; l: number; m: number; c: number };

const DATA_DIR = 'src/lib/data';
const STATE_DIR = 'static/data/state';

// Module-level caches: ~4k prerendered pages hit these loaders; parse once.
const cache = new Map<string, unknown>();

function cached<T>(key: string, compute: () => T): T {
	if (!cache.has(key)) cache.set(key, compute());
	return cache.get(key) as T;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

export const loadItems = () =>
	cached('items', () => readJson<Record<string, ItemMeta>>(`${DATA_DIR}/items.json`));
export const loadBazaar = () =>
	cached('bazaar', () => readJson<BazaarFile>(`${DATA_DIR}/bazaar.json`));
export const loadAuctions = () =>
	cached('auctions', () => readJson<AuctionsFile>(`${DATA_DIR}/auctions.json`));

export const bazaarSlugMap = () =>
	cached('bazaarSlugs', () => buildSlugMap(Object.keys(loadBazaar().products)));
export const auctionSlugMap = () =>
	cached('auctionSlugs', () => buildSlugMap(Object.keys(loadAuctions().items)));

function loadTier<P>(name: string): Map<string, P[]> {
	return cached(`state:${name}`, () => {
		const path = `${STATE_DIR}/${name}.binpb`;
		// tolerate missing state locally — pages render with empty history
		if (!existsSync(path)) return new Map<string, P[]>();
		return decodeStateFile(new Uint8Array(readFileSync(path))).items as Map<string, P[]>;
	});
}

const DAY = 86_400;
const tail = <P extends { t: number }>(points: P[], windowSeconds: number): P[] => {
	const newest = points[points.length - 1]?.t ?? 0;
	return points.filter((p) => p.t >= newest - windowSeconds);
};

/**
 * SSR-embedded fallback series, capped so prerendered pages stay small:
 * all daily, last 7d hourly, last 24h raw. The client fetches the full
 * /data/items/{slug}.json for interactive ranges.
 */
export function bazaarHistory(productId: string): BazaarHistoryPoint[] {
	const daily = loadTier<BazaarPoint>('bazaar-daily').get(productId) ?? [];
	const hourly = loadTier<BazaarPoint>('bazaar-hourly').get(productId) ?? [];
	const raw = loadTier<BazaarPoint>('bazaar-raw').get(productId) ?? [];
	return [...daily, ...tail(hourly, 7 * DAY), ...tail(raw, DAY)].sort((a, b) => a.t - b.t);
}

export function auctionHistory(itemId: string): AuctionHistoryPoint[] {
	const daily = loadTier<AuctionPoint>('auctions-daily').get(itemId) ?? [];
	const raw = loadTier<AuctionPoint>('auctions-raw').get(itemId) ?? [];
	return [...daily, ...tail(raw, 7 * DAY)].sort((a, b) => a.t - b.t);
}
