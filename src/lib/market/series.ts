import type { MarketState, BazaarPoint, AuctionPoint } from './state';

/** columnar tuples: bazaar [t, instabuy, instasell]; auctions [t, lowest, median, count] */
export type BazaarTuple = [t: number, b: number, s: number];
export type AuctionTuple = [t: number, l: number, m: number, c: number];

const DAY = 86_400;
const HOUR = 3_600;

/**
 * The state archives far more than browsers need (raw 90d, hourly 2y).
 * Endpoints ship a trimmed view: raw covers the 1M range at full 15-min
 * density, hourly is thinned to 4h points for the longer ranges.
 */
export const RAW_SLICE = 35 * DAY;
const HOURLY_STEP_HOURS = 4;

/**
 * Per-item chart endpoint. Tiers are disjoint in time (raw newest, then
 * hourly, then daily); clients concat and slice ranges from the merged
 * series.
 */
export interface ItemSeriesJson {
	bazaar?: { raw: BazaarTuple[]; hourly: BazaarTuple[]; daily: BazaarTuple[] };
	auctions?: { raw: AuctionTuple[]; daily: AuctionTuple[] };
}

const bazaarTuple = (p: BazaarPoint): BazaarTuple => [p.t, p.b, p.s];
const auctionTuple = (p: AuctionPoint): AuctionTuple => [p.t, p.l, p.m, p.c];

function rawSlice<P extends { t: number }>(points: P[]): P[] {
	const newest = points[points.length - 1]?.t ?? 0;
	return points.filter((p) => p.t >= newest - RAW_SLICE);
}

// decimation, not re-aggregation: hourly points are already medians, and for
// chart rendering every Nth sample is indistinguishable from a 4h median
function thinHourly<P extends { t: number }>(points: P[]): P[] {
	return points.filter((p) => (p.t / HOUR) % HOURLY_STEP_HOURS === 0);
}

export function itemSeries(state: MarketState, id: string): ItemSeriesJson {
	const out: ItemSeriesJson = {};

	const raw = state.bazaar.raw.get(id);
	const hourly = state.bazaar.hourly.get(id);
	const daily = state.bazaar.daily.get(id);
	if (raw?.length || hourly?.length || daily?.length) {
		out.bazaar = {
			raw: rawSlice(raw ?? []).map(bazaarTuple),
			hourly: thinHourly(hourly ?? []).map(bazaarTuple),
			daily: (daily ?? []).map(bazaarTuple)
		};
	}

	const auctionRaw = state.auctions.raw.get(id);
	const auctionDaily = state.auctions.daily.get(id);
	if (auctionRaw?.length || auctionDaily?.length) {
		out.auctions = {
			raw: rawSlice(auctionRaw ?? []).map(auctionTuple),
			daily: (auctionDaily ?? []).map(auctionTuple)
		};
	}

	return out;
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
