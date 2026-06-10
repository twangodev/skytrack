import type { MarketState, BazaarPoint, AuctionPoint } from './state';

/** columnar tuples: bazaar [t, instabuy, instasell]; auctions [t, lowest, median, count] */
export type BazaarTuple = [t: number, b: number, s: number];
export type AuctionTuple = [t: number, l: number, m: number, c: number];

/**
 * Per-item chart endpoint. Tiers mirror the state tiers and are disjoint in
 * time (raw: last 30d @15min, hourly: 30–120d, daily: older) — clients concat
 * and slice ranges from the merged series.
 */
export interface ItemSeriesJson {
	bazaar?: { raw: BazaarTuple[]; hourly: BazaarTuple[]; daily: BazaarTuple[] };
	auctions?: { raw: AuctionTuple[]; daily: AuctionTuple[] };
}

const bazaarTuple = (p: BazaarPoint): BazaarTuple => [p.t, p.b, p.s];
const auctionTuple = (p: AuctionPoint): AuctionTuple => [p.t, p.l, p.m, p.c];

export function itemSeries(state: MarketState, id: string): ItemSeriesJson {
	const out: ItemSeriesJson = {};

	const raw = state.bazaar.raw.get(id);
	const hourly = state.bazaar.hourly.get(id);
	const daily = state.bazaar.daily.get(id);
	if (raw?.length || hourly?.length || daily?.length) {
		out.bazaar = {
			raw: (raw ?? []).map(bazaarTuple),
			hourly: (hourly ?? []).map(bazaarTuple),
			daily: (daily ?? []).map(bazaarTuple)
		};
	}

	const auctionRaw = state.auctions.raw.get(id);
	const auctionDaily = state.auctions.daily.get(id);
	if (auctionRaw?.length || auctionDaily?.length) {
		out.auctions = {
			raw: (auctionRaw ?? []).map(auctionTuple),
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
