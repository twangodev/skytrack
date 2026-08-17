/** columnar tuples: bazaar [t, instabuy, instasell]; auctions [t, lowest, median, count] */
export type BazaarTuple = [t: number, b: number, s: number];
export type AuctionTuple = [t: number, l: number, m: number, c: number];

const DAY = 86_400;

/**
 * The state archives far more than browsers need (raw 90d, hourly 2y).
 * Endpoints ship a trimmed view: raw covers the 1M range at full 15-min
 * density, hourly is thinned to 4h points for the longer ranges.
 */
export const RAW_SLICE = 35 * DAY;

/**
 * Per-item chart endpoint. Tiers are disjoint in time (raw newest, then
 * hourly, then daily); clients concat and slice ranges from the merged
 * series.
 */
export interface ItemSeriesJson {
	bazaar?: { raw: BazaarTuple[]; hourly: BazaarTuple[]; daily: BazaarTuple[] };
	auctions?: { raw: AuctionTuple[]; daily: AuctionTuple[] };
}

/** Merge disjoint tiers into one ascending series of [t, primary, secondary]. */
export function mergedSeries(
	json: ItemSeriesJson,
	kind: 'bazaar' | 'auctions'
): [number, number, number][] {
	if (kind === 'bazaar') {
		const tiers = json.bazaar;
		if (!tiers) return [];
		return [...tiers.daily, ...tiers.hourly, ...tiers.raw]
			.map(([t, b, s]) => [t, b, s] as [number, number, number])
			.sort((a, b) => a[0] - b[0]);
	}
	const tiers = json.auctions;
	if (!tiers) return [];
	return [...tiers.daily, ...tiers.raw]
		.map(([t, l, m]) => [t, l, m] as [number, number, number])
		.sort((a, b) => a[0] - b[0]);
}
