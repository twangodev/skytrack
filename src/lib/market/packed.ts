export const MARKET_DAY = 86_400;

export type MarketKind = 'bazaar' | 'auctions';

export type PackedBazaarPoint = [t: number, buy: number, sell: number];
export type PackedAuctionPoint = [t: number, lowest: number, median: number, count: number];

export interface PackedPointByMarket {
	bazaar: PackedBazaarPoint;
	auctions: PackedAuctionPoint;
}

export const SNAPSHOT_SHARDS: Record<MarketKind, number> = {
	bazaar: 4,
	auctions: 2
};

// A full UTC day of Bazaar history is roughly 8-12 MB before compression.
// Splitting it 32 ways leaves ample room below D1's 2 MB row limit as the
// product catalogue grows. Auction history is much smaller and less frequent.
export const DAY_SHARDS: Record<MarketKind, number> = {
	bazaar: 32,
	auctions: 4
};

export const utcDay = (unixSeconds: number): number =>
	Math.floor(unixSeconds / MARKET_DAY) * MARKET_DAY;

export function shardFor(item: string, count: number): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < item.length; i++) {
		hash ^= item.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0) % count;
}

export function partitionRecord<T>(values: Record<string, T>, count: number): Record<string, T>[] {
	const shards = Array.from({ length: count }, () => ({}) as Record<string, T>);
	for (const [item, value] of Object.entries(values)) shards[shardFor(item, count)][item] = value;
	return shards;
}

export function parseJsonRecord<T>(value: unknown): Record<string, T> {
	if (typeof value === 'string') return JSON.parse(value) as Record<string, T>;
	return (value ?? {}) as Record<string, T>;
}

export function parseJsonArray<T>(value: unknown): T[] {
	if (typeof value === 'string') return JSON.parse(value) as T[];
	return (value ?? []) as T[];
}
